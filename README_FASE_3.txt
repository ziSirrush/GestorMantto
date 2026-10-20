BLT NOW | MODO OFFLINE | NUEVA IMPLEMENTACION | FASE 3 DE 5
==========================================================

BASE
- GitHub ziSirrush/GestorMantto main 102026.6, commit a7edc4bb1a167d94c138dd3b0db166f30a7ffb5e (20/10/2026).
- Requiere que las Fases 1 CORREGIDA y 2 V001 del MISMO modulo ya esten integradas en la copia local.
- Este ZIP no incluye ni aplica fases previas, instaladores, scripts de aplicacion, archivos .patch, ni commits.

ALCANCE FUNCIONAL REAL
- En Modo Offline > Consulta operativa sin internet aparecen SOLO modulos seleccionados,
  actualmente autorizados, con una generacion F2 completa y firma de alcance coincidente.
- Navegacion: modulo -> tipo de registro -> busqueda local en todos los bloques -> pagina -> detalle.
- Resumen del Dia / UNITED: Tickets y Portafolio, dentro de zonas asignadas o llave maestra.
- Instalaciones / CORELLIAN: Proyectos ins_fl segun personas visibles o llave maestra.
- Todas las consultas de esta pantalla proceden de IndexedDB, sin llamadas a API por el lector.
- Lectura paginada de 30 registros; evita cargar todo el historico en memoria.
- Se validan identidad actor/efectivo, dominio, conjunto, firma y generaciones completas.
- Copias F1 antiguas no se anuncian como completas: necesitan renovacion F2.
- Se limpia el contenido visible al cerrar sesion, cambiar identidad o perder permiso explicito.
- El panel de almacenamiento suma los modulos certificados y verificados, sin duplicar registros.
- Muestra valores locales de lectura; NO crea/modifica registros y no envia datos a Aiven.
- No descarga documentos o fotos originales. Un campo enlazado no equivale a un archivo local.

ALCANCE EXCLUIDO
- Solo los DOS exportadores certificados de F2 se pueden navegar en esta fase.
  El resto de los modulos del catalogo requiere exportadores independientes para respaldarse.
- No reproduce las pantallas online de cada modulo: ofrece un navegador de datos locales.
- Los comentarios, movimientos pendientes y sincronizacion hacia Aiven son Fases 4 y 5.
- El lector necesita una sesion local restaurable y concesion offline cacheada vigente.
  Una PWA completamente cerrada con sesion expirada puede exigir volver a conectarse.
- El navegador no garantiza ejecucion de procesos con la PWA cerrada.

ARCHIVOS COMPLETOS ENTREGADOS, EN RUTAS ORIGINALES
- core/offline-storage.js (modificado; lector por bloques, verificacion y filtros)
- modules/offline-pilot/offline-pilot.js (modificado; catalogo visual + navegador offline)
- service-worker.js (modificado; cache F3 y version de Altas de Instalaciones 102026.6 conservada)
- tests/offline-f1-catalog.test.js (modificado para no aceptar backups F1 incompletos como F3)
- tests/offline-f3-reader.test.js (nuevo; pruebas de aislamiento, lectura y navegacion)
- README_FASE_3.txt (esta nota)

VERIFICACION REALIZADA
- Sintaxis: node --check para cada JS entregado.
- Pruebas aisladas con emulacion simple de IndexedDB y DOM: 37/37 correctas
  al ejecutar los tests F1, F2 Export, F2 Scheduler, F2 Storage y F3 Reader.
- No se realizaron pruebas reales con navegadores/PWA, Aiven ni Azure; queda pendiente E2E.

INTEGRACION Y SEGURIDAD
1. Revisar diff y verificar que F1+F2 estan aplicadas sobre una copia local limpia.
2. Extraer los archivos completos conservando la estructura; revisar cambios en Git.
3. Verificar node --check y ejecutar pruebas de la carpeta tests en el repo completo.
4. Validar manualmente sin internet: zonas limitadas UNITED, llave maestra, CORELLIAN,
   busqueda/paginacion, cambio de usuario, revocacion y respaldo incompleto.
5. NO se ejecutan automaticamente cambios ni despliegues. El usuario autoriza cada publicacion.

ESTADO DE SISTEMAS
- Solo se generaron archivos en el contenedor de entrega.
- GitHub, Aiven, Azure, Netlify y el repo local del usuario permanecen sin cambios por este FIX.
