# FASE 1 - INSTALACIONES · ADMINISTRACION - BACKEND V001

## Base verificada

- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit base: `d19fc8d575c7fe9d2a91c7630ea676180487c18e`
- Version: `Version 100826.2`
- Fecha de corte: 2026-10-08

## Objetivo

Preparar el backend humano del nuevo modulo **Instalaciones · Administracion** sobre la tabla existente `ins_fl`, sin crear tablas ni modificar esquema.

## Implementado

- Nuevo modulo backend `instalaciones-administracion` con patron `routes/controller/service/repository`.
- Contrato de **11 grupos funcionales / 93 campos operativos**.
- Lectura de contrato, busqueda, detalle por `id_ins_fl` y actualizacion parcial por grupo.
- Allowlist estricta por grupo: un campo no puede enviarse desde otro acordeon.
- `id_ins_fl`, `created_at`, `updated_at`: solo lectura.
- `id_proyecto` y `referencia_sitio`: bloqueados en Fase 1 por politica de identidad pendiente.
- `dias_restantes`, `dias_sin_visita`, `dias_sin_ccnr`, `meses_garantia_restantes`: bloqueados hasta decidir si seran calculados o editables.
- IDs de responsables validados como enteros positivos y contra usuarios activos antes de escribir.
- Actualizacion SQL solo de campos realmente modificados.
- Reutilizacion del alcance CORELLIAN existente mediante `ventas-visibility.service` / motor central vigente.
- Rutas registradas bajo `/api/instalaciones/administracion/...`.

## Seguridad de Fase 1

Las rutas estan **cerradas intencionalmente** con respuesta `503 / INSTALACIONES_ADMINISTRACION_PENDING_SECURITY` despues de `requireAuth`.

Motivo: Fase 2 debe definir y conectar los permisos reales y Auditoria. No se reutilizo un permiso no equivalente ni se invento un codigo de permiso para habilitar escrituras humanas.

Por tanto, esta entrega puede integrarse sin exponer una nueva mutacion operativa antes de terminar Fase 2.

## Endpoints preparados

```text
GET   /api/instalaciones/administracion/contrato
GET   /api/instalaciones/administracion/registros?q=...
GET   /api/instalaciones/administracion/registros/:id
PATCH /api/instalaciones/administracion/registros/:id/grupos/:grupo
```

Todos permanecen cerrados hasta Fase 2.

Formato previsto del PATCH:

```json
{
  "changes": {
    "campo_del_grupo": "valor"
  }
}
```

## Archivos

```text
backend/src/modules/instalaciones-administracion/instalaciones-administracion.constants.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.validation.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.controller.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js
backend/src/routes/index.js
tests/instalaciones-administracion-fase1-backend.test.js
```

## Base de datos

- No crea tablas.
- No crea columnas.
- No crea indices.
- No incluye SQL.
- Reutiliza `ins_fl`, `usuarios` y la infraestructura de alcance existente.

## Validaciones ejecutadas

Se ejecutan antes del empaquetado:

- `node --check` sobre todos los JS entregados.
- test automatizado de Fase 1.
- comprobacion de 11 grupos / 93 campos unicos.
- comprobacion del cierre fail-closed de rutas hasta Fase 2.
- comprobacion de que `backend/src/routes/index.js` solo agrega import y montaje del nuevo router.

No se realizo prueba contra Aiven ni prueba E2E porque las rutas quedan cerradas por diseno hasta Fase 2.

## Aplicacion

Extraer el ZIP sobre la raiz del repositorio y revisar:

```powershell
git status
git diff --check
git diff
```

No se requiere ejecutar SQL.

## Pendiente

- Fase 2: permisos y Auditoria.
- Fase 3: frontend base.
- Fase 4: formularios y guardado.
- Fase 5: integracion y QA.

## Sistemas no modificados por esta preparacion

No se modifico GitHub, Aiven, Azure, Netlify ni Google Sheets.

### Resultado de validacion de esta entrega

```text
node --check: PASS (todos los JS entregados)
node --test: 7/7 PASS
Contrato vs DB_FIELDS main: 93/93, sin faltantes ni extras
backend/src/routes/index.js base blob: ca98bb05c1262eb54eed6cf30e1c22116bd1963d
index.js modificado: solo 2 lineas agregadas (import + mount)
```
