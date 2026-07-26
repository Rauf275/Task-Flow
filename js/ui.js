// ============================================================
// ui.js — построение модальных окон и контекстных меню.
// Рендеринг основных экранов находится в render.js.
// ============================================================
import { State, STATUSES, PRIORITIES, PROJECT_COLORS, PROJECT_ICONS } from './state.js';
import { Projects } from './projects.js';
import { Tasks } from './tasks.js';
import { Auth } from './auth.js';
import { Users } from './users.js';
import { Invitations } from './invitations.js';
import * as Permissions from './permissions.js';
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
// Project members modal (list, invite, roles, access mode)
// ------------------------------------------------------------
export function openMembersModal(project, onChange) {
  if (!project) return;
  const user = State.currentUser;
  const canInvite = Permissions.canInviteUsers(user, project);
  const canChangeRoles = Permissions.canChangeRoles(user, project);
  const canEditProj = Permissions.canEditProject(user, project);
  const members = Projects.membersDetailed(project.id);
  const pending = canInvite ? Invitations.pendingForProject(project.id) : [];

  openModal(`
    <div class="modal-head"><h2>Участники — ${escapeHtml(project.name)}</h2><button class="icon-btn" id="modal-close">✕</button></div>
    <div class="modal-body">
      <div class="td-section" style="margin-top:0;">
        <h3>Участники (${members.length})</h3>
        <div id="mm-member-list">
          ${members.map(m => memberRowHtml(m, { canChangeRoles, canRemove: Permissions.canRemoveMember(user, project, m.userId) })).join('')}
        </div>
      </div>

      ${canInvite ? `
      <div class="td-section">
        <h3>Пригласить участника</h3>
        <div class="field-row">
          <div class="field" style="flex:2;">
            <input type="email" id="mm-invite-email" placeholder="email@example.com">
          </div>
          <div class="field" style="flex:1;">
            <select id="mm-invite-role">
              <option value="Admin">Администратор</option>
              <option value="Member" selected>Участник</option>
              <option value="Viewer">Наблюдатель</option>
            </select>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" id="mm-invite-send">+ Пригласить участника</button>
        ${pending.length ? `
          <div style="margin-top:14px;">
            <div class="text-dim" style="font-size:12.5px;margin-bottom:6px;">Ожидают принятия:</div>
            ${pending.map(inv => `
              <div class="member-row">
                <div style="flex:1;min-width:0;font-size:13.5px;">${escapeHtml(inv.email)}</div>
                <span class="role-badge role-${inv.role.toLowerCase()}">${Permissions.roleLabel(inv.role)}</span>
                <button class="link-btn" data-revoke="${inv.id}">Отменить</button>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>` : ''}

      ${canEditProj ? `
      <div class="td-section">
        <h3>Доступ к проекту</h3>
        <div class="field">
          <select id="mm-access-mode">
            <option value="private" ${project.accessMode === 'private' ? 'selected' : ''}>Private — только приглашённые</option>
            <option value="collaborative" ${project.accessMode === 'collaborative' ? 'selected' : ''}>Collaborative — участники работают по ролям</option>
            <option value="readonly" ${project.accessMode === 'readonly' ? 'selected' : ''}>Read Only — доступен по ссылке, изменения запрещены</option>
          </select>
        </div>
        <label style="display:flex;gap:8px;align-items:center;font-size:13.5px;margin-top:12px;">
          <input type="checkbox" id="mm-policy-assignee" ${project.memberEditPolicy?.allowAssigneeEdit ? 'checked' : ''}>
          Участник (Member) может редактировать задачи, назначенные ему
        </label>
        <label style="display:flex;gap:8px;align-items:center;font-size:13.5px;margin-top:8px;">
          <input type="checkbox" id="mm-policy-viewer-comment" ${project.memberEditPolicy?.viewerCanComment ? 'checked' : ''}>
          Наблюдатель (Viewer) может оставлять комментарии
        </label>
      </div>` : ''}
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="modal-cancel">Закрыть</button>
    </div>
  `, { wide: true });

  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal-cancel').onclick = closeModal;

  document.getElementById('mm-member-list').addEventListener('change', (e) => {
    const userId = e.target.dataset.roleFor;
    if (userId) { Projects.changeMemberRole(project.id, userId, e.target.value); refreshMembersModal(project.id, onChange); }
  });
  document.getElementById('mm-member-list').addEventListener('click', (e) => {
    const userId = e.target.dataset.removeMember;
    if (!userId) return;
    confirmDialog({
      title: 'Удалить участника?',
      body: 'Пользователь потеряет доступ к проекту.',
      confirmLabel: 'Удалить',
      onConfirm: () => { Projects.removeMember(project.id, userId); refreshMembersModal(project.id, onChange); },
    });
  });

  if (canInvite) {
    document.getElementById('mm-invite-send').onclick = () => {
      const email = document.getElementById('mm-invite-email').value;
      const role = document.getElementById('mm-invite-role').value;
      const result = Invitations.create({ projectId: project.id, email, role });
      if (result) refreshMembersModal(project.id, onChange);
    };
    document.querySelectorAll('[data-revoke]').forEach(btn => {
      btn.addEventListener('click', () => { Invitations.revoke(btn.dataset.revoke); refreshMembersModal(project.id, onChange); });
    });
  }

  if (canEditProj) {
    document.getElementById('mm-access-mode').addEventListener('change', (e) => {
      Projects.setAccessMode(project.id, e.target.value);
      onChange();
    });
    document.getElementById('mm-policy-assignee').addEventListener('change', (e) => {
      Projects.setEditPolicy(project.id, { allowAssigneeEdit: e.target.checked });
    });
    document.getElementById('mm-policy-viewer-comment').addEventListener('change', (e) => {
      Projects.setEditPolicy(project.id, { viewerCanComment: e.target.checked });
    });
  }
}

function memberRowHtml(m, { canChangeRoles, canRemove }) {
  const name = `${m.user.firstName} ${m.user.lastName}`;
  return `
    <div class="member-row">
      <img class="avatar" src="${m.user.avatar}" alt="">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(name)}</div>
        <div class="text-dim" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.user.email)}</div>
      </div>
      ${(canChangeRoles && m.role !== 'Owner') ? `
        <select data-role-for="${m.userId}" class="select-sm">
          <option value="Admin" ${m.role === 'Admin' ? 'selected' : ''}>Администратор</option>
          <option value="Member" ${m.role === 'Member' ? 'selected' : ''}>Участник</option>
          <option value="Viewer" ${m.role === 'Viewer' ? 'selected' : ''}>Наблюдатель</option>
        </select>
      ` : `<span class="role-badge role-${m.role.toLowerCase()}">${Permissions.roleLabel(m.role)}</span>`}
      ${canRemove ? `<button class="icon-btn tiny" data-remove-member="${m.userId}" title="Удалить из проекта">✕</button>` : ''}
    </div>
  `;
}

function refreshMembersModal(projectId, onChange) {
  openMembersModal(Projects.get(projectId), onChange);
  onChange();
}

// ------------------------------------------------------------
// Task modal (create / edit detail view)
// ------------------------------------------------------------
export function openTaskModal({ task = null, projectId = null, defaultStatus = 'backlog' }, onChange) {
  const isEdit = !!task;
  const t = task || {
    title: '', description: '', status: defaultStatus, priority: 'medium', deadline: '',
    assigneeId: null, color: '#6C5CE7', tags: [], checklist: [], id: null,
  };
  const project = Projects.get(projectId || t.projectId);
  const user = State.currentUser;

  const canEdit = isEdit
    ? Permissions.canEditTask(user, project, t)
    : Permissions.canCreateTask(user, project);
  const canDelete = isEdit && Permissions.canDeleteTask(user, project, t);
  const canCmt = Permissions.canComment(user, project);
  const dis = canEdit ? '' : 'disabled';

  const members = project ? Projects.membersDetailed(project.id) : [];

  openModal(`
    <div class="modal-head">
      <h2>${isEdit ? 'Задача' : 'Новая задача'}${!canEdit ? ' <span class="role-badge role-viewer" style="margin-left:8px;">только просмотр</span>' : ''}</h2>
      <div style="display:flex;gap:6px;align-items:center;">
        ${isEdit ? `<button class="icon-btn tiny" id="tm-fav" title="Избранное">${t.favorite ? '★' : '☆'}</button>` : ''}
        <button class="icon-btn" id="modal-close">✕</button>
      </div>
    </div>
    <div class="modal-body">
      <div class="field">
        <label>Название</label>
        <input type="text" id="tm-title" value="${escapeHtml(t.title)}" placeholder="Что нужно сделать?" ${dis}>
        <span class="field-error" id="tm-title-err"></span>
      </div>
      <div class="field">
        <label>Описание</label>
        <textarea id="tm-desc" placeholder="Подробности задачи" ${dis}>${escapeHtml(t.description)}</textarea>
      </div>
      <div class="td-grid">
        <div class="field">
          <label>Статус</label>
          <select id="tm-status" ${dis}>${STATUSES.map(s => `<option value="${s.id}" ${s.id === t.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Приоритет</label>
          <select id="tm-priority" ${dis}>${PRIORITIES.map(p => `<option value="${p.id}" ${p.id === t.priority ? 'selected' : ''}>${p.label}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Дедлайн</label>
          <input type="datetime-local" id="tm-deadline" value="${t.deadline ? t.deadline.slice(0, 16) : ''}" min="1970-01-01T00:00" max="9999-12-31T23:59" ${dis}>
          <span class="field-error" id="tm-deadline-err"></span>
        </div>
        <div class="field">
          <label>Исполнитель</label>
          <select id="tm-assignee" ${dis}>
            <option value="">Не назначен</option>
            ${members.map(m => `<option value="${m.userId}" ${m.userId === t.assigneeId ? 'selected' : ''}>${escapeHtml(m.user.firstName + ' ' + m.user.lastName)}</option>`).join('')}
          </select>
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
          ${t.tags.map(tag => `<span class="tag-chip">${escapeHtml(tag)}${canEdit ? `<button data-tag="${escapeHtml(tag)}">✕</button>` : ''}</span>`).join('')}
        </div>
        ${canEdit ? `
        <div class="checklist-add">
          <input type="text" id="tm-tag-input" placeholder="Добавить тег и нажать Enter" list="tm-tag-suggestions">
          <datalist id="tm-tag-suggestions">${State.tags.map(tag => `<option value="${escapeHtml(tag)}">`).join('')}</datalist>
          <button class="btn btn-secondary btn-sm" id="tm-tag-add">Добавить</button>
        </div>` : ''}
      </div>

      ${isEdit ? `
      <div class="td-section">
        <h3>Чек-лист (${Tasks.checklistProgress(t)}%)</h3>
        <div class="progress-track"><div class="progress-fill" style="width:${Tasks.checklistProgress(t)}%"></div></div>
        <div id="tm-checklist">
          ${t.checklist.map(c => `
            <div class="checklist-item ${c.done ? 'done' : ''}">
              <input type="checkbox" data-chk="${c.id}" ${c.done ? 'checked' : ''} ${dis}>
              <input type="text" value="${escapeHtml(c.text)}" disabled>
              ${canEdit ? `<button class="icon-btn tiny" data-chk-del="${c.id}">✕</button>` : ''}
            </div>
          `).join('') || '<p class="text-dim" style="font-size:13px;">Пунктов пока нет</p>'}
        </div>
        ${canEdit ? `
        <div class="checklist-add">
          <input type="text" id="tm-chk-input" placeholder="Новый пункт чек-листа">
          <button class="btn btn-secondary btn-sm" id="tm-chk-add">Добавить</button>
        </div>` : ''}
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
        ${canCmt ? `
        <div class="comment-add">
          <textarea id="tm-comment-input" placeholder="Написать комментарий..."></textarea>
          <button class="btn btn-secondary btn-sm" id="tm-comment-add">Отправить</button>
        </div>` : ''}
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
      ${canDelete ? `<button class="btn btn-danger" id="tm-delete" style="margin-right:auto">Удалить</button>` : ''}
      <button class="btn btn-secondary" id="modal-cancel">${canEdit ? 'Отмена' : 'Закрыть'}</button>
      ${canEdit ? `<button class="btn btn-primary" id="tm-save">${isEdit ? 'Сохранить' : 'Создать задачу'}</button>` : ''}
    </div>
  `, { wide: true });

  let selColor = t.color;
  let workingTags = [...t.tags];

  if (canEdit) {
    document.getElementById('tm-colors').addEventListener('click', (e) => {
      const sw = e.target.closest('.swatch'); if (!sw) return;
      selColor = sw.dataset.color;
      document.querySelectorAll('#tm-colors .swatch').forEach(s => s.classList.toggle('active', s === sw));
    });

    // Некоторые браузеры позволяют ввести в год datetime-local больше
    // 4 цифр (известный баг нативного контрола), из-за чего получается
    // абсурдная дата вроде "202506". Отслеживаем последнее корректное
    // значение и откатываемся к нему, если год стал длиннее 4 цифр.
    const deadlineInput = document.getElementById('tm-deadline');
    let lastValidDeadline = deadlineInput.value;
    const guardDeadlineYear = () => {
      const val = deadlineInput.value;
      const errEl = document.getElementById('tm-deadline-err');
      if (val && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val)) {
        deadlineInput.value = lastValidDeadline;
        if (errEl) errEl.textContent = 'Год должен состоять ровно из 4 цифр';
        return;
      }
      if (errEl) errEl.textContent = '';
      lastValidDeadline = val;
    };
    deadlineInput.addEventListener('input', guardDeadlineYear);
    deadlineInput.addEventListener('change', guardDeadlineYear);
  }

  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal-cancel').onclick = closeModal;

  if (isEdit) {
    document.getElementById('tm-fav').onclick = (e) => {
      Tasks.toggleFavorite(t.id);
      e.target.textContent = Tasks.get(t.id).favorite ? '★' : '☆';
      onChange();
    };
    if (canDelete) {
      document.getElementById('tm-delete').onclick = () => {
        confirmDialog({
          title: 'Удалить задачу?',
          body: `Задача «${t.title}» будет удалена безвозвратно.`,
          confirmLabel: 'Удалить',
          onConfirm: () => { Tasks.remove(t.id); closeModal(); onChange(); },
        });
      };
    }

    if (canEdit) {
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
    }

    if (canCmt) {
      document.getElementById('tm-comment-add').onclick = () => {
        const input = document.getElementById('tm-comment-input');
        if (input.value.trim()) { Tasks.addComment(t.id, input.value); refreshTaskModal(t.id, onChange); }
      };
    }
  }

  if (canEdit) {
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
      let deadline = document.getElementById('tm-deadline').value || null;
      if (deadline && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(deadline)) deadline = null;
      const payload = {
        title,
        description: document.getElementById('tm-desc').value,
        status: document.getElementById('tm-status').value,
        priority: document.getElementById('tm-priority').value,
        deadline,
        assigneeId: document.getElementById('tm-assignee').value || null,
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
                ${t.assigneeId ? `<span>👤 ${escapeHtml(Users.fullName(t.assigneeId))}</span>` : ''}
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
