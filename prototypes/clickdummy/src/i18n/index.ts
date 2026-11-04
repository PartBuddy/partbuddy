import i18next from 'i18next';
import ICU from 'i18next-icu';
import { initReactI18next } from 'react-i18next';

import de from './de.json';
import en from './en.json';

/** UI strings with ICU MessageFormat (plurals, numbers); English is the fallback. */
export function initI18n(language: 'en' | 'de') {
  void i18next
    .use(ICU)
    .use(initReactI18next)
    .init({
      resources: { en: { translation: en }, de: { translation: de } },
      lng: language,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      returnNull: false,
    });
}
