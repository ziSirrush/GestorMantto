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
        u.empresa,
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
        u.updated_at,
        COALESCE(
          JSON_ARRAYAGG(
            CASE
              WHEN r2.id_rol IS NULL THEN NULL
              ELSE JSON_OBJECT(
                'id_rol', r2.id_rol,
                'rol', r2.rol,
                'principal', ur.principal,
                'activo', ur.activo
              )
            END
          ),
          JSON_ARRAY()
        ) AS roles_detalle
      FROM usuarios u
      LEFT JOIN roles r
        ON r.id_rol = u.rol_id
      LEFT JOIN usuarios jefe
        ON jefe.id_SB = u.reporta_a
      LEFT JOIN preguntas_seguridad ps
        ON ps.id_pregunta = u.id_pregunta
      LEFT JOIN usuario_roles ur
        ON ur.id_usuario = u.id_SB
       AND ur.activo = 1
      LEFT JOIN roles r2
        ON r2.id_rol = ur.id_rol
       AND r2.estado = 1
      GROUP BY
        u.id_SB,
        u.nombre,
        u.iniciales,
        u.puesto,
        u.area,
        u.empresa,
        u.rol_id,
        r.rol,
        r.descripcion,
        u.correo,
        u.reporta_a,
        jefe.nombre,
        u.estado,
        u.id_pregunta,
        ps.pregunta,
        u.ultimo_acceso,
        u.created_at,
        u.updated_at
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
          id_interno,
          folio,
          estado_ticket,
          estado,
          ciudad,
          proyecto,
          codigo_equipo,
          referencia_en_zona_operativa,
          zona,
          descripcion,
          fecha_reporte,
          h_reporte,
          estatus_equipo_ir,
          fecha_llegada,
          h_llegada,
          persona_que_atiende,
          fecha_cierre,
          h_solucion,
          tecnico,
          estatus_equipo_final,
          causa,
          accion_en_cierre,
          responsabilidad,
          causa_falla,
          tiempo_llegada,
          tiempo_solucion,
          tipo_equipo,
          prioridad,
          ejecutivo_call,
          tiempo_llegada_ii,
          tiempo_solucion_ii,
          blt_empleado,
          ticket_excede,
          zona_administrativa,
          zona_de_falla,
          mes_reporte,
          proyecto_padre
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          id_interno = VALUES(id_interno),
          folio = VALUES(folio),
          estado_ticket = VALUES(estado_ticket),
          estado = VALUES(estado),
          ciudad = VALUES(ciudad),
          proyecto = VALUES(proyecto),
          codigo_equipo = VALUES(codigo_equipo),
          referencia_en_zona_operativa = VALUES(referencia_en_zona_operativa),
          zona = VALUES(zona),
          descripcion = VALUES(descripcion),
          fecha_reporte = VALUES(fecha_reporte),
          h_reporte = VALUES(h_reporte),
          estatus_equipo_ir = VALUES(estatus_equipo_ir),
          fecha_llegada = VALUES(fecha_llegada),
          h_llegada = VALUES(h_llegada),
          persona_que_atiende = VALUES(persona_que_atiende),
          fecha_cierre = VALUES(fecha_cierre),
          h_solucion = VALUES(h_solucion),
          tecnico = VALUES(tecnico),
          estatus_equipo_final = VALUES(estatus_equipo_final),
          causa = VALUES(causa),
          accion_en_cierre = VALUES(accion_en_cierre),
          responsabilidad = VALUES(responsabilidad),
          causa_falla = VALUES(causa_falla),
          tiempo_llegada = VALUES(tiempo_llegada),
          tiempo_solucion = VALUES(tiempo_solucion),
          tipo_equipo = VALUES(tipo_equipo),
          prioridad = VALUES(prioridad),
          ejecutivo_call = VALUES(ejecutivo_call),
          tiempo_llegada_ii = VALUES(tiempo_llegada_ii),
          tiempo_solucion_ii = VALUES(tiempo_solucion_ii),
          blt_empleado = VALUES(blt_empleado),
          ticket_excede = VALUES(ticket_excede),
          zona_administrativa = VALUES(zona_administrativa),
          zona_de_falla = VALUES(zona_de_falla),
          mes_reporte = VALUES(mes_reporte),
          proyecto_padre = VALUES(proyecto_padre)
        `,
        [
          row.ticket || null,
          row.id_interno || null,
          row.folio || null,
          row.estado_ticket || null,
          row.estado || null,
          row.ciudad || null,
          row.proyecto || null,
          row.codigo_equipo || null,
          row.referencia_en_zona_operativa || null,
          row.zona || null,
          row.descripcion || null,
          row.fecha_reporte || null,
          row.h_reporte || null,
          row.estatus_equipo_ir || null,
          row.fecha_llegada || null,
          row.h_llegada || null,
          row.persona_que_atiende || null,
          row.fecha_cierre || null,
          row.h_solucion || null,
          row.tecnico || null,
          row.estatus_equipo_final || null,
          row.causa || null,
          row.accion_en_cierre || null,
          row.responsabilidad || null,
          row.causa_falla || null,
          row.tiempo_llegada || null,
          row.tiempo_solucion || null,
          row.tipo_equipo || null,
          row.prioridad || null,
          row.ejecutivo_call || null,
          row.tiempo_llegada_ii || null,
          row.tiempo_solucion_ii || null,
          row.blt_empleado || null,
          row.ticket_excede || null,
          row.zona_administrativa || null,
          row.zona_de_falla || null,
          row.mes_reporte || null,
          row.proyecto_padre || null
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
async function syncPortafolio(req, res) {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  if (!rows.length) {
    return res.status(400).json({
      ok: false,
      message: 'No se recibieron filas para sincronizar portafolio.'
    });
  }

  try {
    const [columnsResult] = await db.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'portafolio'
    `);

    const validColumns = columnsResult.map(c => c.COLUMN_NAME);
    const ignoredColumns = ['ID_SB', 'id_SB', 'created_at', 'updated_at'];

    let insertedOrUpdated = 0;

    for (const row of rows) {
      const cleanRow = {};

      Object.keys(row).forEach(key => {
        if (
          validColumns.includes(key) &&
          !ignoredColumns.includes(key) &&
          row[key] !== undefined
        ) {
          cleanRow[key] = row[key];
        }
      });

      if (!cleanRow.numero_equipo) continue;

      const columns = Object.keys(cleanRow);
      const placeholders = columns.map(() => '?').join(', ');
      const values = columns.map(col => cleanRow[col]);

      const updateClause = columns
        .filter(col => col !== 'numero_equipo')
        .map(col => `\`${col}\` = VALUES(\`${col}\`)`)
        .join(', ');

      const sql = `
        INSERT INTO portafolio (${columns.map(col => `\`${col}\``).join(', ')})
        VALUES (${placeholders})
        ON DUPLICATE KEY UPDATE
        ${updateClause || '`numero_equipo` = VALUES(`numero_equipo`)'}
      `;

      await db.query(sql, values);
      insertedOrUpdated++;
    }

    return res.json({
      ok: true,
      message: 'Portafolio sincronizado correctamente.',
      total: insertedOrUpdated
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error sincronizando portafolio.',
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
  syncTickets,
  syncPortafolio
};