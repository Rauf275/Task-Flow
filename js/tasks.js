// ============================================================
// tasks.js — CRUD задач, чек-листы, комментарии, теги, история,
// избранное, архив, массовые операции.
// ============================================================
import { State, STATUSES, PRIORITIES } from './state.js';
import { uid, nowIso, formatDate } from './utils.js';
import { Notifications, toast } from './notifications.js';

function addHistory(task, text) {
  task.history = task.history || [];
  task.history.unshift({ text, at: nowIso() });
  task.history = task.history.slice(0, 60);
}

function statusLabel(id) { return (STATUSES.find(s => s.id === id) || {}).label || id; }
function priorityLabel(id) { return (PRIORITIES.find(p => p.id === id) || {}).label || id; }

// Builds a list of human-readable change descriptions by diffing the
// task's editable fields against an incoming patch. Each changed field
// produces its own history entry instead of a generic "task updated".
function describeChanges(task, patch) {
  const changes = [];

  if (patch.title !== undefined && patch.title !== task.title) {
    changes.push(`Название изменено: «${task.title}» → «${patch.title}»`);
  }
  if (patch.description !== undefined && patch.description !== task.description) {
    changes.push('Описание изменено');
  }
  if (patch.priority !== undefined && patch.priority !== task.priority) {
    changes.push(`Приоритет изменён: ${priorityLabel(task.priority)} → ${priorityLabel(patch.priority)}`);
  }
  if (patch.status !== undefined && patch.status !== task.status) {
    changes.push(`Статус изменён: ${statusLabel(task.status)} → ${statusLabel(patch.status)}`);
  }
  if (patch.deadline !== undefined && patch.deadline !== task.deadline) {
    if (!patch.deadline) changes.push('Дедлайн удалён');
    else if (!task.deadline) changes.push(`Установлен дедлайн: ${formatDate(patch.deadline)}`);
    else changes.push(`Дедлайн изменён: ${formatDate(task.deadline)} → ${formatDate(patch.deadline)}`);
  }
  if (patch.color !== undefined && patch.color !== task.color) {
    changes.push('Цвет задачи изменён');
  }
  if (patch.assignee !== undefined && patch.assignee !== task.assignee) {
    if (!patch.assignee) changes.push('Исполнитель убран');
    else if (!task.assignee) changes.push(`Назначен исполнитель: ${patch.assignee}`);
    else changes.push(`Исполнитель изменён: ${task.assignee} → ${patch.assignee}`);
  }
  if (patch.tags !== undefined) {
    const before = new Set(task.tags || []);
    const after = new Set(patch.tags || []);
    const added = [...after].filter(t => !before.has(t));
    const removed = [...before].filter(t => !after.has(t));
    added.forEach(t => changes.push(`Добавлен тег: ${t}`));
    removed.forEach(t => changes.push(`Удалён тег: ${t}`));
  }

  return changes;
}

export const Tasks = {
  create({ projectId, title, description, status, priority, deadline, assignee, color, tags }) {
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
      assignee: (assignee || '').trim(),
      tags: tags || [],
      checklist: [],
      favorite: false,
      archived: false,
      history: [{ text: 'Задача создана', at: nowIso() }],
    };
    State.tasks.push(task);
    State.persistTasks();
    Notifications.push('Задача создана', task.title);
    toast(`Задача «${task.title}» создана`, 'success');
    return task;
  },

  update(id, patch) {
    const task = State.tasks.find(t => t.id === id);
    if (!task) return null;
    const changes = describeChanges(task, patch);
    const becameDone = patch.status && patch.status !== task.status && patch.status === 'done';
    Object.assign(task, patch, { updatedAt: nowIso() });
    changes.forEach(text => addHistory(task, text));
    if (becameDone) {
      Notifications.push('Задача завершена', task.title);
      toast(`Задача «${task.title}» завершена`, 'success');
    }
    State.persistTasks();
    return task;
  },

  remove(id) {
    const task = State.tasks.find(t => t.id === id);
    State.tasks = State.tasks.filter(t => t.id !== id);
    State.comments = State.comments.filter(c => c.taskId !== id);
    State.persistTasks();
    State.persistComments();
    if (task) {
      Notifications.push('Задача удалена', task.title);
      toast(`Задача «${task.title}» удалена`, 'success');
    }
  },

  removeMany(ids) {
    const idSet = new Set(ids);
    State.tasks = State.tasks.filter(t => !idSet.has(t.id));
    State.comments = State.comments.filter(c => !idSet.has(c.taskId));
    State.persistTasks();
    State.persistComments();
    toast(`Удалено задач: ${ids.length}`, 'success');
  },

  setStatusMany(ids, status) {
    const idSet = new Set(ids);
    State.tasks.forEach(t => {
      if (idSet.has(t.id) && t.status !== status) {
        addHistory(t, `Статус изменён: ${statusLabel(t.status)} → ${statusLabel(status)} (массово)`);
        t.status = status;
        t.updatedAt = nowIso();
      }
    });
    State.persistTasks();
    toast(`Статус обновлён у ${ids.length} задач`, 'success');
  },

  duplicate(id) {
    const task = State.tasks.find(t => t.id === id);
    if (!task) return null;
    const copy = {
      ...task,
      id: uid('task'),
      title: task.title + ' (копия)',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      history: [{ text: 'Задача скопирована', at: nowIso() }],
      checklist: task.checklist.map(c => ({ ...c, id: uid('chk') })),
      favorite: false,
    };
    State.tasks.push(copy);
    State.persistTasks();
    toast('Задача продублирована', 'success');
    return copy;
  },

  toggleFavorite(id) {
    const task = State.tasks.find(t => t.id === id);
    if (!task) return;
    task.favorite = !task.favorite;
    addHistory(task, task.favorite ? 'Добавлена в избранное' : 'Убрана из избранного');
    State.persistTasks();
  },

  toggleArchive(id) {
    const task = State.tasks.find(t => t.id === id);
    if (!task) return;
    task.archived = !task.archived;
    addHistory(task, task.archived ? 'Задача перемещена в архив' : 'Задача восстановлена из архива');
    State.persistTasks();
    toast(task.archived ? 'Задача архивирована' : 'Задача восстановлена', 'success');
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
    addHistory(task, `Добавлен пункт чек-листа: «${text.trim()}»`);
    State.persistTasks();
  },

  toggleChecklistItem(taskId, itemId) {
    const task = this.get(taskId);
    if (!task) return;
    const item = task.checklist.find(c => c.id === itemId);
    if (!item) return;
    item.done = !item.done;
    task.updatedAt = nowIso();
    addHistory(task, `${item.done ? 'Отмечен как выполненный' : 'Снята отметка выполнения'} пункт чек-листа: «${item.text}»`);
    State.persistTasks();
  },

  removeChecklistItem(taskId, itemId) {
    const task = this.get(taskId);
    if (!task) return;
    const item = task.checklist.find(c => c.id === itemId);
    task.checklist = task.checklist.filter(c => c.id !== itemId);
    task.updatedAt = nowIso();
    if (item) addHistory(task, `Удалён пункт чек-листа: «${item.text}»`);
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
      addHistory(task, `Добавлен тег: ${tag}`);
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
      task.tags = task.tags.filter(t => t !== tag);
      addHistory(task, `Удалён тег: ${tag}`);
    }
    State.persistTasks();
  },

  // ---- Comments ----
  addComment(taskId, text) {
    if (!text.trim()) return null;
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
    const task = this.get(taskId);
    if (task) {
      const preview = comment.text.length > 40 ? comment.text.slice(0, 40) + '…' : comment.text;
      addHistory(task, `Добавлен комментарий: «${preview}»`);
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
