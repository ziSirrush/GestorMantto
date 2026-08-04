require('dotenv').config();

const { startServer } = require('./src/bootstrap');

startServer().catch((error) => {
  console.error('[BOOTSTRAP] No fue posible iniciar Mantto Gestor API.');
  console.error(error);
  process.exit(1);
});
