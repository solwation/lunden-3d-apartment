// #1754 (part 3 of #1751): the hidden fishing quest. Its steps are *guess*: find the rod under the road bridge, catch a fish in Höje å,
// cook it on a kettle grill or in the pan without burning it (taken off the heat cooked through); eating it is optional. Nothing about it
// shows anywhere until it is completed; then it is paid once through the ordinary score (`bump('fishQuest')`, SCORE.first.fishQuest), a
// badge pops up and the task list shows it as a completed secret quest (tasks.js renderUI `secretQuests`).
// State: `stats.fishQuestSteps` = { s: [step ids reached], t: time completed or 0 } in the statistics record (localStorage, like the medals),
// persisted at once on every new step. Completed = paid: `t` is written (and saved) before the points go through, so a reload or a
// second completion never pays twice; the optional step can still be ticked afterwards (no points).
export const FISH_QUEST = {
  id: 'fishQuest',
  title: 'Fiskelycka',
  steps: [
    { id: 'rod', label: 'Hitta fiskespöet' },
    { id: 'catch', label: 'Fånga en fisk i Höje å' },
    { id: 'cook', label: 'Grilla eller stek fisken utan att bränna den' },
    { id: 'eat', label: 'Ät upp fisken', optional: true },
  ],
};
const IDS = FISH_QUEST.steps.map((s) => s.id);
const REQUIRED = FISH_QUEST.steps.filter((s) => !s.optional).map((s) => s.id);

/** The quest's record in `stats` (made / repaired in place). */
export function questState(stats) {
  let q = stats.fishQuestSteps;
  if (!q || typeof q !== 'object' || Array.isArray(q)) q = stats.fishQuestSteps = { s: [], t: 0 };
  q.s = Array.isArray(q.s) ? [...new Set(q.s.filter((id) => IDS.includes(id)))] : [];
  q.t = Number.isFinite(q.t) && q.t > 0 ? q.t : 0;
  return q;
}

export class FishQuest {
  /** stats: the statistics record (stats.js); save(): persist it now; pay(): the reward through the score (once); now: injectable. */
  constructor({ stats, save = () => {}, pay = () => {}, onDone = () => {}, now = () => Date.now() }) {
    Object.assign(this, { stats, save, pay, onDone, now });
  }
  get state() { return questState(this.stats); }
  get done() { return this.state.t > 0; }
  has(id) { return this.state.s.includes(id); }
  /** A step reached (`rod`, `catch`, `cook`, `eat`). Steps must come in order (no `cook` before a `catch`); returns true when new. */
  step(id) {
    const q = this.state, i = IDS.indexOf(id);
    if (i < 0 || q.s.includes(id)) return false;
    const before = FISH_QUEST.steps.slice(0, i).filter((s) => !s.optional).map((s) => s.id);
    if (!before.every((b) => q.s.includes(b))) return false;
    q.s.push(id);
    const complete = !q.t && REQUIRED.every((r) => q.s.includes(r));
    if (complete) q.t = this.now();
    this.save(); // the step and the completion are on disk before the reward
    if (complete) { this.pay(); this.onDone(); }
    return true;
  }
  /** For the task list: nothing until it is completed, then { title, steps: [{ label, done, optional }] }. */
  view() {
    if (!this.done) return null;
    return { id: FISH_QUEST.id, title: FISH_QUEST.title, t: this.state.t, steps: FISH_QUEST.steps.map((s) => ({ label: s.label, done: this.has(s.id), optional: !!s.optional })) };
  }
}
