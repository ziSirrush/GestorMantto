BLT NOW | EXPERIMENTAL NS | FASE 1
Origen: ziSirrush/GestorMantto main @ aaa1f1ed30798716d0885dee1692ce56b1583402

INCLUYE:
- modules/experimental-ns/experimental-ns.js (archivo completo nuevo)
- modules/experimental-ns/experimental-ns.css (archivo completo nuevo)
- tests/experimental-ns-fase1.test.js (pruebas locales)
- docs/EXPERIMENTAL_NS_FASE1.md (cambios y alcance)
- COMANDOS_POWERSHELL.txt (instrucciones para incorporar cambios minimos a index.html y core/router.js LOCALES)

NO INCLUYE: .patch, instaladores, alter SQL, secrets, cambios de produccion.

APLICACION:
1. Descarga el ZIP a Descargas.
2. Lee COMANDOS_POWERSHELL.txt. Copia y pega el bloque en PowerShell.
3. El comando valida el SHA de Git, crea respaldos y ejecuta checks.
4. Inspecciona cambios. No hacer commit/push/deploy hasta revisar.

Si el SHA de tu main cambió desde esta entrega, se detiene para evitar sobrescrituras.
