BLT NOW | FIX VISUAL MODO OFFLINE | PROGRESO GLOBAL V001
=====================================================
Fecha: 2026-10-20
Repositorio base verificado: ziSirrush/GestorMantto main, version 102026.7
Commit: 678146822d43fc4ca4fd9a77714bfa8bdb75ee99

OBJETIVO
Sustituir el avance tecnico por tabla (ejemplo "portafolio 900/3714")
por una vista sencilla del modulo actual: "Resumen del Dia 0/100" y
una barra con el porcentaje de progreso GENERAL de los respaldos disponibles.

CAMBIOS
- Nombre del modulo activo y progreso individual 0/100, nunca datos por tipo de tabla.
- Una sola barra con porcentaje global real del conjunto de modulos descargables
  que el usuario selecciono (no del catalogo total ni de modulos aun no habilitados).
- Porcentaje individual basado en registros verificados y acumulados de los tipos
  del modulo; porcentaje global promedia los modulos disponibles por igual.
- El 100% solo se muestra despues de completar los respaldos y confirmar su commit.
- Cuando una descarga falla se conserva su copia anterior y el resultado se
  informa como incompleto; no aparece un falso 100%.
- Se elimina del mensaje visible el texto "2 modulos respaldados. 71 modulos
  aun no tienen exportador certificado". Los modulos no habilitados no se
  consideran respaldos fallidos ni se incluyen en la barra.
- El catalogo conserva la seleccion de todos por defecto, pero informa
  "Respaldo no habilitado todavia" donde corresponde.
- Se renueva la version del Service Worker para actualizar el JS de la PWA.

ALCANCE
- Este FIX modifica solamente la visualizacion y los eventos del avance,
  el estado final de los modulos efectivamente descargables y la cache estatica.
- No crea exportadores adicionales: Resumen del Dia (UNITED) y Proyectos de
  Instalaciones (CORELLIAN) siguen siendo los unicos habilitados actualmente.
- No altera filtros de empresa/zona, permisos, escrituras, seguridad, IndexedDB
  ni adaptadores de sincronizacion de Fase 5.

ARCHIVOS COMPLETOS PARA REEMPLAZAR (rutas originales)
core/offline-scheduler.js
modules/offline-pilot/offline-pilot.js
service-worker.js
tests/offline-f2-scheduler.test.js
tests/offline-progress-ui.test.js (nuevo)
tests/pwa-app-update.test.js
README_FIX_OFFLINE_PROGRESO_V001.txt

VERIFICACION
- Sintaxis node --check de JS: correcta.
- Regresion offline F1-F5 y visual: 73/73 tests simulados correctos.
- Prueba focalizada de renovacion SW: 1/1 correcta.
- No ejecutadas pruebas E2E con Azure/Aiven o dispositivo final.
- QA realizado fuera del repositorio; no se escribio en GitHub, Aiven, Azure
  ni Netlify y no se altero la copia del usuario.

ENTREGA
- ZIP con archivos completos. NO incluye .patch, instaladores, scripts de
  aplicacion automatica, .ps1, migraciones ni comandos de commit/push.
- Aplicacion local MANUAL cuando el usuario decida integrar el FIX.
- Validar cambios con la PWA abierta y cerrada/recargada antes de publicar.
