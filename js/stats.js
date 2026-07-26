// ============================================================
// stats.js — расчёт статистики для Dashboard и профиля.
// ============================================================
import { State } from './state.js';
import { isOverdue } from './utils.js';

export const Stats = {
  compute({ projectId = null } = {}) {
    const tasks = State.tasks.filter(t => !t.archived && (!projectId || t.projectId === projectId));
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const overdue = tasks.filter(t => isOverdue(t.deadline, t.status)).length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    const projectCount = projectId ? 1 : State.projects.length;
    return { total, done, inProgress, overdue, percent, projectCount };
  },

  cardsHtml(stats) {
    const items = [
      { label: 'Всего задач', value: stats.total },
      { label: 'Выполнено', value: stats.done },
      { label: 'В работе', value: stats.inProgress },
      { label: 'Просрочено', value: stats.overdue },
      { label: 'Процент выполнения', value: stats.percent + '%', bar: stats.percent },
      { label: 'Проектов', value: stats.projectCount },
    ];
    return items.map(i => `
      <div class="stat-card">
        <div class="stat-value">${i.value}</div>
        <div class="stat-label">${i.label}</div>
        ${i.bar !== undefined ? `<div class="stat-bar"><div class="stat-bar-fill" style="width:${i.bar}%"></div></div>` : ''}
      </div>
    `).join('');
  },
};
