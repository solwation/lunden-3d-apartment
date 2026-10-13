import * as THREE from 'three';
import { awardTask, taskReward } from './stats.js';
import { TASK_NOTE, TASK_POOL, HALL_CARE } from './config.js';
import { sfx } from './audio.js';

// Everyday tasks manager (LIFE-030, #392).
// Driven entirely by domain events ('ate', 'washed', 'dishwasher', 'wipe', 'rubbishOut', 'vacuumed' …),
// not by hardcoded click sequences.
// Sub-goals can be completed in any order and never count twice per task cycle.
// Hints can be turned on or off via setting / UI toggle (persisted in localStorage).
// Hidden hall work is discovered by reading (#594); chicken work by a pan attempt or actual grill placement (#710).
// Discovery emits tasksShown, which lets hallcare.js lay out the jacket and shoes.

const HINTS_KEY = 'lunden.taskHints';

export const TASK_DEFINITIONS = [
  {
    id: 'makeSandwich',
    title: 'Gör en macka',
    goals: [
      { id: 'prep', label: 'Lägg smör eller pålägg på brödet' },
      { id: 'eat', label: 'Ät upp mackan' },
    ],
    hint: 'Ta fram bröd från skafferiet, smör eller pålägg från kylen och ät mackan.',
  },
  {
    id: 'resetKitchen',
    title: 'Återställ köket',
    goals: [
      { id: 'dishes', label: 'Diska eller kör diskmaskinen' },
      { id: 'wipe', label: 'Torka av köksbänken' },
      { id: 'rubbish', label: 'Bär ut en soppåse om det finns sopor' },
    ],
    hint: 'Ställ disk i diskmaskinen eller diska vid kranen, torka av bänken med disktrasan och bär befintliga sopor till behållarna vid parkeringen. Tomma kärl behöver inte tömmas.',
  },
  {
    id: 'snackClean',
    title: 'Städa efter mellanmålet',
    goals: [
      { id: 'crumbs', label: 'Dammsug upp smulor eller damm från golvet' },
    ],
    hint: 'Hämta skaftdammsugaren i klädkammaren under trappan och dammsug golvet.',
  },
  {
    id: 'tidyHall',
    title: 'Städa i hallen',
    hidden: true,
    goals: [
      { id: 'hallJacket', label: 'Häng upp jackan på kroken eller i hallgarderoben' },
      { id: 'hallShoes', label: 'Ställ skorna på skohyllan' },
    ],
    hint: 'Jackan och skorna ligger på golvet i hallen innanför ytterdörren. Häng jackan på kroken eller i hallgarderoben och ställ skorna på skohyllan.',
  },
  {
    id: 'grillChicken', title: 'Gör något gott av kycklingen', hidden: true, discovery: 'chickenPanRefused',
    goals: [
      { id: 'fire', label: 'Tänd grillen på gården' },
      { id: 'place', label: 'Lägg kycklingen på grillen' },
      { id: 'golden', label: 'Ta den gyllene kycklingen från grillen' },
    ],
    hint: 'Kycklingen behöver gårdsgrillen. Tänd den, lägg på den råa kycklingen och ta den när den är gyllene, innan den bränns.',
  },
  {
    id: 'washDish', title: 'Diska efter dig',
    goals: [{ id: 'wash', label: 'Diska en använd sak' }],
    hint: 'Använd en tallrik, ett glas eller ett redskap och diska det vid kökskranen.',
  },
  {
    id: 'makeBed', title: 'Bädda efter vilan',
    goals: [{ id: 'rest', label: 'Vila i en säng' }, { id: 'bed', label: 'Bädda en säng efteråt' }],
    hint: 'Lägg dig en stund, res dig och bädda täcket med E.',
  },
];

export class TasksManager {
  constructor({ life, scene = null }) {
    this.life = life;
    this.scene = scene;
    this.hints = this.loadHints();
    this.tasks = TASK_DEFINITIONS.map((def) => ({
      ...def,
      completedGoals: new Set(),
      isDone: false,
      shown: !def.hidden,
      active: false,
      completions: 0,
      readyAt: 0,
      placedBird: null, grilledBird: null, replenished: false, failed: false,
    }));

    this.elapsed = 0;
    this.refill();
    this.onTaskCompleted = null;
    this.initEvents();
    life.keepPart('tasks', { save: () => this.save(), load: (v) => this.load(v) });
  }

  loadHints() {
    try {
      const v = localStorage.getItem(HINTS_KEY);
      return v !== null ? v === 'true' : true;
    } catch {
      return true;
    }
  }

  setHints(enabled) {
    this.hints = !!enabled;
    try {
      localStorage.setItem(HINTS_KEY, String(this.hints));
    } catch {}
    this.renderUI();
  }

  toggleHints() {
    this.setHints(!this.hints);
    return this.hints;
  }

  initEvents() {
    if (!this.life?.onEvent) return;
    this.life.onEvent((kind, data) => this.handleEvent(kind, data));
  }

  handleEvent(kind, data = {}) {
    const item = data.item;
    if (kind === 'chickenPlaced' && item?.type === 'chicken' && data.surface === 'grill') {
      this.discover('grillChicken');
      if (data.state !== 'raw') this.failChickenCycle();
    }
    if (kind === 'chickenPanRefused') {
      this.discover('grillChicken');
      if (data.state && data.state !== 'raw') this.failChickenCycle();
    }
    const chickenTask = this.tasks.find(t => t.id === 'grillChicken');
    if (chickenTask?.active) {
      if (kind === 'grillLit' && data.surface === 'grill') this.completeGoal('grillChicken', 'fire');
      if (item?.type === 'chicken' && typeof item.id === 'string' && data.surface === 'grill') {
        if (kind === 'chickenPlaced' && data.state === 'raw' && !item.machine?.cooked && !item.machine?.burnt) {
          chickenTask.placedBird = item.id; this.completeGoal('grillChicken', 'fire'); this.completeGoal('grillChicken', 'place');
        }
        if (kind === 'grilled' && item.id === chickenTask.placedBird && data.state === 'golden' && item.machine?.cooked && !item.machine?.burnt) {
          chickenTask.grilledBird = item.id; this.life.dirty = true;
        }
        if (kind === 'chickenBurnt' && item.id === chickenTask.placedBird) this.failChickenCycle();
        if (kind === 'chickenTaken' && item.id === chickenTask.placedBird && item.id === chickenTask.grilledBird && data.state === 'golden' && item.machine?.cooked && !item.machine?.burnt) this.completeGoal('grillChicken', 'golden');
      }
    }
    const sandwich = (data.type ?? item?.type) === 'breadSlice' && (data.parts ?? item?.parts)?.length > 0;
    if (sandwich && ['prepared', 'bite', 'ate'].includes(kind)) {
      this.completeGoal('makeSandwich', 'prep');
      if (kind === 'ate') this.completeGoal('makeSandwich', 'eat');
    }
    if ((kind === 'washed' && (item || data.what)) || (kind === 'dishwasher' && data.washed?.length)) {
      this.completeGoal('resetKitchen', 'dishes');
    }
    if (kind === 'wipe' && data.point && this.life.worktopAt([data.point.x, data.point.y, data.point.z])) {
      this.completeGoal('resetKitchen', 'wipe');
    }
    if (kind === 'rubbishOut' && data.amount > 0) this.completeGoal('resetKitchen', 'rubbish');
    // No task requires creating rubbish by throwing useful food or objects away.
    if (['washed', 'dishwasher', 'wipe'].includes(kind) && !this.hasRubbish()) this.completeGoal('resetKitchen', 'rubbish');
    if (kind === 'vacuumed' && data.amount > 0) this.completeGoal('snackClean', 'crumbs');
    if (kind === 'washed' && (item || data.what)) this.completeGoal('washDish', 'wash');
    if (kind === 'bedRumpled') this.completeGoal('makeBed', 'rest');
    if (kind === 'bedMade') this.completeGoal('makeBed', 'bed');
    if (kind === 'hallTidied' && this.isShown('tidyHall')) this.completeGoal('tidyHall', data.item?.type);
  }

  failChickenCycle() {
    const task = this.tasks.find(t => t.id === 'grillChicken');
    if (!task?.active || task.isDone) return;
    task.failed = task.isDone = true; task.active = false; task.replenished = false;
    task.readyAt = this.elapsed + TASK_POOL.cooldown;
    this.life.say('Kycklingen blev inte gyllene den här gången. En ny chans väntar efter ett speldygn.');
    this.refill(); this.life.dirty = true; this.renderUI(); // no task reward on failure
  }

  isShown(taskId) { return !!this.tasks.find((t) => t.id === taskId)?.shown; }
  activeTasks() { return this.tasks.filter((t) => t.active); }
  shownIds() { return this.tasks.filter((t) => t.shown).map((t) => t.id); }

  /** The list is read (the panel opens): hidden tasks join it, once. Things already tidied before the task existed
   * (a save from before #594) count as done without a bonus. Returns the newly shown ids. */
  read() {
    const added = this.tasks.filter((t) => !t.shown && !t.discovery);
    return this.showTasks(added);
  }

  discover(id) {
    const task = this.tasks.find(t => t.id === id);
    return task && !task.shown ? this.showTasks([task]) : [];
  }

  showTasks(added) {
    if (!added.length) return [];
    for (const t of added) {
      t.shown = true;
      if (t.id === 'tidyHall') {
        for (const it of this.life.items.all()) if (HALL_CARE.tidy[it.place?.store] === it.type && t.goals.some((g) => g.id === it.type)) t.completedGoals.add(it.type);
        t.isDone = t.goals.every((g) => t.completedGoals.has(g.id));
      }
    }
    // Newly discovered tasks get a slot now, keeping at most three; displaced progress remains queued.
    for (const t of added) {
      if (t.isDone) { t.readyAt = this.elapsed + TASK_POOL.cooldown; continue; }
      const active = this.activeTasks();
      if (active.length >= TASK_POOL.active) {
        // Once the bird is in play, reading the hall task cannot queue its cooking events (#710).
        ([...active].reverse().find(other => other.id !== 'grillChicken') ?? active.at(-1)).active = false;
      }
      t.active = true;
    }
    this.refill();
    this.life.emit('tasksShown', { ids: this.shownIds(), added: added.map((t) => t.id) });
    this.life.dirty = true;
    this.renderUI();
    return added.map((t) => t.id);
  }

  hasRubbish() {
    const I = this.life.items;
    return I.all().some((it) => (I.has(it, 'bin') || it.type === 'rubbishBag') && it.amount > 0);
  }

  /** Stable definition order, discovered tasks only; never recycle the just-completed task. */
  refill({ restored = false } = {}) {
    // Renew only when the cooled-down chicken task receives an active slot. A full pool cannot
    // expose a fresh rewardable bird while its task is still queued. Restoration stays silent.
    let slots = TASK_POOL.active - this.activeTasks().length;
    for (const t of this.tasks) {
      if (!slots) break;
      if (!t.shown || t.active || t.readyAt > this.elapsed) continue;
      if (t.id === 'grillChicken' && t.isDone && !t.replenished) {
        if (restored) continue;
        t.replenished = true; this.life.emit('chickenTaskReady', { task: t.id }); this.life.dirty = true;
      }
      if (t.isDone) { t.completedGoals.clear(); t.isDone = t.failed = false; t.placedBird = t.grilledBird = null; }
      t.active = true;
      slots--;
    }
  }

  update(dt) {
    this.elapsed += Math.max(0, dt);
    const before = this.activeTasks().map((t) => t.id).join();
    this.refill();
    if (before !== this.activeTasks().map((t) => t.id).join()) {
      this.life.dirty = true;
      this.renderUI();
    }
  }

  save() {
    // load() reconstructs untouched task fields; retain every changed field and
    // explicit zero counters/deadlines on completed tasks (their load defaults differ).
    const tasks = {};
    for (const t of this.tasks) {
      const state = {};
      const completed = t.isDone || t.failed || t.goals.every(g => t.completedGoals.has(g.id));
      if (t.completedGoals.size) state.goals = [...t.completedGoals];
      if (t.completions || completed) state.completions = t.completions;
      if (t.readyAt || completed) state.readyAt = t.readyAt;
      if (t.isDone) state.done = true;
      if (t.placedBird !== null) state.placedBird = t.placedBird;
      if (t.grilledBird !== null) state.grilledBird = t.grilledBird;
      if (t.replenished) state.replenished = true;
      if (t.failed) state.failed = true;
      if (Object.keys(state).length) tasks[t.id] = state;
    }
    return { v: 2, elapsed: this.elapsed, active: this.activeTasks().map((t) => t.id), shown: this.shownIds(),
      tasks };
  }

  load(record) {
    if (![1, 2].includes(record?.v)) return;
    this.elapsed = Number.isFinite(record.elapsed) ? Math.max(0, record.elapsed) : 0;
    for (const t of this.tasks) {
      const saved = record.v === 1 ? record.goals?.[t.id] : record.tasks?.[t.id]?.goals;
      t.completedGoals = new Set((Array.isArray(saved) ? saved : []).filter((id) => t.goals.some((g) => g.id === id)));
      t.isDone = t.goals.every((g) => t.completedGoals.has(g.id));
      const state = record.v === 2 ? record.tasks?.[t.id] : null;
      t.failed = !!state?.failed; t.isDone ||= t.failed;
      t.completions = Number.isSafeInteger(state?.completions) ? Math.max(0, state.completions) : Number(t.isDone);
      t.readyAt = Number.isFinite(state?.readyAt) ? Math.max(0, state.readyAt) : t.isDone ? this.elapsed + TASK_POOL.cooldown : 0;
      t.placedBird = typeof state?.placedBird === 'string' ? state.placedBird : null;
      t.grilledBird = state?.grilledBird === t.placedBird ? t.placedBird : null;
      t.replenished = !!state?.replenished;
      t.shown = !t.hidden || (Array.isArray(record.shown) && record.shown.includes(t.id));
      t.active = record.v === 2 && (Array.isArray(record.active) && record.active.includes(t.id)) && t.shown && !t.isDone;
    }
    // Tolerate stale/newer definitions and corrupt records without ever exceeding the cap.
    this.activeTasks().slice(TASK_POOL.active).forEach((t) => { t.active = false; });
    this.refill({ restored: true });
    this.life.emit('tasksShown', { ids: this.shownIds(), added: [], restored: true });
    this.renderUI(); // restoring progress never awards points again
  }

  reset({ newChicken = false } = {}) {
    this.elapsed = 0;
    for (const t of this.tasks) {
      t.completedGoals.clear(); t.isDone = t.active = false;
      t.completions = t.readyAt = 0; t.shown = !t.hidden;
      t.placedBird = t.grilledBird = null; t.replenished = t.failed = false;
    }
    if (newChicken) this.life.emit('chickenTaskReset', { task: 'grillChicken' });
    this.refill();
    this.life.dirty = true;
    this.renderUI();
  }

  completeGoal(taskId, goalId) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task?.active || task.isDone || !task.goals.some((g) => g.id === goalId)) return false;

    // Check if goal is already completed in this task cycle
    if (task.completedGoals.has(goalId)) return false;

    task.completedGoals.add(goalId);

    // Check if all goals are complete
    const allDone = task.goals.every((g) => task.completedGoals.has(g.id));
    if (allDone && !task.isDone) {
      task.isDone = true;
      task.active = false;
      task.completions++; task.replenished = false;
      task.readyAt = this.elapsed + TASK_POOL.cooldown;
      this.triggerTaskComplete(task);
      this.refill();
    }

    this.life.dirty = true;
    this.renderUI();
    return true;
  }

  triggerTaskComplete(task) {
    sfx.pling?.(null, 1.2);
    awardTask(task.id, task.title);
    if (this.onTaskCompleted) this.onTaskCompleted(task);
  }

  // Active / next hint for prompts or HUD
  currentHint() {
    if (!this.hints) return null;
    const pending = this.tasks.find((t) => t.active);
    if (!pending) return null;
    return pending.hint;
  }

  bindUI({ modalEl, listEl, hintsBtn, closeBtn, onClose }) {
    this.modalEl = modalEl;
    this.listEl = listEl;
    this.hintsBtn = hintsBtn;
    this.closeBtn = closeBtn;

    if (this.hintsBtn) {
      this.hintsBtn.addEventListener('click', () => {
        this.toggleHints();
      });
    }

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => {
        onClose();
      });
    }

    this.renderUI();
  }

  showUI(show = true) {
    if (show) this.read();
    if (!this.modalEl) return;
    this.modalEl.hidden = !show;
    if (show) this.renderUI();
  }

  renderUI() {
    if (this.hintsBtn) {
      this.hintsBtn.textContent = this.hints ? 'På' : 'Av';
      this.hintsBtn.setAttribute('aria-pressed', String(this.hints));
      this.hintsBtn.classList.toggle('on', this.hints);
    }

    this.drawCard?.();
    if (!this.listEl) return;

    this.listEl.innerHTML = '';
    for (const task of this.tasks) {
      if (!task.active) continue;
      const card = document.createElement('div');
      card.className = `task-card${task.isDone ? ' done' : ''}`;

      const titleRow = document.createElement('div');
      titleRow.className = 'task-title';
      titleRow.innerHTML = `<span>${task.title} · +${taskReward(task.id)}</span>${task.isDone ? '<span class="task-badge">✓ Utfört</span>' : ''}`;
      card.append(titleRow);

      const goalsList = document.createElement('ul');
      goalsList.className = 'task-goals';
      for (const g of task.goals) {
        const isGoalDone = task.completedGoals.has(g.id);
        const li = document.createElement('li');
        li.className = isGoalDone ? 'goal-done' : '';
        li.innerHTML = `<span>${isGoalDone ? '☑' : '☐'}</span> <span>${g.label}</span>`;
        goalsList.append(li);
      }
      card.append(goalsList);

      if (this.hints && !task.isDone && task.hint) {
        const hintDiv = document.createElement('div');
        hintDiv.className = 'task-hint';
        hintDiv.textContent = `💡 Tips: ${task.hint}`;
        card.append(hintDiv);
      }

      this.listEl.append(card);
    }
  }

  build3DCard(cabinet) {
    const { w, h, tilt, inset, height, across } = TASK_NOTE;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 640;
    const g = canvas.getContext('2d');
    this.drawCard = () => {
      g.fillStyle = '#fffdf0';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.strokeStyle = '#c2baa2';
      g.lineWidth = 4;
      g.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

      g.fillStyle = '#23324a';
      g.font = 'bold 36px system-ui, sans-serif';
      g.fillText('📋 UPPDRAG', 24, 55);

      let y = 105;
      for (const t of this.activeTasks()) {
        g.fillStyle = '#23324a';
        g.font = 'bold 27px system-ui, sans-serif';
        g.fillText(`${t.title} · +${taskReward(t.id)}`, 24, y, canvas.width - 48);
        g.font = '22px system-ui, sans-serif';
        y += 34;
        for (const goal of t.goals) {
          let line = t.completedGoals.has(goal.id) ? '☑' : '☐';
          for (const word of goal.label.split(' ')) {
            if (g.measureText(`${line} ${word}`).width > canvas.width - 48) {
              g.fillText(line, 24, y); y += 29; line = '   ' + word;
            } else line += ' ' + word;
          }
          g.fillText(line, 24, y); y += 29;
        }
        y += 25;
      }

      if (this.cardTexture) this.cardTexture.needsUpdate = true;
    };
    this.drawCard();
    const tex = this.cardTexture = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geom = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.receiveShadow = true; // like the door it hangs on: no evening sun through the house (#607)

    // On the actual inner door face; parent rotation carries the sheet with the hinge (#509).
    const face = cabinet.innerFace;
    mesh.position.set(face.x+inset, face.height*height, face.width*across);
    mesh.rotation.set(0, Math.PI/2, tilt);
    cabinet.door.add(mesh);

    const cardTarget = {
      name: 'uppdragslappen',
      kind: 'taskNote',
      get blocked() { return !cabinet.isOpen; },
      blockedText: 'Öppna skåpet',
      verb: 'läsa',
      object: mesh,
      pickable: mesh,
    };
    mesh.userData.door = cardTarget;

    this.card = cardTarget;
    return cardTarget;
  }
}
