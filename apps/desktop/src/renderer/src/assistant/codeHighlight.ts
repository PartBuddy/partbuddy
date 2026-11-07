import { createHighlighterCore, type HighlighterCore, type LanguageInput } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import type { CodeHighlighterPlugin, HighlightResult } from 'streamdown';

/**
 * The languages an answer about printed parts plausibly holds (chat polish); anything else shows
 * as plain text. Shiki's full bundle would ship every grammar (+25 MB on disk) for nothing.
 */
const LANGUAGES: Record<string, () => LanguageInput> = {
  python: () => import('@shikijs/langs/python'),
  javascript: () => import('@shikijs/langs/javascript'),
  typescript: () => import('@shikijs/langs/typescript'),
  json: () => import('@shikijs/langs/json'),
  yaml: () => import('@shikijs/langs/yaml'),
  shellscript: () => import('@shikijs/langs/shellscript'),
  powershell: () => import('@shikijs/langs/powershell'),
  openscad: () => import('@shikijs/langs/openscad'),
  csv: () => import('@shikijs/langs/csv'),
  markdown: () => import('@shikijs/langs/markdown'),
};
const ALIASES: Record<string, string> = {
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  sh: 'shellscript',
  bash: 'shellscript',
  shell: 'shellscript',
  zsh: 'shellscript',
  ps1: 'powershell',
  pwsh: 'powershell',
  yml: 'yaml',
  scad: 'openscad',
  md: 'markdown',
};
// The "default" GitHub themes: their comments and constants keep 4.5:1 on the code surface (axe).
const THEMES = ['github-light-default', 'github-dark-default'] as const;
/** Finished blocks kept highlighted; old ones go first. */
const CACHE_SIZE = 200;

/** Shiki's name for a fence's language, or null when PartBuddy brings no grammar for it. */
export function languageOf(fence: string): string | null {
  const id = fence.trim().toLowerCase();
  const name = ALIASES[id] ?? id;
  return name in LANGUAGES ? name : null;
}

let highlighter: Promise<HighlighterCore> | null = null;
const loading = new Map<string, Promise<void>>();
const cache = new Map<string, HighlightResult>();

async function ready(language: string): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [import('@shikijs/themes/github-light-default'), import('@shikijs/themes/github-dark-default')],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  const core = await highlighter;
  const grammar = LANGUAGES[language];
  if (grammar && !loading.has(language)) loading.set(language, core.loadLanguage(grammar()));
  await loading.get(language);
  return core;
}

/** Streamdown's code highlighter on Shiki's core with only the languages above. */
export const codeHighlighter: CodeHighlighterPlugin = {
  name: 'shiki',
  type: 'code-highlighter',
  getSupportedLanguages: () => Object.keys(LANGUAGES),
  getThemes: () => [...THEMES],
  supportsLanguage: (language) => languageOf(language) !== null,
  highlight({ code, language, isIncomplete }, callback) {
    const lang = languageOf(language) ?? 'text';
    const key = `${lang}\n${code}`;
    const hit = cache.get(key);
    if (hit) return hit;
    ready(lang).then(
      (core) => {
        const result = core.codeToTokens(code, { lang, themes: { light: THEMES[0], dark: THEMES[1] } });
        // A block still streaming is replaced by its next state; only finished ones are kept.
        if (!isIncomplete) {
          cache.set(key, result);
          if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value ?? key);
        }
        callback?.(result);
      },
      (error: unknown) => {
        console.warn('PartBuddy: highlighting a code block failed', error);
      },
    );
    return null;
  },
};
