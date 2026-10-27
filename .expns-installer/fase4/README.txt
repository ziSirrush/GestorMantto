BLT NOW — EXPERIMENTAL NS — FASE 4 — EQUIPOS CRITICOS

ENTREGA LOCAL. ZIP con archivos completos (no .patch, no instaladores ejecutables).
APLICACION: copiar los COMANDOS_POWERSHELL.txt a PowerShell en el equipo local.
PRERREQUISITOS: Fases 1/2/3 ya instaladas; estructura experimental NS,
permisos y puerta EXPERIMENTAL_NS configurados según normas oficiales.

NUEVOS:
- backend/src/modules/experimental-ns/experimental-ns-equipos-criticos.*.js (5)
- backend/tests/experimental-ns-fase4.test.js
- modules/experimental-ns/equipos-criticos/equipos-criticos-ns.js
- modules/experimental-ns/equipos-criticos/equipos-criticos-ns.css
- docs/EXPERIMENTAL_NS_FASE4.md

MODIFICADO COMPLETO:
- modules/experimental-ns/experimental-ns.js (sobre copia exacta F3, checksum comprobado).

ENLACE DE RUTA: backend/src/routes/index.js se edita localmente de forma
conservadora desde PowerShell, con prevalidacion y respaldo.

FUENTES: Exclusivamente ns_portafolio_pruebas y ns_tickets_pruebas.
TESTS LOCALES CON MOCKS: 46/46 aprobados en F2+F3+F4; E2E con Aiven pendiente.
LIMITES: hasta 50,000 filas por tabla; pagina/PDF exportan pagina visible;
historico de NetSuite incompleto afecta U365 y anio actual.
PRODUCCION NO MODIFICADA. Sin cambios GitHub, Azure, NetSuite, Aiven.
