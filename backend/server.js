require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const db = require('./src/config/db');

const authRoutes = require('./src/routes/auth.routes');
const dataRoutes = require('./src/routes/data.routes');
const supportRoutes = require('./src/routes/support.routes');
const usuariosRoutes = require('./src/routes/usuarios.routes');
const catalogosRoutes = require('./src/routes/catalogos.routes');
const devRoutes = require('./src/routes/dev.routes');
const { startPortafolioCierreMensualJob } = require('./src/jobs/portafolioCierreMensual.job');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT NOW() AS server_time');

    return res.json({
      ok: true,
      message: 'Mantto Gestor API activa',
      database: 'connected',
      server_time: rows[0].server_time
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error conectando con Aiven MySQL',
      error: error.message
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/catalogos', catalogosRoutes);
app.use('/api/dev', devRoutes);
app.use('/api', dataRoutes);

app.listen(PORT, () => {
  console.log('Mantto Gestor API escuchando en http://localhost:' + PORT);
  startPortafolioCierreMensualJob();
});