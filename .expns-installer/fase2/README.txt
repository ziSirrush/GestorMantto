BLT NOW - EXPERIMENTAL NS - FASE 2 (solo lectura)

Fuentes: GitHub ziSirrush/GestorMantto, main aaa1f1ed30798716d0885dee1692ce56b1583402.

COMPONENTES:
- 5 archivos de backend NUEVOS en backend/src/modules/experimental-ns/.
- 1 prueba nueva (backend/tests/experimental-ns-fase2.test.js).
- 1 documento tecnico y 2 SQL de planeacion/configuracion manual.
- El archivo backend/src/routes/index.js existente se actualiza solo LOCALMENTE
  al pegar COMANDOS_POWERSHELL.txt. No se incluye ningun .patch ni instalador.

RUTAS:
GET /api/experimental-ns/estado
GET /api/experimental-ns/portafolio
GET /api/experimental-ns/tickets

SEGURIDAD:
Requiere sesion JWT + rol Programador + permisos funcionales + puerta
EXPERIMENTAL_NS + alcance UNITED del usuario efectivo.
SQL solo de lectura sobre ns_portafolio_pruebas y ns_tickets_pruebas.

IMPORTANTE:
1. Aplica Fase 1 local primero; NO requiere enviar F1 a GitHub.
2. Descarga el ZIP a Descargas y copia COMANDOS_POWERSHELL.txt a PowerShell.
3. No hagas commit/push ni deploy sin autorizacion.
4. No ejecutes SQL sin revision de esquema real y autorizacion explicita.
5. Los permisos/puertas no se conceden automaticamente; por defecto falla cerrado.
6. NO se ha consultado Aiven actual ni realizado E2E con NetSuite/Azure.

VALIDACIONES ANTES DE ENTREGAR:
- node --check para todos los nuevos archivos JS
- 14 pruebas unitarias sin BD real
- chequeo manual de nombres SQL contra sabana 07/10/2026

DETALLE: docs/EXPERIMENTAL_NS_FASE2.md
