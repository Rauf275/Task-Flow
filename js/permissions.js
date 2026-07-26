// ============================================================
// permissions.js — централизованная проверка прав доступа.
//
// Все места приложения, которые решают "можно ли пользователю
// сделать X", обязаны вызывать функции отсюда, а не сравнивать
// роли напрямую. Это единственный файл, матрицу прав в котором
// нужно будет продублировать на backend при подключении сервера —
// остальной код от конкретных правил ничего не знает.
//
// Роли проекта (по возрастанию прав): Viewer < Member < Admin < Owner.
// ============================================================

export const ROLES = ['Viewer', 'Member', 'Admin', 'Owner'];

function memberEntry(project, userId) {
  if (!project || !userId) return null;
  if (project.ownerId === userId) return { userId, role: 'Owner' };
  return (project.members || []).find(m => m.userId === userId) || null;
}

// Роль пользователя в проекте, либо null, если он не участник.
export function roleOf(user, project) {
  if (!user || !project) return null;
  const m = memberEntry(project, user.id);
  return m ? m.role : null;
}

export function isMember(user, project) {
  return !!roleOf(user, project);
}

// Видимость проекта: участники видят всегда; в режиме "Read Only"
// проект доступен для просмотра по ссылке кому угодно.
export function canViewProject(user, project) {
  if (!project) return false;
  if (isMember(user, project)) return true;
  return project.accessMode === 'readonly';
}

// Режим "Read Only" публикует проект для чтения — в этом режиме
// изменения запрещены абсолютно всем, включая владельца, пока
// проект не переведён обратно в Private/Collaborative.
function editingLocked(project) {
  return !!project && project.accessMode === 'readonly';
}

export function canEditProject(user, project) {
  return roleOf(user, project) === 'Owner';
}

export function canDeleteProject(user, project) {
  return roleOf(user, project) === 'Owner';
}

export function canInviteUsers(user, project) {
  const role = roleOf(user, project);
  return role === 'Owner' || role === 'Admin';
}

export function canChangeRoles(user, project) {
  return roleOf(user, project) === 'Owner';
}

export function canRemoveMember(user, project, targetUserId) {
  if (!project || targetUserId === project.ownerId) return false;
  return roleOf(user, project) === 'Owner';
}

export function canCreateTask(user, project) {
  if (editingLocked(project)) return false;
  const role = roleOf(user, project);
  return role === 'Owner' || role === 'Admin' || role === 'Member';
}

export function canEditTask(user, project, task) {
  if (editingLocked(project) || !task) return false;
  const role = roleOf(user, project);
  if (role === 'Owner' || role === 'Admin') return true;
  if (role === 'Member') {
    if (task.creatorId === user.id) return true;
    if (project.memberEditPolicy?.allowAssigneeEdit && task.assigneeId === user.id) return true;
  }
  return false;
}

// Перемещение карточки между колонками — частный случай изменения задачи.
export const canMoveTask = canEditTask;

export function canDeleteTask(user, project, task) {
  if (editingLocked(project) || !task) return false;
  const role = roleOf(user, project);
  if (role === 'Owner' || role === 'Admin') return true;
  if (role === 'Member') return task.creatorId === user.id;
  return false;
}

export function canComment(user, project) {
  if (editingLocked(project)) return false;
  const role = roleOf(user, project);
  if (role === 'Owner' || role === 'Admin' || role === 'Member') return true;
  if (role === 'Viewer') return !!project.memberEditPolicy?.viewerCanComment;
  return false;
}

export function roleLabel(role) {
  const labels = { Owner: 'Владелец', Admin: 'Администратор', Member: 'Участник', Viewer: 'Наблюдатель' };
  return labels[role] || role;
}
