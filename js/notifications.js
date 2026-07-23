// ============================================================
// notifications.js — система уведомлений (создана / удалена /
// завершена задача, истекает дедлайн) + отображение в toast.
// ============================================================
import { State } from './state.js';
import { uid, nowIso, formatDateTime, escapeHtml } from './utils.js';

export const Notifications = {
  push(title, body = '') {
    const item = { id: uid('notif'), title, body, createdAt: nowIso(), read: false };
    State.notifications.unshift(item);
    State.notifications = State.notifications.slice(0, 50);
    State.persistNotifications();
    this.renderDropdown();
    this.renderBadge();
  },

  markAllRead() {
    State.notifications.forEach(n => (n.read = true));
    State.persistNotifications();
    this.renderBadge();
  },

  clear() {
    State.notifications = [];
    State.persistNotifications();
    this.renderDropdown();
    this.renderBadge();
  },

  renderBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    const unread = State.notifications.filter(n => !n.read).length;
    badge.textContent = unread;
    badge.classList.toggle('hidden', unread === 0);
  },

  renderDropdown() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (!State.notifications.length) {
      list.innerHTML = `<div class="notif-empty">Пока нет уведомлений</div>`;
      return;
    }
    list.innerHTML = State.notifications.map(n => `
      <div class="notif-item">
        <div class="notif-item-title">${escapeHtml(n.title)}</div>
        ${n.body ? `<div>${escapeHtml(n.body)}</div>` : ''}
        <div class="notif-item-time">${formatDateTime(n.createdAt)}</div>
      </div>
    `).join('');
  },
};

// ---- Toast (immediate, ephemeral, on-screen feedback) ----
export function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 200);
  }, 3200);
}
