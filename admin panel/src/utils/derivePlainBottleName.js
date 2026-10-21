/**
 * Client-side utility for deriving Plain Bottle Name from Bottle Name string.
 * Keeps same behavior as Backend/src/utils/derivePlainBottleName.js.
 */

const SHADE_TOKENS = new Set([
  'ORG', 'ORGANIC', 'FOIL', 'GOLD', 'SILVER', 'BLACK', 'WHITE',
  'PINK', 'MATT', 'BLUE', 'GREY', 'RED', 'GREEN', 'CHROME',
  'ROSE', 'PASS', 'THREE', 'P', 'ONLY', 'COATING', 'PLAIN'
]);

const DELIMITERS = /[\s\+\/\-]+/;

export function derivePlainBottleName(bottleName) {
  if (!bottleName || typeof bottleName !== 'string') return '';

  const trimmed = bottleName.trim().replace(/\s+/g, ' ');

  // 1. Parentheticals: -(...) or (...)
  const parenMatch = trimmed.match(/^(.*?)(?:\s*-\s*|\s+)\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const baseCandidate = parenMatch[1].trim();
    const inside = parenMatch[2].trim();
    const rawTokens = inside.split(DELIMITERS).map(t => t.trim().toUpperCase()).filter(Boolean);
    const nonShade = rawTokens.filter(t => !SHADE_TOKENS.has(t));
    if (nonShade.length === 0 && rawTokens.length > 0) {
      return baseCandidate;
    }
    return trimmed;
  }

  // 2. Dash suffix: - ...
  const dashMatch = trimmed.match(/^(.*?)\s*-\s*([A-Za-z0-9\+\/\s]+)$/);
  if (dashMatch) {
    const baseCandidate = dashMatch[1].trim();
    const suffix = dashMatch[2].trim();
    const rawTokens = suffix.split(DELIMITERS).map(t => t.trim().toUpperCase()).filter(Boolean);
    const nonShade = rawTokens.filter(t => !SHADE_TOKENS.has(t));
    if (nonShade.length === 0 && rawTokens.length > 0) {
      return baseCandidate;
    }
    return trimmed;
  }

  return trimmed;
}
