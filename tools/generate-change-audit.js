'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CHANGES_DIR = path.join(ROOT, 'audit', 'changes');
const OUTPUT = path.join(ROOT, 'core', 'change-audit.generated.js');
const COMPANIES = new Set(['GENERAL', 'UNITED', 'CORELLIAN']);
const TYPES = new Set(['feature', 'correction', 'security', 'configuration', 'data', 'maintenance']);
const LAYERS = new Set(['FRONTEND', 'BACKEND', 'DATABASE', 'INTEGRATION']);
const STATUSES = new Set(['draft', 'published', 'cancelled']);
const REQUIRED = ['title', 'module', 'final_summary', 'reason', 'user_impact', 'responsible', 'validation'];
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA = /^[0-9a-f]{40}$/i;

function fail(file, message) { throw new Error(`${path.basename(file)}: ${message}`); }

function validate(record, file) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail(file, 'se requiere un objeto JSON');
  if (record.schema_version !== 1) fail(file, 'schema_version debe ser 1');
  if (typeof record.change_id !== 'string' || !/^MG-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(record.change_id)) fail(file, 'change_id inválido');
  if (path.basename(file, '.json') !== record.change_id) fail(file, 'change_id debe coincidir con el nombre del archivo');
  if (!STATUSES.has(record.status)) fail(file, 'status inválido');
  if (!COMPANIES.has(record.company)) fail(file, 'company inválida');
  if (!TYPES.has(record.type)) fail(file, 'type inválido');
  if (!Array.isArray(record.layer) || !record.layer.length || record.layer.some(layer => !LAYERS.has(layer)) || new Set(record.layer).size !== record.layer.length) fail(file, 'layer inválida');
  if (record.status !== 'published') return;
  for (const key of REQUIRED) if (typeof record[key] !== 'string' || !record[key].trim()) fail(file, `${key} obligatorio`);
  if (typeof record.finalized_at !== 'string' || !ISO_WITH_ZONE.test(record.finalized_at) || !Number.isFinite(Date.parse(record.finalized_at))) fail(file, 'finalized_at debe ser una fecha ISO válida con zona horaria');
  const dateParts = record.finalized_at.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/).slice(1).map(Number);
  const local = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], dateParts[3], dateParts[4], dateParts[5]));
  if ([local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate(), local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds()].some((value, index) => value !== dateParts[index])) fail(file, 'finalized_at contiene una fecha u hora inexistente');
  const match = record.finalized_at.match(/([+-])(\d{2}):(\d{2})$/);
  if (match && (Number(match[2]) > 23 || Number(match[3]) > 59)) fail(file, 'zona horaria inválida');
  if (!record.references || !SHA.test(record.references.commit || '')) fail(file, 'references.commit debe ser un SHA completo');
  for (const key of ['issue', 'pull_request']) {
    const value = record.references[key];
    if (value !== undefined && value !== null && (typeof value !== 'string' || !/^https:\/\/github\.com\//i.test(value))) fail(file, `references.${key} debe ser una URL de GitHub`);
  }
}

function collect(dir = CHANGES_DIR) {
  const seen = new Set();
  const changes = [];
  for (const name of fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort()) {
    const file = path.join(dir, name);
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (record && seen.has(record.change_id)) fail(file, `change_id duplicado: ${record.change_id}`);
    validate(record, file);
    seen.add(record.change_id);
    if (record.status !== 'published') continue;
    changes.push(Object.fromEntries([
      'schema_version', 'change_id', 'title', 'module', 'company', 'type', 'layer',
      'final_summary', 'reason', 'user_impact', 'status', 'finalized_at', 'responsible', 'validation'
    ].map(key => [key, record[key]]).concat([['references', {
      commit: record.references.commit.toLowerCase(),
      issue: record.references.issue || null,
      pull_request: record.references.pull_request || null
    }]])));
  }
  return changes.sort((a, b) => Date.parse(b.finalized_at) - Date.parse(a.finalized_at) || a.change_id.localeCompare(b.change_id, 'en'));
}

function generate({ dir = CHANGES_DIR, output = OUTPUT, commit, generatedAt, indexPath } = {}) {
  const buildCommit = commit || process.env.GITHUB_SHA || process.env.COMMIT_REF || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (!SHA.test(buildCommit)) throw new Error('No se pudo determinar un SHA completo del despliegue');
  const payload = { schemaVersion: 1, generatedAt: generatedAt || new Date().toISOString(), buildCommit, changes: collect(dir) };
  const json = JSON.stringify(payload, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  let updatedIndex;
  if (indexPath) {
    const html = fs.readFileSync(indexPath, 'utf8');
    updatedIndex = html;
    for (const asset of ['build-info', 'change-audit']) {
      const pattern = new RegExp(`(\\.\\/core\\/${asset}\\.generated\\.js\\?v=)[^"']+`);
      if (!pattern.test(updatedIndex)) throw new Error(`Falta la referencia a ${asset}.generated.js en index.html`);
      updatedIndex = updatedIndex.replace(pattern, (_, prefix) => `${prefix}${buildCommit}`);
    }
  }
  fs.writeFileSync(output, `window.MANTTO_CHANGE_AUDIT = Object.freeze(${json});\n`, 'utf8');
  if (indexPath) fs.writeFileSync(indexPath, updatedIndex, 'utf8');
  return payload;
}

if (require.main === module) {
  try { const payload = generate({ indexPath: path.join(ROOT, 'index.html') }); console.log(`[Mantto Audit] ${payload.changes.length} cambio(s) · ${payload.buildCommit.slice(0, 7)}`); }
  catch (error) { console.error(`[Mantto Audit] ${error.message}`); process.exitCode = 1; }
}

module.exports = { validate, collect, generate };
