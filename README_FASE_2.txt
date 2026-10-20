BLT NOW | MODO OFFLINE | NUEVA IMPLEMENTACION - FASE 2

BASE DE ENTREGA
Proyecto: ziSirrush/GestorMantto, main version 102026.5
Commit verificado: 0768e330f8e70befd131b89b1d3d4d01940242f9
Fase 1 corregida se preparo contra 102026.4; el delta 102026.5 se audito y NO toca archivos de este FIX.
Continuidad: Fase 1 corregida (BLTNOW_FIX_MODO_OFFLINE_FASE_1_CORREGIDA.zip).
Numeracion nueva implementacion: Fase 2 de 5.

ALCANCE REAL DE ESTE FIX
- Respaldo automatico de datasets CERTIFICADOS de modulos seleccionados (default: todos).
- Al horario configurado mientras la PWA esta activa o al reabrirla/recuperar conexion.
- Sin solicitud manual de Wi-Fi; despues de configurar se inicia automaticamente.
- API protegida por Guard GENERAL/MODO_OFFLINE + permiso funcional y motor de alcance de cada empresa.
- Paginacion estable por PK sin limite global de 50,000 registros.
- Cuenta total y marca de ultima actualizacion comparadas antes/despues de cada exportacion.
- Bloques guardados en IndexedDB con generaciones temporales. SOLO cambia el respaldo visible
  si todas las paginas completan con la misma identidad, dominio, firma de alcance y conteos.
- Respaldo anterior sobrevive a cortes, fallas de cuota y cambios de datos durante la copia.
- Limpieza selectiva de respaldos por cambio de permisos/alcance, y purga al cerrar sesion.
- No incluye originales de fotos/documentos; solo campos de vista previa ya existentes.

EXPORTADORES CONCRETOS IMPLEMENTADOS Y SU ALCANCE
1. OPERACION_RESUMEN_DEL_DIA / UNITED
   Tickets + portafolio completos dentro de sus zonas vigentes; llave maestra = UNITED completo.
2. INSTALACIONES_PROYECTOS / CORELLIAN
   Proyectos ins_fl completos dentro del universo de usuarios visibles; llave maestra = CORELLIAN completo.

IMPORTANTE / LIMITACION VERIFICABLE
Los otros modulos autorizados aparecen seleccionados por defecto, PERO NO se consideran
respaldados hasta contar con exportador independiente revisado contra su Guard/alcance.
El resultado sera PARCIAL si se seleccionan modulos no implementados; NO se simula una
copia de "todas las BD". La implementacion de todos los demas exportadores necesita
contratos y pruebas por modulo. Esta entrega NO acredita modo offline completo de BLT NOW.
La navegacion offline funcional dentro de cada modulo corresponde a Fase 3.
Comentarios/movimientos offline y envio a Aiven siguen deshabilitados (Fases 4 y 5).

ALCANCE DE LA PROGRAMACION
El navegador/PWA NO garantiza ejecucion con la app cerrada o dispositivo suspendido.
Al reabrir la app o recobrar la conexion se reintenta el pendiente.
No hay instaladores, scripts de aplicacion, .patch o ejecucion de git automatica.

APLICACION EXCLUSIVAMENTE MANUAL
1. Validar que se parte de la Fase 1 corregida y que el codigo local coincide con esta base;
   si main avanzo, comparar y reconciliar antes de copiar.
2. Extraer ZIP y sustituir/crear manualmente en las rutas indicadas.
3. Revisar git diff/status y ejecutar comprobacion de sintaxis con node --check sobre JS entregados.
4. Ejecutar pruebas desde la RAIZ de repositorio: 
   node --test tests/offline-f1-catalog.test.js tests/offline-f2-export.test.js tests/offline-f2-scheduler.test.js tests/offline-f2-storage.test.js tests/offline-pilot-permissions.test.js
5. Validar manualmente con usuarios piloto de CORELLIAN, UNITED con cuatro zonas,
   llave maestra, revocaciones, cortes de conexion y capacidad/cuota del navegador.
6. Solo el usuario decide commit y posteriores publicaciones. Esta entrega NO ejecuta ninguno.

VALIDACION REALIZADA EN CONTENEDOR AISLADO
- node --check sobre JS del FIX.
- node --test tests/offline-f1-catalog.test.js, offline-f2-export.test.js,
  offline-f2-scheduler.test.js y offline-f2-storage.test.js: 27 pruebas simuladas correctas.
- Sin conexion a Aiven/Azure: NO se realizaron pruebas reales de BD, PWA ni E2E.
- Los tests actualizados offline-pilot-permissions requieren el repositorio completo
  para ejecutarse: no forman parte de las 27 pruebas simuladas del contenedor.

SISTEMAS MODIFICADOS POR ESTA ENTREGA
Solo archivos locales generados para el ZIP. GitHub, Azure, Aiven, Netlify y repositorio
local del usuario: intactos. Sin SQL nuevas tablas, sin migraciones ni escrituras remotas.
