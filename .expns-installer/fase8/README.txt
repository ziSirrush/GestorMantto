BLT NOW | EXPERIMENTAL NS | FASE 8 V001

OBJETIVO: optimizar y medir los refrescos SIN afectar el motor global.

- Agrupa avisos en 250 ms y dispersa sondeos; aplica backoff ante red fallida.
- Comparte solo la huella de revision de SQL identico por scope y permiso
  durante 1 s, despues de autenticacion+Guard individuales.
- Mide GET/p50/p95/refrescos/cambios en memoria; panel solo Programador.
- Prueba HTTP aislada con 1/10/50 clientes simulados (sin Aiven/NetSuite).
- Conserva borradores, foco, filtros y detalles de F7; solo lectura.

REQUISITO: F1-F7 V001 aplicadas localmente, sin cambios extra a los
siete archivos reemplazados. Si SHA no coincide, PowerShell detiene.

APLICAR: coloca el ZIP en Descargas y ejecuta COMANDOS_POWERSHELL.txt
contra tu repositorio local. Respaldo y rollback automaticos.

PRUEBAS EJECUTADAS: 108/108 unitarias F2-F8, 3/3 navegador simulado,
benchmark HTTP loopback 1/10/50 (cifras en docs).
NO SE PROBO con Azure/Aiven/NetSuite reales; no se garantiza SLA.
No se ejecuto commit, push, SQL, despliegue ni escritura remota.

GitHub main de referencia: aaa1f1ed30798716d0885dee1692ce56b1583402.
Solo frontend Experimental NS + rutas live experimentales; Core intacto.
