// ============================================================
// storage.js — единая точка доступа к Local Storage.
// Каждый тип данных хранится в собственном ключе, что упрощает
// последующую замену на реальный backend/DB без переработки
// остального кода (достаточно заменить реализацию Storage.*).
// ============================================================

const KEYS = {
  users: 'taskflow_users',
  session: 'taskflow_session',
  projects: 'taskflow_projects',
  tasks: 'taskflow_tasks',
  comments: 'taskflow_comments',
  settings: 'taskflow_settings',
  theme: 'taskflow_theme',
  tags: 'taskflow_tags',
  notifications: 'taskflow_notifications',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error('Storage read error for', key, e);
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('Storage write error for', key, e);
    return false;
  }
}

export const Storage = {
  KEYS,

  // Generic helpers, kept for extensibility (e.g. future async backend)
  getRaw(key, fallback) { return read(key, fallback); },
  setRaw(key, value) { return write(key, value); },

  // ---- Users ----
  getUsers() { return read(KEYS.users, []); },
  setUsers(users) { return write(KEYS.users, users); },

  // ---- Session ----
  getSession() { return read(KEYS.session, null); },
  setSession(userId) { return write(KEYS.session, userId); },
  clearSession() { localStorage.removeItem(KEYS.session); },

  // ---- Projects ----
  getProjects() { return read(KEYS.projects, []); },
  setProjects(projects) { return write(KEYS.projects, projects); },

  // ---- Tasks ----
  getTasks() { return read(KEYS.tasks, []); },
  setTasks(tasks) { return write(KEYS.tasks, tasks); },

  // ---- Comments ----
  getComments() { return read(KEYS.comments, []); },
  setComments(comments) { return write(KEYS.comments, comments); },

  // ---- Settings ----
  getSettings() { return read(KEYS.settings, { language: 'ru' }); },
  setSettings(settings) { return write(KEYS.settings, settings); },

  // ---- Theme ----
  getTheme() { return read(KEYS.theme, 'dark'); },
  setTheme(theme) { return write(KEYS.theme, theme); },

  // ---- Tags ----
  getTags() { return read(KEYS.tags, ['Frontend', 'Backend', 'Bug', 'Feature', 'Design']); },
  setTags(tags) { return write(KEYS.tags, tags); },

  // ---- Notifications ----
  getNotifications() { return read(KEYS.notifications, []); },
  setNotifications(list) { return write(KEYS.notifications, list); },

  // ---- Bulk export / import ----
  exportAll() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      users: this.getUsers(),
      projects: this.getProjects(),
      tasks: this.getTasks(),
      comments: this.getComments(),
      settings: this.getSettings(),
      theme: this.getTheme(),
      tags: this.getTags(),
      notifications: this.getNotifications(),
    };
  },

  importAll(data) {
    if (!data || typeof data !== 'object') throw new Error('Некорректный файл импорта');
    if (data.users) this.setUsers(data.users);
    if (data.projects) this.setProjects(data.projects);
    if (data.tasks) this.setTasks(data.tasks);
    if (data.comments) this.setComments(data.comments);
    if (data.settings) this.setSettings(data.settings);
    if (data.theme) this.setTheme(data.theme);
    if (data.tags) this.setTags(data.tags);
    if (data.notifications) this.setNotifications(data.notifications);
    return true;
  },
};
