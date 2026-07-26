// ============================================================
// auth.js — регистрация, вход, выход, редактирование профиля.
// Пароли в этом демо (без backend) хранятся простым хэшем,
// чтобы не держать их в открытом виде в Local Storage. При
// подключении реального backend это заменяется на серверную
// аутентификацию без изменения остального кода приложения.
// ============================================================
import { State } from './state.js';
import { Storage } from './storage.js';
import { uid, nowIso, avatarDataUrl, initials } from './utils.js';

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `h${hash}`;
}

const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'mail.ru'];

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isAllowedDomain(email) {
  const domain = (email.split('@')[1] || '').toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

export const Auth = {
  errors: {},

  validateRegister({ first, last, email, password, password2 }) {
    const errors = {};
    if (!first || !first.trim()) errors['reg-first'] = 'Введите имя';
    if (!last || !last.trim()) errors['reg-last'] = 'Введите фамилию';
    if (!email || !isValidEmail(email)) errors['reg-email'] = 'Введите корректный email';
    else if (!isAllowedDomain(email)) {
      errors['reg-email'] = 'Регистрация доступна только с почтой @gmail.com или @mail.ru';
    } else if (State.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      errors['reg-email'] = 'Пользователь с таким email уже существует';
    }
    if (!password || password.length < 6) errors['reg-password'] = 'Минимум 6 символов';
    if (password !== password2) errors['reg-password2'] = 'Пароли не совпадают';
    return errors;
  },

  validateLogin({ email, password }) {
    const errors = {};
    if (!email || !isValidEmail(email)) errors['login-email'] = 'Введите корректный email';
    if (!password) errors['login-password'] = 'Введите пароль';
    return errors;
  },

  register({ first, last, email, password }) {
    const user = {
      id: uid('user'),
      firstName: first.trim(),
      lastName: last.trim(),
      email: email.trim(),
      passwordHash: simpleHash(password),
      role: '',
      bio: '',
      avatar: avatarDataUrl(email.trim(), initials(first, last)),
      createdAt: nowIso(),
    };
    State.users.push(user);
    State.persistUsers();
    this.login({ email: user.email, password }, true);
    return user;
  },

  login({ email, password }, _skipValidation) {
    const user = State.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return { ok: false, error: 'Пользователь не найден' };
    if (user.passwordHash !== simpleHash(password)) return { ok: false, error: 'Неверный пароль' };
    State.currentUser = user;
    Storage.setSession(user.id);
    return { ok: true, user };
  },

  logout() {
    State.currentUser = null;
    Storage.clearSession();
  },

  updateProfile(patch) {
    if (!State.currentUser) return;
    Object.assign(State.currentUser, patch);
    const idx = State.users.findIndex(u => u.id === State.currentUser.id);
    if (idx !== -1) State.users[idx] = State.currentUser;
    State.persistUsers();
  },
};
