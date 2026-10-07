import * as THREE from 'three';
import { badge } from './stats.js';
import { TASK_NOTE } from './config.js';
import { sfx } from './audio.js';

// Everyday tasks manager (LIFE-030, #392).
// Driven entirely by domain events ('ate', 'washed', 'dishwasher', 'wipe', 'rubbishOut', 'vacuumed' …),
// not by hardcoded click sequences.
// Sub-goals can be completed in any order and never count twice per task cycle.
// Hints can be turned on or off via setting / UI toggle (persisted in localStorage).

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
    }));

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
  }

  hasRubbish() {
    const I = this.life.items;
    return I.all().some((it) => (I.has(it, 'bin') || it.type === 'rubbishBag') && it.amount > 0);
  }

  save() {
    return { v: 1, goals: Object.fromEntries(this.tasks.map((t) => [t.id, [...t.completedGoals]])) };
  }

  load(record) {
    if (record?.v !== 1 || !record.goals || typeof record.goals !== 'object') return;
    for (const t of this.tasks) {
      const saved = Array.isArray(record.goals[t.id]) ? record.goals[t.id] : [];
      t.completedGoals = new Set(saved.filter((id) => t.goals.some((g) => g.id === id)));
      t.isDone = t.goals.every((g) => t.completedGoals.has(g.id));
    }
    this.renderUI(); // restoring progress never awards points again
  }

  completeGoal(taskId, goalId) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task || !task.goals.some((g) => g.id === goalId)) return false;

    // Check if goal is already completed in this task cycle
    if (task.completedGoals.has(goalId)) return false;

    task.completedGoals.add(goalId);

    // Check if all goals are complete
    const allDone = task.goals.every((g) => task.completedGoals.has(g.id));
    if (allDone && !task.isDone) {
      task.isDone = true;
      this.triggerTaskComplete(task);
    }

    this.life.dirty = true;
    this.renderUI();
    return true;
  }

  triggerTaskComplete(task) {
    sfx.pling?.(null, 1.2);
    badge(`📋 Uppdrag klart: ${task.title}!`, false);
    this.life.bump('tasks', 1, task.id);
    if (this.onTaskCompleted) this.onTaskCompleted(task);
  }

  resetTask(taskId) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task?.isDone) return;
    task.completedGoals.clear();
    task.isDone = false;
    this.life.dirty = true;
    this.renderUI();
  }

  // Active / next hint for prompts or HUD
  currentHint() {
    if (!this.hints) return null;
    const pending = this.tasks.find((t) => !t.isDone);
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
      const card = document.createElement('div');
      card.className = `task-card${task.isDone ? ' done' : ''}`;

      const titleRow = document.createElement('div');
      titleRow.className = 'task-title';
      titleRow.innerHTML = `<span>${task.title}</span>${task.isDone ? '<span class="task-badge">✓ Utfört</span>' : ''}`;
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

      if (task.isDone) {
        const again = document.createElement('button');
        again.type = 'button'; again.textContent = 'Gör igen'; again.className = 'task-again';
        again.dataset.task = task.id;
        again.addEventListener('click', () => this.resetTask(task.id));
        card.append(again);
      }
      this.listEl.append(card);
    }
  }

  build3DCard() {
    const { w, h, pos, tilt } = TASK_NOTE;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 320;
    const g = canvas.getContext('2d');
    this.drawCard = () => {
      g.fillStyle = '#fffdf0';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.strokeStyle = '#c2baa2';
      g.lineWidth = 4;
      g.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

      g.fillStyle = '#23324a';
      g.font = 'bold 24px system-ui, sans-serif';
      g.fillText('📋 UPPDRAG', 20, 40);

      g.font = '16px system-ui, sans-serif';
      let y = 80;
      for (const t of this.tasks) {
        g.fillStyle = t.isDone ? '#2e7d32' : '#23324a';
        g.fillText(`${t.isDone ? '✓' : '•'} ${t.title}`, 20, y, canvas.width - 40);
        y += 36;
      }

      if (this.cardTexture) this.cardTexture.needsUpdate = true;
    };
    this.drawCard();
    const tex = this.cardTexture = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geom = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    const mesh = new THREE.Mesh(geom, mat);

    // Small optional task card beside the sink, on the kitchen worktop.
    mesh.position.set(...pos);
    mesh.rotation.set(-Math.PI / 2, 0, tilt);

    const cardTarget = {
      name: 'uppdragslappen',
      kind: 'taskNote',
      verb: 'läsa',
      object: mesh,
      pickable: mesh,
    };
    mesh.userData.door = cardTarget;

    this.card = cardTarget;
    return cardTarget;
  }
}
