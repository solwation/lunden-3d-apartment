#!/usr/bin/env bash
# Classify and remove leftover worker checkouts (git worktrees or clones).
#
#   scripts/prune-worktrees.sh [options] ROOT...
#
# Scans ROOT and its subdirectories (two levels) for git checkouts and prints one
# line per checkout with its class. Nothing is changed unless --apply is given.
#
#   integrated  clean tree and every local commit (or its patch) is on the remote
#               main branch: removed with --apply
#   active      in use: carries a claim marker (see below) whose issue is not known
#               to be closed; has no commits of its own and its HEAD changed within
#               --min-age (a fresh worker checkout); or references an open issue
#               (branch name or unmerged commit subjects, looked up with gh): never
#               removed
#   unproven    uncommitted changes, or commits whose patch is not on main, with no
#               open issue: removed with --apply only together with --archive DIR,
#               which first writes DIR/<name>.bundle (all local refs beyond main)
#               and DIR/<name>.patch (tracked and untracked changes)
#   protected   backs other worktrees or other clones' object stores (alternates), is
#               listed with --protect, or could not be checked (no remote main, failed
#               fetch): never removed
#
# Claim marker: whoever creates a worker checkout writes <git-dir>/orchestra-claim
# (`git rev-parse --git-dir`; per worktree, outside the working tree, so it neither
# dirties the tree nor gets committed), for example
#     issue=owner/repo#57
#     session=host-model-20261108
# A marker counts without a GitHub remote or gh. It goes stale only when gh shows its
# issue closed; the checkout is then classified normally. Removing the checkout
# removes the marker.
#
# Options:
#   --apply          remove what the classes above allow
#   --archive DIR    preserve unproven checkouts in DIR before removal
#   --protect PATH   never remove this checkout (repeatable)
#   --no-fetch       use the remote-tracking refs as they are
#   --no-issues      do not consult gh; open issues cannot be detected
#   --min-age MIN    a checkout with no commits of its own whose HEAD changed less
#                    than MIN minutes ago is active (default 120; 0 disables)
#
# Requires bash, git and optionally gh. Exit status 0; failures are reported per line.
set -u

apply=0; archive=""; nofetch=0; noissues=0; minage=120; roots=(); protect=()
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) apply=1 ;;
    --archive) archive=$(realpath -m "$2"); shift ;;
    --protect) protect+=("$(realpath -m "$2")"); shift ;;
    --no-fetch) nofetch=1 ;;
    --no-issues) noissues=1 ;;
    --min-age) minage="$2"; shift ;;
    -h|--help) sed -n '2,42p' "$0"; exit 0 ;;
    *) roots+=("$1") ;;
  esac
  shift
done
[ ${#roots[@]} -eq 0 ] && { echo "usage: $0 [--apply] [--archive DIR] [--protect PATH] [--no-fetch] [--no-issues] [--min-age MIN] ROOT..." >&2; exit 2; }
command -v gh >/dev/null 2>&1 || noissues=1

declare -A issue_state   # "owner/repo#n" -> open|closed|unknown
declare -A fetched       # common git dir -> 1 (worktrees share one object store)
declare -A checked_protect

is_protected() { local p=$1; for q in "${protect[@]}"; do [ "$p" = "$q" ] && return 0; done; return 1; }

github_slug() { # from remote URL
  # accepts git@github.com:o/r, https://github.com/o/r and URLs with user info before the host
  sed -E 's#^(git@|https?://([^@/]+@)?)github\.com[:/]##; s#\.git$##; s#/$##' <<<"$1" | grep -E '^[^/]+/[^/]+$'
}

lookup_issue() { # slug number -> state
  local key="$1#$2"
  if [ -z "${issue_state[$key]+x}" ]; then
    local s
    s=$(gh api "repos/$1/issues/$2" --jq .state 2>/dev/null) || s=unknown
    issue_state[$key]=$s
  fi
  printf '%s' "${issue_state[$key]}"
}

# collect candidate checkouts: ROOT itself, ROOT/*, ROOT/*/*
candidates=()
for r in "${roots[@]}"; do
  r=$(realpath -m "$r"); [ -d "$r" ] || continue
  while IFS= read -r g; do candidates+=("$(dirname "$g")"); done < <(find "$r" -mindepth 1 -maxdepth 3 -name .git \( -type d -o -type f \) 2>/dev/null; [ -e "$r/.git" ] && echo "$r/.git")
done
# unique, sorted, never an empty path: `git -C ""` would act on the current directory
if [ ${#candidates[@]} -gt 0 ]; then
  mapfile -t candidates < <(printf '%s\n' "${candidates[@]}" | awk 'NF && !seen[$0]++' | sort)
fi

# main repositories that back worktrees, and clones whose object store another clone
# borrows (git clone --reference/--shared), are protected: removing them breaks the rest
for d in "${candidates[@]}"; do
  [ -n "$d" ] || continue
  common=$(git -C "$d" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || continue
  [ -f "$d/.git" ] && { main=$(dirname "$common"); checked_protect[$main]=1; }
  alt="$common/objects/info/alternates"
  [ -f "$alt" ] && while IFS= read -r a; do [ -n "$a" ] && checked_protect[$(dirname "$(dirname "$a")")]=1; done < "$alt"
done
for m in "${!checked_protect[@]}"; do protect+=("$m"); done

printf '%-10s %6s  %-60s %-30s %5s %5s %4s  %s\n' CLASS MB DIR BRANCH DIRTY AHEAD NEW ISSUES
total_mb=0; freed_mb=0; n_int=0; n_act=0; n_unp=0; n_prot=0; n_removed=0

for d in "${candidates[@]}"; do
  [ -n "$d" ] || continue
  name=$(basename "$d"); parent=$(basename "$(dirname "$d")")
  short=$(printf '%s' "$d" | sed "s#^$HOME#~#")
  mb=$(du -xsm "$d" 2>/dev/null | cut -f1); total_mb=$((total_mb + mb))
  kind=repo; [ -f "$d/.git" ] && kind=wt
  remote=$(git -C "$d" remote 2>/dev/null | grep -m1 -x origin || git -C "$d" remote 2>/dev/null | head -1)
  url=$(git -C "$d" remote get-url "$remote" 2>/dev/null); slug=$(github_slug "$url")
  branch=$(git -C "$d" symbolic-ref --short -q HEAD 2>/dev/null || echo "(detached)")
  class=""; note=""
  if is_protected "$d"; then class=protected; note="protected"; fi

  base=""
  if [ -z "$class" ] && [ -n "$remote" ]; then
    common=$(git -C "$d" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
    if [ $nofetch -eq 0 ] && [ -z "${fetched[$common]+x}" ]; then
      git -C "$d" fetch -q "$remote" 2>/dev/null || note="fetch failed"; fetched[$common]=1
    fi
    for b in main master; do git -C "$d" rev-parse -q --verify "refs/remotes/$remote/$b" >/dev/null 2>&1 && { base="$remote/$b"; break; }; done
  fi
  if [ -z "$class" ] && [ -z "$base" ]; then class=protected; note="${note:-no remote main}"; fi

  dirty=0; ahead=0; new=0; issues=""
  if [ -z "$class" ]; then
    dirty=$(git -C "$d" status --porcelain 2>/dev/null | wc -l)
    # a clone owns every local branch; a worktree only its own HEAD
    refs=HEAD; [ $kind = repo ] && refs="$(git -C "$d" for-each-ref --format='%(refname)' refs/heads)$( [ "$branch" = "(detached)" ] && echo " HEAD")"
    for ref in $refs; do
      ahead=$((ahead + $(git -C "$d" rev-list --count "$base..$ref" 2>/dev/null || echo 0)))
      new=$((new + $(git -C "$d" cherry "$base" "$ref" 2>/dev/null | grep -c '^+')))
    done
    nums=$( { printf '%s\n' "$branch" | grep -oE '[0-9]{2,6}$'; git -C "$d" log --format=%s "$base..HEAD" 2>/dev/null | grep -oE '#[0-9]+' | tr -d '#'; } | sort -un)
    open=0
    for n in $nums; do
      st=unknown
      if [ $noissues -eq 0 ] && [ -n "$slug" ]; then st=$(lookup_issue "$slug" "$n"); fi
      issues="$issues#$n:${st:0:1} "
      [ "$st" = open ] && open=1
    done
    if [ $open -eq 1 ]; then class=active
    elif [ "$dirty" -eq 0 ] && [ "$new" -eq 0 ]; then class=integrated
    else class=unproven; fi

    # in use without evidence in git yet: a claim marker, or a fresh checkout
    gitdir=$(git -C "$d" rev-parse --absolute-git-dir 2>/dev/null)
    claim="$gitdir/orchestra-claim"
    if [ "$class" != active ] && [ -n "$gitdir" ] && [ -f "$claim" ]; then
      ci=$(sed -n 's/^issue=//p' "$claim" | head -1 | tr -d '[:space:]')
      cs=$(sed -n 's/^session=//p' "$claim" | head -1 | tr -d '[:space:]')
      cslug=${ci%#*}; cnum=${ci##*#}; [ "$cslug" = "$ci" ] && cslug=""; [ -z "$cslug" ] && cslug=$slug
      st=unknown
      if [ $noissues -eq 0 ] && [ -n "$cslug" ] && [[ "$cnum" =~ ^[0-9]+$ ]]; then st=$(lookup_issue "$cslug" "$cnum"); fi
      if [ "$st" = closed ]; then note="${note:+$note; }stale claim ${ci:-?}, issue closed"
      else class=active; note="${note:+$note; }claim ${ci:-?}${cs:+ $cs}"; fi
    fi
    if [ "$class" != active ] && [ "$ahead" -eq 0 ] && [ "$minage" -gt 0 ] && [ -n "$gitdir" ]; then
      changed=$(stat -c %Y "$gitdir/HEAD" "$gitdir/logs/HEAD" 2>/dev/null | sort -n | tail -1)
      if [ -n "$changed" ] && [ $(( $(date +%s) - changed )) -lt $((minage * 60)) ]; then
        class=active; note="${note:+$note; }fresh, no commits, HEAD changed $(( ($(date +%s) - changed) / 60 )) min ago"
      fi
    fi
  fi

  printf '%-10s %6s  %-60s %-30s %5s %5s %4s  %s %s\n' "$class" "$mb" "$short" "$branch" "$dirty" "$ahead" "$new" "$issues" "${note:+($note)}"
  case $class in integrated) n_int=$((n_int+1));; active) n_act=$((n_act+1));; unproven) n_unp=$((n_unp+1));; *) n_prot=$((n_prot+1));; esac

  # ---- apply ----
  [ $apply -eq 1 ] || continue
  remove=0
  if [ "$class" = integrated ]; then remove=1
  elif [ "$class" = unproven ] && [ -n "$archive" ]; then
    mkdir -p "$archive"
    stem="$archive/${parent}__${name}"
    ok=1
    refs=HEAD; [ $kind = repo ] && refs="$(git -C "$d" for-each-ref --format='%(refname)' refs/heads)$( [ "$branch" = "(detached)" ] && echo " HEAD")"
    if [ "$ahead" -gt 0 ]; then
      git -C "$d" bundle create "$stem.bundle" $refs "^$base" >/dev/null 2>&1 || ok=0
    fi
    if [ "$dirty" -gt 0 ]; then
      git -C "$d" add -A >/dev/null 2>&1 && git -C "$d" diff --cached --binary HEAD > "$stem.patch" 2>/dev/null || ok=0
    fi
    if [ $ok -eq 1 ]; then remove=1; echo "           archived -> $(ls "$stem".bundle "$stem".patch 2>/dev/null | tr '\n' ' ')"; else echo "           ARCHIVE FAILED, kept"; fi
  fi
  [ $remove -eq 1 ] || continue
  if [ $kind = wt ]; then
    main=$(dirname "$(git -C "$d" rev-parse --path-format=absolute --git-common-dir)")
    if git -C "$main" worktree remove --force "$d" >/dev/null 2>&1 || { rm -rf "$d" && git -C "$main" worktree prune; }; then
      if [ "$branch" != "(detached)" ] && git -C "$main" merge-base --is-ancestor "$branch" "$base" 2>/dev/null; then
        git -C "$main" branch -D "$branch" >/dev/null 2>&1 && echo "           removed worktree and merged branch $branch"
      elif [ "$branch" = "(detached)" ]; then echo "           removed worktree"
      else echo "           removed worktree (branch $branch kept, not on main)"; fi
      n_removed=$((n_removed+1)); freed_mb=$((freed_mb+mb))
    else echo "           REMOVE FAILED"; fi
  else
    if rm -rf "$d"; then echo "           removed clone"; n_removed=$((n_removed+1)); freed_mb=$((freed_mb+mb)); else echo "           REMOVE FAILED"; fi
  fi
  rmdir "$(dirname "$d")" 2>/dev/null && echo "           removed empty $(dirname "$d" | sed "s#^$HOME#~#")"
done

echo
echo "checkouts: ${#candidates[@]} (${total_mb} MB)  integrated: $n_int  active: $n_act  unproven: $n_unp  protected: $n_prot"
if [ $apply -eq 1 ]; then echo "removed: $n_removed (${freed_mb} MB)"; else echo "dry run; add --apply to remove integrated checkouts, --archive DIR to also preserve and remove unproven ones"; fi
