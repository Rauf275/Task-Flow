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
    this.theme = Storage.getTheme();
    this.settings = Storage.getSettings();
    const sessionId = Storage.getSession();
    this.currentUser = sessionId ? this.users.find(u => u.id === sessionId) || null : null;
  },

  persistUsers() { Storage.setUsers(this.users); },
  persistProjects() { Storage.setProjects(this.projects); },
  persistTasks() { Storage.setTasks(this.tasks); },
  persistComments() { Storage.setComments(this.comments); },
  persistTags() { Storage.setTags(this.tags); },
  persistNotifications() { Storage.setNotifications(this.notifications); },
  persistSettings() { Storage.setSettings(this.settings); },
};
