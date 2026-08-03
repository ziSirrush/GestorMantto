# ADR-003 - Azure Blob Storage para archivos de Mantto Gestor

Estado: Aprobado para Fase 3 backend
Fecha: 2026-08-03

## Contexto

Mantto Gestor tiene varias tablas de adjuntos con relaciones y columnas distintas. Unificarlas fisicamente obligaria a migrar llaves foraneas, consultas y modulos activos o en Nevera.

## Decision

- Azure Blob Storage guarda el archivo fisico.
- Aiven conserva la relacion funcional y los metadatos en la tabla propia de cada modulo.
- Se centraliza el servicio de almacenamiento, no las tablas.
- El contenedor es privado.
- El backend usa Managed Identity y Microsoft Entra ID.
- La base guarda `storage_provider`, `storage_container`, `storage_blob_name` y una URL base privada cuando la tabla lo permite.
- Las URL SAS se generan bajo demanda y no se persisten porque expiran.
- Los registros historicos de Glide, Drive o almacenamiento local continuan siendo compatibles durante la migracion gradual.

## Consecuencias

- No se rompen llaves foraneas existentes.
- Cada modulo puede migrarse por separado.
- La logica de Azure queda reutilizable.
- Los permisos funcionales de apertura y eliminacion se validaran en cada integracion modular.
