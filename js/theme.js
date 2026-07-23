// ============================================================
// theme.js — светлая/тёмная тема, сохраняется в Local Storage.
// ============================================================
import { State } from './state.js';
import { Storage } from './storage.js';

const SUN_PATH = '<circle cx="12" cy="12" r="4.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
const MOON_PATH = '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>';

export const Theme = {
  apply(theme) {
    State.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    Storage.setTheme(theme);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.innerHTML = theme === 'dark' ? SUN_PATH : MOON_PATH;
    document.querySelectorAll('.theme-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  },

  toggle() {
    this.apply(State.theme === 'dark' ? 'light' : 'dark');
  },

  init() {
    this.apply(State.theme || 'dark');
  },
};
