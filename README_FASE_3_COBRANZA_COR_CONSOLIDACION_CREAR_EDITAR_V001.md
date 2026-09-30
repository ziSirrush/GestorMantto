# FASE 3 · COBRANZA COR · CONSOLIDACIÓN CREAR / EDITAR V001

Fecha de preparación: 30/09/2026  
Dominio: CORELLIAN  
Agrupación: Cobranza  
Módulo: Estados de Cuenta  
`main` revisado: `794a40e2afb909026f440e59fcd5858ae321209c` (`Version 092926.3`)

## Dependencias

Aplicar en orden:

1. **FASE 1 · REWORK GENERAL V001**;
2. **FASE 2 · REWORK EQUIPOS + HITOS V001**;
3. **esta FASE 3**.

El aplicador valida marcadores de Fase 1 y Fase 2 antes de modificar archivos. No sustituye esas fases.

## Objetivo

Cerrar técnicamente las plantillas **Crear / Editar Estado de Cuenta** antes de tocar el Detalle. Esta fase no agrega Facturas ni Pagos; deja el contrato limpio para que Fase 4 pueda construir `Hito/Aditiva → Factura → Pago` sin seguir mezclando responsabilidades dentro de `cobranza_fuente_cor`.

## Contrato final de Crear / Editar

### General

Se conserva lo implementado en Fase 1:

- PPNS como identidad/relación del Estado de Cuenta;
- Proyecto, Cliente y Contractual como datos funcionales editables;
- Fondo de Garantía;
- IVA general `0 / 8 / 16`;
- N Partidas MXN / USD / EUR, permitiendo varias de una misma moneda;
- bases 100% por moneda antes de IVA.

En Crear, Proyecto y Cliente continúan precargándose desde `ins_fl`, pero **ya no quedan bloqueados ni el backend los vuelve a sobrescribir al guardar**. Proyecto puede quedar vacío; PPNS sigue siendo obligatorio por ser la llave funcional de relación.

El seguro/código maestro para modificar IVA **NO se implementa todavía**, conforme a lo acordado.

### Equipos

Se conserva Fase 2:

- fuente visual `log_ops.ph_ns`;
- solo IDs `Pxxxxx`;
- separados por comas;
- normalizados y sin duplicados;
- sin Alineación manual;
- sin Ubicación/Torre duplicada.

### Hitos

Campos que permanecen en Crear / Editar:

- Orden hito;
- Hito / Condición;
- %;
- Año;
- Moneda;
- Subtotal automático;
- IVA automático;
- Total automático;
- Factura **solo lectura**;
- Fecha vencimiento;
- Días vencimiento;
- Estimado pago;
- Fecha programada;
- Fecha notificada;
- Acciones.

La moneda continúa limitada a las Partidas de General y los Hitos deben sumar 100% por cada moneda activa.

### Campos que salen de la edición del Hito

Ya no se capturan desde Crear/Editar:

- `pago_total`;
- `estatus_factura`;
- `fecha_pago`;
- `estatus_vencimiento`;
- `estatus_hito`.

También **Factura no puede escribirse manualmente**. Se mantiene visible únicamente como referencia y se poblará posteriormente desde las Facturas relacionadas.

El backend de esta fase tampoco acepta esos campos como parte de la mutación normal del Hito. Esto evita que una llamada directa a la API reintroduzca la mezcla que la interfaz ya eliminó.

## Compatibilidad con Estados de Cuenta existentes

No se borra ni migra automáticamente información legacy. Si una fila actual de `cobranza_fuente_cor` ya tiene:

- factura;
- pago total;
- estatus de factura;
- fecha de pago;
- estatus de vencimiento;
- estatus de hito;

esos valores **se siguen leyendo/serializando para el Detalle actual, pero Guardar desde Crear/Editar no los sobrescribe ni los pone en NULL**.

Esta es una decisión deliberada para que Fase 4 pueda migrar/relacionar Facturas y Pagos sin pérdida de información.

## Identificadores preparados para Fase 4

No se crea una tabla de relación prematuramente. Ya existen identificadores estables:

- Hito: `cobranza_fuente_cor.id_fuente_cor`;
- Aditiva: `cobranza_aditivas_cor.id_aditiva_cor`.

Fase 4 deberá usar esos IDs como anclas al diseñar Facturas.

## Base de datos

**Fase 3 no requiere DDL.**

Incluye únicamente SQL de lectura:

- `00_PRECHECK_COBRANZA_COR_REWORK_FASE_3_CONSOLIDACION_V001.sql`;
- `01_SMOKE_READ_COBRANZA_COR_REWORK_FASE_3_CONSOLIDACION_V001.sql`.

El smoke cuantifica valores legacy para confirmar que existen antes de Fase 4; no los modifica.

## Archivos funcionales modificados

- `backend/src/modules/cobranza-cor/cobranza-cor.service.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css`
- `core/module-loader.js`
- `index.html`

No modifica:

- `modules/cobranza-cor/cobranza-cor-estados-cuenta.js` (Detalle/Main);
- repository/controller/routes funcionales;
- Aditivas;
- tablas de Facturas/Pagos, porque aún no existen en esta fase.

## Consolidación de pruebas

Fases 1 y 2 cambiaron reglas que dejaron pruebas históricas con expectativas antiguas (Alineación PHNS, campos de pago dentro del Hito y cache-bust anteriores). Fase 3 actualiza esos contratos de prueba para que el conjunto acumulado represente la definición funcional ya cerrada.

Se actualizan localmente:

- `tests/cobranza-cor-estados-cuenta-fase1-general.test.js`;
- `tests/cobranza-cor-estados-cuenta-fase2-equipos-hitos.test.js`;
- `tests/cobranza-cor-estados-cuenta-crud-form.test.js`;
- `tests/cobranza-cor-estados-cuenta-phns-alineacion.test.js`;
- `tests/cobranza-cor-estados-cuenta-responsive.test.js`.

Y se agrega:

- `tests/cobranza-cor-estados-cuenta-fase3-consolidacion.test.js`.

El aplicador protege los tests de Fase 1/2 mediante SHA-256 exacto antes de reemplazarlos y protege los tests existentes del repo mediante blob Git validado.

## Aplicación local

Con Fase 1 y Fase 2 ya aplicadas:

```powershell
$REPO="C:\Users\T14s\Downloads\mantto_gestor_frontend"
& ".\APLICAR_FIX_LOCAL.ps1" -Repo $REPO
```

El aplicador:

1. valida `.git`;
2. valida blobs de `main` de los archivos controlados;
3. valida marcadores de Fase 1 y Fase 2;
4. valida SHA exacto de los tests generados por Fase 1 y Fase 2;
5. rechaza doble aplicación;
6. aplica transformaciones exactas;
7. actualiza pruebas acumuladas;
8. ejecuta `node --check`;
9. ejecuta las pruebas de Fase 1, 2 y 3 más CRUD/PHNS/responsive;
10. ejecuta `git diff --check`;
11. ante cualquier fallo restaura todos los archivos tocados.

## Validación manual posterior

1. Crear: seleccionar PPNS y confirmar que Proyecto/Cliente se precargan pero pueden editarse.
2. Editar: confirmar que Proyecto/Cliente/Contractual son manipulables.
3. Confirmar Partidas e IVA de Fase 1.
4. Confirmar IDs de Equipos desde `log_ops.ph_ns`, sin Alineación/Ubicación.
5. Confirmar Hitos con 100% por moneda y cálculos automáticos.
6. Confirmar que Factura se ve pero no se puede editar.
7. Confirmar que no aparecen Pago total, Estatus factura, Fecha pago, Estatus vencimiento ni Estatus hito.
8. Guardar un Estado de Cuenta existente con datos legacy y comprobar mediante SQL/Detalle que esos campos legacy no fueron limpiados por la edición.

## Validaciones y límites de esta entrega

- `main` revisado: **sí**, `794a40e...`.
- archivos de Cobranza COR relevantes: mismos blobs funcionales que la base usada por Fases 1/2.
- Aiven live: **NO modificado / NO se ejecutó SQL**.
- E2E contra backend desplegado: **NO ejecutado**.
- GitHub: **sin cambios**.
- Azure: **sin cambios**.
- Netlify: **sin cambios**.

No puedo confirmar el comportamiento contra datos live hasta ejecutar los PRECHECK/SMOKE en Aiven y hacer la prueba manual posterior.
