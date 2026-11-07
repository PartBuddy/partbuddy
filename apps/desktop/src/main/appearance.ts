import type { Theme } from '../shared/contract';
import type { SettingsStore } from './settingsStore';

/** The colour theme the user chose (UI upgrade, 2026-11-04): follow Windows, light or dark. */
export class AppearanceSettings {
  constructor(private readonly store: SettingsStore) {}

  theme(): Theme {
    return this.store.get('theme');
  }

  setTheme(theme: Theme): void {
    this.store.set('theme', theme);
  }
}
