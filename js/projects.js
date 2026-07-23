// ============================================================
// projects.js — CRUD проектов, избранное, дублирование.
// ============================================================
import { State } from './state.js';
import { uid, nowIso } from './utils.js';
import { Notifications, toast } from './notifications.js';

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
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    State.projects.push(project);
    State.persistProjects();
    Notifications.push('Проект создан', project.name);
    toast(`Проект «${project.name}» создан`, 'success');
    return project;
  },

  update(id, patch) {
    const project = State.projects.find(p => p.id === id);
    if (!project) return null;
    Object.assign(project, patch, { updatedAt: nowIso() });
    State.persistProjects();
    toast('Проект обновлён', 'success');
    return project;
  },

  remove(id) {
    const project = State.projects.find(p => p.id === id);
    State.projects = State.projects.filter(p => p.id !== id);
    State.tasks = State.tasks.filter(t => t.projectId !== id);
    State.persistProjects();
    State.persistTasks();
    if (project) {
      Notifications.push('Проект удалён', project.name);
      toast(`Проект «${project.name}» удалён`, 'success');
    }
  },

  duplicate(id) {
    const project = State.projects.find(p => p.id === id);
    if (!project) return null;
    const copy = { ...project, id: uid('proj'), name: project.name + ' (копия)', createdAt: nowIso(), updatedAt: nowIso(), favorite: false };
    State.projects.push(copy);
    const tasks = State.tasks.filter(t => t.projectId === id);
    tasks.forEach(t => {
      State.tasks.push({ ...t, id: uid('task'), projectId: copy.id, createdAt: nowIso(), updatedAt: nowIso(), history: [] });
    });
    State.persistProjects();
    State.persistTasks();
    toast(`Проект продублирован как «${copy.name}»`, 'success');
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
    return [...State.projects].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  favorites() {
    return this.all().filter(p => p.favorite);
  },
};
