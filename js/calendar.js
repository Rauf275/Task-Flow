// ============================================================
// calendar.js — модуль календаря.
// Архитектура разделена на независимые части:
//   - buildMonthGrid()      — генерация сетки дней месяца
//   - groupTasksByDate()    — индексация активных задач по дате (для
//                              производительности: один проход по
//                              задачам вместо фильтрации на каждую
//                              ячейку сетки)
//   - CalendarModule.*      — публичное API, которым пользуется render.js
// Навигация по месяцам и обработчики событий находятся в main.js /
// render.js и сюда не подмешиваются.
// ============================================================
import { State } from './state.js';
import { isOverdue } from './utils.js';

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DOW = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

// Статусы, которые считаются "активными" и должны попадать в календарь.
// Задачи в статусе Done в календаре не отображаются.
const ACTIVE_STATUSES = new Set(['backlog', 'todo', 'in_progress', 'review', 'testing']);

// Локальный ключ даты вида "YYYY-MM-DD" без каких-либо преобразований
// часового пояса — используется только как ключ группировки, дедлайн
// как таковой не пересчитывается и не конвертируется.
function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isActiveTask(task) {
  return !task.archived && ACTIVE_STATUSES.has(task.status);
}

// ------------------------------------------------------------
// Генерация сетки календаря: всегда 42 ячейки (6 недель), понедельник
// первым днём недели. Чистая функция — не трогает State и не рендерит.
// ------------------------------------------------------------
function buildMonthGrid(cursorDate) {
  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  let startDow = firstOfMonth.getDay(); // 0 = воскресенье
  startDow = startDow === 0 ? 6 : startDow - 1; // Пн = 0

  const startDate = new Date(year, month, 1 - startDow);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    cells.push(d);
  }
  return cells;
}

// ------------------------------------------------------------
// Один проход по задачам -> Map<dateKey, Task[]>. Используется вместо
// повторной фильтрации всего массива задач для каждой из 42 ячеек.
// ------------------------------------------------------------
function groupTasksByDate() {
  const map = new Map();
  for (const task of State.tasks) {
    if (!task.deadline || !isActiveTask(task)) continue;
    const d = new Date(task.deadline);
    if (isNaN(d.getTime())) continue;
    const key = localDateKey(d);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(task);
  }
  return map;
}

export const CalendarModule = {
  monthLabel(date) {
    return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
  },

  dowLabels() { return DOW; },

  dateKey(date) { return localDateKey(date); },

  // Возвращает всё необходимое для рендера месяца за один вызов:
  // сетку дней + индекс задач по дате, посчитанный один раз.
  buildMonthView(cursorDate) {
    return {
      cells: buildMonthGrid(cursorDate),
      tasksByDate: groupTasksByDate(),
    };
  },

  tasksOnDate(date) {
    const key = localDateKey(date);
    return groupTasksByDate().get(key) || [];
  },

  overdueTasks() {
    return State.tasks
      .filter(t => isActiveTask(t) && isOverdue(t.deadline, t.status))
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  },

  upcomingTasks(limit = 8) {
    const now = Date.now();
    return State.tasks
      .filter(t => isActiveTask(t) && t.deadline && new Date(t.deadline).getTime() >= now)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
      .slice(0, limit);
  },
};
