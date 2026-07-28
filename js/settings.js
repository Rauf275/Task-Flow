// ============================================================
// settings.js — экспорт/импорт данных, язык интерфейса.
// ============================================================
import { State } from './state.js';
import { Storage } from './storage.js';
import { downloadFile, readFileAsText } from './utils.js';
import { toast } from './notifications.js';
import { t } from './i18n.js';

export const Settings = {
  exportJson() {
    const data = Storage.exportAll();
    downloadFile(`taskflow-export-${Date.now()}.json`, JSON.stringify(data, null, 2));
    toast(t('settings.dataExported'), 'success');
  },

  async importJson(file) {
    try {
      const text = await readFileAsText(file);
      const data = JSON.parse(text);
      Storage.importAll(data);
      State.loadAll();
      toast(t('settings.dataImported'), 'success');
      return true;
    } catch (e) {
      console.error(e);
      toast(t('settings.importFailed'), 'error');
      return false;
    }
  },

  setLanguage(lang) {
    State.settings.language = lang;
    State.persistSettings();
    toast(lang === 'ru' ? t('settings.langSetRu') : t('settings.langSetEn'), 'success');
  },
};
