const db = require('../config/db');

async function getTickets(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM tickets
      ORDER BY id DESC
      LIMIT 50000
    `);

    return res.json({ ok: true, source: 'tickets', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando tickets.',
      error: error.message
    });
  }
}

async function getPortafolio(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM portafolio
      LIMIT 50000
    `);

    return res.json({ ok: true, source: 'portafolio', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando portafolio.',
      error: error.message
    });
  }
}

async function getEquipos(req, res) {
  return getPortafolio(req, res);
}

async function getUsuarios(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT
        u.id_SB,
        u.nombre,
        u.iniciales,
        u.puesto,
        u.area,
        u.rol_id,
        r.rol,
        r.descripcion AS rol_descripcion,
        u.correo,
        u.reporta_a,
        jefe.nombre AS reporta_a_nombre,
        u.estado,
        u.id_pregunta,
        ps.pregunta AS pregunta_seguridad,
        u.ultimo_acceso,
        u.created_at,
        u.updated_at
      FROM usuarios u
      LEFT JOIN roles r
        ON r.id_rol = u.rol_id
      LEFT JOIN usuarios jefe
        ON jefe.id_SB = u.reporta_a
      LEFT JOIN preguntas_seguridad ps
        ON ps.id_pregunta = u.id_pregunta
      ORDER BY
        CASE r.rol
          WHEN 'Director General' THEN 1
          WHEN 'Director Mantenimiento' THEN 2
          WHEN 'Director Finanzas' THEN 3
          WHEN 'Director Instalaciones' THEN 4
          WHEN 'Director Ventas' THEN 5

          WHEN 'Programador' THEN 10
          WHEN 'Auxiliar Direccion' THEN 11
          WHEN 'Jefe de Calidad' THEN 12

          WHEN 'Superintendente Mantenimiento Zonas OCC01-02 y NOR01-03' THEN 20
          WHEN 'Superintendente Mantenimiento Zonas CNA01-04' THEN 21
          WHEN 'Superintendente Mantenimiento Zonas CNB01-03' THEN 22

          WHEN 'Jefe Juridico' THEN 30
          WHEN 'Auxiliar Legal' THEN 31
          WHEN 'Especialista IMSS' THEN 32
          WHEN 'Recursos Humanos' THEN 33
          WHEN 'Auxiliar Adminitrativo' THEN 34
          WHEN 'Jefe de Contratos' THEN 35
          WHEN 'Jefa de Atencion a Cliente' THEN 36
          WHEN 'Coordinador de Soporte' THEN 37
          WHEN 'Sistemas Digitales Soporte' THEN 38
          WHEN 'Almacen y Cobranza Proyectos' THEN 39
          WHEN 'Costumer Experience (CX)' THEN 40
          WHEN 'Whatsapp Pagina' THEN 41

          WHEN 'Supervisor Mantenimiento Zona CNA04' THEN 50
          WHEN 'Supervisor Mantenimiento Zona CNB01' THEN 51
          WHEN 'Supervisor Mantenimiento Zona CNB02' THEN 52
          WHEN 'Supervisor Mantenimiento Zona CNB03' THEN 53
          WHEN 'Supervisor Mantenimiento Zona CNA01' THEN 54
          WHEN 'Supervisor Mantenimiento Zona CNA02' THEN 55
          WHEN 'Supervisor Mantenimiento Zona CNA03' THEN 56
          WHEN 'Supervisor Mantenimiento Zona NOR01 y NOR02' THEN 57
          WHEN 'Supervisor Mantenimiento Zona NOR03' THEN 58
          WHEN 'Supervisor de Soporte' THEN 59
          WHEN 'Supervisora Administrativa de Mantenimiento' THEN 60
          WHEN 'Supervisor Mantenimiento Zona OCC01 y OCC02' THEN 61

          ELSE 999
        END,
        u.nombre ASC
    `);

    return res.json({ ok: true, source: 'usuarios', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando usuarios.',
      error: error.message
    });
  }
}

async function getPermisos(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT
        p.*,
        r.rol
      FROM permisos p
      LEFT JOIN roles r
        ON r.id_rol = p.rol_id
      ORDER BY p.rol_id ASC
    `);

    return res.json({ ok: true, source: 'permisos', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando permisos.',
      error: error.message
    });
  }
}

async function getRoles(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM roles
      WHERE estado = 1
      ORDER BY id_rol ASC
    `);

    return res.json({ ok: true, source: 'roles', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando roles.',
      error: error.message
    });
  }
}

async function getZonas(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM z_op
      WHERE estado = 1
      ORDER BY zona ASC
    `);

    return res.json({ ok: true, source: 'z_op', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando zonas operativas.',
      error: error.message
    });
  }
}

async function getUsuarioZop(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT
        uz.id_usuario_zop,
        uz.usuario_id,
        u.nombre AS usuario_nombre,
        uz.zona_id,
        z.zona,
        z.nombre AS zona_nombre,
        uz.estado
      FROM usuario_zop uz
      LEFT JOIN usuarios u
        ON u.id_SB = uz.usuario_id
      LEFT JOIN z_op z
        ON z.id_zona = uz.zona_id
      ORDER BY u.nombre ASC, z.zona ASC
    `);

    return res.json({ ok: true, source: 'usuario_zop', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando relación usuario-zona.',
      error: error.message
    });
  }
}

async function getProyectos(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT
        proyecto,
        MAX(ciudad) AS ciudad,
        MAX(zona) AS zona,
        MAX(supervisor) AS supervisor,
        COUNT(*) AS equipos
      FROM portafolio
      GROUP BY proyecto
      ORDER BY proyecto ASC
    `);

    return res.json({ ok: true, source: 'portafolio', data: rows });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando proyectos desde portafolio.',
      error: error.message
    });
  }
}

async function syncTickets(req, res) {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  if (!rows.length) {
    return res.status(400).json({
      ok: false,
      message: 'No se recibieron filas para sincronizar.'
    });
  }

  try {
    let insertedOrUpdated = 0;

    for (const row of rows) {
      await db.query(
        `
        INSERT INTO tickets (
          ticket,
          folio,
          proyecto,
          equipo,
          codigo_equipo,
          tipo_equipo,
          zona,
          ciudad,
          estado,
          prioridad,
          responsabilidad,
          causa_falla,
          descripcion,
          fecha_reporte,
          fecha_llegada,
          fecha_cierre,
          tecnico,
          supervisor,
          vobo_estado,
          vobo_comentario
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          folio = VALUES(folio),
          proyecto = VALUES(proyecto),
          equipo = VALUES(equipo),
          codigo_equipo = VALUES(codigo_equipo),
          tipo_equipo = VALUES(tipo_equipo),
          zona = VALUES(zona),
          ciudad = VALUES(ciudad),
          estado = VALUES(estado),
          prioridad = VALUES(prioridad),
          responsabilidad = VALUES(responsabilidad),
          causa_falla = VALUES(causa_falla),
          descripcion = VALUES(descripcion),
          fecha_reporte = VALUES(fecha_reporte),
          fecha_llegada = VALUES(fecha_llegada),
          fecha_cierre = VALUES(fecha_cierre),
          tecnico = VALUES(tecnico),
          supervisor = VALUES(supervisor),
          vobo_estado = VALUES(vobo_estado),
          vobo_comentario = VALUES(vobo_comentario)
        `,
        [
          row.ticket || null,
          row.folio || null,
          row.proyecto || null,
          row.equipo || null,
          row.codigo_equipo || null,
          row.tipo_equipo || null,
          row.zona || null,
          row.ciudad || null,
          row.estado || null,
          row.prioridad || null,
          row.responsabilidad || null,
          row.causa_falla || null,
          row.descripcion || null,
          row.fecha_reporte || null,
          row.fecha_llegada || null,
          row.fecha_cierre || null,
          row.tecnico || null,
          row.supervisor || null,
          row.vobo_estado || null,
          row.vobo_comentario || null
        ]
      );

      insertedOrUpdated++;
    }

    return res.json({
      ok: true,
      message: 'Tickets sincronizados correctamente.',
      total: insertedOrUpdated
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error sincronizando tickets.',
      error: error.message
    });
  }
}

module.exports = {
  getTickets,
  getPortafolio,
  getEquipos,
  getUsuarios,
  getPermisos,
  getRoles,
  getZonas,
  getUsuarioZop,
  getProyectos,
  syncTickets
};