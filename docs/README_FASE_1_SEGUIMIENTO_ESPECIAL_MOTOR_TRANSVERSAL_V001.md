# FASE 1 — Seguimiento Especial · Motor transversal UNITED V001

## Base revisada

- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit base verificado: `ed6d9d7e552b387cd0a6e0d2928786861b12c73c`
- `backend/src/services/notifications/notification.service.js` base blob: `f6c215656e71db6ed83f6c23ba8d3b4cabe202fa`
- `backend/package.json` base blob: `564c39e99319b6834715419b07f5d7be36ce69b1`

## Objetivo

Corregir la frontera de autorización de Seguimiento Especial. Un follower que ya fue autorizado por el resolver UNITED no debe ser descartado después por no tener un rol asociado al evento nativo.

## Regla aplicada

- Destinatario normal: conserva matriz de roles, alcance y preferencias actuales.
- Follower autorizado: recibe el mismo evento nativo sin volver a depender de rol.
- Follower autorizado: campana + push activos.
- Normal + follower: una sola notificación, con `SEGUIMIENTO_ESPECIAL` para resolver `⭐` desde `estados_visuales`.
- Actor excluido: se conserva la exclusión actual.
- Fuera de UNITED o sin autorización real de seguimiento: no se amplía acceso.

## Archivos

### Modificados

- `backend/src/services/notifications/notification.service.js`
- `backend/package.json`

### Nuevos de validación/documentación

- `validation/seguimiento-especial-fase1-sin-rol.test.js`
- `ADR_20260914_SEGUIMIENTO_ESPECIAL_SUSCRIPCION_TRANSVERSAL_V001.md`
- `README_FASE_1_SEGUIMIENTO_ESPECIAL_MOTOR_TRANSVERSAL_V001.md`
- `MANIFEST_FASE_1_SEGUIMIENTO_ESPECIAL_MOTOR_TRANSVERSAL_V001.txt`
- `CHECKSUMS_FASE_1_SEGUIMIENTO_ESPECIAL_MOTOR_TRANSVERSAL_V001_SHA256.txt`

## Qué NO cambia

- No se modifica `portafolio_interes`.
- No se modifica el permiso de Seguimiento Especial.
- No se modifica el resolver de alcance UNITED/ZOP.
- No se modifica SQL.
- No se modifica el sync de Tickets.
- No se modifica el sync de Portafolio.
- No se crean eventos paralelos de Seguimiento Especial.
- No se agregan todavía productores/eventos faltantes de UNITED; eso corresponde a Fase 2.

## Validaciones ejecutadas en el entregable

### Validación estática

- `node --check backend/src/services/notifications/notification.service.js` → PASS.
- `node --check validation/seguimiento-especial-fase1-sin-rol.test.js` → PASS.
- `backend/package.json` parse JSON → PASS.

### Prueba local dirigida

`node --test validation/seguimiento-especial-fase1-sin-rol.test.js`

Resultado: **6/6 PASS**.

Casos cubiertos:

1. follower sin rol nativo recibe el evento UNITED;
2. destinatario normal sin rol sigue bloqueado;
3. normal + follower recibe una sola entrega con `SEGUIMIENTO_ESPECIAL`;
4. follower autorizado no depende de la zona top-level de la matriz nativa;
5. `requireRoleMatrix` sin matriz conserva la entrega al follower y bloquea únicamente al destinatario nativo.
6. la exclusión nativa del actor se conserva aunque el actor sea follower.

## Estado de validación

- Validación estática: PASS.
- Prueba local dirigida: PASS 6/6.
- Suite completa del repositorio: **no ejecutada en este entorno porque no existe un checkout completo del repositorio en `/mnt/data`**.
- Prueba contra Aiven: no ejecutada.
- E2E real campana/push: no ejecutada.
- Desplegado: no.

## Instalación

Copiar el contenido del ZIP sobre la raíz del repositorio conservando rutas. Después ejecutar desde `backend`:

```powershell
npm run check
npm test
```

No aplicar SQL para esta fase.

## Dependencia de Fase 2

Fase 1 corrige el motor central. Fase 2 debe revisar todos los productores UNITED y garantizar que cada evento asociado a Proyecto/Equipo entregue `contextoSeguimiento` suficiente para que esta capa transversal pueda operar.
