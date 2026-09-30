# FASE 4 · COBRANZA COR · DETALLE + FACTURAS V001

Fecha de preparación: 30/09/2026  
Dominio: CORELLIAN  
Agrupación: Cobranza  
Módulo: Estados de Cuenta  
`main` revisado: `794a40e2afb909026f440e59fcd5858ae321209c` (`Version 092926.3`)

## Dependencias

Aplicar en orden:

1. **FASE 1 · REWORK GENERAL V001**;
2. **FASE 2 · REWORK EQUIPOS + HITOS V001**;
3. **FASE 3 · CONSOLIDACIÓN CREAR / EDITAR V001**;
4. **esta FASE 4**.

El aplicador valida marcadores de Fases 1–3. No sustituye las fases previas.

## Objetivo

Cerrar el primer rework del **Detalle del Estado de Cuenta** agregando la entidad compartida **Facturas** sin mezclarla nuevamente dentro de Hitos/Aditivas.

La línea queda:

`Hito -> Factura -> Pago`  
`Aditiva -> Factura -> Pago`

En esta fase se implementa hasta **Factura**. La fuente de Pagos todavía no fue definida, por lo que esta entrega **no crea, no lee y no simula una tabla de Pagos**.

## Comportamiento

### Detalle

Se conserva el Estado de Cuenta actual y se agrega debajo una **Tabla de Facturas**.

La tabla:

- solo aparece en el **Detalle** de un Estado de Cuenta ya creado;
- no aparece en Crear;
- no aparece en Editar;
- muestra Facturas relacionadas a Hitos y Aditivas en una sola tabla;
- permite **crear** un registro de Factura;
- no agrega edición/borrado de Facturas en esta fase.

### Relación

Cada registro nuevo se relaciona con exactamente un concepto:

- `HITO` -> `cobranza_fuente_cor.id_fuente_cor`; o
- `ADITIVA` -> `cobranza_aditivas_cor.id_aditiva_cor`.

También se guarda `ppns` para alcance/consulta del Estado de Cuenta. El backend valida que el concepto seleccionado pertenezca al PPNS autorizado antes de insertar.

**No se ha definido todavía si una misma Factura real podrá repartir su importe entre varios Hitos/Aditivas.** Esta fase no inventa esa cardinalidad: cada registro representa una relación Factura-concepto. Si después se define Factura N:N, deberá normalizarse mediante una tabla de aplicaciones, no mediante inferencias silenciosas.

### Campos de Factura capturados

- Tipo: Hito / Aditiva;
- Concepto relacionado;
- Factura/folio;
- Fecha factura;
- Moneda, tomada del concepto relacionado;
- Subtotal;
- IVA;
- Total = Subtotal + IVA cuando ambos componentes se capturan;
- Estatus factura: `NULL / No pagado / Pagado`;
- Fecha vencimiento.

`estatus_cobranza` existe en la nueva tabla para el catálogo acordado `NULL / En Tiempo / En Cobranza / Cobrado / Vencido`, pero **Fase 4 no lo calcula**. Queda `NULL` hasta integrar la fuente real de Pagos; calcularlo ahora produciría falsos estados porque todavía no existe la relación Factura -> Pago en el Gestor.

### Factura en Hitos de Crear/Editar

La columna Factura permanece **solo lectura**. Fase 4 cambia su fuente de presentación:

- si existen Facturas HITO en `cobranza_facturas_cor`, muestra los folios relacionados, separados por coma;
- si aún no existen relaciones nuevas, conserva la referencia legacy que ya se leía desde FUENTE.

Guardar Crear/Editar continúa sin escribir manualmente la Factura.

## Nueva tabla aprobada

Se crea `cobranza_facturas_cor` porque la estructura vigente no puede representar correctamente una entidad Factura compartida por Hitos/Aditivas y posteriormente relacionable con Pagos sin mezclar responsabilidades en `cobranza_fuente_cor` o `cobranza_aditivas_cor`.

No se crea `cobranza_pagos_cor` en esta entrega.

## Migración legacy conservadora

El SQL migra referencias de factura existentes desde:

- `cobranza_fuente_cor.factura` -> tipo `HITO`;
- `cobranza_aditivas_cor.factura` -> tipo `ADITIVA`.

Reglas de seguridad:

- el texto legacy se conserva completo; **no se divide por comas** porque no se puede confirmar si el valor representa uno o varios folios;
- no se infiere el monto de una Factura a partir del monto total del Hito/Aditiva;
- no se migra `fecha_pago` ni `pago_total` a Facturas, porque pertenecen a la futura línea de Pagos;
- el estatus legacy de Hito solo se migra si es exactamente `No pagado` o `Pagado`;
- Aditivas no reutiliza `estatus_cobranza` como `estatus_factura`, porque son semánticas distintas.

## Orden SQL

Ejecutar manualmente en Aiven, después de validar el resultado de cada paso:

1. `00_PRECHECK_COBRANZA_COR_REWORK_FASE_4_FACTURAS_V001.sql` — solo lectura.
2. `01_BACKUP_COBRANZA_COR_REWORK_FASE_4_FACTURAS_V001.sql` — crea respaldos puntuales.
3. `02_CREAR_COBRANZA_COR_REWORK_FASE_4_FACTURAS_V001.sql` — crea `cobranza_facturas_cor`.
4. `03_MIGRAR_LEGACY_COBRANZA_COR_REWORK_FASE_4_FACTURAS_V001.sql` — migra referencias legacy de forma conservadora.
5. `04_SMOKE_COBRANZA_COR_REWORK_FASE_4_FACTURAS_V001.sql` — solo lectura.

`99_ROLLBACK...sql` elimina únicamente la nueva tabla y conserva los respaldos. No debe ejecutarse después de capturar nuevas Facturas que deban conservarse.

## Archivos funcionales modificados por el aplicador

- `backend/src/modules/cobranza-cor/cobranza-cor.repository.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.service.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.controller.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.routes.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta.css`
- `core/module-loader.js`
- `index.html`

También actualiza pruebas acumuladas y agrega el test de Fase 4.

## Seguridad / alcance

- reutiliza el Guard actual de `COBRANZA_ESTADOS_CUENTA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`;
- reutiliza el alcance CORELLIAN existente por PPNS;
- el Visor de Usuarios continúa en solo lectura;
- el backend vuelve a validar que Hito/Aditiva pertenezcan al PPNS antes del INSERT;
- los IDs técnicos y columnas de control no son editables desde la UI.

## Aplicación local

Con Fases 1–3 aplicadas:

```powershell
$REPO="C:\Users\T14s\Downloads\mantto_gestor_frontend"
& ".\APLICAR_FIX_LOCAL.ps1" -Repo $REPO
```

El aplicador:

1. valida `.git` y los blobs de `main` usados como base;
2. valida marcadores de Fases 1, 2 y 3;
3. valida SHA-256 exacto de las pruebas acumuladas entregadas por Fase 3;
4. exige archivos no tocados por fases previas limpios antes de modificar Detail/controller/routes;
5. aplica transformaciones exactas;
6. actualiza tests de regresión afectados por cache-bust/contrato;
7. agrega SQL, README y test F4;
8. ejecuta `node --check`;
9. ejecuta pruebas F1/F2/F3/F4 + CRUD/PHNS/responsive;
10. ejecuta `git diff --check`;
11. ante fallo restaura todos los archivos tocados.

## Validación manual posterior

1. Crear/Editar: confirmar que NO aparece tabla/formulario de Facturas.
2. Abrir Detalle de un PPNS existente.
3. Confirmar tabla Facturas debajo del Estado de Cuenta actual.
4. Crear una Factura ligada a un Hito.
5. Recargar: confirmar la fila y que el Hito muestra el folio relacionado.
6. Crear una Factura ligada a una Aditiva.
7. Confirmar que ambas aparecen en la misma tabla con Tipo/Concepto correcto.
8. Probar un usuario fuera de alcance: la creación debe fallar cerrado.
9. Probar Visor de Usuarios: no debe ofrecer creación y el backend debe rechazar POST.
10. Ejecutar el smoke SQL y confirmar 0 relaciones huérfanas.

## Límites verificables de esta entrega

- `main` revisado: **sí**, `794a40e2afb909026f440e59fcd5858ae321209c`.
- cambios de Cobranza COR de ese commit respecto a la base anterior: ninguno; el commit solo cambió Runner/Prueba de carga.
- Aiven live: **NO modificado**.
- SQL F4: **NO ejecutado contra Aiven live**.
- GitHub: **NO modificado**.
- Azure: **NO modificado**.
- Netlify: **NO modificado**.
- E2E con Factura real/pago real: **NO ejecutado**.

No puedo confirmar el esquema live de Aiven ni la cardinalidad Factura N:N hasta ejecutar el PRECHECK y cerrar esa regla de negocio. El paquete falla cerrado donde esa información sería necesaria.
