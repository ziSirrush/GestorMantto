(function(){
  // Configuracion local de pruebas.
  // Si pruebas frontend con Live Server/serve en puerto 5500 o 3000,
  // el backend local corre en http://localhost:3001.
  // En produccion se puede reemplazar por la URL de Railway.
  window.MANTTO_API_BASE = window.MANTTO_API_BASE || 'http://localhost:3001';
})();
