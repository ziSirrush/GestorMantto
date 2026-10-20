BLT NOW | MODO OFFLINE | NUEVA IMPLEMENTACION | FASE 5 DE 5
==========================================================
Fecha: 2026-10-20
Base main verificada: 102026.6 / a7edc4bb1a167d94c138dd3b0db166f30a7ffb5e
Repo: https://github.com/ziSirrush/GestorMantto

REQUISITOS
- Integrar previamente las Fases 1 CORREGIDA, 2 V001, 3 V001 y 4 V001.
- Este ZIP solo incluye archivos NUEVOS y MODIFICADOS para Fase 5.
- No se aplica automáticamente. Comparar en la copia local antes de reemplazar.
- Sin scripts de instalación, .patch, .ps1, migraciones ni commits automáticos.

QUÉ HACE ESTA FASE
- Envía automáticamente pendientes al recuperar internet con la PWA ABIERTA,
  después de revalidar permiso offline, catálogo, dominio, zona y alcance.
- Permite ejecución manual en Modo Offline > Sincronizar pendientes ahora.
- Backend: rutas independientes POST /api/offline/actions/sync/united y
  /api/offline/actions/sync/corellian, con Guard GENERAL + Guard funcional.
- En cada POST: identidad actor/efectivo, modo Visor, firma territorial vigente,
  permiso adicional de detalle para comentarios de Tickets, fila del alcance
  actual, identidad del registro y formato de operación.
- Idempotencia: clave UUID; GET_LOCK MySQL por operación y confirmación durable
  en usuario_interacciones (reutiliza estructura actual, sin tabla nueva).
  Una UUID no se puede reutilizar para otra accion o texto; se rechaza el conflicto.
- Para TICKET_COMMENT inserta ticket_comentarios + usuario_interacciones
  en la MISMA transacción; notifica con el evento oficial de Ticket tras commit,
  sólo si se resolvió de manera segura su zona.
- TICKET_MOVEMENT, EQUIPMENT_MOVEMENT, PROJECT_COMMENT, PROJECT_MOVEMENT:
  registran movimientos/comentarios DESCRIPTIVOS auditables en
  usuario_interacciones, NO mutan campos de negocio ni guardan documentos.
- Cola local: PENDIENTE / ENVIANDO / SINCRONIZADO / REQUIERE_REVISION.
  Confirma sólo con ACK servidor ligado a UUID, acción, registro e interacción.
  Error de red reintenta con espera; 400/403/409 de negocio exige revisión.
  Token de reclamación protege entre pestañas; reenvíos son idempotentes.
- El aviso local de Notificaciones desaparece al confirmarse pendientes.
- Guarda recibos locales hasta 30 días como máximo cuando se vuelve a capturar;
  sólo movimientos sin confirmar consumen el cupo de pendientes.

LIMITACIONES CRÍTICAS / SIN AFIRMACIONES ENGAÑOSAS
- Sólo los módulos con exportador real F2: Resumen del Día UNITED y Proyectos
  de Instalaciones CORELLIAN. Los demás NO cuentan con backup certificado.
- Los MOVIMIENTOS de esta implementación son REGISTROS DESCRIPTIVOS; nunca
  cambian estatus, Vo.Bo., responsables, inventarios, importes o pagos.
- Comentarios CORELLIAN de proyecto quedan en el histórico de interacciones
  de Aiven, NO en Bitácora de Obra ni en un hilo de comentarios especializado.
- La notificación de Ticket se intenta tras la transacción y NO cancela un
  comentario ya confirmado si falla el servicio de notificaciones.
- No se garantiza sincronización a hora exacta con PWA totalmente cerrada.
- Una operación fuera de alcance o cuyo identificador cambió NO se sube.
- Cerrar sesión limpia datos locales, incluidos pendientes no sincronizados.
- No se ha probado con Azure/Aiven real ni PWA en dispositivo; la estructura
  actual de Aiven y la lógica E2E deben verificarse antes de PRODUCCIÓN.

ARCHIVOS COMPLETOS (rutas dentro del repositorio)
backend/src/modules/offline-pilot/offline-pilot.sync.js      [NUEVO]
backend/src/modules/offline-pilot/offline-pilot.routes.js    [MODIFICADO]
backend/src/modules/offline-pilot/offline-pilot.controller.js [MODIFICADO]
backend/src/modules/offline-pilot/offline-pilot.service.js   [MODIFICADO]
core/offline-storage.js                                     [MODIFICADO]
core/offline-scheduler.js                                   [MODIFICADO]
modules/offline-pilot/offline-pilot.js                       [MODIFICADO]
service-worker.js                                           [MODIFICADO]
tests/offline-f1-catalog.test.js                             [REGRESION]
tests/offline-f2-export.test.js                              [REGRESION]
tests/offline-f3-reader.test.js                              [REGRESION]
tests/offline-f4-outbox.test.js                              [REGRESION]
tests/offline-pilot-permissions.test.js                      [REGRESION]
tests/offline-f5-server.test.js                              [NUEVO]
tests/offline-f5-scheduler.test.js                           [NUEVO]
README_FASE_5.txt                                           [DOCUMENTACION]

VALIDACION
- node --check: sintaxis de archivos JS modificados correcta.
- 52/52 pruebas simuladas F2/F3/F4/F5 correctas (mock de DB/IDB/DOM).
- Sin pruebas en Azure/Aiven y sin E2E; no se afirma compatibilidad probada
  con una base de datos en ejecución.
- Sin cambios sobre GitHub, Azure, Aiven, Netlify ni archivos del usuario.

ORDEN DE INTEGRACION LOCAL (manual, no automático)
1) Confirmar que F1-F4 ya están aplicadas y limpias en la copia local.
2) Extraer estos archivos COMPLETOS en sus rutas existentes.
3) Revisar diferencias; correr pruebas disponibles y validación con BD de LAB.
4) Verificar primero Corellian/United y permisos en un ambiente NO productivo.
5) Commit/push/despliegue solamente cuando el usuario lo autorice explícitamente.
