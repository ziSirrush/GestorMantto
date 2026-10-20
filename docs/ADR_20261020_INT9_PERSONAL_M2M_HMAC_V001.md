# ADR — INT-9: recepción M2M/HMAC para alta de personal

- **Fecha:** 20/10/2026
- **Proyecto:** BLT NOW / Mantto Gestor
- **Módulo:** Instalaciones / Programación de Personal (INT-9)
- **Estado:** Propuesto y preparado localmente; no desplegado
- **Referencia de código:** `ziSirrush/GestorMantto`, `main` `7f497d121eb26ec6a121140a19c334c6e16d57ab`

## Contexto y problema

El POST `/api/instalaciones/programacion/personal` existe para usuarios humanos mediante JWT, permisos `VER` y `CREAR`, puerta de información de Instalaciones y dominio CORELLIAN. Google Apps Script firma solicitudes M2M/HMAC y no tiene la identidad de un usuario de `usuarios.id_SB`. La creación exige `actorId(req)` y anteriormente rechazaba M2M.

El middleware compartido `requireIntegrationAuthFor` ya está implementado y contempla firma sobre el cuerpo original; se reutiliza sin cambios.

## Decisión

Permitir **únicamente** el alta `POST /api/instalaciones/programacion/personal` por cualquiera de dos vías independientes:

1. **Humana:** JWT + Guard nativo + permiso CREAR; comportamiento inalterado.
2. **Técnica:** `requireIntegrationAuthFor('INTEGRATION_VENTAS_ID', { alwaysRequireAuth: true, algorithm: 'sha256' })`; exigir HMAC-SHA256 aun con `INTEGRATION_AUTH_ENABLED=false`.

Si aparecen encabezados M2M, la solicitud utiliza el camino técnico y falla cerrado si son inválidos o incompletos, sin fallback a JWT.

Se conserva la credencial existente de Ventas (`INTEGRATION_VENTAS_ID`, `INTEGRATION_VENTAS_SECRET`), como se solicitó, sin secretos hardcodeados ni tablas adicionales. No se concede a M2M acceso a edición, desactivación, asignaciones ni consultas GET.

El registro humano mantiene FKs `created_by`/`updated_by` del usuario autenticado. Una creación M2M deja ambas FKs en `NULL` (permitido por el DDL) y escribe en logs técnicos `integration_id`, `id_personal`, `tipo_personal`, sin PII ni secretos.

## Alternativas descartadas

- Emular un usuario `id_SB` fijo: suplantaría identidad y rompería trazabilidad real.
- Publicar el POST sin HMAC mientras el switch global está apagado: contradice la seguridad.
- Añadir una API masiva o crear nuevas tablas/columnas: innecesario para recibir una fila por POST y fuera del alcance solicitado.
- Modificar `integration-auth.middleware.js`: no necesario; ya soporta `alwaysRequireAuth`.

## Riesgos y condiciones pendientes

1. **Reutilización de identidad:** la clave de Ventas habilita también el alta de personal; cualquier poseedor legítimo de esa credencial hereda esta capacidad. Una separación futura requeriría autorización para una identidad técnica específica.
2. **Auditoría persistente:** las FKs humanas de los registros M2M son `NULL`. Solo se registra la identidad M2M en logs de Azure. No se incorpora en este cambio una auditoría duradera en Aiven; evaluar esta brecha de trazabilidad antes de una operación definitiva si así lo exige el control interno.
3. **Disponibilidad SQL:** no se confirma que el DDL INT-9 se haya ejecutado en Aiven ni que existan permisos de BD para insertar.
4. **Replay/idempotencia:** la firma usa ventana temporal; la unicidad existente rechaza reenvíos idénticos con 409. No ofrece idempotencia con respuesta 200 ni una tabla de deduplicación por mensaje.
5. **Despliegue:** ninguna modificación se ha ejecutado en GitHub, Azure, Netlify, Aiven o el GAS del usuario.

## Validaciones

Pruebas locales: 17/17 sobre middleware de autenticación real, ruta simulada y DB simulada; chequeo de sintaxis de archivos afectados. El flujo E2E autenticado Azure → Aiven y los permisos reales de las cuentas técnicas no están comprobados.

## Reversión

Restaurar exclusivamente los dos archivos JS modificados y retirar los dos archivos nuevos (prueba y ADR), antes del commit y tras comprobar que no hay otros cambios locales. No requiere SQL ni modificaciones de secretos.
