BLT NOW — EXPERIMENTAL NS — FASE 5 | PROYECTOS MANTENIMIENTO + QA

ZIP para aplicar LOCALMENTE. Sin .patch, instalador, SQL ejecutable ni despliegue.
Requiere F1/F2/F3/F4 ya aplicadas, permisos/puerta EXPERIMENTAL_NS registrados.

NUEVOS:
* 5 archivos backend/src/modules/experimental-ns/experimental-ns-proyectos-mantenimiento.*.js
* backend/tests/experimental-ns-fase5.test.js
* modules/experimental-ns/proyectos-mantenimiento/proyectos-mantenimiento-ns.{js,css}
* docs/EXPERIMENTAL_NS_FASE5.md

MODIFICADOS COMPLETOS:
* modules/experimental-ns/experimental-ns.js (partiendo exactamente de F4 V001).
* tests/experimental-ns-fase1.test.js (actualiza el test de cascaron F1 a rutas F3/F4/F5).

ENLACE CENTRAL LOCAL:
* backend/src/routes/index.js se modifica SOLO al pegar COMANDOS_POWERSHELL.txt,
  con validacion de marcadores, respaldo y reversión de errores.

RUTAS GET:
  /api/experimental-ns/proyectos-mantenimiento/inicial
  /api/experimental-ns/proyectos-mantenimiento/detalle

DATOS: SOLO ns_portafolio_pruebas + ns_tickets_pruebas, por codigo de equipo.
La copia usa CSS visual oficial de Proyectos pero no su JavaScript ni sus APIs.
Fase 5: 33 pruebas nuevas con mocks/VM (F2-F5: 79 en total) + sintaxis JS validada.
F1 se verifica en el repositorio LOCAL durante aplicacion, no en el snapshot de pruebas.
No se consulto Aiven real y NO se verifico funcionalidad end-to-end ni exactitud
completa del historico; F3 mantiene criticidad pendiente y F4 tiene limites documentados.

APLICACION:
Guardar ZIP en Descargas y pegar COMANDOS_POWERSHELL.txt en PowerShell.
NO ejecutar commit/push ni desplegar sin autorizacion.
