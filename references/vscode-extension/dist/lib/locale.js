'use strict';

const vscode = require('vscode');

const EXTENSION_LOCALE_KEY = 'cursorGuard.locale';

function normalizeLocale(locale) {
  return locale === 'zh-CN' ? 'zh-CN' : 'en-US';
}

function detectLocale() {
  return normalizeLocale(
    (vscode.env.language || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
  );
}

function getLocale(storage) {
  if (!storage || typeof storage.get !== 'function') return detectLocale();
  return normalizeLocale(storage.get(EXTENSION_LOCALE_KEY) || detectLocale());
}

async function setLocale(storage, locale) {
  const normalized = normalizeLocale(locale);
  if (storage && typeof storage.update === 'function') {
    await storage.update(EXTENSION_LOCALE_KEY, normalized);
  }
  return normalized;
}

module.exports = {
  EXTENSION_LOCALE_KEY,
  normalizeLocale,
  detectLocale,
  getLocale,
  setLocale,
};
