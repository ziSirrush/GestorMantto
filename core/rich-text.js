(function initManttoRichText(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ManttoRichText = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createManttoRichText() {
  'use strict';

  const TAG_ALIASES = Object.freeze({
    b: 'strong',
    strong: 'strong',
    i: 'em',
    em: 'em',
    u: 'u',
    s: 's',
    strike: 's',
    p: 'p',
    div: 'div',
    br: 'br',
    ul: 'ul',
    ol: 'ol',
    li: 'li',
    span: 'span',
    font: 'span'
  });

  const FONT_SIZE_MAP = Object.freeze({
    '1': '12px',
    '2': '12px',
    '3': '14px',
    '4': '16px',
    '5': '18px',
    '6': '22px',
    '7': '22px'
  });

  const ALLOWED_FONT_SIZES = new Set(['12px', '14px', '16px', '18px', '22px']);
  const BLOCKED_CONTAINERS = /<\s*(script|style|iframe|object|embed|svg|math|template|noscript)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

  function readAttribute(source, name) {
    const expression = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
    const match = String(source || '').match(expression);
    return match ? String(match[1] ?? match[2] ?? match[3] ?? '') : '';
  }

  function normalizeColor(value) {
    const color = String(value || '').trim().toLowerCase();
    if (/^#[0-9a-f]{3,4}$/.test(color) || /^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(color)) return color;
    if (/^rgba?\(\s*(?:\d{1,3}%?\s*,\s*){2}\d{1,3}%?(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/.test(color)) return color;
    if (['black', 'white', 'transparent'].includes(color)) return color;
    return '';
  }

  function normalizeFontSize(value) {
    const size = String(value || '').trim().toLowerCase();
    if (FONT_SIZE_MAP[size]) return FONT_SIZE_MAP[size];
    return ALLOWED_FONT_SIZES.has(size) ? size : '';
  }

  function safeStyle(source, tagName) {
    const declarations = String(readAttribute(source, 'style') || '')
      .split(';')
      .map(item => item.split(':'))
      .filter(parts => parts.length >= 2)
      .reduce((result, parts) => {
        const property = String(parts.shift() || '').trim().toLowerCase();
        const value = parts.join(':').trim();
        if (property === 'color') result.color = normalizeColor(value);
        if (property === 'background-color') result.backgroundColor = normalizeColor(value);
        if (property === 'font-size') result.fontSize = normalizeFontSize(value);
        return result;
      }, {});

    if (tagName === 'font') {
      declarations.color = declarations.color || normalizeColor(readAttribute(source, 'color'));
      declarations.fontSize = declarations.fontSize || normalizeFontSize(readAttribute(source, 'size'));
    }

    return [
      declarations.fontSize ? 'font-size:' + declarations.fontSize : '',
      declarations.color ? 'color:' + declarations.color : '',
      declarations.backgroundColor ? 'background-color:' + declarations.backgroundColor : ''
    ].filter(Boolean).join(';');
  }

  function escapeTextFragment(value) {
    return String(value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function sanitizeTag(token) {
    if (/^<!--/.test(token)) return '';
    const closing = token.match(/^<\s*\/\s*([a-z0-9]+)\s*>$/i);
    if (closing) {
      const canonical = TAG_ALIASES[String(closing[1] || '').toLowerCase()];
      return canonical && canonical !== 'br' ? '</' + canonical + '>' : '';
    }

    const opening = token.match(/^<\s*([a-z0-9]+)\b([^>]*)>$/i);
    if (!opening) return escapeTextFragment(token);
    const originalName = String(opening[1] || '').toLowerCase();
    const canonical = TAG_ALIASES[originalName];
    if (!canonical) return escapeTextFragment(token);
    if (canonical === 'br') return '<br>';
    if (canonical === 'span') {
      const style = safeStyle(opening[2] || '', originalName);
      return style ? '<span style="' + style + '">' : '<span>';
    }
    return '<' + canonical + '>';
  }

  function sanitizeHtml(value) {
    let source = value === null || value === undefined ? '' : String(value);
    source = source.replace(/\0/g, '');
    let previous = '';
    while (source !== previous) {
      previous = source;
      source = source.replace(BLOCKED_CONTAINERS, '');
    }

    const expression = /<!--[\s\S]*?-->|<\/?[^>]*>/g;
    let cursor = 0;
    let output = '';
    let match;
    while ((match = expression.exec(source))) {
      output += escapeTextFragment(source.slice(cursor, match.index));
      output += sanitizeTag(match[0]);
      cursor = expression.lastIndex;
    }
    output += escapeTextFragment(source.slice(cursor));
    return output.trim();
  }

  function decodeEntities(value) {
    return String(value || '')
      .replace(/&#x([0-9a-f]+);/gi, function decodeHex(_match, code) {
        try { return String.fromCodePoint(Number.parseInt(code, 16)); } catch (_error) { return ''; }
      })
      .replace(/&#(\d+);/g, function decodeDecimal(_match, code) {
        try { return String.fromCodePoint(Number.parseInt(code, 10)); } catch (_error) { return ''; }
      })
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&amp;/gi, '&');
  }

  function toPlainText(value) {
    const html = sanitizeHtml(value)
      .replace(/<br\s*>/gi, '\n')
      .replace(/<li>/gi, '• ')
      .replace(/<\/(?:p|div|li|ul|ol)>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    return decodeEntities(html)
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function toEditorHtml(value) {
    const sanitized = sanitizeHtml(value);
    if (!sanitized) return '';
    const containsFormatting = /<(?:strong|em|u|s|span|p|div|br|ul|ol|li)\b/i.test(sanitized);
    return containsFormatting ? sanitized : sanitized.replace(/\r\n?|\n/g, '<br>');
  }

  function hasContent(value) {
    return Boolean(toPlainText(value).replace(/\s/g, ''));
  }

  return Object.freeze({
    sanitizeHtml,
    toEditorHtml,
    toPlainText,
    hasContent,
    allowedFontSizes: Object.freeze(Array.from(ALLOWED_FONT_SIZES))
  });
});
