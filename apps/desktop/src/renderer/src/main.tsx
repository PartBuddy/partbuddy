import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { initI18n, localeFrom } from './i18n';
import './styles.css';

initI18n(localeFrom(navigator.language));

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

// `?gallery` shows every control in every state for the UI screenshots (e2e/ui-gallery.spec.ts).
if (new URLSearchParams(location.search).has('gallery')) {
  void import('./ui/Gallery').then(({ Gallery }) => {
    createRoot(root).render(
      <StrictMode>
        <Gallery />
      </StrictMode>,
    );
  });
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
