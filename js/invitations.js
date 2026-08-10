// ============================================================
// invitations.js — приглашения в проект по email.
//
// Сущность приглашения соответствует ТЗ:
//   { projectId, email, role, status }
// Пока backend не подключен, реальная отправка письма невозможна,
// поэтому здесь она симулируется двумя способами:
//   1) если пользователь с таким email уже зарегистрирован —
//      он добавляется в проект немедленно;
//   2) иначе создаётся запись со статусом "pending", которая
//      автоматически применяется, когда пользователь с этим email
//      зарегистрируется или войдёт в систему (см. acceptPendingFor).
// После подключения backend шаг (2) заменяется реальной отправкой
// письма — структура данных и интерфейс не меняются.
// ============================================================
import { State } from './state.js';
import { uid, nowIso } from './utils.js';
import { toast } from './notifications.js';
import { Projects } from './projects.js';
import { t } from './i18n.js';

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const Invitations = {
  create({ projectId, email, role }) {
    const project = Projects.get(projectId);
    if (!project) return null;
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      toast(t('invite.err.invalidEmail'), 'error');
      return null;
    }

    const existingUser = State.users.find(u => u.email.toLowerCase() === normalizedEmail);
    if (existingUser) {
      if (project.members.some(m => m.userId === existingUser.id)) {
        toast(t('invite.err.alreadyMember'), 'error');
        return null;
      }
      Projects.addMember(projectId, existingUser.id, role);
      toast(t('invite.addedImmediate', { name: `${existingUser.firstName} ${existingUser.lastName}` }), 'success');
      return { immediate: true, user: existingUser };
    }

    const already = State.invitations.find(
      i => i.projectId === projectId && i.email === normalizedEmail && i.status === 'pending'
    );
    if (already) {
      toast(t('invite.err.alreadyPending'), 'error');
      return null;
    }

    const invite = {
      id: uid('inv'),
      projectId,
      email: normalizedEmail,
      role,
      status: 'pending',
      invitedBy: State.currentUser.id,
      createdAt: nowIso(),
    };
    State.invitations.push(invite);
    State.persistInvitations();
    toast(t('invite.sentPending', { email: normalizedEmail }), 'success');
    return invite;
  },

  pendingForProject(projectId) {
    return State.invitations.filter(i => i.projectId === projectId && i.status === 'pending');
  },

  revoke(id) {
    const invite = State.invitations.find(i => i.id === id);
    if (!invite) return;
    invite.status = 'revoked';
    State.persistInvitations();
    toast(t('invite.revoked'), 'success');
  },

  // Вызывается сразу после входа/регистрации пользователя: принимает
  // все ожидающие приглашения, адресованные его email, и добавляет
  // его в соответствующие проекты. Возвращает число принятых приглашений.
  acceptPendingFor(user) {
    const email = user.email.toLowerCase();
    const mine = State.invitations.filter(i => i.status === 'pending' && i.email === email);
    if (!mine.length) return 0;
    mine.forEach(invite => {
      Projects.addMember(invite.projectId, user.id, invite.role);
      invite.status = 'accepted';
    });
    State.persistInvitations();
    return mine.length;
  },
};
