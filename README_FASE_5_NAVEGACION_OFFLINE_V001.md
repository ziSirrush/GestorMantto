# BLT NOW | Navegacion normal offline | Fase 5 V001

**Base de codigo confirmada:** `ziSirrush/GestorMantto`, `main`, version **102026.8**, commit `857f52b8f38062f3171c3198568466b83e7805ac` (20-oct-2026).
Fuente: https://github.com/ziSirrush/GestorMantto/commit/857f52b8f38062f3171c3198568466b83e7805ac

**Prerequisitos:** respaldos Offline Fases 1-5 anteriores y Navegacion Offline Fases 1-4 **integradas localmente**. El ZIP F5 es incremental; no reemplaza ni reinstala las fases anteriores.

## Objetivo y comportamiento

Auditar y endurecer los dos modulos certificados (Resumen del Dia UNITED y Proyectos de Instalaciones CORELLIAN) y las acciones locales pendientes que se capturan en sus pantallas habituales. No se introduce otra interfaz operativa: Modo Offline permanece destinado a configuracion y respaldos.

- **Online:** las pantallas normales siguen consultando Azure/Aiven, sin pasar por IndexedDB.
- **Offline:** se muestran los respaldos integros autorizados con actor/usuario efectivo, dominio, permiso, `scope_signature` y `run_id`; la cola usa el motor de sincronizacion preexistente.
- **Sin respaldo, permiso o firma valida:** no se habilita el modulo offline ni se permite una escritura de emergencia.
- **Reconectar:** verifica API y BD; revalida permisos antes de recuperar la navegacion online. El sincronizador previo aplica idempotencia, ACK y conflictos; este FIX no reemplaza su contrato.

## Archivos completos (rutas relativas a la raiz del repo)

1. `core/offline-navigation.js`: revisa otra vez la autorizacion al terminar una verificacion lenta de los bloques; no publica rutas si el permiso o firma cambio durante el escaneo. Renueva las URLs de los lectores.
2. `core/offline-resumen-dia.js`: impide mutaciones en Resumen/Tickets durante una desconexion aunque el permiso haya vencido. Oculta el DOM sensible del Resumen al cerrar sesion, cambiar de usuario o expirar la sesion y solo lo libera tras una nueva lectura para la identidad actual.
3. `core/offline-instalaciones-proyectos.js`: mantiene bloqueados los controles de escritura de un expediente montado si el acceso CORELLIAN expira en pleno modo offline.
4. `core/offline-native-actions.js`: intercepta siempre el envio de comentarios nativos offline, incluso si se revoca su respaldo; conserva el texto si no se puede guardar. Un resultado local tardio no modifica el formulario de otro usuario o registro.
5. `service-worker.js`: version F5 y prerrequisitos del shell para **ambos** modulos certificados. Si faltan recursos obligatorios, se descarta el cache parcial y el worker nuevo no toma control.
6. `tests/offline-navegacion-fase1.test.js`, `tests/offline-navegacion-fase2-resumen.test.js`, `tests/offline-navegacion-fase3-instalaciones.test.js`, `tests/offline-navegacion-fase4-acciones.test.js`: archivos completos de prueba con escenarios F5 adicionales.
7. `tests/pwa-app-update.test.js`: ajuste exclusivo del identificador de version del worker en la prueba existente.
8. `docs/ADR_20261020_NAVEGACION_OFFLINE_FASE_5_V001.md`: decision de seguridad y restricciones.
9. `SHA256SUMS_FASE_5_NAVEGACION_OFFLINE_V001.txt`: integridad de la entrega.

No hay cambios en backend, SQL, estructura de datos, permisos oficiales ni modulos productivos en Nevera. No se entregan fragmentos de codigo, instaladores, `.patch` ni scripts que apliquen cambios automaticamente.

## Pruebas ejecutadas en entorno aislado

- Sintaxis `node --check` de los archivos JavaScript entregados: **PASS**.
- Regresion integrada Node con las Fases 1-5 de respaldos y Fases 1-4 de navegacion: **146/146 pruebas simuladas PASS**, incluyendo nuevas pruebas de permisos vencidos, cambio de identidad, consultas por alcance, formularios offline, colas, ACK/duplicados y SW.
- Prueba complementaria de actualizacion de PWA (`worker puente recarga`): **1/1 PASS**.
- Una suite completa de permisos generales y la suite completa del actualizador de PWA no se ejecutaron porque el arbol de pruebas aislado no incluye todas sus dependencias; se distinguen de las pruebas anteriores.
- **No puedo confirmar** pruebas E2E reales en dispositivo, conexion con Azure/Aiven, revocaciones reales, rendimiento con volumen productivo ni despliegue. Estos escenarios requieren validacion Local -> GitHub Pages antes de Netlify.

## Matriz manual pendiente para validar E2E

1. Iniciar sesion online y completar un respaldo autorizado de ambos dominios; recargar la PWA y desconectar red/API.
2. Confirmar visibilidad de modulos autorizados en barra lateral; abrir Resumen, Tickets y Proyectos desde las pantallas habituales.
3. Capturar comentario de Ticket y seguimiento descriptivo CORELLIAN: deben quedar **pendientes locales**, nunca mostrarse como confirmados en Aiven sin ACK.
4. Intentar Vo.Bo., modificacion de estatus, fotografias, archivos y comentarios de junta: deben quedar bloqueados offline.
5. Cambiar usuario/visor o expirar el permiso con la pantalla abierta: se deben ocultar datos ajenos y bloquear la captura.
6. Reconectar: verificar estado de API y MySQL, revalidacion de alcance, envio de pendientes con un solo ACK, conflicto visible y lectura online normal.
7. Repetir con una copia incompleta, perdida de red durante respaldo y dos pestanas abiertas.

## Limitaciones y advertencias

- Las fotografias, carpetas, historial de chat y otros datasets sin respaldo certificado siguen sin consulta offline.
- Una revocacion hecha mientras no existe red solo puede conocerse despues de reconectar o al vencer el permiso local cacheado.
- La aplicacion no puede sincronizar si la PWA esta cerrada; funciona al abrirla y recuperar conexion.
- En la implementacion previa, **cerrar sesion ejecuta purga del almacenamiento offline del dispositivo, incluida la cola local pendiente**. Antes de cerrar sesion con cambios no sincronizados se debe reconectar y esperar ACK; este FIX no cambia esa politica existente.
- No se ha realizado prueba de rendimiento con cientos de miles de filas ni auditoria de seguridad externa.

## Estado y sistemas

**Entregado:** ZIP con archivos completos y estructura relativa original; no aplicado. **Sin cambios** en GitHub, Azure, Aiven, Netlify ni en el equipo del usuario. Aplicar manualmente solo despues de integrar F1-F4 y verificar compatibilidad local.
