// Adaptador temporal de compatibilidad.
// Conserva el registro actual de data.routes.js mientras el módulo definitivo
// vive dentro de src/modules/catalogos.
module.exports = require('../../modules/catalogos/catalogos.routes');
