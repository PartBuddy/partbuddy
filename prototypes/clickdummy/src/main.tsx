import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { initI18n } from './i18n';
import { useStudio, type Locale, type Theme } from './state/store';
import './styles.css';

const params = new URLSearchParams(window.location.search);
const theme: Theme =
  params.get('theme') === 'dark' || (params.get('theme') !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
    ? 'dark'
    : 'light';
const locale: Locale = params.get('lang') === 'de' ? 'de' : 'en';

useStudio.setState({ theme, locale });
initI18n(locale);

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
