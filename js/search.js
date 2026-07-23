// ============================================================
// search.js — поиск в реальном времени, фильтрация, сортировка.
// ============================================================
import { State } from './state.js';
import { Projects } from './projects.js';
import { isOverdue, isDueToday, isDueThisWeek } from './utils.js';

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

export const Search = {
  // Full-text search across title, description, tags, project name
  matchQuery(task, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const project = Projects.get(task.projectId);
    return (
      task.title.toLowerCase().includes(q) ||
      (task.description || '').toLowerCase().includes(q) ||
      task.tags.some(t => t.toLowerCase().includes(q)) ||
      (project && project.name.toLowerCase().includes(q))
    );
  },

  matchFilters(task, filters) {
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.assignee && task.assignee !== filters.assignee) return false;
    if (filters.tag && !task.tags.includes(filters.tag)) return false;
    if (filters.deadline === 'overdue' && !isOverdue(task.deadline, task.status)) return false;
    if (filters.deadline === 'today' && !isDueToday(task.deadline)) return false;
    if (filters.deadline === 'week' && !isDueThisWeek(task.deadline)) return false;
    return true;
  },

  sort(tasks, sortBy) {
    const arr = [...tasks];
    switch (sortBy) {
      case 'title':
        arr.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
        break;
      case 'priority':
        arr.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
        break;
      case 'deadline':
        arr.sort((a, b) => {
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline) - new Date(b.deadline);
        });
        break;
      case 'status':
        arr.sort((a, b) => a.status.localeCompare(b.status));
        break;
      case 'date':
      default:
        arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return arr;
  },

  // Runs the full pipeline for a given project's board
  forBoard(projectId) {
    let tasks = State.tasks.filter(t => t.projectId === projectId && !t.archived);
    tasks = tasks.filter(t => this.matchQuery(t, State.searchQuery));
    tasks = tasks.filter(t => this.matchFilters(t, State.activeFilters));
    return this.sort(tasks, State.sortBy);
  },

  // Global search across every non-archived task (used by the topbar search)
  globalResults(query) {
    if (!query) return [];
    return State.tasks.filter(t => !t.archived && this.matchQuery(t, query)).slice(0, 30);
  },
};
