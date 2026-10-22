// The settings panel keeps the start menu inert and delegates existing actions.
export class MenuSettings {
  constructor({ dialog, trigger, menu, children = [] }) {
    Object.assign(this, { dialog, trigger, menu, children });
    trigger.addEventListener('click', () => this.open());
    dialog.querySelector('#settings-close').addEventListener('click', () => this.close());
    this.observer = new MutationObserver(records => {
      if (dialog.hidden) return;
      for (const { target } of records) {
        if (!target.hidden) {
          this.returnFromChild = document.activeElement;
          this.focusables(target)[0]?.focus({ preventScroll: true });
        } else this.returnFromChild?.focus({ preventScroll: true });
      }
    });
    for (const child of children) if (child) this.observer.observe(child, { attributes: true, attributeFilter: ['hidden'] });
    document.addEventListener('keydown', e => {
      if (dialog.hidden) return;
      const child = children.find(el => el && !el.hidden);
      if (e.key === 'Tab') {
        const list = this.focusables(child ?? dialog), current = list.indexOf(document.activeElement);
        if (current < 0 || (e.shiftKey ? current === 0 : current === list.length - 1)) {
          e.preventDefault(); (e.shiftKey ? list.at(-1) : list[0])?.focus();
        }
      }
      if (child) return; // Existing child Escape handlers own their dismissal.
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      e.stopImmediatePropagation(); // A settings key must not start/resume gameplay.
    }, true);
  }
  focusables(root) {
    return [...root.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], select, [tabindex="0"]')]
      .filter(el => el.getClientRects().length && !el.hidden);
  }
  open() {
    this.dialog.hidden = false; this.menu.inert = true;
    this.dialog.querySelector('#settings-close').focus({ preventScroll: true });
  }
  close(restoreFocus = true) {
    this.dialog.hidden = true; this.menu.inert = false;
    if (restoreFocus) this.trigger.focus({ preventScroll: true });
  }
}
