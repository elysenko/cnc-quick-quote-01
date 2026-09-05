/**
 * Namespaced browser storage.
 *
 * Mockups are served many-per-origin under /<mockup_id>/ and web storage is
 * origin-scoped (not path-scoped), so unprefixed keys collide across mockups.
 * Every read/write in the app goes through these helpers, which prefix each key
 * with the first URL path segment using a colon separator.
 */
const NS = (typeof location !== 'undefined' && location.pathname.split('/')[1]) || 'app';

export const nsKey = (key: string): string => `${NS}:${key}`;

export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(nsKey(key));
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(nsKey(key), value);
  } catch {
    /* storage unavailable (private mode / quota) — the UI must still work */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(nsKey(key));
  } catch {
    /* no-op */
  }
}

/** Reads JSON defensively: anything unparseable or failing `validate` is cleared. */
export function readJson<T>(key: string, validate: (value: unknown) => value is T): T | null {
  const raw = readRaw(key);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (validate(parsed)) return parsed;
  } catch {
    /* fall through to clear */
  }
  removeKey(key);
  return null;
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeRaw(key, JSON.stringify(value));
  } catch {
    /* no-op */
  }
}
