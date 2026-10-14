import * as THREE from 'three';
import { awardTask, taskReward, taskPaid, keepTaskDay, taskBonusFor, reconcileTaskDay, stats } from './stats.js';
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
  constructor({ life, scene = null, now = () => new Date(), random = Math.random }) {
    this.now = now; this.random = random; this.initializing = true;
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
      readyAt: 0, points: null,
      placedBird: null, grilledBird: null, replenished: false, failed: false,
    }));

    this.elapsed = 0; this.day = null; this.bonusPoints = null; this.selected = []; this.renewChicken = false;
    const cachedAtStart = stats.taskDay?.v === 3 ? stats.taskDay : null;
    if (!cachedAtStart) this.ensureDay();
    this.onTaskCompleted = null;
    this.initEvents();
    this.restored = false;
    life.keepPart('tasks', { save: () => this.save(), load: (v) => {
      // The first home restore may contain a legacy record that predates this manager's fresh selection.
      const saved = !this.restored && !cachedAtStart ? v : stats.taskDay?.v === 3 ? stats.taskDay : v;
      this.restored = true; this.load(saved);
    } });
    if (cachedAtStart) this.load(cachedAtStart);
    this.initializing = false; this.persist();
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
    this.ensureDay();
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
    this.persist();
  }

  failChickenCycle() {
    const task = this.tasks.find(t => t.id === 'grillChicken');
    if (!task?.active || task.isDone || task.failed) return;
    task.failed = true; this.renewChicken = true;
    this.life.say('Kycklingen blev inte gyllene. Du får en ny rå kyckling att försöka med.');
    this.life.dirty = true; this.persist(); this.renderUI(); // no reward for a failed attempt
  }

  isShown(taskId) { return !!this.tasks.find((t) => t.id === taskId)?.shown; }
  activeTasks() { return this.tasks.filter((t) => t.active); }
  shownIds() { return this.tasks.filter((t) => t.shown).map((t) => t.id); }

  /** The list is read (the panel opens): hidden tasks join it, once. Things already tidied before the task existed
   * (a save from before #594) count as done without a bonus. Returns the newly shown ids. */
  read() {
    this.ensureDay();
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
    // Discovery is remembered immediately but never replaces today's fixed set.
    // Existing hall items stay where the visitor left them; tomorrow excludes an already tidy hall.
    this.life.emit('tasksShown', { ids: this.shownIds(), added: added.map((t) => t.id) });
    this.life.dirty = true; this.persist();
    this.renderUI();
    return added.map((t) => t.id);
  }

  hasRubbish() {
    const I = this.life.items;
    return I.all().some((it) => (I.has(it, 'bin') || it.type === 'rubbishBag') && it.amount > 0);
  }

  localDay() {
    const d = this.now();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  available(task) {
    if (!task.shown) return false;
    // Hall work must still be possible without undoing the visitor's tidying or moving their things.
    return task.id !== 'tidyHall' || !task.goals.every(g => this.life.items.all().some(it =>
      it.type === g.id && HALL_CARE.tidy[it.place?.store] === it.type));
  }

  ensureDay() {
    const day = this.localDay();
    if (this.day === day) return false;
    this.day = day; this.bonusPoints = null;
    for (const t of this.tasks) {
      t.completedGoals.clear(); t.isDone = t.active = t.failed = t.replenished = false;
      t.completions = t.readyAt = 0; t.points = null; t.placedBird = t.grilledBird = null;
    }
    const pool = this.tasks.filter(t => this.available(t));
    for (let n = pool.length - 1; n > 0; n--) {
      const k = Math.min(n, Math.max(0, Math.floor(this.random() * (n + 1))));
      [pool[n], pool[k]] = [pool[k], pool[n]];
    }
    this.selected = pool.slice(0, TASK_POOL.active).map(t => t.id);
    for (const t of this.tasks) t.active = this.selected.includes(t.id);
    this.renewChicken = this.selected.includes('grillChicken');
    this.applyReceipts(); this.life.dirty = true; this.persist();
    return true;
  }

  applyReceipts() {
    this.bonusPoints = taskBonusFor(this.day) ?? this.bonusPoints;
    for (const t of this.activeTasks()) if (taskPaid(t.id, this.day)) {
      t.isDone = true; t.failed = false; t.completedGoals = new Set(t.goals.map(g => g.id));
    }
    if (this.tasks.find(t => t.id === 'grillChicken')?.isDone) this.renewChicken = false;
  }

  reconcileBonus() {
    if (this.bonusPoints !== null || this.selected.length !== 3 || !this.activeTasks().every(t => t.isDone)) return false;
    const record = this.save();
    if (!reconcileTaskDay(record)) return false;
    this.bonusPoints = record.bonusPoints;
    return true;
  }

  persist() {
    if (this.initializing) return;
    const record = this.save();
    if (JSON.stringify(record) !== JSON.stringify(stats.taskDay)) keepTaskDay(record);
  }

  update(dt) {
    this.elapsed += Math.max(0, dt);
    const changed = this.ensureDay();
    const bonusChanged = this.reconcileBonus();
    // Registration/restoration of the real chicken finishes before the first ordinary frame.
    // A saved pending renewal is cleared before emit, so repeated updates/reloads do not duplicate it.
    if (this.renewChicken) {
      this.renewChicken = false;
      const t = this.tasks.find(t => t.id === 'grillChicken');
      if (t?.active && !t.isDone) {
        t.completedGoals.clear(); t.placedBird = t.grilledBird = null; t.failed = false;
        const bird = this.life.extras?.get('chicken')?.save();
        // Preserve an already usable raw bird, including one restored after a pending renewal.
        if (!bird || bird.done || bird.burnt) {
          this.life.emit('chickenTaskReady', { task: t.id });
          this.life.flush?.(); // save the renewed generation before clearing its daily pending flag
        }
      }
      this.life.dirty = true; this.persist(); this.renderUI();
    } else if (changed || bonusChanged) this.renderUI();
  }

  save() {
    const tasks = {};
    for (const t of this.tasks) {
      const state = {};
      if (t.completedGoals.size) state.goals = [...t.completedGoals];
      if (t.completions || t.isDone) state.completions = t.completions;
      if (t.isDone) state.done = true;
      if (t.points !== null) state.points = t.points;
      if (t.placedBird !== null) state.placedBird = t.placedBird;
      if (t.grilledBird !== null) state.grilledBird = t.grilledBird;
      if (t.failed) state.failed = true;
      if (Object.keys(state).length) tasks[t.id] = state;
    }
    return { v: 3, day: this.day, bonusPoints: this.bonusPoints, selected: [...this.selected], shown: this.shownIds(),
      renewChicken: this.renewChicken, tasks };
  }

  load(record) {
    if (![1, 2, 3].includes(record?.v)) return;
    this.bonusPoints = record.v === 3 && Number.isFinite(record.bonusPoints) && record.bonusPoints >= 0 ? record.bonusPoints : null;
    for (const t of this.tasks) {
      const saved = record.v === 1 ? record.goals?.[t.id] : record.tasks?.[t.id]?.goals;
      t.completedGoals = new Set((Array.isArray(saved) ? saved : []).filter(id => t.goals.some(g => g.id === id)));
      t.isDone = t.goals.every(g => t.completedGoals.has(g.id));
      const state = record.v !== 1 ? record.tasks?.[t.id] : null;
      t.isDone ||= !!state?.done; t.failed = !!state?.failed;
      if (record.v !== 3 && t.failed) t.isDone = false;
      t.completions = Number.isSafeInteger(state?.completions) ? Math.max(0, state.completions) : record.v === 3 ? 0 : Number(t.isDone);
      t.points = Number.isFinite(state?.points) && state.points >= 0 ? state.points : null;
      t.readyAt = 0; t.replenished = false;
      t.placedBird = typeof state?.placedBird === 'string' ? state.placedBird : null;
      t.grilledBird = t.placedBird !== null && state?.grilledBird === t.placedBird ? t.placedBird : null;
      t.shown = !t.hidden || (Array.isArray(record.shown) && record.shown.includes(t.id));
    }
    if (record.v === 3 && /^\d{4}-\d{2}-\d{2}$/.test(record.day) && record.day !== this.localDay()) {
      this.day = null; this.ensureDay();
    } else {
      this.day = this.localDay();
      const known = id => this.tasks.some(t => t.id === id && t.shown);
      const ids = record.v === 3 ? record.selected : record.active;
      this.selected = [...new Set((Array.isArray(ids) ? ids : []).filter(known))].slice(0, TASK_POOL.active);
      // Migration retains the old active tasks/progress, then fills once from available definitions.
      // A valid v3 smaller pool stays fixed even if new definitions/discoveries arrive later today.
      if (record.v !== 3 || !Array.isArray(ids) || ids.some(id => !known(id))) {
        const candidates = this.tasks.filter(t => this.available(t) && !this.selected.includes(t.id));
        this.selected.push(...candidates.slice(0, TASK_POOL.active - this.selected.length).map(t => t.id));
      }
      for (const t of this.tasks) t.active = this.selected.includes(t.id);
      this.renewChicken = record.v === 3 ? !!record.renewChicken : !!this.tasks.find(t => t.active && t.id === 'grillChicken' && (t.isDone || t.failed));
      this.applyReceipts();
    }
    if (record.v === 3 && record.day === this.day) this.reconcileBonus();
    this.life.emit('tasksShown', { ids: this.shownIds(), added: [], restored: true });
    this.persist(); this.renderUI(); // no individual replay; a legitimate paid v3 set may reconcile its missing one-time bonus
  }

  reset({ newChicken = false } = {}) {
    this.elapsed = 0; this.day = null;
    for (const t of this.tasks) t.shown = !t.hidden;
    if (newChicken) this.life.emit('chickenTaskReset', { task: 'grillChicken' });
    this.ensureDay(); this.persist(); this.renderUI();
  }

  completeGoal(taskId, goalId) {
    this.ensureDay();
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task?.active || task.isDone || !task.goals.some((g) => g.id === goalId)) return false;

    // Check if goal is already completed in this task cycle
    if (task.completedGoals.has(goalId)) return false;

    task.completedGoals.add(goalId);

    // Check if all goals are complete
    const allDone = task.goals.every((g) => task.completedGoals.has(g.id));
    if (allDone && !task.isDone) {
      task.points = taskReward(task.id);
      task.isDone = true;
      task.completions++; task.replenished = false;
      this.triggerTaskComplete(task);
    }

    this.life.dirty = true; this.persist();
    this.renderUI();
    return true;
  }

  triggerTaskComplete(task) {
    sfx.pling?.(null, 1.2);
    const record = this.save();
    awardTask(task.id, task.title, this.day, record);
    this.bonusPoints = record.bonusPoints ?? null;
    if (this.onTaskCompleted) this.onTaskCompleted(task);
  }

  // Active / next hint for prompts or HUD
  currentHint() {
    if (!this.hints) return null;
    const pending = this.tasks.find((t) => t.active && !t.isDone);
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
    const heading = document.createElement('p');
    heading.textContent = `Dagens uppdrag · ${this.day}`;
    if (this.selected.length < TASK_POOL.active) heading.textContent += ` · ${this.selected.length} tillgängliga`;
    this.listEl.append(heading);
    if (this.bonusPoints !== null) {
      const bonus = document.createElement('p');
      bonus.className = 'task-bonus';
      bonus.textContent = `Alla uppdrag avklarade · +${this.bonusPoints}`;
      this.listEl.append(bonus);
    }
    for (const task of this.tasks) {
      if (!task.active) continue;
      const card = document.createElement('div');
      card.className = `task-card${task.isDone ? ' done' : ''}`;

      const titleRow = document.createElement('div');
      titleRow.className = 'task-title';
      titleRow.innerHTML = `<span>${task.title} · +${task.points ?? taskReward(task.id)}</span>${task.isDone ? '<span class="task-badge">✓ Utfört</span>' : ''}`;
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
      g.fillText('📋 DAGENS UPPDRAG', 24, 55);
      g.font = '20px system-ui, sans-serif'; g.fillText(this.bonusPoints !== null ? `Alla uppdrag avklarade · +${this.bonusPoints}` : this.day, 24, 82);

      let y = 105;
      for (const t of this.activeTasks()) {
        g.fillStyle = '#23324a';
        g.font = 'bold 27px system-ui, sans-serif';
        g.fillText(`${t.isDone ? '✓ ' : ''}${t.title} · +${t.points ?? taskReward(t.id)}`, 24, y, canvas.width - 48);
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
