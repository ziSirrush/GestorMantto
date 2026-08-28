# FASE 6 — Alcances globales + Panel de Control V001

## Objetivo

Integrar las Fases 1–5 sin crear tablas nuevas y separar formalmente los tres motores de alcance:

- `GENERAL` → `alcance_gnral` (por defecto: creado/asignado/relacionado).
- `CORELLIAN` → `alcance_cor` (personas visibles).
- `UNITED` → `alcance_uni` (Zonas Operativas activas).

La empresa del motor se obtiene de `perm_agrupaciones.empresa`, no de la empresa del usuario.

## Archivos nuevos/modificados

- `backend/src/services/alcance/alcance-panel.service.js` **nuevo**
- `backend/src/services/alcance/alcance-resolver.service.js` **modificado**
- `backend/src/services/alcance/informacion-cruzada.service.js` **modificado**
- `backend/src/middleware/information-access-gnral.middleware.js` **modificado**
- `backend/src/services/information-record-scope-gnral.service.js` **modificado**
- `backend/src/controllers/panel-control-alcance.controller.js` **modificado**
- `APLICAR_FASE_6_PANEL_ALCANCES_V001.js` **nuevo, aplicador protegido del frontend**
- `backend/scripts/test-fase-6-alcances.js` **nuevo**

No se modifica SQL ni se crean tablas/columnas.

## Regla final del Guard humano

Orden obligatorio:

1. Usuario efectivo (`contextUser` si existe Viewer).
2. Permiso funcional efectivo.
3. Puerta de información de la agrupación.
4. Motor según `perm_agrupaciones.empresa`.
5. Alcance de registro:
   - GENERAL: relación directa.
   - CORELLIAN: personas visibles.
   - UNITED: Zona Operativa.
6. Consulta/acción.

Si existe llave maestra `DOMINIO_COMPLETO`, la llave abre puerta y elimina el filtro de personas/zona del dominio, pero **nunca sustituye el permiso funcional**.

## Panel de Control > Alcance

El contrato nuevo permite guardar simultáneamente:

### GENERAL

No requiere configuración manual. Siempre se presenta como alcance por relación directa.

### CORELLIAN

- Llave maestra Corellian.
- Puertas/agrupaciones Corellian.
- Propio (siempre).
- `REPORTA_A`.
- `REL_ADMIN`.
- Usuarios adicionales (solo Programador, conservando la restricción existente).

### UNITED

- Llave maestra United.
- Puertas/agrupaciones United.
- Zonas Operativas activas.

Las zonas se leen/escriben en la fuente ya existente `usuario_zop` + `z_op`. No se crea una tabla paralela.

## Compatibilidad de despliegue

Los endpoints existentes se conservan:

- `GET /api/panel-control/usuarios/:id/alcance-informacion`
- `PUT /api/panel-control/usuarios/:id/alcance-informacion`
- `PUT /api/panel-control/usuarios/alcance-informacion/masivo`

El GET devuelve el contrato F6 y también los campos legacy temporales (`dominios_completos`, `agrupaciones`, etc.). Un frontend anterior puede convivir durante el despliegue gradual.

## Información cruzada

`informacion-cruzada.service.js` queda corregido para validar por bloque hijo:

1. permiso funcional;
2. puerta del bloque;
3. alcance del registro/contexto del bloque;
4. carga del bloque.

El acceso al detalle padre no hereda acceso al hijo.

Regla de Chats: el alcance decide si el usuario puede abrir el hilo. Si puede abrirlo, el historial completo del hilo se conserva y se muestra; no se filtran mensajes históricos por participante.

## Migración central

Los módulos que ya consumen `information-access-gnral.middleware.js` y los guards de `information-record-scope-gnral.service.js` cambian de motor sin reescribir sus rutas:

- CORELLIAN deja de depender de lógica United y usa personas visibles.
- UNITED deja de usar supervisor/superintendente como alcance global y usa `zona_id` mediante `alcance_uni`.
- Los detalles ya protegidos por los guards de Ticket/Proyecto/Equipo reciben el nuevo contexto.

### Límite deliberado de esta fase

Esta Fase 6 **no reescribe los handlers internos de módulos en Nevera ni los handlers legacy que todavía hacen consultas mixtas dentro de una sola función**. El servicio de información cruzada ya impone el contrato correcto, pero cada detalle mixto legacy deberá consumirlo cuando ese módulo se migre/intervenga.

Por lo tanto, no se declara que todos los handlers legacy del repositorio hayan quedado filtrados internamente solo por instalar esta fase. La Fase 6 integra el núcleo y el Panel sin realizar una refactorización masiva contraria a la Constitución del proyecto.

## M2M / Sync

No se modifica ningún endpoint de integración. `sync`, M2M y webhooks permanecen fuera del Guard humano y continúan usando su autenticación de integración.

## Aplicación

Requiere que Fases 1, 2, 3, 4 y 5 estén aplicadas.

1. Copiar los archivos `backend/` de esta fase sobre el proyecto.
2. Desde la raíz del repositorio ejecutar:

```powershell
node .\APLICAR_FASE_6_PANEL_ALCANCES_V001.js
```

El aplicador del frontend valida el Git blob exacto de `modules/panel-control/panel-control.js` antes de tocarlo. Si la base cambió, se detiene sin modificar el archivo.

3. Validar:

```powershell
node --check backend\src\services\alcance\alcance-panel.service.js
node --check backend\src\services\alcance\alcance-resolver.service.js
node --check backend\src\services\alcance\informacion-cruzada.service.js
node --check backend\src\middleware\information-access-gnral.middleware.js
node --check backend\src\services\information-record-scope-gnral.service.js
node --check backend\src\controllers\panel-control-alcance.controller.js
node backend\scripts\test-fase-6-alcances.js
```

## Validaciones realizadas al generar el FIX

- `node --check` en todos los JS entregados: OK.
- Prueba funcional de resolver de puertas: OK.
- GENERAL default: OK.
- CORELLIAN por puerta/personas: OK.
- UNITED por zonas: OK.
- Puente de filtros de Portafolio/Tickets United: OK.
- Puente `ins_fl` Corellian: OK.
- Información cruzada: permiso → puerta → registro: OK.
- Llave maestra no sustituye permiso funcional: OK.
- Aplicador frontend probado sobre fixture sintético y validación del JS resultante: OK.

No se ejecutó prueba runtime contra Aiven ni contra el backend desplegado; esa confirmación requiere despliegue en el ambiente del proyecto.
