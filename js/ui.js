// ============================================================
// ui.js — построение модальных окон и контекстных меню.
// Рендеринг основных экранов находится в render.js.
// ============================================================
import { State, STATUSES, PRIORITIES, PROJECT_COLORS, PROJECT_ICONS } from './state.js';
import { Projects } from './projects.js';
import { Tasks } from './tasks.js';
import { Auth } from './auth.js';
import { escapeHtml, formatDateTime, initials, avatarDataUrl, readFileAsDataUrl } from './utils.js';
import { toast } from './notifications.js';

const modalRoot = () => document.getElementById('modal-root');

export function closeModal() {
  modalRoot().innerHTML = '';
}

function openModal(html, { wide = false } = {}) {
  modalRoot().innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-box ${wide ? 'wide' : ''}">${html}</div>
    </div>
  `;
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}

// ------------------------------------------------------------
// Confirm dialog
// ------------------------------------------------------------
export function confirmDialog({ title, body, confirmLabel = 'Подтвердить', danger = true, onConfirm }) {
  openModal(`
    <div class="modal-head"><h2>${escapeHtml(title)}</h2><button class="icon-btn" id="modal-close">✕</button></div>
    <div class="modal-body"><p>${escapeHtml(body)}</p></div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="confirm-cancel">Отмена</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">${escapeHtml(confirmLabel)}</button>
    </div>
  `);
  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('confirm-cancel').onclick = closeModal;
  document.getElementById('confirm-ok').onclick = () => { onConfirm(); closeModal(); };
}

// ------------------------------------------------------------
// Project modal (create / edit)
// ------------------------------------------------------------
export function openProjectModal(existing, onSaved) {
  const isEdit = !!existing;
  const color = existing ? existing.color : PROJECT_COLORS[0];
  const icon = existing ? existing.icon : PROJECT_ICONS[0];
  openModal(`
    <div class="modal-head"><h2>${isEdit ? 'Редактировать проект' : 'Новый проект'}</h2><button class="icon-btn" id="modal-close">✕</button></div>
    <div class="modal-body">
      <div class="field">
        <label>Название</label>
        <input type="text" id="pm-name" value="${escapeHtml(existing?.name || '')}" placeholder="Название проекта">
        <span class="field-error" id="pm-name-err"></span>
      </div>
      <div class="field">
        <label>Описание</label>
        <textarea id="pm-desc" placeholder="Коротко опишите проект">${escapeHtml(existing?.description || '')}</textarea>
      </div>
      <div class="field">
        <label>Цвет</label>
        <div class="color-swatches" id="pm-colors">
          ${PROJECT_COLORS.map(c => `<div class="swatch ${c === color ? 'active' : ''}" data-color="${c}" style="background:${c}"></div>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>Иконка</label>
        <div class="icon-picker" id="pm-icons">
          ${PROJECT_ICONS.map(i => `<div class="icon-opt ${i === icon ? 'active' : ''}" data-icon="${i}">${i}</div>`).join('')}
        </div>
      </div>
    </div>
    <div class="modal-foot">
      ${isEdit ? `<button class="btn btn-danger" id="pm-delete" style="margin-right:auto">Удалить проект</button>` : ''}
      <button class="btn btn-secondary" id="modal-cancel">Отмена</button>
      <button class="btn btn-primary" id="pm-save">${isEdit ? 'Сохранить' : 'Создать'}</button>
    </div>
  `);

  let selColor = color, selIcon = icon;
  document.getElementById('pm-colors').addEventListener('click', (e) => {
    const sw = e.target.closest('.swatch'); if (!sw) return;
    selColor = sw.dataset.color;
    document.querySelectorAll('#pm-colors .swatch').forEach(s => s.classList.toggle('active', s === sw));
  });
  document.getElementById('pm-icons').addEventListener('click', (e) => {
    const op = e.target.closest('.icon-opt'); if (!op) return;
    selIcon = op.dataset.icon;
    document.querySelectorAll('#pm-icons .icon-opt').forEach(s => s.classList.toggle('active', s === op));
  });

  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal-cancel').onclick = closeModal;
  if (isEdit) {
    document.getElementById('pm-delete').onclick = () => {
      confirmDialog({
        title: 'Удалить проект?',
        body: `Проект «${existing.name}» и все его задачи будут удалены безвозвратно.`,
        confirmLabel: 'Удалить',
        onConfirm: () => { Projects.remove(existing.id); onSaved({ deleted: true }); },
      });
    };
  }
  document.getElementById('pm-save').onclick = () => {
    const name = document.getElementById('pm-name').value.trim();
    if (!name) { document.getElementById('pm-name-err').textContent = 'Введите название проекта'; return; }
    const desc = document.getElementById('pm-desc').value;
    let project;
    if (isEdit) project = Projects.update(existing.id, { name, description: desc, color: selColor, icon: selIcon });
    else project = Projects.create({ name, description: desc, color: selColor, icon: selIcon });
    closeModal();
    onSaved({ project });
  };
}

// ------------------------------------------------------------
// Task modal (create / edit detail view)
// ------------------------------------------------------------
export function openTaskModal({ task = null, projectId = null, defaultStatus = 'backlog' }, onChange) {
  const isEdit = !!task;
  const t = task || {
    title: '', description: '', status: defaultStatus, priority: 'medium', deadline: '',
    assignee: '', color: '#6C5CE7', tags: [], checklist: [], id: null,
  };
  const project = Projects.get(projectId || t.projectId);

  openModal(`
    <div class="modal-head">
      <h2>${isEdit ? 'Задача' : 'Новая задача'}</h2>
      <div style="display:flex;gap:6px;align-items:center;">
        ${isEdit ? `<button class="icon-btn tiny" id="tm-fav" title="Избранное">${t.favorite ? '★' : '☆'}</button>` : ''}
        <button class="icon-btn" id="modal-close">✕</button>
      </div>
    </div>
    <div class="modal-body">
      <div class="field">
        <label>Название</label>
        <input type="text" id="tm-title" value="${escapeHtml(t.title)}" placeholder="Что нужно сделать?">
        <span class="field-error" id="tm-title-err"></span>
      </div>
      <div class="field">
        <label>Описание</label>
        <textarea id="tm-desc" placeholder="Подробности задачи">${escapeHtml(t.description)}</textarea>
      </div>
      <div class="td-grid">
        <div class="field">
          <label>Статус</label>
          <select id="tm-status">${STATUSES.map(s => `<option value="${s.id}" ${s.id === t.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Приоритет</label>
          <select id="tm-priority">${PRIORITIES.map(p => `<option value="${p.id}" ${p.id === t.priority ? 'selected' : ''}>${p.label}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Дедлайн</label>
          <input type="datetime-local" id="tm-deadline" value="${t.deadline ? t.deadline.slice(0, 16) : ''}">
        </div>
        <div class="field">
          <label>Исполнитель</label>
          <input type="text" id="tm-assignee" value="${escapeHtml(t.assignee)}" placeholder="Имя исполнителя">
        </div>
        <div class="field">
          <label>Цвет</label>
          <div class="color-swatches" id="tm-colors">
            ${PROJECT_COLORS.map(c => `<div class="swatch ${c === t.color ? 'active' : ''}" data-color="${c}" style="background:${c}"></div>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>Проект</label>
          <input type="text" value="${escapeHtml(project?.name || '')}" disabled>
        </div>
      </div>

      <div class="field">
        <label>Теги</label>
        <div class="tag-editor" id="tm-tag-list">
          ${t.tags.map(tag => `<span class="tag-chip">${escapeHtml(tag)}<button data-tag="${escapeHtml(tag)}">✕</button></span>`).join('')}
        </div>
        <div class="checklist-add">
          <input type="text" id="tm-tag-input" placeholder="Добавить тег и нажать Enter" list="tm-tag-suggestions">
          <datalist id="tm-tag-suggestions">${State.tags.map(tag => `<option value="${escapeHtml(tag)}">`).join('')}</datalist>
          <button class="btn btn-secondary btn-sm" id="tm-tag-add">Добавить</button>
        </div>
      </div>

      ${isEdit ? `
      <div class="td-section">
        <h3>Чек-лист (${Tasks.checklistProgress(t)}%)</h3>
        <div class="progress-track"><div class="progress-fill" style="width:${Tasks.checklistProgress(t)}%"></div></div>
        <div id="tm-checklist">
          ${t.checklist.map(c => `
            <div class="checklist-item ${c.done ? 'done' : ''}">
              <input type="checkbox" data-chk="${c.id}" ${c.done ? 'checked' : ''}>
              <input type="text" value="${escapeHtml(c.text)}" disabled>
              <button class="icon-btn tiny" data-chk-del="${c.id}">✕</button>
            </div>
          `).join('') || '<p class="text-dim" style="font-size:13px;">Пунктов пока нет</p>'}
        </div>
        <div class="checklist-add">
          <input type="text" id="tm-chk-input" placeholder="Новый пункт чек-листа">
          <button class="btn btn-secondary btn-sm" id="tm-chk-add">Добавить</button>
        </div>
      </div>

      <div class="td-section">
        <h3>Комментарии</h3>
        <div id="tm-comments">
          ${Tasks.commentsFor(t.id).map(c => `
            <div class="comment-item">
              <div class="comment-head"><span class="comment-author">${escapeHtml(c.author)}</span><span class="comment-time">${formatDateTime(c.createdAt)}</span></div>
              <div class="comment-text">${escapeHtml(c.text)}</div>
            </div>
          `).join('') || '<p class="text-dim" style="font-size:13px;">Комментариев пока нет</p>'}
        </div>
        <div class="comment-add">
          <textarea id="tm-comment-input" placeholder="Написать комментарий..."></textarea>
          <button class="btn btn-secondary btn-sm" id="tm-comment-add">Отправить</button>
        </div>
      </div>

      <div class="td-section">
        <h3>История изменений</h3>
        <div>
          ${(t.history || []).map(h => `<div class="history-item">${escapeHtml(h.text)} · ${formatDateTime(h.at)}</div>`).join('')}
        </div>
      </div>
      ` : ''}
    </div>
    <div class="modal-foot">
      ${isEdit ? `<button class="btn btn-danger" id="tm-delete" style="margin-right:auto">Удалить</button>` : ''}
      <button class="btn btn-secondary" id="modal-cancel">Отмена</button>
      <button class="btn btn-primary" id="tm-save">${isEdit ? 'Сохранить' : 'Создать задачу'}</button>
    </div>
  `, { wide: true });

  let selColor = t.color;
  let workingTags = [...t.tags];

  document.getElementById('tm-colors').addEventListener('click', (e) => {
    const sw = e.target.closest('.swatch'); if (!sw) return;
    selColor = sw.dataset.color;
    document.querySelectorAll('#tm-colors .swatch').forEach(s => s.classList.toggle('active', s === sw));
  });

  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal-cancel').onclick = closeModal;

  if (isEdit) {
    document.getElementById('tm-fav').onclick = (e) => {
      Tasks.toggleFavorite(t.id);
      e.target.textContent = Tasks.get(t.id).favorite ? '★' : '☆';
      onChange();
    };
    document.getElementById('tm-delete').onclick = () => {
      confirmDialog({
        title: 'Удалить задачу?',
        body: `Задача «${t.title}» будет удалена безвозвратно.`,
        confirmLabel: 'Удалить',
        onConfirm: () => { Tasks.remove(t.id); closeModal(); onChange(); },
      });
    };

    document.getElementById('tm-checklist').addEventListener('change', (e) => {
      const chkId = e.target.dataset.chk;
      if (chkId) { Tasks.toggleChecklistItem(t.id, chkId); refreshTaskModal(t.id, onChange); }
    });
    document.getElementById('tm-checklist').addEventListener('click', (e) => {
      const delId = e.target.dataset.chkDel;
      if (delId) { Tasks.removeChecklistItem(t.id, delId); refreshTaskModal(t.id, onChange); }
    });
    document.getElementById('tm-chk-add').onclick = () => {
      const input = document.getElementById('tm-chk-input');
      if (input.value.trim()) { Tasks.addChecklistItem(t.id, input.value); refreshTaskModal(t.id, onChange); }
    };
    document.getElementById('tm-chk-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('tm-chk-add').click(); }
    });

    document.getElementById('tm-comment-add').onclick = () => {
      const input = document.getElementById('tm-comment-input');
      if (input.value.trim()) { Tasks.addComment(t.id, input.value); refreshTaskModal(t.id, onChange); }
    };
  }

  document.getElementById('tm-tag-list').addEventListener('click', (e) => {
    const tag = e.target.dataset.tag;
    if (!tag) return;
    workingTags = workingTags.filter(x => x !== tag);
    if (isEdit) Tasks.removeTagFromTask(t.id, tag);
    e.target.closest('.tag-chip').remove();
  });
  const addTag = () => {
    const input = document.getElementById('tm-tag-input');
    const val = input.value.trim();
    if (!val || workingTags.includes(val)) return;
    workingTags.push(val);
    if (isEdit) Tasks.addTagToTask(t.id, val);
    const list = document.getElementById('tm-tag-list');
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `${escapeHtml(val)}<button data-tag="${escapeHtml(val)}">✕</button>`;
    list.appendChild(chip);
    input.value = '';
  };
  document.getElementById('tm-tag-add').onclick = addTag;
  document.getElementById('tm-tag-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
  });

  document.getElementById('tm-save').onclick = () => {
    const title = document.getElementById('tm-title').value.trim();
    if (!title) { document.getElementById('tm-title-err').textContent = 'Введите название задачи'; return; }
    const payload = {
      title,
      description: document.getElementById('tm-desc').value,
      status: document.getElementById('tm-status').value,
      priority: document.getElementById('tm-priority').value,
      deadline: document.getElementById('tm-deadline').value || null,
      assignee: document.getElementById('tm-assignee').value,
      color: selColor,
      tags: workingTags,
    };
    if (isEdit) {
      Tasks.update(t.id, payload);
    } else {
      Tasks.create({ ...payload, projectId: projectId || t.projectId });
    }
    closeModal();
    onChange();
  };
}

function refreshTaskModal(taskId, onChange) {
  const task = Tasks.get(taskId);
  openTaskModal({ task, projectId: task.projectId }, onChange);
}

// ------------------------------------------------------------
// Profile modal (edit)
// ------------------------------------------------------------
export function openProfileEditModal(onSaved) {
  const u = State.currentUser;
  openModal(`
    <div class="modal-head"><h2>Редактировать профиль</h2><button class="icon-btn" id="modal-close">✕</button></div>
    <div class="modal-body">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
        <img id="pf-avatar-preview" class="avatar big" src="${u.avatar}" alt="">
        <label class="btn btn-secondary file-btn">Изменить фото<input type="file" id="pf-avatar-input" accept="image/*" hidden></label>
      </div>
      <div class="field-row">
        <div class="field"><label>Имя</label><input type="text" id="pf-first" value="${escapeHtml(u.firstName)}"></div>
        <div class="field"><label>Фамилия</label><input type="text" id="pf-last" value="${escapeHtml(u.lastName)}"></div>
      </div>
      <div class="field"><label>Email</label><input type="email" id="pf-email" value="${escapeHtml(u.email)}"></div>
      <div class="field"><label>Должность</label><input type="text" id="pf-role" value="${escapeHtml(u.role || '')}" placeholder="Например, Product Manager"></div>
      <div class="field"><label>Описание</label><textarea id="pf-bio" placeholder="Немного о себе">${escapeHtml(u.bio || '')}</textarea></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="modal-cancel">Отмена</button>
      <button class="btn btn-primary" id="pf-save">Сохранить</button>
    </div>
  `);
  let newAvatar = u.avatar;
  document.getElementById('pf-avatar-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    newAvatar = await readFileAsDataUrl(file);
    document.getElementById('pf-avatar-preview').src = newAvatar;
  });
  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('pf-save').onclick = () => {
    const first = document.getElementById('pf-first').value.trim();
    const last = document.getElementById('pf-last').value.trim();
    if (!first || !last) { toast('Заполните имя и фамилию', 'error'); return; }
    Auth.updateProfile({
      firstName: first,
      lastName: last,
      email: document.getElementById('pf-email').value.trim(),
      role: document.getElementById('pf-role').value.trim(),
      bio: document.getElementById('pf-bio').value.trim(),
      avatar: newAvatar || avatarDataUrl(first + last, initials(first, last)),
    });
    closeModal();
    onSaved();
    toast('Профиль обновлён', 'success');
  };
}

// ------------------------------------------------------------
// Day tasks modal (calendar cell click) — lists every active task
// due on a given date with title, project, status, priority,
// deadline and assignee, and lets the user drill into a task.
// ------------------------------------------------------------
export function openDayTasksModal(date, tasks, onOpenTask) {
  const dateLabel = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
  openModal(`
    <div class="modal-head"><h2>${escapeHtml(dateLabel)}</h2><button class="icon-btn" id="modal-close">✕</button></div>
    <div class="modal-body">
      ${tasks.length ? tasks.map(t => {
        const project = Projects.get(t.projectId);
        const p = PRIORITIES.find(x => x.id === t.priority) || PRIORITIES[1];
        const s = STATUSES.find(x => x.id === t.status) || STATUSES[0];
        const overdue = t.deadline && new Date(t.deadline).getTime() < Date.now() && t.status !== 'done';
        return `
          <div class="day-task-row" data-task="${t.id}">
            <span class="p-dot" style="background:${p.color};width:9px;height:9px;border-radius:50%;flex:none;"></span>
            <div class="day-task-main">
              <div class="day-task-title">${escapeHtml(t.title)}</div>
              <div class="day-task-meta">
                <span>${escapeHtml(project?.name || '')}</span>
                <span>${escapeHtml(s.label)}</span>
                <span class="priority-badge priority-${t.priority}">${p.label}</span>
                <span class="${overdue ? 'overdue' : ''}">${formatDateTime(t.deadline)}</span>
                ${t.assignee ? `<span>👤 ${escapeHtml(t.assignee)}</span>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('') : `<p class="text-dim" style="font-size:13.5px;">На эту дату нет активных задач.</p>`}
    </div>
    <div class="modal-foot"><button class="btn btn-secondary" id="modal-cancel">Закрыть</button></div>
  `, { wide: true });
  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal-cancel').onclick = closeModal;
  modalRoot().querySelectorAll('.day-task-row').forEach(row => {
    row.addEventListener('click', () => {
      closeModal();
      onOpenTask(row.dataset.task);
    });
  });
}

// ------------------------------------------------------------
// Context menu (right-click / long-press quick actions)
// ------------------------------------------------------------
export function showContextMenu(x, y, items) {
  document.querySelectorAll('.context-menu').forEach(el => el.remove());
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - items.length * 38 - 20) + 'px';
  menu.innerHTML = items.map((it, i) => `<div class="context-menu-item ${it.danger ? 'danger' : ''}" data-idx="${i}">${it.label}</div>`).join('');
  document.body.appendChild(menu);
  menu.addEventListener('click', (e) => {
    const el = e.target.closest('.context-menu-item');
    if (!el) return;
    items[+el.dataset.idx].action();
    menu.remove();
  });
  const closer = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closer); } };
  setTimeout(() => document.addEventListener('click', closer), 0);
}
