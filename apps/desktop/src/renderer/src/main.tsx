import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { initI18n, localeFrom } from './i18n';
import { applyLook } from './viewer/look';
import './styles.css';

initI18n(localeFrom(navigator.language));
applyLook();

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
