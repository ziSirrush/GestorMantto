'use strict';
// BLT NOW · Experimental NS · F8: coalescencia efimera por SQL y alcance.
// El Guard de acceso se ejecuta ANTES de llamar este modulo. Solo se cachea
// la huella opaca, jamas filas, tickets, datos personales o permisos.
const crypto = require('node:crypto');

const TTL_MS = 1000;
const MAX_ENTRIES = 128;
const entries = new Map();

function scopedKey(req, repo) {
  const access = req && req.informationAccess;
  if (!access || access.acceso_puerta !== true || access.dominio !== 'UNITED' ||
      access.agrupacion?.codigo !== 'EXPERIMENTAL_NS' ||
      typeof access.permission_code !== 'string' ||
      typeof repo?.queries !== 'function') return null;
  // Ambos queries se construyen con el alcance oficial y fallan cerrados.
  // Una entrada compartida exige SQL, parametros y permiso exactamente iguales.
  const q = repo.queries(req);
  if (!q || typeof q.portafolio !== 'string' || typeof q.tickets !== 'string' ||
      !Array.isArray(q.pParams) || !Array.isArray(q.tParams)) return null;
  return crypto.createHash('sha256').update(JSON.stringify({
    grouping: access.agrupacion.codigo,
    domain: access.dominio,
    permission: access.permission_code,
    queries: [[q.portafolio, q.pParams], [q.tickets, q.tParams]]
  })).digest('hex');
}

function trim() {
  const now = Date.now();
  for (const [key, item] of entries) {
    if (!item.pending && item.expires <= now) entries.delete(key);
  }
  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

async function revision(req, repo) {
  if (!repo || typeof repo.revision !== 'function') throw new Error('Repositorio NS no disponible.');
  const key = scopedKey(req, repo);
  if (!key) return repo.revision(req);  // Nunca cachear sin contexto completo.
  const old = entries.get(key);
  if (old?.pending) return old.pending;
  if (old?.expires > Date.now()) return old.value;
  trim();
  const item = { pending:null, expires:0, value:null };
  const work = Promise.resolve().then(() => repo.revision(req)).then(value => {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
      throw new Error('Huella de revision NS invalida.');
    }
    item.value = value;
    item.expires = Date.now() + TTL_MS;
    item.pending = null;
    return value;
  }).catch(error => {
    if (entries.get(key) === item) entries.delete(key);
    throw error;
  });
  item.pending = work;
  entries.set(key, item);
  return work;
}

// Unicamente para tests locales, no publicado como endpoint HTTP.
function resetForTests(){ entries.clear(); }
function sizeForTests(){ return entries.size; }
module.exports = { revision, TTL_MS, MAX_ENTRIES, resetForTests, sizeForTests };
