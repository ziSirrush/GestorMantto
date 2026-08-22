# FIX F3/F4 — Tickets · permiso↔puerta + identificadores V001

## Base verificada

- Repositorio: `JIVMBLT/updated_code`
- Rama: `main`
- Commit base: `e4484459c67860351fb146d28fe17c05ebf7468c`
- Mensaje: `fix FASES DE ALCANCE 1 - 11 . 0`

## Objetivo
Corregir exclusivamente los hallazgos de Fase 3 y Fase 4 de Tickets:

1. impedir que un permiso funcional de una agrupación se combine con la puerta de otra;
2. alinear el detalle de Ticket con los cuatro identificadores que ya reconoce el record-scope.

Experimental no participa en este flujo. No se crean permisos, agrupaciones, tablas ni columnas.

## Archivos modificados

- `backend/src/middleware/information-access-gnral.middleware.js`
- `backend/src/modules/tickets/tickets.routes.js`
- `backend/src/modules/tickets/tickets-consultas_uni.js`

## Archivos nuevos de validación/documentación

- `backend/scripts/test-fix-f3-f4-tickets-paired-access.js`
- `ADR_FIX_F3_F4_TICKETS_PERMISO_PUERTA_EMPAREJADOS_V001.md`
- `README_FIX_F3_F4_TICKETS_PERMISO_PUERTA_ID_V001.md`
- `CHECKSUMS_FIX_F3_F4_TICKETS_PERMISO_PUERTA_ID_V001.sha256`

## Cambio 1 — Guard General emparejado

Se agrega una opción opt-in:

```js
{
  domain: 'UNITED',
  groupingPermissionPairsAny: [
    { groupingCode: 'OPERACION', permissionCodesAny: [...] },
    { groupingCode: 'PORTAFOLIO', permissionCodesAny: [...] }
  ]
}
```

El Guard evalúa cada par de forma atómica:

`permiso del par -> puerta del mismo par -> alcance de esa agrupación`

No se permite mezclar esta modalidad con `permissionCode/permissionCodesAny` o `groupingCode/groupingCodesAny` globales dentro del mismo Guard.

El modo histórico continúa disponible para todas las rutas no migradas.

### Caso que ahora falla cerrado

```text
Permiso PORTAFOLIO = sí
Puerta PORTAFOLIO  = no
Puerta OPERACION   = sí
Permiso OPERACION  = no
```

Resultado: `403 INFORMATION_ACCESS_DENIED`.

La puerta Operación ya no puede completar el permiso Portafolio.

## Cambio 2 — Tickets F3/F4

Lista y detalle usan solo pares:

- Operación + permisos Operación.
- Portafolio + permiso Portafolio.

Se eliminan de estas rutas:

- agrupación `EXPERIMENTAL`;
- permisos `*_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`.

Esto no modifica otros módulos Experimental.

## Cambio 3 — Identificadores de Detalle Ticket

`getTicketDetalle_uni()` ahora busca por:

```sql
TRIM(COALESCE(t.ticket, '')) = ?
OR CAST(t.id AS CHAR) = ?
OR TRIM(COALESCE(t.folio, '')) = ?
OR TRIM(COALESCE(t.id_interno, '')) = ?
```

Después aplica el mismo `buildTicketScopeSql_gnral()` territorial.

La zona visible continúa canonizada por la estructura Portafolio -> `zona_id` -> `z_op`.

## No se modifica

- frontend;
- Aiven / esquema SQL;
- `usuario_zop`;
- reglas territoriales de cuartos UNITED;
- validación/Vo.Bo.;
- comentarios/chat;
- endpoints M2M `/tickets/sync` y `/tickets/sync-fechas-cdmx`;
- módulos Experimental.

## Validaciones realizadas

- `node --check` sobre todos los `.js` del FIX: OK.
- prueba automática `test-fix-f3-f4-tickets-paired-access.js`: OK.
- prueba negativa permiso Portafolio + puerta Operación: rechazada.
- prueba positiva Portafolio + Portafolio: autorizada.
- prueba positiva Operación + Operación: autorizada.
- puerta sin permiso funcional: rechazada.
- compatibilidad del modo histórico del Guard: validada.
- detalle: cuatro identificadores y orden de parámetros de alcance: validado con mock.
- ZIP y checksums: validar antes de entrega.

## Prueba runtime recomendada

Después de aplicar el FIX:

1. usuario con permiso Tickets Portafolio pero sin puerta Portafolio y con puerta Operación: `/api/tickets` debe devolver 403;
2. mismo usuario con puerta Portafolio válida: debe entrar y conservar filtro por sus `usuario_zop`;
3. abrir un detalle usando `ticket`, `id`, `folio` e `id_interno`; todos deben resolver el mismo contrato de seguridad;
4. confirmar que ningún resultado salga de los cuartos UNITED autorizados.

## Límite de verificación

La revisión se hizo contra el código actual de `main` y con pruebas locales/mocks. **No puedo confirmar el comportamiento runtime contra Aiven/Railway** hasta desplegar/aplicar el FIX y ejecutar las pruebas autenticadas en el entorno real.
