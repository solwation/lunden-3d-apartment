using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;

namespace Lunden.Launcher;

internal sealed record Installation(string Directory, string ManifestHash, string AppVersion,
    int ContentVersion, DateTimeOffset Published);
internal sealed record InstallState(string Channel, Installation? Active = null, Installation? Previous = null,
    string? Rejected = null, bool Pending = false);

// Each release is a complete Unreal installation. Both its app and its content
// become visible with one state-file replacement. No updater path targets Saved/.
internal sealed class UpdateStore(string root, HttpClient client, Action<string, ReleaseFile, bool> verifyPublisher)
{
    string StatePath => Path.Combine(root, "state.json");
    internal string PathFor(Installation item) => Path.Combine(root, "versions", item.Directory);
    internal FileStream Lock() {
        Directory.CreateDirectory(root);
        return new FileStream(Path.Combine(root, ".update.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
    }

    internal InstallState Load(string channel)
    {
        if (!File.Exists(StatePath)) return new(channel);
        var state = JsonSerializer.Deserialize<InstallState>(File.ReadAllBytes(StatePath), ReleaseManifest.Json);
        if (state?.Channel != channel) throw new InvalidDataException("Fel kanal i installationens tillstånd.");
        foreach (var item in new[] {state.Active, state.Previous})
            if (item != null && (!Guid.TryParseExact(item.Directory, "N", out _)
                || item.ManifestHash is not {Length: 64} || !item.ManifestHash.All(Uri.IsHexDigit)))
                throw new InvalidDataException("Ogiltig versionskatalog.");
        return state;
    }

    internal async Task<Installation> Apply(ReleaseManifest manifest, byte[] bytes, byte[] signature,
        InstallState state, bool dryRun, CancellationToken ct)
    {
        StockRuntime.Validate(manifest);
        bool stock = manifest.EntryPoint == ReleaseManifest.StockGameExe;
        string hash = Convert.ToHexString(SHA256.HashData(bytes));
        if (state.Rejected == hash) throw new InvalidDataException("Den här versionen misslyckades vid start.");
        if (state.Active?.ManifestHash == hash) return state.Active;
        if (state.Active != null && manifest.Published <= state.Active.Published)
            throw new InvalidDataException("Manifestet är äldre än den aktiva versionen.");

        var next = new Installation(Guid.NewGuid().ToString("N"), hash, manifest.App.Version,
            manifest.Content.Version, manifest.Published);
        string staging = Path.Combine(root, "staging", hash);
        string tree = Path.Combine(staging, "tree");
        var files = manifest.Files.ToArray();
        long missing = 0, downloaded = 0;
        foreach (var file in files)
        {
            ct.ThrowIfCancellationRequested();
            string target = Path.Combine(tree, file.Path);
            string? existing = state.Active == null ? null : GameFile(state.Active, file.Path);
            if (await Matches(target, file, ct))
            {
                if (ReleaseManifest.NeedsSigning(file)) verifyPublisher(target, file, stock);
                continue; // Fully validated file from a prior attempt.
            }
            bool reuse = existing != null && await Matches(existing, file, ct);
            if (!reuse) missing = checked(missing + file.Size);
            if (dryRun) {
                if (!reuse) Console.WriteLine($"Skulle hämta {file.Path} ({file.Size} byte).");
                continue;
            }
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            if (reuse)
                File.Copy(existing!, target, overwrite: true);
            else {
                Console.WriteLine($"Hämtar {file.Path} ({file.Size} byte)…");
                downloaded += await Download(file, target, Path.Combine(staging, "partial", file.Sha256.ToUpperInvariant()), ct);
            }
            if (!await Matches(target, file, ct)) throw new InvalidDataException($"Fel kontrollsumma för {file.Path}.");
            if (ReleaseManifest.NeedsSigning(file)) verifyPublisher(target, file, stock);
        }
        Console.WriteLine(dryRun ? $"Filer som kräver hämtning: {missing} byte." : $"Hämtat: {downloaded} byte.");
        if (dryRun) return next;

        // Metadata resides beside the game files, outside their manifest namespace.
        // Move the whole directory before publishing its name. An interrupted move
        // can only leave an unreferenced version, never a half-updated active one.
        string version = PathFor(next);
        Directory.CreateDirectory(Path.GetDirectoryName(version)!);
        Directory.CreateDirectory(version);
        CheckTree(tree, files);
        Directory.Move(tree, Path.Combine(version, "game"));
        await File.WriteAllBytesAsync(Path.Combine(version, "manifest.json"), bytes, ct);
        await File.WriteAllBytesAsync(Path.Combine(version, "manifest.sig"), signature, ct);
        Save(new(state.Channel, next, state.Pending ? state.Previous : state.Active, Pending: true));
        return next;
    }

    internal string GameFile(Installation install, string name) => Path.Combine(PathFor(install), "game", name);

    internal async Task<string> VerifyInstalled(Installation install, ECDsa key, string channel, CancellationToken ct)
    {
        string version = PathFor(install);
        byte[] bytes = await File.ReadAllBytesAsync(Path.Combine(version, "manifest.json"), ct);
        if (!Convert.ToHexString(SHA256.HashData(bytes)).Equals(install.ManifestHash, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Installerat manifest stämmer inte med den aktiva versionen.");
        var manifest = ReleaseManifest.Read(bytes, await File.ReadAllBytesAsync(Path.Combine(version, "manifest.sig"), ct), key, channel);
        StockRuntime.Validate(manifest);
        CheckTree(GameFile(install, ""), manifest.Files);
        foreach (var file in manifest.Files)
        {
            string path = GameFile(install, file.Path);
            if (!await Matches(path, file, ct)) throw new InvalidDataException($"Installerad fil stämmer inte: {file.Path}.");
            // The bytes match the signed manifest and were publisher-checked before activation.
            // Starting offline must not depend on an online certificate revocation check.
        }
        return manifest.EntryPoint;
    }

    static void CheckTree(string rootPath, IEnumerable<ReleaseFile> files)
    {
        var allowed = files.Select(f => f.Path).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var directories = new Stack<string>();
        directories.Push(rootPath);
        while (directories.TryPop(out string? dir)) {
            foreach (string entry in Directory.EnumerateFileSystemEntries(dir)) {
                var attributes = File.GetAttributes(entry);
                if (attributes.HasFlag(FileAttributes.ReparsePoint))
                    throw new InvalidDataException("En länk finns i versionskatalogen.");
                if (attributes.HasFlag(FileAttributes.Directory)) directories.Push(entry);
                else if (!allowed.Remove(Path.GetRelativePath(rootPath, entry).Replace(Path.DirectorySeparatorChar, '/')))
                    throw new InvalidDataException($"Oväntad fil i versionskatalogen: {Path.GetFileName(entry)}.");
            }
        }
        if (allowed.Count != 0) throw new InvalidDataException("Versionskatalogen är inte komplett.");
    }

    internal void Confirm(InstallState state) { if (state.Pending) Save(state with {Pending = false}); }

    internal void Rollback(InstallState state) {
        if (state.Active == null || state.Previous == null) throw new InvalidOperationException("Ingen tidigare version finns.");
        Save(new(state.Channel, state.Previous, null, state.Active.ManifestHash));
    }

    internal void Prune(InstallState state)
    {
        string versions = Path.Combine(root, "versions");
        if (state.Active == null || !Directory.Exists(versions)) return;
        // A previous launcher can exit while its game is still using older packages.
        // A directly started Shipping executable must get the same protection.
        if (GameProcess.IsRunning(root)) return;
        foreach (string directory in Directory.GetDirectories(versions)) {
            string id = Path.GetFileName(directory);
            if (!Guid.TryParseExact(id, "N", out _) || id == state.Active.Directory || id == state.Previous?.Directory)
                continue;
            try {
                // Preserve saves if a pilot build ever ignores the configured user directory.
                if (File.GetAttributes(directory).HasFlag(FileAttributes.ReparsePoint)
                    || Directory.Exists(Path.Combine(directory, "game", "Lunden", "Saved"))) continue;
                Directory.Delete(directory, recursive: true);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) {
                Console.Error.WriteLine($"Äldre versionsfiler kunde inte tas bort: {ex.Message}");
            }
        }
    }

    void Save(InstallState state)
    {
        string tmp = StatePath + ".tmp";
        using (var stream = new FileStream(tmp, FileMode.Create, FileAccess.Write, FileShare.None)) {
            JsonSerializer.Serialize(stream, state, ReleaseManifest.Json);
            stream.Flush(flushToDisk: true);
        }
        File.Move(tmp, StatePath, overwrite: true);
    }

    static async Task<bool> Matches(string path, ReleaseFile file, CancellationToken ct)
    {
        var info = new FileInfo(path);
        if (!info.Exists || info.Length != file.Size) return false;
        await using var stream = File.OpenRead(path);
        var sha = await SHA256.HashDataAsync(stream, ct);
        return Convert.ToHexString(sha).Equals(file.Sha256, StringComparison.OrdinalIgnoreCase);
    }

    internal async Task<long> Download(ReleaseFile file, string target, string partial, CancellationToken ct)
    {
        long received = 0;
        for (int attempt = 0; ; attempt++) {
            try {
                await DownloadOnce(file, target, partial, bytes => received += bytes, ct);
                return received;
            }
            catch (Exception ex) when (attempt == 0 && !ct.IsCancellationRequested &&
                (ex is EndOfStreamException or HttpIOException or OperationCanceledException ||
                 ex is HttpRequestException http && (http.StatusCode == null || (int)http.StatusCode >= 500))) {
                Console.Error.WriteLine($"Hämtningen av {file.Path} avbröts, försöker igen.");
                await Task.Delay(250, ct);
            }
        }
    }

    async Task DownloadOnce(ReleaseFile file, string target, string partial, Action<int> received, CancellationToken ct)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(partial)!);
        var part = new FileInfo(partial);
        long offset = part.Exists ? part.Length : 0;
        if (part.Exists && offset == file.Size && await Matches(partial, file, ct)) {
            File.Move(partial, target, true); return;
        }
        if (offset >= file.Size) offset = 0;
        using var request = new HttpRequestMessage(HttpMethod.Get, file.Url);
        if (offset != 0) request.Headers.Range = new RangeHeaderValue(offset, null);
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        response.EnsureSuccessStatusCode();
        if (response.StatusCode == HttpStatusCode.PartialContent)
        {
            var range = response.Content.Headers.ContentRange;
            if (range?.Unit != "bytes" || range.From != offset || range.To != file.Size - 1 || range.Length != file.Size)
                throw new InvalidDataException($"Fel intervall för {file.Path}.");
        }
        else if (response.StatusCode == HttpStatusCode.OK) offset = 0; // Server ignored Range.
        else throw new InvalidDataException($"Oväntat svar för {file.Path}.");

        using (var output = new FileStream(partial, offset == 0 ? FileMode.Create : FileMode.Append, FileAccess.Write, FileShare.None))
        await using (var input = await response.Content.ReadAsStreamAsync(ct))
        {
            var buffer = new byte[81920];
            long count = offset;
            using var readTimeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            while (true)
            {
                readTimeout.CancelAfter(TimeSpan.FromSeconds(20));
                int n = await input.ReadAsync(buffer, readTimeout.Token);
                readTimeout.CancelAfter(Timeout.InfiniteTimeSpan);
                if (n == 0) break;
                if (n > file.Size - count) throw new InvalidDataException($"För stor fil: {file.Path}.");
                await output.WriteAsync(buffer.AsMemory(0, n), ct);
                count += n;
                received(n);
            }
            if (count != file.Size) throw new EndOfStreamException($"Hämtningen avbröts: {file.Path}.");
        }
        if (!await Matches(partial, file, ct)) {
            File.Delete(partial); throw new InvalidDataException($"Fel kontrollsumma för {file.Path}.");
        }
        File.Move(partial, target, true);
    }
}
