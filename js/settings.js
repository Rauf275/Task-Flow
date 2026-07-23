// ============================================================
// settings.js — экспорт/импорт данных, язык интерфейса.
// ============================================================
import { State } from './state.js';
import { Storage } from './storage.js';
import { downloadFile, readFileAsText } from './utils.js';
import { toast } from './notifications.js';

export const Settings = {
  exportJson() {
    const data = Storage.exportAll();
    downloadFile(`taskflow-export-${Date.now()}.json`, JSON.stringify(data, null, 2));
    toast('Данные экспортированы', 'success');
  },

  async importJson(file) {
    try {
      const text = await readFileAsText(file);
      const data = JSON.parse(text);
      Storage.importAll(data);
      State.loadAll();
      toast('Данные успешно импортированы', 'success');
      return true;
    } catch (e) {
      console.error(e);
      toast('Не удалось импортировать файл', 'error');
      return false;
    }
  },

  setLanguage(lang) {
    State.settings.language = lang;
    State.persistSettings();
    toast(lang === 'ru' ? 'Язык интерфейса: Русский' : 'Interface language: English', 'success');
  },
};
