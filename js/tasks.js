// ============================================================
// tasks.js — CRUD задач, чек-листы, комментарии, теги, история,
// избранное, архив, массовые операции.
// ============================================================
import { State } from './state.js';
import { uid, nowIso, formatDate } from './utils.js';
import { Notifications, toast } from './notifications.js';
import { Projects } from './projects.js';
import { Users } from './users.js';
import * as Permissions from './permissions.js';
import { t } from './i18n.js';

function addHistory(task, text) {
  task.history = task.history || [];
  task.history.unshift({ text, at: nowIso() });
  task.history = task.history.slice(0, 60);
}

function statusLabel(id) { return t(`status.${id}`) || id; }
function priorityLabel(id) { return t(`priority.${id}`) || id; }

// Builds a list of human-readable change descriptions by diffing the
// task's editable fields against an incoming patch. Each changed field
// produces its own history entry instead of a generic "task updated".
function describeChanges(task, patch) {
  const changes = [];

  if (patch.title !== undefined && patch.title !== task.title) {
    changes.push(t('history.titleChanged', { from: task.title, to: patch.title }));
  }
  if (patch.description !== undefined && patch.description !== task.description) {
    changes.push(t('history.descChanged'));
  }
  if (patch.priority !== undefined && patch.priority !== task.priority) {
    changes.push(t('history.priorityChanged', { from: priorityLabel(task.priority), to: priorityLabel(patch.priority) }));
  }
  if (patch.status !== undefined && patch.status !== task.status) {
    changes.push(t('history.statusChanged', { from: statusLabel(task.status), to: statusLabel(patch.status) }));
  }
  if (patch.deadline !== undefined && patch.deadline !== task.deadline) {
    if (!patch.deadline) changes.push(t('history.deadlineRemoved'));
    else if (!task.deadline) changes.push(t('history.deadlineSet', { date: formatDate(patch.deadline) }));
    else changes.push(t('history.deadlineChanged', { from: formatDate(task.deadline), to: formatDate(patch.deadline) }));
  }
  if (patch.color !== undefined && patch.color !== task.color) {
    changes.push(t('history.colorChanged'));
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId) {
    const newName = Users.fullName(patch.assigneeId);
    const oldName = Users.fullName(task.assigneeId);
    if (!patch.assigneeId) changes.push(t('history.assigneeRemoved'));
    else if (!task.assigneeId) changes.push(t('history.assigneeSet', { name: newName }));
    else changes.push(t('history.assigneeChanged', { from: oldName, to: newName }));
  }
  if (patch.tags !== undefined) {
    const before = new Set(task.tags || []);
    const after = new Set(patch.tags || []);
    const added = [...after].filter(t => !before.has(t));
    const removed = [...before].filter(t => !after.has(t));
    added.forEach(tag => changes.push(t('history.tagAdded', { tag })));
    removed.forEach(tag => changes.push(t('history.tagRemoved', { tag })));
  }

  return changes;
}

export const Tasks = {
  create({ projectId, title, description, status, priority, deadline, assigneeId, color, tags }) {
    const project = Projects.get(projectId);
    if (!Permissions.canCreateTask(State.currentUser, project)) {
      toast(t('perm.err.createTask'), 'error');
      return null;
    }
    const task = {
      id: uid('task'),
      projectId,
      title: title.trim(),
      description: (description || '').trim(),
      status: status || 'backlog',
      priority: priority || 'medium',
      deadline: deadline || null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      color: color || '#6C5CE7',
      creatorId: State.currentUser.id,
      assigneeId: assigneeId || null,
      tags: tags || [],
      checklist: [],
      favorite: false,
      archived: false,
      history: [{ text: t('history.created'), at: nowIso() }],
    };
    State.tasks.push(task);
    State.persistTasks();
    Notifications.push('notif.taskCreated', task.title);
    toast(t('task.toast.created', { title: task.title }), 'success');
    return task;
  },

  update(id, patch) {
    const task = State.tasks.find(t => t.id === id);
    if (!task) return null;
    const project = Projects.get(task.projectId);
    if (!Permissions.canEditTask(State.currentUser, project, task)) {
      toast(t('perm.err.editTask'), 'error');
      return null;
    }
    const changes = describeChanges(task, patch);
    const becameDone = patch.status && patch.status !== task.status && patch.status === 'done';
    Object.assign(task, patch, { updatedAt: nowIso() });
    changes.forEach(text => addHistory(task, text));
    if (becameDone) {
      Notifications.push('notif.taskCompleted', task.title);
      toast(t('task.toast.completed', { title: task.title }), 'success');
    }
    State.persistTasks();
    return task;
  },

  remove(id) {
    const task = State.tasks.find(t => t.id === id);
    if (!task) return;
    const project = Projects.get(task.projectId);
    if (!Permissions.canDeleteTask(State.currentUser, project, task)) {
      toast(t('perm.err.deleteTask'), 'error');
      return;
    }
    State.tasks = State.tasks.filter(t => t.id !== id);
    State.comments = State.comments.filter(c => c.taskId !== id);
    State.persistTasks();
    State.persistComments();
    Notifications.push('notif.taskDeleted', task.title);
    toast(t('task.toast.deleted', { title: task.title }), 'success');
  },

  removeMany(ids) {
    const idSet = new Set(ids);
    const allowed = State.tasks.filter(
      t => idSet.has(t.id) && Permissions.canDeleteTask(State.currentUser, Projects.get(t.projectId), t)
    );
    if (!allowed.length) { toast(t('perm.err.bulkDelete'), 'error'); return; }
    const allowedIds = new Set(allowed.map(t => t.id));
    State.tasks = State.tasks.filter(t => !allowedIds.has(t.id));
    State.comments = State.comments.filter(c => !allowedIds.has(c.taskId));
    State.persistTasks();
    State.persistComments();
    const skipped = ids.length - allowed.length;
    toast(t('task.toast.bulkDeleted', { n: allowed.length, skipped }), 'success');
  },

  setStatusMany(ids, status) {
    const idSet = new Set(ids);
    let count = 0;
    State.tasks.forEach(task => {
      if (idSet.has(task.id) && task.status !== status && Permissions.canMoveTask(State.currentUser, Projects.get(task.projectId), task)) {
        addHistory(task, t('history.statusChangedBulk', { from: statusLabel(task.status), to: statusLabel(status) }));
        task.status = status;
        task.updatedAt = nowIso();
        count++;
      }
    });
    State.persistTasks();
    const skipped = ids.length - count;
    toast(t('task.toast.bulkStatus', { n: count, skipped }), 'success');
  },

  duplicate(id) {
    const task = State.tasks.find(t => t.id === id);
    if (!task) return null;
    const project = Projects.get(task.projectId);
    if (!Permissions.canCreateTask(State.currentUser, project)) {
      toast(t('perm.err.createTask'), 'error');
      return null;
    }
    const copy = {
      ...task,
      id: uid('task'),
      title: task.title + t('common.copySuffix'),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      creatorId: State.currentUser.id,
      history: [{ text: t('history.duplicated'), at: nowIso() }],
      checklist: task.checklist.map(c => ({ ...c, id: uid('chk') })),
      favorite: false,
    };
    State.tasks.push(copy);
    State.persistTasks();
    toast(t('task.toast.duplicated'), 'success');
    return copy;
  },

  toggleFavorite(id) {
    const task = State.tasks.find(t => t.id === id);
    if (!task) return;
    task.favorite = !task.favorite;
    addHistory(task, task.favorite ? t('history.favAdded') : t('history.favRemoved'));
    State.persistTasks();
  },

  toggleArchive(id) {
    const task = State.tasks.find(t => t.id === id);
    if (!task) return;
    task.archived = !task.archived;
    addHistory(task, task.archived ? t('history.archived') : t('history.unarchived'));
    State.persistTasks();
    toast(task.archived ? t('task.toast.archived') : t('task.toast.restored'), 'success');
  },

  get(id) {
    return State.tasks.find(t => t.id === id) || null;
  },

  byProject(projectId, { includeArchived = false } = {}) {
    return State.tasks.filter(t => t.projectId === projectId && (includeArchived || !t.archived));
  },

  // ---- Checklist ----
  addChecklistItem(taskId, text) {
    const task = this.get(taskId);
    if (!task || !text.trim()) return;
    task.checklist.push({ id: uid('chk'), text: text.trim(), done: false });
    task.updatedAt = nowIso();
    addHistory(task, t('history.checklistAdded', { text: text.trim() }));
    State.persistTasks();
  },

  toggleChecklistItem(taskId, itemId) {
    const task = this.get(taskId);
    if (!task) return;
    const item = task.checklist.find(c => c.id === itemId);
    if (!item) return;
    item.done = !item.done;
    task.updatedAt = nowIso();
    addHistory(task, item.done
      ? t('history.checklistDone', { text: item.text })
      : t('history.checklistUndone', { text: item.text }));
    State.persistTasks();
  },

  removeChecklistItem(taskId, itemId) {
    const task = this.get(taskId);
    if (!task) return;
    const item = task.checklist.find(c => c.id === itemId);
    task.checklist = task.checklist.filter(c => c.id !== itemId);
    task.updatedAt = nowIso();
    if (item) addHistory(task, t('history.checklistRemoved', { text: item.text }));
    State.persistTasks();
  },

  checklistProgress(task) {
    if (!task.checklist.length) return 0;
    const done = task.checklist.filter(c => c.done).length;
    return Math.round((done / task.checklist.length) * 100);
  },

  // ---- Tags ----
  addTagToTask(taskId, tag) {
    const task = this.get(taskId);
    if (!task || !tag) return;
    if (!task.tags.includes(tag)) {
      task.tags.push(tag);
      addHistory(task, t('history.tagAdded', { tag }));
    }
    if (!State.tags.includes(tag)) {
      State.tags.push(tag);
      State.persistTags();
    }
    State.persistTasks();
  },

  removeTagFromTask(taskId, tag) {
    const task = this.get(taskId);
    if (!task) return;
    if (task.tags.includes(tag)) {
      task.tags = task.tags.filter(x => x !== tag);
      addHistory(task, t('history.tagRemoved', { tag }));
    }
    State.persistTasks();
  },

  // ---- Comments ----
  addComment(taskId, text) {
    if (!text.trim()) return null;
    const task = this.get(taskId);
    if (!task) return null;
    const project = Projects.get(task.projectId);
    if (!Permissions.canComment(State.currentUser, project)) {
      toast(t('perm.err.comment'), 'error');
      return null;
    }
    const comment = {
      id: uid('cmt'),
      taskId,
      author: `${State.currentUser.firstName} ${State.currentUser.lastName}`,
      authorId: State.currentUser.id,
      text: text.trim(),
      createdAt: nowIso(),
    };
    State.comments.push(comment);
    State.persistComments();
    {
      const preview = comment.text.length > 40 ? comment.text.slice(0, 40) + '…' : comment.text;
      addHistory(task, t('history.commentAdded', { preview }));
    }
    State.persistTasks();
    return comment;
  },

  commentsFor(taskId) {
    return State.comments
      .filter(c => c.taskId === taskId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },

  removeComment(id) {
    State.comments = State.comments.filter(c => c.id !== id);
    State.persistComments();
  },
};
