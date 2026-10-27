BLT NOW | EXPERIMENTAL NS | FASE 6 V001

F6: Cache volatil de vistas ya cargadas, comprobacion periodica de cambios en
Aiven, parcheo y resaltado selectivo del DOM sin F5, sin cerrar detalle ni
sobrescribir campos en edicion. Solo Experimental NS.

DEPENDENCIAS: Fases F1-F5 V001 ya aplicadas LOCALMENTE; configuracion de permisos
EXPERIMENTAL_NS existente. No sustituye el receptor NetSuite ni activa escritura.

APLICACION LOCAL:
1) Descarga este ZIP en Descargas.
2) Copia a PowerShell el texto de COMANDOS_POWERSHELL.txt.
3) Verifica resultado y respaldo; no hacer commit/push/deploy sin autorizacion.

Se entregan SOLO archivos nuevos y archivos completos modificados; el indice de
rutas backend se adapta en LOCAL tras verificar marcadores y crear backup.
Sin .patch, sin instaladores ejecutables, sin SQL de cambios.

VALIDACIONES EJECUTADAS:
- node --check: correcto.
- F2-F6: 86/86 unitarias con mocks.
- Chromium headless: 3 escenarios de UI con API simulada.
PENDIENTE: pruebas E2E Aiven/NetSuite/Azure, carga concurrente y exactitud del
historico. La deteccion es por sondeo ~30 s, NO por push instantaneo.

FUENTE: GitHub main aaa1f1ed30798716d0885dee1692ce56b1583402,
mas entregas F1-F5 V001. No se modifico GitHub/Aiven/Azure/NetSuite/Netlify.
