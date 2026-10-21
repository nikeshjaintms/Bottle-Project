/**
 * derivePlainBottleName.js
 *
 * Extracts base mold (plain bottle) name from a given bottle name string.
 *
 * Rule:
 * Strips a trailing -(...) or (...) or - ... suffix ONLY when its contents
 * consist strictly of shade/finish/foil/organic color tokens.
 *
 * If the suffix contains any proper noun (e.g. CUBA, DALLAS, MONK, BIG BOY, KHOLS,
 * or numeric mold codes like 1189, 802, etc.), it is part of the mold's identity
 * and is preserved unchanged.
 */

const bottleMapping = require('../scripts/bottlePerBox.mapping');
let plainMapping = null;
try {
  plainMapping = require('../scripts/plainBottleNameMapping');
} catch (e) {
  plainMapping = null;
}

const SHADE_TOKENS = new Set([
  'ORG', 'ORGANIC', 'FOIL', 'GOLD', 'SILVER', 'BLACK', 'WHITE',
  'PINK', 'MATT', 'BLUE', 'GREY', 'RED', 'GREEN', 'CHROME',
  'ROSE', 'PASS', 'THREE', 'P', 'ONLY', 'COATING', 'PLAIN'
]);

const DELIMITERS = /[\s\+\/\-]+/;

function canonicalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  const trimmed = name.trim().replace(/\s+/g, ' ');

  // 1. First look up in bottlePerBox.mapping.js (read-only reference)
  if (bottleMapping && bottleMapping[trimmed] && bottleMapping[trimmed] !== trimmed) {
    return bottleMapping[trimmed].trim().replace(/\s+/g, ' ');
  }

  // 2. Also look up in plainBottleNameMapping.js (canonical reference for typo/spacing fixes e.g. "100 MLHPPL 200" -> "100 ML HPPL 200")
  if (plainMapping && plainMapping[trimmed] && plainMapping[trimmed] !== trimmed) {
    return plainMapping[trimmed].trim().replace(/\s+/g, ' ');
  }

  if (bottleMapping && bottleMapping[trimmed]) {
    return bottleMapping[trimmed].trim().replace(/\s+/g, ' ');
  }

  return trimmed;
}

function derivePlainBottleName(bottleName) {
  if (!bottleName || typeof bottleName !== 'string') {
    return {
      plainBottleName: bottleName || '',
      isStripped: false,
      reason: 'Empty or invalid bottleName',
      isAmbiguous: false
    };
  }

  // Pre-correction: lookup in mapping dictionary first
  const canonicalStarting = canonicalizeName(bottleName);
  const trimmed = canonicalStarting.trim().replace(/\s+/g, ' ');

  // 1. Matches trailing parentheticals: - ( ... ) or ( ... )
  // e.g. "20 ML SAAB-(BLACK ORG)", "100 ML TPP BRD (ONLY COATING)", "BS-350 (CUBA JAR)"
  const parenMatch = trimmed.match(/^(.*?)(?:\s*-\s*|\s+)\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const baseCandidate = canonicalizeName(parenMatch[1].trim());
    const inside = parenMatch[2].trim();
    return evaluateTokens(trimmed, baseCandidate, inside);
  }

  // 2. Matches trailing dash suffix without parens: - ...
  // e.g. "8 ML SQ ROLL ON - GOLD FOIL", "8 ML SQ ROLL ON -GOLD ORG", "100ML TPP BRD - WHITE ORG"
  const dashMatch = trimmed.match(/^(.*?)\s*-\s*([A-Za-z0-9\+\/\s]+)$/);
  if (dashMatch) {
    const baseCandidate = canonicalizeName(dashMatch[1].trim());
    const suffix = dashMatch[2].trim();
    return evaluateTokens(trimmed, baseCandidate, suffix);
  }

  // No suffix pattern matched: mold name is itself (canonicalized)
  return {
    plainBottleName: trimmed,
    isStripped: trimmed !== bottleName.trim().replace(/\s+/g, ' '),
    reason: 'No suffix pattern matched',
    tokens: [],
    isAmbiguous: false
  };
}

function evaluateTokens(rawName, baseCandidate, suffixContent) {
  const rawTokens = suffixContent
    .split(DELIMITERS)
    .map(t => t.trim().toUpperCase())
    .filter(Boolean);

  if (rawTokens.length === 0) {
    return {
      plainBottleName: rawName,
      isStripped: false,
      reason: 'Empty suffix',
      isAmbiguous: false
    };
  }

  const unknownTokens = rawTokens.filter(t => !SHADE_TOKENS.has(t));

  if (unknownTokens.length === 0) {
    // Pure shade/finish tokens: strip suffix to get base mold
    return {
      plainBottleName: baseCandidate,
      isStripped: true,
      suffix: suffixContent,
      tokens: rawTokens,
      isAmbiguous: false
    };
  } else {
    // Contains non-shade words (e.g. CUBA, DALLAS, MONK, BIG BOY, KHOLS, 1189)
    // Keep full name unchanged as the base mold
    return {
      plainBottleName: rawName,
      isStripped: false,
      reason: `Non-shade tokens detected: ${unknownTokens.join(', ')}`,
      suffix: suffixContent,
      unknownTokens,
      isAmbiguous: false
    };
  }
}

module.exports = {
  derivePlainBottleName,
  SHADE_TOKENS
};
