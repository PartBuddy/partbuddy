import i18next from 'i18next';
import ICU from 'i18next-icu';
import { initReactI18next } from 'react-i18next';

import { stepMessages } from '../../../shared/stepPhrases';
import de from './de.json';
import en from './en.json';

export type Locale = 'en' | 'de';

/** German for German system locales, English otherwise and as the fallback. */
export function localeFrom(language: string): Locale {
  return language.toLowerCase().startsWith('de') ? 'de' : 'en';
}

/** UI strings with ICU MessageFormat (plurals, numbers). */
export function initI18n(language: Locale) {
  void i18next
    .use(ICU)
    .use(initReactI18next)
    .init({
      // Work-log phrases (M2a) live in shared/, where the main process writes them for the model too.
      resources: { en: { translation: { ...en, steps: stepMessages.en } }, de: { translation: { ...de, steps: stepMessages.de } } },
      lng: language,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  document.documentElement.lang = language;
}
