const db = require('../../config/db');
const repository = require('./instalaciones-comentarios-junta.repository');

function currentUser(req) {
  const user = req.user || {};
  return { id: Number(user.id_SB || user.id || 0) };
}

function clean(value, max = 500) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { text: `S${String(week).padStart(2, '0')}`, order: d.getUTCFullYear() * 100 + week };
}

async function list(req, res) {
  const user = currentUser(req);
  if (!user.id) return res.status(401).json({ ok: false, message: 'Sesión sin usuario válido.' });
  const rows = await repository.listByUser(db, user.id, {
    referencia_sitio: clean(req.query.referencia_sitio, 255) || null
  });
  return res.json({ ok: true, source: 'aiven', data: rows });
}

async function create(req, res) {
  const user = currentUser(req);
  if (!user.id) return res.status(401).json({ ok: false, message: 'Sesión sin usuario válido.' });
  const comentario = clean(req.body?.comentario, 2000);
  const referencia = clean(req.body?.referencia_sitio, 255);
  if (!comentario) return res.status(400).json({ ok: false, message: 'El comentario es obligatorio.' });
  if (!referencia) return res.status(400).json({ ok: false, message: 'La referencia del equipo es obligatoria.' });
  const week = isoWeek();
  const id = await repository.create(db, {
    id_usuario: user.id,
    id_proyecto: clean(req.body?.id_proyecto, 100) || null,
    proyecto: clean(req.body?.proyecto, 255) || null,
    referencia_sitio: referencia,
    comentario,
    responsables: clean(Array.isArray(req.body?.responsables) ? req.body.responsables.join(', ') : req.body?.responsables, 1000) || null,
    semana_iso: week.text,
    semana_orden: week.order
  });
  const rows = await repository.listByUser(db, user.id, { referencia_sitio: referencia });
  return res.status(201).json({ ok: true, source: 'aiven', message: 'Comentario de junta guardado.', id_comentario: id, data: rows.find(r => Number(r.id_comentario) === Number(id)) || null });
}

module.exports = { list, create };
