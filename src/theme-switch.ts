// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.ThemeSwitch` (browser global consumed by index.html).
// Themes and the header quick button that switches between two of them
// (by default indoor "Original" and outdoor "Sol").

type ThemeSwitchName = 'dark' | 'light' | 'contrast' | 'ocean' | 'sol';

(function exposeThemeSwitch(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.ThemeSwitch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createThemeSwitchModule() {
  // Keep in sync with the inline bootstrap in index.html <head> (a test checks it).
  const THEMES: ThemeSwitchName[] = ['dark', 'light', 'contrast', 'ocean', 'sol'];
  const DEFAULT_PAIR: [ThemeSwitchName, ThemeSwitchName] = ['dark', 'sol'];
  const PAIR_KEY = 'themeQuickPair';
  const LABELS: Record<ThemeSwitchName, string> = { dark: 'Original', light: 'Claro', contrast: 'Alto contraste', ocean: 'Océano', sol: 'Sol' };
  const BACKGROUNDS: Record<ThemeSwitchName, string> = { dark: '#0a0e27', light: '#f3f4f6', contrast: '#000000', ocean: '#0f172a', sol: '#ffffff' };
  const LIGHT_THEMES: ThemeSwitchName[] = ['light', 'sol'];

  function isTheme(value: unknown): value is ThemeSwitchName {
    return typeof value === 'string' && (THEMES as string[]).includes(value);
  }

  function normalizeTheme(value: unknown): ThemeSwitchName {
    return isTheme(value) ? value : 'dark';
  }

  function parsePair(raw: string | null): [ThemeSwitchName, ThemeSwitchName] {
    try {
      const pair = JSON.parse(raw || 'null');
      if (Array.isArray(pair) && pair.length === 2 && isTheme(pair[0]) && isTheme(pair[1]) && pair[0] !== pair[1]) return [pair[0], pair[1]];
    } catch { /* fall through to the default */ }
    return [DEFAULT_PAIR[0], DEFAULT_PAIR[1]];
  }

  function nextTheme(current: unknown, pair: [ThemeSwitchName, ThemeSwitchName]): ThemeSwitchName {
    return current === pair[0] ? pair[1] : pair[0];
  }

  // The button shows where it takes you.
  function iconFor(target: ThemeSwitchName): 'sun' | 'moon' {
    return LIGHT_THEMES.includes(target) ? 'sun' : 'moon';
  }

  const label = (theme: ThemeSwitchName) => LABELS[normalizeTheme(theme)];
  const statusBarColor = (theme: ThemeSwitchName) => BACKGROUNDS[normalizeTheme(theme)];

  return { THEMES, DEFAULT_PAIR, PAIR_KEY, normalizeTheme, parsePair, nextTheme, iconFor, label, statusBarColor };
});
