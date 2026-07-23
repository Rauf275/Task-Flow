// ============================================================
// main.js — точка входа: инициализация, авторизация, роутинг,
// обработчики событий интерфейса.
// ============================================================
import { State, STATUSES } from './state.js';
import { Storage } from './storage.js';
import { Auth } from './auth.js';
import { Projects } from './projects.js';
import { Tasks } from './tasks.js';
import { Theme } from './theme.js';
import { Settings } from './settings.js';
import { Notifications, toast } from './notifications.js';
import { debounce, isOverdue, isDueToday } from './utils.js';
import {
  openProjectModal, openTaskModal, openProfileEditModal, closeModal,
} from './ui.js';
import {
  showView, renderCurrentView, renderSidebar, openProject, renderNotifications,
} from './render.js';

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------
State.loadAll();
Theme.init();

if (State.currentUser) {
  enterApp();
} else {
  showAuthScreen();
}

// ------------------------------------------------------------
// Auth screen wiring
// ------------------------------------------------------------
function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function clearFieldErrors(formEl) {
  formEl.querySelectorAll('.field-error').forEach(e => (e.textContent = ''));
  formEl.querySelectorAll('input').forEach(i => i.classList.remove('invalid'));
}

function applyFieldErrors(formEl, errors) {
  Object.entries(errors).forEach(([id, msg]) => {
    const errEl = formEl.querySelector(`.field-error[data-for="${id}"]`);
    if (errEl) errEl.textContent = msg;
    const input = document.getElementById(id);
    if (input) input.classList.add('invalid');
  });
}

document.getElementById('show-register').addEventListener('click', () => {
  document.getElementById('login-form-wrap').classList.add('hidden');
  document.getElementById('register-form-wrap').classList.remove('hidden');
});
document.getElementById('show-login').addEventListener('click', () => {
  document.getElementById('register-form-wrap').classList.add('hidden');
  document.getElementById('login-form-wrap').classList.remove('hidden');
});

document.getElementById('register-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  clearFieldErrors(form);
  const payload = {
    first: document.getElementById('reg-first').value,
    last: document.getElementById('reg-last').value,
    email: document.getElementById('reg-email').value,
    password: document.getElementById('reg-password').value,
    password2: document.getElementById('reg-password2').value,
  };
  const errors = Auth.validateRegister(payload);
  if (Object.keys(errors).length) { applyFieldErrors(form, errors); return; }
  Auth.register(payload);
  toast(`Добро пожаловать, ${payload.first}!`, 'success');
  enterApp();
});

document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  clearFieldErrors(form);
  const payload = {
    email: document.getElementById('login-email').value,
    password: document.getElementById('login-password').value,
  };
  const errors = Auth.validateLogin(payload);
  if (Object.keys(errors).length) { applyFieldErrors(form, errors); return; }
  const result = Auth.login(payload);
  if (!result.ok) {
    applyFieldErrors(form, { 'login-password': result.error });
    return;
  }
  toast(`С возвращением, ${result.user.firstName}!`, 'success');
  enterApp();
});

// ------------------------------------------------------------
// Enter / exit app
// ------------------------------------------------------------
function enterApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  checkDeadlineReminders();
  showView('dashboard');
}

document.getElementById('logout-btn').addEventListener('click', () => {
  Auth.logout();
  document.getElementById('login-form').reset();
  document.getElementById('register-form-wrap').classList.add('hidden');
  document.getElementById('login-form-wrap').classList.remove('hidden');
  showAuthScreen();
});

// ------------------------------------------------------------
// Sidebar navigation
// ------------------------------------------------------------
document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.view === 'projects') State.currentProjectId = null;
    showView(btn.dataset.view);
    closeMobileSidebar();
  });
});

document.querySelectorAll('[data-view-link]').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.viewLink));
});

document.getElementById('sidebar').addEventListener('click', (e) => {
  const item = e.target.closest('.sidebar-project-item');
  if (item) { openProject(item.dataset.project); closeMobileSidebar(); }
});

document.getElementById('sidebar-new-project').addEventListener('click', () => {
  openProjectModal(null, ({ project }) => { if (project) openProject(project.id); });
});

document.getElementById('open-profile').addEventListener('click', () => showView('profile'));

// Sidebar collapse (desktop) & mobile toggle
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
});
document.getElementById('mobile-menu-btn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('mobile-open');
  document.getElementById('sidebar-overlay').classList.remove('hidden');
});
document.getElementById('sidebar-overlay').addEventListener('click', closeMobileSidebar);
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebar-overlay').classList.add('hidden');
}

// ------------------------------------------------------------
// Theme & notifications
// ------------------------------------------------------------
document.getElementById('theme-toggle').addEventListener('click', () => Theme.toggle());
document.querySelectorAll('.theme-opt').forEach(btn => {
  btn.addEventListener('click', () => Theme.apply(btn.dataset.theme));
});

document.getElementById('notif-toggle').addEventListener('click', () => {
  const dd = document.getElementById('notif-dropdown');
  dd.classList.toggle('hidden');
  if (!dd.classList.contains('hidden')) { renderNotifications(); Notifications.markAllRead(); }
});
document.addEventListener('click', (e) => {
  const wrap = document.getElementById('notif-wrap') || document.querySelector('.notif-wrap');
  if (wrap && !wrap.contains(e.target)) document.getElementById('notif-dropdown').classList.add('hidden');
});
document.getElementById('notif-clear').addEventListener('click', () => Notifications.clear());

// ------------------------------------------------------------
// Global search (real-time)
// ------------------------------------------------------------
document.getElementById('global-search').addEventListener('input', debounce((e) => {
  State.searchQuery = e.target.value.trim();
  if (State.currentView === 'board') renderCurrentView();
}, 150));

document.getElementById('global-search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && State.searchQuery) {
    // Jump to first matching task's project board for convenience
    import('./search.js').then(({ Search }) => {
      const results = Search.globalResults(State.searchQuery);
      if (results.length) openProject(results[0].projectId);
    });
  }
});

// ------------------------------------------------------------
// New task / project buttons
// ------------------------------------------------------------
document.getElementById('new-task-btn').addEventListener('click', () => {
  const projectId = State.currentProjectId || Projects.all()[0]?.id;
  if (!projectId) { toast('Сначала создайте проект', 'error'); return; }
  openTaskModal({ projectId }, () => renderCurrentView());
});
document.getElementById('new-project-btn').addEventListener('click', () => {
  openProjectModal(null, ({ project }) => { if (project) openProject(project.id); });
});

// ------------------------------------------------------------
// Board: back button, edit project, favorite, new task, filters
// ------------------------------------------------------------
document.getElementById('back-to-projects').addEventListener('click', () => {
  State.currentProjectId = null;
  showView('projects');
});
document.getElementById('board-project-edit').addEventListener('click', () => {
  const project = Projects.get(State.currentProjectId);
  openProjectModal(project, ({ deleted }) => {
    if (deleted) { State.currentProjectId = null; showView('projects'); } else renderCurrentView();
  });
});
document.getElementById('board-project-fav').addEventListener('click', () => {
  Projects.toggleFavorite(State.currentProjectId);
  renderCurrentView();
});
document.getElementById('board-new-task').addEventListener('click', () => {
  openTaskModal({ projectId: State.currentProjectId }, () => renderCurrentView());
});

['filter-priority', 'filter-assignee', 'filter-tag', 'filter-deadline'].forEach(id => {
  document.getElementById(id).addEventListener('change', (e) => {
    const key = id.replace('filter-', '');
    State.activeFilters[key] = e.target.value;
    renderCurrentView();
  });
});
document.getElementById('sort-by').addEventListener('change', (e) => {
  State.sortBy = e.target.value;
  renderCurrentView();
});
document.getElementById('clear-filters').addEventListener('click', () => {
  State.activeFilters = { priority: '', assignee: '', tag: '', deadline: '' };
  State.sortBy = 'date';
  renderCurrentView();
});

// Bulk actions
document.getElementById('bulk-cancel').addEventListener('click', () => {
  State.selectedTaskIds.clear();
  renderCurrentView();
});
document.getElementById('bulk-delete').addEventListener('click', () => {
  const ids = [...State.selectedTaskIds];
  if (!ids.length) return;
  import('./ui.js').then(({ confirmDialog }) => {
    confirmDialog({
      title: 'Удалить выбранные задачи?',
      body: `Будет удалено задач: ${ids.length}.`,
      confirmLabel: 'Удалить',
      onConfirm: () => { Tasks.removeMany(ids); State.selectedTaskIds.clear(); renderCurrentView(); },
    });
  });
});
document.getElementById('bulk-status').addEventListener('change', (e) => {
  const status = e.target.value;
  const ids = [...State.selectedTaskIds];
  if (status && ids.length) {
    Tasks.setStatusMany(ids, status);
    State.selectedTaskIds.clear();
    renderCurrentView();
  }
});

// ------------------------------------------------------------
// Calendar navigation
// ------------------------------------------------------------
document.getElementById('cal-prev').addEventListener('click', () => {
  State.calendarCursor = new Date(State.calendarCursor.getFullYear(), State.calendarCursor.getMonth() - 1, 1);
  renderCurrentView();
});
document.getElementById('cal-next').addEventListener('click', () => {
  State.calendarCursor = new Date(State.calendarCursor.getFullYear(), State.calendarCursor.getMonth() + 1, 1);
  renderCurrentView();
});

// ------------------------------------------------------------
// Settings: theme select, language, export/import, profile, logout
// ------------------------------------------------------------
document.getElementById('lang-select').addEventListener('change', (e) => Settings.setLanguage(e.target.value));
document.getElementById('export-json').addEventListener('click', () => Settings.exportJson());
document.getElementById('import-json').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const ok = await Settings.importJson(file);
  if (ok) renderCurrentView();
  e.target.value = '';
});
document.getElementById('settings-edit-profile').addEventListener('click', () => {
  openProfileEditModal(() => renderCurrentView());
});
document.getElementById('profile-edit-btn').addEventListener('click', () => {
  openProfileEditModal(() => renderCurrentView());
});

// ------------------------------------------------------------
// Deadline reminder check (runs on entry + every 5 minutes)
// ------------------------------------------------------------
function checkDeadlineReminders() {
  const soonTasks = State.tasks.filter(t => !t.archived && t.status !== 'done' && isDueToday(t.deadline));
  soonTasks.forEach(t => {
    const already = State.notifications.some(n => n.title === 'Истекает дедлайн' && n.body === t.title);
    if (!already) Notifications.push('Истекает дедлайн', t.title);
  });
  renderNotifications();
}
setInterval(checkDeadlineReminders, 5 * 60 * 1000);

// Apply saved language on load
if (State.settings.language) {
  const sel = document.getElementById('lang-select');
  if (sel) sel.value = State.settings.language;
}

// Initial theme option highlight
document.querySelectorAll('.theme-opt').forEach(btn => {
  btn.classList.toggle('active', btn.dataset.theme === State.theme);
});
