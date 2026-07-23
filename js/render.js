// ============================================================
// render.js — рендеринг всех экранов приложения на основе State.
// ============================================================
import { State, STATUSES, PRIORITIES } from './state.js';
import { Projects } from './projects.js';
import { Tasks } from './tasks.js';
import { Search } from './search.js';
import { Stats } from './stats.js';
import { CalendarModule } from './calendar.js';
import { Notifications } from './notifications.js';
import { escapeHtml, formatDate, formatDateTime, isOverdue, initials } from './utils.js';
import { openTaskModal, showContextMenu, confirmDialog, openDayTasksModal } from './ui.js';
import { Tasks as TasksApi } from './tasks.js';

function priorityMeta(id) { return PRIORITIES.find(p => p.id === id) || PRIORITIES[1]; }
function statusMeta(id) { return STATUSES.find(s => s.id === id) || STATUSES[0]; }

// ------------------------------------------------------------
// Sidebar
// ------------------------------------------------------------
export function renderSidebar() {
  const u = State.currentUser;
  document.getElementById('sidebar-avatar').src = u.avatar;
  document.getElementById('sidebar-username').textContent = `${u.firstName} ${u.lastName}`;
  document.getElementById('sidebar-userrole').textContent = u.role || u.email;

  const list = document.getElementById('sidebar-project-list');
  const projects = Projects.all().slice(0, 8);
  list.innerHTML = projects.map(p => `
    <div class="sidebar-project-item ${State.currentProjectId === p.id ? 'active' : ''}" data-project="${p.id}">
      <span class="proj-dot" style="background:${p.color}"></span>
      <span>${escapeHtml(p.name)}</span>
    </div>
  `).join('') || `<div style="padding:8px 4px;color:var(--text-faint);font-size:12.5px;">Нет проектов</div>`;

  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === State.currentView);
  });
}

// ------------------------------------------------------------
// View switcher
// ------------------------------------------------------------
export function showView(viewName) {
  State.currentView = viewName;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const el = document.getElementById(`view-${viewName}`);
  if (el) el.classList.remove('hidden');
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });
  renderCurrentView();
}

export function renderCurrentView() {
  switch (State.currentView) {
    case 'dashboard': renderDashboard(); break;
    case 'projects': renderProjectsGrid(); break;
    case 'board': renderBoard(); break;
    case 'calendar': renderCalendar(); break;
    case 'favorites': renderFavorites(); break;
    case 'archive': renderArchive(); break;
    case 'profile': renderProfile(); break;
    case 'settings': break;
  }
  renderSidebar();
}

// ------------------------------------------------------------
// Dashboard
// ------------------------------------------------------------
function miniTaskRow(task) {
  const project = Projects.get(task.projectId);
  const overdue = isOverdue(task.deadline, task.status);
  return `
    <div class="mini-task-row" data-task="${task.id}">
      <span class="p-dot" style="background:${priorityMeta(task.priority).color}"></span>
      <span class="mt-title">${escapeHtml(task.title)}</span>
      <span class="mt-project">${project ? escapeHtml(project.name) : ''}</span>
      <span class="mt-deadline ${overdue ? 'task-card-deadline overdue' : ''}">${task.deadline ? formatDate(task.deadline, { short: true }) : ''}</span>
    </div>
  `;
}

function renderDashboard() {
  const u = State.currentUser;
  document.getElementById('dashboard-greeting').textContent = `Добро пожаловать, ${u.firstName}! Вот что происходит в ваших проектах.`;
  document.getElementById('stat-grid').innerHTML = Stats.cardsHtml(Stats.compute());

  const recent = [...State.tasks].filter(t => !t.archived).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6);
  document.getElementById('recent-tasks').innerHTML = recent.map(miniTaskRow).join('') || emptyRow('Пока нет задач');

  const projects = Projects.all().slice(0, 6);
  document.getElementById('dash-projects').innerHTML = projects.map(p => `
    <div class="mini-project-row" data-project="${p.id}">
      <span class="mp-icon" style="background:${p.color}22;color:${p.color}">${p.icon}</span>
      <span class="mp-name">${escapeHtml(p.name)}</span>
      <span class="mp-count">${Projects.taskCount(p.id)} задач</span>
    </div>
  `).join('') || emptyRow('Создайте первый проект');

  bindTaskRowClicks(document.getElementById('recent-tasks'));
  bindProjectRowClicks(document.getElementById('dash-projects'));
}

function emptyRow(text) { return `<div class="empty-state">${escapeHtml(text)}</div>`; }

// ------------------------------------------------------------
// Projects grid
// ------------------------------------------------------------
function projectCardHtml(p) {
  const progress = Projects.progress(p.id);
  return `
    <div class="project-card" data-project="${p.id}">
      <button class="project-fav-star ${p.favorite ? 'active' : ''}" data-fav="${p.id}">${p.favorite ? '★' : '☆'}</button>
      <div class="project-card-top">
        <span class="project-icon-badge" style="background:${p.color}22;color:${p.color}">${p.icon}</span>
        <span class="project-card-title">${escapeHtml(p.name)}</span>
      </div>
      <p class="project-card-desc">${escapeHtml(p.description || 'Без описания')}</p>
      <div class="project-card-progress"><div class="project-card-progress-fill" style="width:${progress}%;background:${p.color}"></div></div>
      <div class="project-card-foot">
        <span>${Projects.taskCount(p.id)} задач</span>
        <span>${progress}% готово</span>
      </div>
    </div>
  `;
}

function renderProjectsGrid() {
  const grid = document.getElementById('project-grid');
  const projects = Projects.all();
  grid.innerHTML = projects.map(projectCardHtml).join('') || emptyRow('У вас пока нет проектов. Создайте первый!');
  bindProjectCardEvents(grid);
}

function bindProjectCardEvents(container) {
  container.querySelectorAll('.project-fav-star').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      Projects.toggleFavorite(btn.dataset.fav);
      renderCurrentView();
    });
  });
  container.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => openProject(card.dataset.project));
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const id = card.dataset.project;
      showContextMenu(e.clientX, e.clientY, [
        { label: '✎ Редактировать', action: () => import('./ui.js').then(m => m.openProjectModal(Projects.get(id), () => renderCurrentView())) },
        { label: '⧉ Дублировать', action: () => { Projects.duplicate(id); renderCurrentView(); } },
        { label: '🗑 Удалить', danger: true, action: () => confirmDialog({
            title: 'Удалить проект?', body: 'Все задачи проекта тоже будут удалены.', confirmLabel: 'Удалить',
            onConfirm: () => { Projects.remove(id); renderCurrentView(); },
          }) },
      ]);
    });
  });
}

export function openProject(id) {
  State.currentProjectId = id;
  showView('board');
}

// ------------------------------------------------------------
// Kanban board
// ------------------------------------------------------------
function populateFilterOptions(projectId) {
  const tasks = Tasks.byProject(projectId, { includeArchived: false });
  const assignees = [...new Set(tasks.map(t => t.assignee).filter(Boolean))];
  const tags = [...new Set(tasks.flatMap(t => t.tags))];

  const assigneeSel = document.getElementById('filter-assignee');
  const current = State.activeFilters.assignee;
  assigneeSel.innerHTML = `<option value="">Исполнитель: все</option>` + assignees.map(a => `<option value="${escapeHtml(a)}" ${a === current ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('');

  const tagSel = document.getElementById('filter-tag');
  const currentTag = State.activeFilters.tag;
  tagSel.innerHTML = `<option value="">Тег: все</option>` + tags.map(t => `<option value="${escapeHtml(t)}" ${t === currentTag ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');

  const bulkStatus = document.getElementById('bulk-status');
  bulkStatus.innerHTML = `<option value="">Изменить статус...</option>` + STATUSES.map(s => `<option value="${s.id}">${s.label}</option>`).join('');
}

function taskCardHtml(task) {
  const p = priorityMeta(task.priority);
  const overdue = isOverdue(task.deadline, task.status);
  const progress = TasksApi.checklistProgress(task);
  const selected = State.selectedTaskIds.has(task.id);
  return `
    <div class="task-card" draggable="true" data-task="${task.id}" style="border-left-color:${p.color}">
      <input type="checkbox" class="task-card-bulk-check" data-bulk="${task.id}" ${selected ? 'checked' : ''}>
      <div class="task-card-top">
        <span class="task-card-title">${escapeHtml(task.title)}</span>
      </div>
      <div class="task-card-color-strip" style="background:${task.color}"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span class="priority-badge priority-${task.priority}">${p.label}</span>
        ${task.favorite ? '<span style="color:var(--p-medium);font-size:13px;">★</span>' : ''}
      </div>
      ${task.tags.length ? `<div class="task-card-tags">${task.tags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      ${task.checklist.length ? `<div class="task-card-progress"><div class="task-card-progress-fill" style="width:${progress}%"></div></div>` : ''}
      <div class="task-card-meta" style="margin-top:8px;">
        <span class="task-card-deadline ${overdue ? 'overdue' : ''}">${task.deadline ? '⏱ ' + formatDate(task.deadline, { short: true }) : ''}</span>
        ${task.assignee ? `<span class="task-card-assignee" title="${escapeHtml(task.assignee)}">${initials(task.assignee.split(' ')[0], task.assignee.split(' ')[1] || '')}</span>` : '<span></span>'}
      </div>
    </div>
  `;
}

function renderBoard() {
  const project = Projects.get(State.currentProjectId);
  if (!project) { showView('projects'); return; }

  document.getElementById('board-project-name').textContent = project.name;
  const iconBadge = document.getElementById('board-project-icon');
  iconBadge.textContent = project.icon;
  iconBadge.style.background = project.color + '22';
  iconBadge.style.color = project.color;
  const favBtn = document.getElementById('board-project-fav');
  favBtn.classList.toggle('active', project.favorite);
  favBtn.textContent = project.favorite ? '★' : '☆';

  populateFilterOptions(project.id);
  document.getElementById('filter-priority').value = State.activeFilters.priority;
  document.getElementById('filter-deadline').value = State.activeFilters.deadline;
  document.getElementById('sort-by').value = State.sortBy;

  const tasks = Search.forBoard(project.id);
  const board = document.getElementById('kanban-board');
  board.innerHTML = STATUSES.map(s => {
    const colTasks = tasks.filter(t => t.status === s.id);
    return `
      <div class="kanban-col" data-status="${s.id}">
        <div class="kanban-col-head"><span>${s.label}</span><span class="col-count">${colTasks.length}</span></div>
        <div class="kanban-col-body" data-status-body="${s.id}">
          ${colTasks.map(taskCardHtml).join('')}
        </div>
      </div>
    `;
  }).join('');

  bindKanbanEvents(board, project.id);
  updateBulkBar();
}

function bindKanbanEvents(board, projectId) {
  // Card click -> open detail
  board.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.matches('input[type=checkbox]')) return;
      const task = TasksApi.get(card.dataset.task);
      openTaskModal({ task, projectId }, () => renderCurrentView());
    });
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const id = card.dataset.task;
      const task = TasksApi.get(id);
      showContextMenu(e.clientX, e.clientY, [
        { label: task.favorite ? '☆ Убрать из избранного' : '★ В избранное', action: () => { TasksApi.toggleFavorite(id); renderCurrentView(); } },
        { label: '⧉ Дублировать', action: () => { TasksApi.duplicate(id); renderCurrentView(); } },
        { label: '🗄 В архив', action: () => { TasksApi.toggleArchive(id); renderCurrentView(); } },
        { label: '🗑 Удалить', danger: true, action: () => confirmDialog({
            title: 'Удалить задачу?', body: `«${task.title}» будет удалена.`, confirmLabel: 'Удалить',
            onConfirm: () => { TasksApi.remove(id); renderCurrentView(); },
          }) },
      ]);
    });
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });

  // Bulk checkboxes
  board.querySelectorAll('[data-bulk]').forEach(chk => {
    chk.addEventListener('click', (e) => e.stopPropagation());
    chk.addEventListener('change', () => {
      const id = chk.dataset.bulk;
      if (chk.checked) State.selectedTaskIds.add(id); else State.selectedTaskIds.delete(id);
      updateBulkBar();
    });
  });

  // Drag & drop columns
  board.querySelectorAll('.kanban-col-body').forEach(colBody => {
    colBody.addEventListener('dragover', (e) => {
      e.preventDefault();
      colBody.classList.add('drag-over');
    });
    colBody.addEventListener('dragleave', () => colBody.classList.remove('drag-over'));
    colBody.addEventListener('drop', (e) => {
      e.preventDefault();
      colBody.classList.remove('drag-over');
      const dragging = board.querySelector('.dragging');
      if (!dragging) return;
      const taskId = dragging.dataset.task;
      const newStatus = colBody.dataset.statusBody;
      TasksApi.update(taskId, { status: newStatus });
      renderCurrentView();
    });
  });
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const count = State.selectedTaskIds.size;
  bar.classList.toggle('hidden', count === 0);
  document.getElementById('bulk-count').textContent = `${count} выбрано`;
}

// ------------------------------------------------------------
// Calendar
// ------------------------------------------------------------
function renderCalendar() {
  document.getElementById('cal-label').textContent = CalendarModule.monthLabel(State.calendarCursor);
  const grid = document.getElementById('calendar-grid');
  const { cells, tasksByDate } = CalendarModule.buildMonthView(State.calendarCursor);
  const dows = CalendarModule.dowLabels().map(d => `<div class="cal-dow">${d}</div>`).join('');
  const today = new Date();
  const MAX_VISIBLE = 2;

  const cellsHtml = cells.map(date => {
    const otherMonth = date.getMonth() !== State.calendarCursor.getMonth();
    const isToday = date.toDateString() === today.toDateString();
    const dayTasks = tasksByDate.get(CalendarModule.dateKey(date)) || [];
    const overdueCount = dayTasks.filter(t => isOverdue(t.deadline, t.status)).length;
    const visible = dayTasks.slice(0, MAX_VISIBLE);
    const rest = dayTasks.length - visible.length;

    return `
      <div class="cal-cell ${otherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${overdueCount ? 'has-overdue' : ''}" data-date="${CalendarModule.dateKey(date)}">
        <div class="cal-cell-head">
          <span class="cal-cell-num">${date.getDate()}</span>
          ${dayTasks.length ? `<span class="cal-cell-count ${overdueCount ? 'overdue-count' : ''}">📋 ${dayTasks.length}</span>` : ''}
        </div>
        <div class="cal-cell-list">
          ${visible.map(t => {
            const overdue = isOverdue(t.deadline, t.status);
            const color = t.color || priorityMeta(t.priority).color;
            return `<div class="cal-cell-task ${overdue ? 'overdue' : ''}" style="background:${color}22;color:${color};border-left-color:${color}">${escapeHtml(t.title)}</div>`;
          }).join('')}
          ${rest > 0 ? `<div class="cal-cell-more">+${rest} ещё</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  grid.innerHTML = dows + cellsHtml;
  grid.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      const dayTasks = tasksByDate.get(cell.dataset.date) || [];
      const [y, m, d] = cell.dataset.date.split('-').map(Number);
      openDayTasksModal(new Date(y, m - 1, d), dayTasks, (taskId) => {
        const task = TasksApi.get(taskId);
        if (task) openTaskModal({ task, projectId: task.projectId }, () => renderCurrentView());
      });
    });
  });

  document.getElementById('cal-overdue').innerHTML = CalendarModule.overdueTasks().map(miniTaskRow).join('') || emptyRow('Просроченных задач нет');
  document.getElementById('cal-upcoming').innerHTML = CalendarModule.upcomingTasks().map(miniTaskRow).join('') || emptyRow('Нет ближайших дедлайнов');
  bindTaskRowClicks(document.getElementById('cal-overdue'));
  bindTaskRowClicks(document.getElementById('cal-upcoming'));
}

// ------------------------------------------------------------
// Favorites
// ------------------------------------------------------------
function renderFavorites() {
  const favProjects = Projects.favorites();
  document.getElementById('fav-project-grid').innerHTML = favProjects.map(projectCardHtml).join('') || emptyRow('Нет избранных проектов');
  bindProjectCardEvents(document.getElementById('fav-project-grid'));

  const favTasks = State.tasks.filter(t => t.favorite && !t.archived);
  document.getElementById('fav-task-list').innerHTML = favTasks.map(miniTaskRow).join('') || emptyRow('Нет избранных задач');
  bindTaskRowClicks(document.getElementById('fav-task-list'));
}

// ------------------------------------------------------------
// Archive
// ------------------------------------------------------------
function renderArchive() {
  const archived = State.tasks.filter(t => t.archived);
  const list = document.getElementById('archive-task-list');
  list.innerHTML = archived.map(t => `
    <div class="mini-task-row" data-task="${t.id}">
      <span class="p-dot" style="background:${priorityMeta(t.priority).color}"></span>
      <span class="mt-title">${escapeHtml(t.title)}</span>
      <button class="link-btn" data-restore="${t.id}">Восстановить</button>
    </div>
  `).join('') || emptyRow('Архив пуст');

  list.querySelectorAll('[data-restore]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      TasksApi.toggleArchive(btn.dataset.restore);
      renderCurrentView();
    });
  });
  bindTaskRowClicks(list, true);
}

// ------------------------------------------------------------
// Profile
// ------------------------------------------------------------
function renderProfile() {
  const u = State.currentUser;
  document.getElementById('profile-avatar').src = u.avatar;
  document.getElementById('profile-name').textContent = `${u.firstName} ${u.lastName}`;
  document.getElementById('profile-role').textContent = u.role || 'Должность не указана';
  document.getElementById('profile-email').textContent = u.email;
  document.getElementById('profile-bio').textContent = u.bio || '';
  document.getElementById('profile-stat-grid').innerHTML = Stats.cardsHtml(Stats.compute());
}

// ------------------------------------------------------------
// Shared row click binders
// ------------------------------------------------------------
function bindTaskRowClicks(container, skipIfRestoreBtn = false) {
  if (!container) return;
  container.querySelectorAll('.mini-task-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (skipIfRestoreBtn && e.target.dataset.restore) return;
      const task = TasksApi.get(row.dataset.task);
      if (!task) return;
      openTaskModal({ task, projectId: task.projectId }, () => renderCurrentView());
    });
  });
}

function bindProjectRowClicks(container) {
  if (!container) return;
  container.querySelectorAll('.mini-project-row').forEach(row => {
    row.addEventListener('click', () => openProject(row.dataset.project));
  });
}

export function renderNotifications() {
  Notifications.renderDropdown();
  Notifications.renderBadge();
}
