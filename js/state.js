// ============================================================
// state.js — центральное состояние приложения в памяти.
// Данные всегда читаются/пишутся через storage.js; State служит
// быстрым кэшем в рамках текущей сессии страницы.
// ============================================================
import { Storage } from './storage.js';

export const STATUSES = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'Review' },
  { id: 'testing', label: 'Testing' },
  { id: 'done', label: 'Done' },
];

export const PRIORITIES = [
  { id: 'low', label: 'Low', color: 'var(--p-low)' },
  { id: 'medium', label: 'Medium', color: 'var(--p-medium)' },
  { id: 'high', label: 'High', color: 'var(--p-high)' },
  { id: 'critical', label: 'Critical', color: 'var(--p-critical)' },
];

export const PROJECT_COLORS = ['#6C5CE7', '#2FD9A8', '#FF9F45', '#FF5C6C', '#4ADE9C', '#FFC857', '#5C9DFF', '#E86CE8'];
export const PROJECT_ICONS = ['📋', '🚀', '💡', '🎯', '🛠️', '📈', '🎨', '🧩', '⚙️', '📱', '🔬', '📦'];

export const State = {
  currentUser: null,
  currentView: 'dashboard',
  currentProjectId: null,
  users: [],
  projects: [],
  tasks: [],
  comments: [],
  tags: [],
  notifications: [],
  invitations: [],
  theme: 'dark',
  settings: {},
  selectedTaskIds: new Set(),
  activeFilters: { priority: '', assignee: '', tag: '', deadline: '' },
  sortBy: 'date',
  searchQuery: '',
  calendarCursor: new Date(),

  loadAll() {
    this.users = Storage.getUsers();
    this.projects = Storage.getProjects();
    this.tasks = Storage.getTasks();
    this.comments = Storage.getComments();
    this.tags = Storage.getTags();
    this.notifications = Storage.getNotifications();
    this.invitations = Storage.getInvitations();
    this.theme = Storage.getTheme();
    this.settings = Storage.getSettings();
    this._migrateLegacyData();
    const sessionId = Storage.getSession();
    this.currentUser = sessionId ? this.users.find(u => u.id === sessionId) || null : null;
  },

  // Приводит данные, созданные до появления ролей и multi-user
  // архитектуры, к новой схеме (project.members/accessMode,
  // task.creatorId/assigneeId). Выполняется один раз при загрузке;
  // при первом обнаружении старых данных сразу сохраняет результат,
  // так что дальше приложение всегда работает с новой схемой.
  _migrateLegacyData() {
    let changed = false;
    this.projects.forEach(p => {
      if (!Array.isArray(p.members)) {
        p.members = [{ userId: p.ownerId, role: 'Owner' }];
        changed = true;
      }
      if (!p.accessMode) { p.accessMode = 'private'; changed = true; }
      if (!p.memberEditPolicy) {
        p.memberEditPolicy = { allowAssigneeEdit: true, viewerCanComment: false };
        changed = true;
      }
    });
    this.tasks.forEach(t => {
      if (Object.prototype.hasOwnProperty.call(t, 'assignee')) {
        // Старая схема хранила исполнителя как текст. Надёжно
        // сопоставить его с userId нельзя, поэтому просто переносим
        // задачу на новую схему — исполнителя нужно назначить заново.
        delete t.assignee;
        changed = true;
      }
      if (t.assigneeId === undefined) { t.assigneeId = null; changed = true; }
      if (t.creatorId === undefined) {
        const project = this.projects.find(p => p.id === t.projectId);
        t.creatorId = project ? project.ownerId : null;
        changed = true;
      }
    });
    if (changed) {
      this.persistProjects();
      this.persistTasks();
    }
  },

  persistUsers() { Storage.setUsers(this.users); },
  persistProjects() { Storage.setProjects(this.projects); },
  persistTasks() { Storage.setTasks(this.tasks); },
  persistComments() { Storage.setComments(this.comments); },
  persistTags() { Storage.setTags(this.tags); },
  persistNotifications() { Storage.setNotifications(this.notifications); },
  persistInvitations() { Storage.setInvitations(this.invitations); },
  persistSettings() { Storage.setSettings(this.settings); },
};
