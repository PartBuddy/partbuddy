import { StrictMode } from 'react';
import i18n from 'i18next';
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
  createRoot(root, {
    // React drops the whole interface on an uncaught error; the stack goes to the log (main reads
    // console errors) and the window says so instead of turning white.
    onUncaughtError: (error) => {
      console.error(`interface crashed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      const message = document.createElement('p');
      message.textContent = i18n.t('app.crashed.text');
      const reload = document.createElement('button');
      reload.textContent = i18n.t('app.crashed.reload');
      reload.className = 'rounded-md border border-border px-3 py-1';
      reload.onclick = () => {
        location.reload();
      };
      root.className = 'flex h-full flex-col items-center justify-center gap-3 bg-surface p-6 text-md text-text';
      root.replaceChildren(message, reload);
    },
  }).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
