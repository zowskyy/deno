// Scoped custom CSS for profile pages. Rejects unsafe constructs per the
// Personal Webspaces safety policy — CSS alone is not a complete security
// boundary, but these rules close the obvious escape hatches.

const BLOCKED_PATTERNS: RegExp[] = [
  /@import\b/i,
  /@font-face\b/i,
  /@namespace\b/i,
  /javascript:/i,
  /expression\s*\(/i,
  /-moz-binding/i,
  /behavior\s*:/i,
  /url\s*\(\s*["']?\s*javascript:/i,
  /url\s*\(\s*["']?\s*data:/i,
  /<\s*\/?\s*style/i,
];

const BLOCKED_SELECTORS = /\b(html|body|:root|iframe|dialog|script|\.top-bar|\.studio-|#studio)\b/i;

const MAX_CSS_LENGTH = 8000;
const MAX_RULE_COUNT = 80;

/** Remove block comments from CSS source text, preserving content inside quoted strings. */
function stripCssComments(css: string): string {
  let out = "";
  let i = 0;
  let inSingle = false;
  let inDouble = false;

  while (i < css.length) {
    const ch = css[i]!;
    const next = css[i + 1];

    if (!inSingle && !inDouble && ch === "/" && next === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }

    if (!inDouble && ch === "'" && !inSingle) {
      inSingle = true;
      out += ch;
      i++;
      continue;
    }
    if (inSingle) {
      out += ch;
      if (ch === "\\" && i + 1 < css.length) {
        out += css[i + 1];
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i++;
      continue;
    }

    if (!inSingle && ch === '"' && !inDouble) {
      inDouble = true;
      out += ch;
      i++;
      continue;
    }
    if (inDouble) {
      out += ch;
      if (ch === "\\" && i + 1 < css.length) {
        out += css[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') inDouble = false;
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/** Map a decoded CSS code point to a safe Unicode scalar, or U+FFFD when invalid. */
function safeCssCodePoint(hex: string): string {
  const value = parseInt(hex, 16);
  if (!Number.isFinite(value) || value === 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    return "\uFFFD";
  }
  return String.fromCodePoint(value);
}

/** Decode CSS escape sequences so obfuscated tokens match their literal forms. */
function decodeCssEscapes(css: string): string {
  return css
    .replace(/\\([0-9a-fA-F]{1,6})(?:\r\n|[\t\n\f\r ])?/g, (_, hex: string) => safeCssCodePoint(hex))
    .replace(/\\(?:\r\n|[\t\n\f\r ])?/g, "")
    .replace(/\\(.)/g, "$1");
}

/** Normalize CSS text before safety checks. */
function canonicalizeCss(css: string): string {
  return decodeCssEscapes(stripCssComments(css)).replace(/\s+/g, " ");
}

/** Reject positioned overlays that include z-index. */
function rejectUnsafeDeclarations(body: string, rejected: string[]): boolean {
  const normalized = canonicalizeCss(body);
  const hasOverlayPosition = /position\s*:\s*(fixed|absolute)/i.test(normalized);
  const hasZIndex = /\bz-index\s*:/i.test(normalized);
  if (hasOverlayPosition && hasZIndex) {
    rejected.push("Overlays with z-index are not allowed.");
    return true;
  }
  return false;
}

/** Validate a rule declaration block for unsafe overlay patterns. */
function validateRuleBody(body: string, rejected: string[]): boolean {
  return rejectUnsafeDeclarations(body, rejected);
}

/** Result of scoping and validating profile custom CSS. */
export interface CssScopeResult {
  css: string;
  warnings: string[];
  rejected: string[];
}

/** Prefix selectors and filter unsafe rules in profile custom CSS. */
export function scopeProfileCss(raw: string, scopeClass: string): CssScopeResult {
  const warnings: string[] = [];
  const rejected: string[] = [];

  if (!raw.trim()) return { css: "", warnings, rejected };

  if (raw.includes("<")) {
    rejected.push("HTML tags are not allowed in custom CSS.");
    return { css: "", warnings, rejected };
  }

  if (raw.length > MAX_CSS_LENGTH) {
    rejected.push(`Custom CSS exceeds ${MAX_CSS_LENGTH} characters.`);
    return { css: "", warnings, rejected };
  }

  const canonical = canonicalizeCss(raw);
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(canonical)) {
      rejected.push(`Blocked pattern: ${pattern.source}`);
    }
  }

  if (rejected.length > 0) return { css: "", warnings, rejected };

  const rules = splitCssRules(raw);
  if (rules.length > MAX_RULE_COUNT) {
    rejected.push(`Too many rules (${rules.length}); maximum is ${MAX_RULE_COUNT}.`);
    return { css: "", warnings, rejected };
  }

  const scoped: string[] = [];
  for (const rule of rules) {
    const trimmed = rule.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("@media")) {
      const mediaMatch = trimmed.match(/^(@media[^{]+)\{([\s\S]*)\}$/);
      if (!mediaMatch) {
        warnings.push("Skipped malformed @media rule.");
        continue;
      }
      const inner = scopeSelectors(mediaMatch[2]!, scopeClass, rejected);
      if (inner) scoped.push(`${mediaMatch[1]}{${inner}}`);
      continue;
    }

    const ruleMatch = trimmed.match(/^([^{]+)\{([^}]*)\}$/);
    if (!ruleMatch) {
      warnings.push(`Skipped malformed rule: ${trimmed.slice(0, 40)}…`);
      continue;
    }

    const selector = ruleMatch[1]!.trim();
    const body = ruleMatch[2]!.trim();

    if (BLOCKED_SELECTORS.test(selector)) {
      rejected.push(`Blocked selector: ${selector}`);
      continue;
    }

    if (validateRuleBody(body, rejected)) continue;

    const scopedSelector = selector
      .split(",")
      .map((s) => {
        const part = s.trim();
        if (!part) return "";
        if (part.startsWith(scopeClass)) return part;
        return `${scopeClass} ${part}`;
      })
      .filter(Boolean)
      .join(", ");

    scoped.push(`${scopedSelector} { ${body} }`);
  }

  if (rejected.length > 0) return { css: "", warnings, rejected };

  return { css: scoped.join("\n"), warnings, rejected };
}

/** Validate and scope custom CSS for a profile. Fails closed when any rule is rejected. */
export function validateProfileCustomCss(
  raw: string,
  handle: string,
): { ok: true; css: string; warnings: string[] } | { ok: false; error: string } {
  if (!raw.trim()) return { ok: true, css: "", warnings: [] };
  const scopeClass = `.${profileScopeClass(handle)}`;
  const result = scopeProfileCss(raw, scopeClass);
  if (result.rejected.length > 0) {
    return { ok: false, error: result.rejected.join("; ") };
  }
  return { ok: true, css: result.css, warnings: result.warnings };
}

/** Scope selectors inside a nested CSS block. */
function scopeSelectors(block: string, scopeClass: string, rejected: string[]): string {
  const rules = splitCssRules(block);
  const out: string[] = [];
  for (const rule of rules) {
    const ruleMatch = rule.trim().match(/^([^{]+)\{([^}]*)\}$/);
    if (!ruleMatch) continue;
    const selector = ruleMatch[1]!.trim();
    if (BLOCKED_SELECTORS.test(selector)) {
      rejected.push(`Blocked selector: ${selector}`);
      continue;
    }
    const body = ruleMatch[2]!.trim();
    if (validateRuleBody(body, rejected)) continue;
    const scopedSelector = selector
      .split(",")
      .map((s) => `${scopeClass} ${s.trim()}`)
      .join(", ");
    out.push(`${scopedSelector} { ${body} }`);
  }
  return out.join("\n");
}

/** Split top-level CSS rules while respecting nested braces. */
function splitCssRules(css: string): string[] {
  const rules: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        rules.push(css.slice(start, i + 1));
        start = i + 1;
      }
    }
  }
  const tail = css.slice(start).trim();
  if (tail) rules.push(tail);
  return rules;
}

/** Derive the scoped CSS class name for a profile handle. */
export function profileScopeClass(handle: string): string {
  const safe = handle.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return `profile-scope--${safe}`;
}
