# FASE 2 · EQUIPO SALE DE CRÍTICO · U35 AUTOMÁTICO V001

## Objetivo
Completar `EQUIPO_SALE_DE_CRITICO` para que también se genere cuando un equipo deja de cumplir criticidad **solo por el avance de la ventana U35**, aunque ningún Ticket haya sido modificado.

Regla conservada:

`>= 3 fallas BLT en U35` → `< 3 fallas BLT en U35`.

## Prerrequisito
Debe estar aplicada **Fase 1 · EQUIPO_SALE_DE_CRITICO · NOTIFICACIONES V001**, incluida la alta del evento `EQUIPO_SALE_DE_CRITICO` y su configuración de Roles/Política desde Panel de Control.

## Base verificada
- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit: `f69aa5d40796c5976cf8d59eb6f6f99dbd930299`
- Mensaje: `Version 092826.3`
- `backend/src/bootstrap.js` base Git blob SHA: `fbaaef45baea0e0aa99ced4c08aa8404e7ab27e5`

## Funcionamiento
El job reconstruye diariamente dos ventanas sobre los mismos Tickets actuales:

### Ayer
Cuenta BLT entre:

`ayer - 35 días` y `< ayer + 1 día`.

### Hoy
Cuenta BLT entre:

`hoy - 35 días` y `< hoy + 1 día`.

Solo entra al resultado:

- `fallas_blt_antes >= 3`;
- `fallas_blt_despues < 3`.

Por tanto:

- 3 → 2: notifica;
- 4 → 2: notifica;
- 4 → 3: no notifica;
- 3 → 3: no notifica;
- 2 → 1: no notifica.

## Scheduler
Default:

- `00:10` CDMX;
- `America/Mexico_City`;
- chequeo cada 60 segundos;
- recuperación del último día vencido al iniciar;
- backoff de 5 minutos después de error.

Variables opcionales:

```text
CRITICOS_SALIDA_U35_ENABLED=true
CRITICOS_SALIDA_U35_TZ=America/Mexico_City
CRITICOS_SALIDA_U35_HOUR=0
CRITICOS_SALIDA_U35_MINUTE=10
CRITICOS_SALIDA_U35_INTERVAL_MS=60000
```

## Notificación
Código:

`EQUIPO_SALE_DE_CRITICO`

Título:

`Equipo dejó de ser crítico`

Mensaje:

`Se generó salida automática de condición crítica · <Proyecto - Referencia>. Actualmente registra <N> fallas BLT en los últimos 35 días.`

La notificación usa:

- Evento → Rol Principal;
- política `OBLIGATORIA` / `OPCIONAL` existente;
- ZOP del equipo;
- preferencias personales cuando aplique;
- deduplicación central;
- Seguimiento Especial como capa adicional cuando el equipo esté seguido.

## Navegación
Como no existe un Ticket causante:

- acción: `ABRIR_MODULO`;
- ruta: `criticos`.

Fase 1 mantiene `ABRIR_TICKET` en su emisión porque allí sí existe un Ticket disparador.

## Archivos modificados
- `backend/src/bootstrap.js`

## Archivos nuevos
- `backend/src/jobs/equiposCriticosSalidaU35.job.js`
- `sql/PRECHECK_EQUIPO_SALE_DE_CRITICO_FASE_2_V001.sql`
- `sql/APLICAR_EQUIPO_SALE_DE_CRITICO_FASE_2_V001.sql`
- `sql/VALIDAR_EQUIPO_SALE_DE_CRITICO_FASE_2_V001.sql`
- `sql/ROLLBACK_EQUIPO_SALE_DE_CRITICO_FASE_2_V001.sql`
- `validation/equipo-sale-critico-fase2.test.js`
- `docs/ADR_20260929_EQUIPO_SALE_DE_CRITICO_FASE_2_V001.md`
- `docs/README_FASE_2_EQUIPO_SALE_DE_CRITICO_U35_AUTOMATICO_V001.md`
- `docs/MANIFEST_FASE_2_EQUIPO_SALE_DE_CRITICO_U35_AUTOMATICO_V001.txt`
- `docs/CHECKSUMS_FASE_2_EQUIPO_SALE_DE_CRITICO_U35_AUTOMATICO_V001_SHA256.txt`

## SQL de Fase 2
No crea tablas ni eventos ni matriz Evento → Rol.

`APLICAR` solo actualiza el catálogo del evento existente para que su descripción incluya ambas fuentes de salida y deja como default general `ABRIR_MODULO / criticos`.

## Orden recomendado
1. Confirmar Fase 1 aplicada.
2. Ejecutar `PRECHECK_EQUIPO_SALE_DE_CRITICO_FASE_2_V001.sql`.
3. Copiar `backend/src/jobs/equiposCriticosSalidaU35.job.js`.
4. Reemplazar `backend/src/bootstrap.js` con el archivo de esta fase.
5. Ejecutar `APLICAR_EQUIPO_SALE_DE_CRITICO_FASE_2_V001.sql`.
6. Reiniciar/desplegar backend.
7. Ejecutar `VALIDAR_EQUIPO_SALE_DE_CRITICO_FASE_2_V001.sql`.
8. Revisar logs `[CRITICOS_SALIDA_U35_RUN]` y una transición real U35.

## Rollback
1. Retirar el job y restaurar `bootstrap.js` anterior a Fase 2.
2. Ejecutar `ROLLBACK_EQUIPO_SALE_DE_CRITICO_FASE_2_V001.sql` para restaurar los defaults de catálogo de Fase 1.

El rollback no borra historial, no desactiva el evento y no modifica relaciones Evento → Rol.

## Validación realizada
- `node --check` job: PASS.
- `node --check` bootstrap: PASS.
- prueba Fase 2: 13/13 PASS.
- prueba Fase 1 repetida: 14/14 PASS.
- cadena Fase 1 + Fase 2: 27/27 PASS.
- comprobación del baseline de `bootstrap.js` por Git blob SHA: PASS.

## No ejecutado
- SQL contra Aiven: NO.
- Deploy Azure: NO.
- Push real: NO.
- Prueba E2E real a las 00:10: NO.

La entrega está validada estáticamente y mediante pruebas dirigidas locales; la emisión real debe confirmarse después del despliegue y configuración de matriz.
