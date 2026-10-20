BLT NOW | Modo Offline | NUEVA IMPLEMENTACION - FASE 1
Base comprobada: ziSirrush/GestorMantto main, version 102026.4
Commit base: 62eb487c56cdbeab40f8a7c859d081782287702c

OBJETIVO
Catalogo dinamico de modulos autorizados, separado por GENERAL/CORELLIAN/UNITED.
Validacion por permisos efectivos, puerta y motor de alcance oficial.
En UNITED: zonas efectivas o dominio completo si tiene llave maestra.
En CORELLIAN: personas visibles o dominio completo si tiene llave maestra.
Todos los modulos autorizados aparecen marcados por defecto; seleccion local por actor y usuario efectivo.
Consulta offline lista SOLO respaldos existentes, seleccionados y cuyo alcance aun coincide.
El exportador piloto de Resumen del Dia se mantiene; los demas se marcan pendientes de Fase 2.

ARCHIVOS COMPLETOS
backend/src/modules/offline-pilot/offline-pilot.catalog.js  NUEVO
backend/src/modules/offline-pilot/offline-pilot.service.js  MODIFICADO
backend/src/modules/offline-pilot/offline-pilot.controller.js  MODIFICADO
modules/offline-pilot/offline-pilot.js                MODIFICADO COMPLETO
service-worker.js                                     MODIFICADO COMPLETO (renovacion cache)
tests/offline-f1-catalog.test.js                      NUEVO

APLICACION LOCAL MANUAL
1. Confirmar HEAD local = commit base y arbol de trabajo limpio; de otro modo, detener y conciliar.
2. Extraer ZIP y copiar manualmente los archivos a las rutas respectivas del repositorio.
3. Revisar git diff, git status y comprobar tests antes de decidir un commit.
4. No hay scripts de aplicacion, commits, publicaciones ni migraciones automaticas.

PRUEBAS REALIZADAS
node --check sobre los cinco archivos JS de codigo: correctos.
node --test tests/offline-f1-catalog.test.js: 7/7 pruebas simuladas exitosas.
Contrato basico del piloto previo: comprobaciones estaticas y funcionales aisladas correctas.

PENDIENTE DE VALIDAR
Integracion completa en el repositorio del usuario, permisos reales en Aiven, Azure, navegador/PWA y E2E.
La descarga automatica, nuevos exportadores, envio de movimientos, revocacion y purga remota NO se implementan en esta fase.

ESTADO
GitHub, Azure, Aiven, Netlify, GitHub Pages y repositorio local del usuario: SIN CAMBIOS.
Sin instaladores, archivos .patch ni comandos ejecutables de aplicacion o commit.
La propiedad historica 'phase:2' del piloto se conserva por compatibilidad; 'implementation_phase:1' identifica la nueva fase.
