/**
 * Text helpers shared by the assistant parser and the UI filters.
 */

/**
 * Removes combining diacritics so "café" and "cafe" match the same keyword.
 * The range is written with explicit escapes because a literal class of
 * combining marks is invisible and easy to corrupt in an editor.
 */
export function deaccent(value: string): string {
  return value.normalize('NFD').replace(/\p{Mn}/gu, '');
}

export function normalizeText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Lowercase, accent-free, single-spaced — the form keyword tables expect. */
export function searchKey(input: string): string {
  return deaccent(normalizeText(input));
}
