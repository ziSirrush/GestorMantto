BLT NOW | MODO OFFLINE | NUEVA IMPLEMENTACION | FASE 4 DE 5
==========================================================

BASE VERIFICADA
- GitHub main 102026.6: a7edc4bb1a167d94c138dd3b0db166f30a7ffb5e (20/10/2026).
- REQUIERE que las Fases 1 CORREGIDA, 2 V001 y 3 V001 de esta misma
  implementacion ya esten integradas en la copia local.
- NO contiene ni reinstala fases previas. Estas fases no constaban aun en main.

FUNCIONALIDAD REAL ENTREGADA EN FASE 4
- El detalle local de cada registro respaldado y validado muestra un formulario
  para guardar comentarios o reportes textuales de movimientos como PENDIENTES.
- Operaciones soportadas en esta fase:
  * UNITED / Resumen del Dia: comentario de Ticket, movimiento descriptivo
    de Ticket y movimiento descriptivo de equipo de Portafolio.
  * CORELLIAN / Proyectos de Instalaciones: comentario de proyecto y
    movimiento descriptivo del proyecto.
- Cada intencion se registra en IndexedDB/outbox con UUID, fecha/hora, actor,
  usuario efectivo, dominio, modulo, clase de registro, id del registro,
  referencia, firma de alcance, generacion del respaldo y texto (max 2000).
- Antes de almacenar se relee el registro desde un respaldo local F2/F3
  certificado: identidad, modulo, firma, version y generacion deben coincidir.
- Guardado atomico en la cola; no modifica el respaldo de solo lectura.
- Vista de operaciones pendientes: consulta local y descarte manual confirmado.
- Aviso LOCAL en Notificaciones y distintivo independiente en la campana.
  Tambien emite mantto:offline-sync-required (local_only=true).
- Al recobrar conexion se mantiene el aviso de pendientes, SIN simular envio.
- Revalida firmas con el catalogo nuevo; limpia pendientes de alcances revocados.
  Desmarcar un modulo sin perder permiso no elimina sus pendientes.
- Modo Visor no puede crear nuevas operaciones desde la interfaz ni mediante
  el metodo de almacenamiento cuando la autorizacion cacheada es solo lectura.

LIMITES IMPORTANTES
- En Fase 4 SOLO se guarda la intencion local. No se realiza HTTP para
  comentarios o movimientos, ni se inserta una notificacion en Aiven.
- Los movimientos de Fase 4 son reportes textuales PENDIENTES, NO cambios
  efectivos de estatus, responsables, validaciones, Vo.Bo., inventario,
  cobranza o valores financieros. Esas operaciones requieren adaptadores
  transaccionales y reglas especificas de autorizacion (Fase 5).
- El POST /api/tickets/:ticket/comentarios existe en el backend online,
  pero no se invoca durante Fase 4. Fase 5 revalidara permisos, alcance e
  idempotencia ANTES de enviar o aplicar cualquier operacion.
- No hay sincronizacion, reconciliacion ni reintentos a Aiven en esta fase.
- Los pendientes se borran al cerrar sesion junto con IndexedDB. PRECAUCION:
  cerrar sesion antes de Fase 5 implica perder intenciones no sincronizadas.
- Permiso offline cacheado expira a las 24h. Al faltar una autorizacion vigente,
  no se permite capturar nuevas operaciones offline, incluso si hay copia.
- IndexedDB no equivale a almacenamiento criptograficamente cifrado ni a una
  prueba de aislamiento del equipo. No se certifica seguridad E2E sin ensayos.
- Como en fases previas, la PWA cerrada no garantiza tareas en segundo plano.
- Solo hay exportadores operativos de F2 para Resumen del Dia y Proyectos de
  Instalaciones. Otros modulos siguen pendientes de exportador certificado.

ARCHIVOS COMPLETOS ENTREGADOS, EN SUS RUTAS REALES
- core/offline-storage.js                  (modificado, cola IndexedDB)
- core/offline-scheduler.js                (modificado, aviso y limpieza)
- modules/offline-pilot/offline-pilot.js   (modificado, captura/listado)
- service-worker.js                       (modificado, shell F4; conserva
                                             version Altas de Instalaciones 102026.6)
- tests/offline-f2-storage.test.js         (actualizado: outbox F4)
- tests/offline-f3-reader.test.js          (actualizado: shell y outbox F4)
- tests/offline-pilot-permissions.test.js  (actualizado: outbox local)
- tests/offline-f4-outbox.test.js          (nuevo)
- tests/offline-f4-ui.test.js              (nuevo)
- README_FASE_4.txt                       (este documento)

VERIFICACION
- node --check: sin errores en los JS entregados.
- Pruebas unitarias y de regresion aisladas: 46/46 correctas
  (F1 catalogo, F2 export/scheduler/storage, F3 lector, F4 outbox/UI).
- Mock de IndexedDB y DOM, NO equivalente a prueba PWA real o E2E.
- No se ejecutaron pruebas contra Aiven/Azure ni pruebas en dispositivo.
- La suite de pruebas del repositorio completo requiere los archivos existentes
  del repo en la carpeta local; este ZIP NO es un repositorio independiente.

INTEGRACION MANUAL / NORMAS
- Comparar el codigo con la copia local que ya contenga F1+F2+F3.
- Extraer SOLO los archivos completos en sus rutas originales. Revisar cambios
  antes de crear cualquier commit, si el usuario decide hacerlo.
- No hay instaladores, parches .patch, .ps1, ejecutores ni scripts de
  aplicacion automatica. Los JS incluidos son codigo de la aplicacion y tests.
- NO realiza escrituras sobre GitHub, Azure, Netlify, Aiven ni el equipo local
  del usuario. No hace commit, push, migracion SQL ni despliegue.

PENDIENTE FASE 5
- Implementar endpoints/adaptadores por tipo de operacion, con permisos reales,
  reconocimiento de registros, control de conflictos, idempotencia persistente,
  auditoria, notificaciones de servidor y marca de envio confirmado.
