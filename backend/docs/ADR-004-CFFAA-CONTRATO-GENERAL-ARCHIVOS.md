# ADR-004 — Contrato general de archivos CFFAA

## Estado

Aceptado para implementación incremental.

## Contexto

Mantto Gestor conserva archivos relacionados con diferentes entidades y tablas funcionales. Las tablas ya contienen datos históricos y llaves foráneas activas, por lo que una tabla maestra única introduciría riesgo de migración, pérdida de contexto y ruptura de relaciones.

También coexistían reglas distintas de tamaño, MIME, extensión, manejo de errores, compensación y eliminación de blobs.

## Decisión

1. Azure Blob Storage conserva el archivo físico privado.
2. Cada módulo conserva su tabla funcional de relaciones y metadatos.
3. Un contrato técnico común centraliza validación, carga, SAS, compensación y eliminación.
4. Los archivos nuevos deben llegar por `multipart/form-data` cuando cada módulo adopte su fase CFFAA correspondiente.
5. Las fallas de eliminación se registran en `storage_operaciones_pendientes` para reintento.
6. La tabla técnica de operaciones pendientes no reemplaza ni relaciona funcionalmente los archivos.
7. La SAS se generará bajo demanda en las fases específicas de cada módulo.

## Consecuencias

- Se conservan históricos, tablas y llaves foráneas existentes.
- Los módulos pueden migrarse uno por uno.
- Se normalizan respuestas `400`, `413`, `415` y `503`.
- Las eliminaciones fallidas dejan trazabilidad y pueden reintentarse.
- La validación de firma reduce archivos renombrados maliciosamente, pero no sustituye un antivirus.

## Fuera de alcance

- Unificación física de tablas.
- Migración automática de Glide, Drive o rutas locales.
- Antivirus o análisis de contenido profundo.
- Cambios visuales y funcionales propios de Home, Soporte, Prospección o Cotizaciones.

## Ampliación CFFAA-01E/F

8. La SAS no se emitirá desde un endpoint genérico que acepte un nombre de blob proporcionado por el cliente.
9. Cada módulo deberá resolver el registro por su identificador funcional y ejecutar una autorización explícita antes de llamar al servicio común.
10. El servicio común registrará la emisión de acceso sin almacenar ni imprimir la URL SAS.
11. Los diagnósticos de ciclo completo estarán desactivados en producción salvo activación temporal y requerirán rol Programador.
12. Las pruebas técnicas cargarán archivos únicamente en la ruta de diagnóstico y los eliminarán al finalizar; cualquier limpieza fallida se enviará a la cola técnica.
