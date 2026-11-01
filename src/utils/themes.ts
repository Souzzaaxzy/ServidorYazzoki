// ── Theme catalog ids ────────────────────────────────────────
// The single source of truth the SERVER accepts. It mirrors the app's
// `yazzokiThemes` catalog: the server never stores a colour, only this slug.
// An unknown id is rejected (the app would have no palette to render it).
export const THEME_IDS = [
  'washi',
  'sumi',
  'sakura',
  'matcha',
  'hinoki',
  'kogane',
  'ai',
  'yuki',
  'tsuki',
  'fuji',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

/** Whether [id] is a selectable theme. `''`/null mean "no profile theme". */
export function isValidThemeId(id: string | null | undefined): boolean {
  if (id === null || id === undefined || id === '') return true;
  return (THEME_IDS as readonly string[]).includes(id);
}
