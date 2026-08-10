// ============================================================
// projects.js — CRUD проектов, избранное, дублирование.
// ============================================================
import { State } from './state.js';
import { uid, nowIso } from './utils.js';
import { Notifications, toast } from './notifications.js';
import { canViewProject } from './permissions.js';
import { t } from './i18n.js';

export const Projects = {
  create({ name, description, color, icon }) {
    const project = {
      id: uid('proj'),
      name: name.trim(),
      description: (description || '').trim(),
      color: color || '#6C5CE7',
      icon: icon || '📋',
      favorite: false,
      ownerId: State.currentUser.id,
      // Владелец всегда состоит в members с ролью Owner — так вся
      // логика прав (см. permissions.js) работает через один список,
      // без частных случаев "это владелец / это участник".
      members: [{ userId: State.currentUser.id, role: 'Owner' }],
      accessMode: 'private', // 'private' | 'readonly' | 'collaborative'
      memberEditPolicy: { allowAssigneeEdit: true, viewerCanComment: false },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    State.projects.push(project);
    State.persistProjects();
    Notifications.push('notif.projectCreated', project.name);
    toast(t('project.toast.created', { name: project.name }), 'success');
    return project;
  },

  update(id, patch) {
    const project = State.projects.find(p => p.id === id);
    if (!project) return null;
    Object.assign(project, patch, { updatedAt: nowIso() });
    State.persistProjects();
    toast(t('project.toast.updated'), 'success');
    return project;
  },

  remove(id) {
    const project = State.projects.find(p => p.id === id);
    State.projects = State.projects.filter(p => p.id !== id);
    State.tasks = State.tasks.filter(t => t.projectId !== id);
    State.invitations = State.invitations.filter(i => i.projectId !== id);
    State.persistProjects();
    State.persistTasks();
    State.persistInvitations();
    if (project) {
      Notifications.push('notif.projectDeleted', project.name);
      toast(t('project.toast.deleted', { name: project.name }), 'success');
    }
  },

  duplicate(id) {
    const project = State.projects.find(p => p.id === id);
    if (!project) return null;
    const copy = {
      ...project,
      id: uid('proj'),
      name: project.name + t('common.copySuffix'),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      favorite: false,
      members: project.members.map(m => ({ ...m })),
      memberEditPolicy: { ...project.memberEditPolicy },
    };
    State.projects.push(copy);
    const tasks = State.tasks.filter(t => t.projectId === id);
    tasks.forEach(t => {
      State.tasks.push({ ...t, id: uid('task'), projectId: copy.id, createdAt: nowIso(), updatedAt: nowIso(), history: [] });
    });
    State.persistProjects();
    State.persistTasks();
    toast(t('project.toast.duplicated', { name: copy.name }), 'success');
    return copy;
  },

  toggleFavorite(id) {
    const project = State.projects.find(p => p.id === id);
    if (!project) return;
    project.favorite = !project.favorite;
    State.persistProjects();
  },

  get(id) {
    return State.projects.find(p => p.id === id) || null;
  },

  // ---- Участники, роли, доступ ----
  // Все мутации ниже не проверяют права сами — вызывающий код
  // (ui.js) обязан заранее спросить permissions.js, можно ли
  // совершать это действие. Здесь только сама операция с данными.

  membersDetailed(id) {
    const project = this.get(id);
    if (!project) return [];
    return project.members
      .map(m => ({ ...m, user: State.users.find(u => u.id === m.userId) || null }))
      .filter(m => m.user);
  },

  addMember(id, userId, role = 'Member') {
    const project = this.get(id);
    if (!project || userId === project.ownerId) return project;
    const existing = project.members.find(m => m.userId === userId);
    if (existing) existing.role = role;
    else project.members.push({ userId, role });
    project.updatedAt = nowIso();
    State.persistProjects();
    return project;
  },

  removeMember(id, userId) {
    const project = this.get(id);
    if (!project || userId === project.ownerId) return;
    project.members = project.members.filter(m => m.userId !== userId);
    project.updatedAt = nowIso();
    State.persistProjects();
    toast(t('project.toast.memberRemoved'), 'success');
  },

  changeMemberRole(id, userId, role) {
    const project = this.get(id);
    if (!project || userId === project.ownerId) return;
    const m = project.members.find(x => x.userId === userId);
    if (!m) return;
    m.role = role;
    project.updatedAt = nowIso();
    State.persistProjects();
    toast(t('project.toast.roleChanged'), 'success');
  },

  setAccessMode(id, mode) {
    const project = this.get(id);
    if (!project) return;
    project.accessMode = mode;
    project.updatedAt = nowIso();
    State.persistProjects();
    toast(t('project.toast.accessUpdated'), 'success');
  },

  setEditPolicy(id, patch) {
    const project = this.get(id);
    if (!project) return;
    project.memberEditPolicy = { ...project.memberEditPolicy, ...patch };
    project.updatedAt = nowIso();
    State.persistProjects();
  },

  taskCount(id) {
    return State.tasks.filter(t => t.projectId === id && !t.archived).length;
  },

  doneCount(id) {
    return State.tasks.filter(t => t.projectId === id && t.status === 'done' && !t.archived).length;
  },

  progress(id) {
    const total = this.taskCount(id);
    if (!total) return 0;
    return Math.round((this.doneCount(id) / total) * 100);
  },

  all() {
    // Каждый пользователь видит только проекты, где он владелец/участник,
    // либо публично доступные проекты в режиме "Read Only". Это то место,
    // которое реально делает данные multi-user — при подключении backend
    // сервер будет фильтровать так же на своей стороне.
    return [...State.projects]
      .filter(p => canViewProject(State.currentUser, p))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  favorites() {
    return this.all().filter(p => p.favorite);
  },
};
