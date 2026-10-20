BLT NOW - MODO OFFLINE - NUEVA IMPLEMENTACION FASE 1
Base de codigo: main, 102026.4, commit 62eb487c56cdbeab40f8a7c859d081782287702c

Entrega: codigo fuente real modificado y nuevo, prueba automatizada y secuencia PowerShell de integracion local.
Los archivos grandes existentes (index.html, core/module-loader.js, service-worker.js y offline-pilot.js)
se editan mediante sustituciones exactas comprobadas contra main al ejecutar INTEGRACION_LOCAL_POWERSHELL.txt,
quedando completos en el repositorio local; NO se entrega .patch ni instalador.

Incluye:
- Catalogo de modulos de lectura segun permisos efectivos, puerta y motor de alcance oficial.
- Distincion GENERAL, CORELLIAN y UNITED, incluidas zonas UNITED y llaves maestras independientes.
- Seleccion por usuario actor/efectivo: todos los modulos autorizados marcados por defecto.
- Los modulos sin exportador se muestran como PENDIENTE_EXPORTACION: NO se inventan descargas.
- El exportador existente de Resumen del Dia solo se anuncia a quien tiene permiso y alcance.
- Consulta operativa muestra SOLO modulos con snapshot local real y permitido, sin mezclar filas.
- El backend conserva los Guards de cada API y NO publica datos en el catalogo.

No incluye todavia (fases posteriores): descarga de los demas modulos, reemplazo automatico,
operaciones offline y envio de cola a Aiven, limpieza completa por revocacion, pruebas E2E.

Comprobado: node --check (4 archivos nuevos o modificados) y 5/5 pruebas simuladas del nuevo catalogo.
Pendiente: QA local con el repo completo, Aiven real y navegacion con/sin conexion.

SISTEMAS NO MODIFICADOS: GitHub, Aiven, Azure, Netlify, GitHub Pages y repo local del usuario.
