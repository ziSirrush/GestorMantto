const db = require('../../config/db');

async function getHealth(req, res) {
  try {
    const database = await db.testConnection();

    return res.status(200).json({
      ok: true,
      message: 'Mantto Gestor API activa',
      environment: process.env.NODE_ENV || 'development',
      database: 'connected',
      server_time: database.server_time
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      message: 'Mantto Gestor API activa, pero MySQL no esta disponible',
      database: 'disconnected',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
}

module.exports = { getHealth };
