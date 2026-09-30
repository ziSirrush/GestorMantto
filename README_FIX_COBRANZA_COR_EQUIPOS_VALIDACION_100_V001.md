# FIX COBRANZA COR · EQUIPOS + VALIDACION 100% V001

**Fecha:** 30/09/2026  
**Modulo:** Cobranza CORELLIAN > Estados de Cuenta > Crear / Editar  
**Base GitHub validada:** `main` @ `4e89b8c9ac1977ad90de7ae06afa75fa53002010` (`Version 093026.5`)  
**Blob base formulario:** `e9e706be32b913e106358089bc118aa6a19a138f`

## Objetivo

Corregir dos incidencias observadas en Crear / Editar Estado de Cuenta:

1. Al seleccionar un proyecto/PPNS de Instalaciones, el bloque **Equipos del proyecto** podia quedar mostrando solamente los PHNS disponibles en `log_ops.ph_ns`, sin presentar las filas reales de equipos existentes en `ins_fl` para relacionarlas.
2. La regla de que los Hitos deben sumar exactamente **100% por cada moneda usada en General** ya estaba protegida en backend, pero no tenia una validacion visual suficiente en tiempo real en el formulario.

## Causa verificada

El backend vigente ya entrega al formulario:

- equipos del PPNS desde `ins_fl`;
- registros de `log_ops` del PPNS;
- relaciones existentes de `cobranza_equipos_cor`.

Sin embargo, el frontend vigente de la Fase 2/3 renderizaba el bloque de equipos a partir de los IDs normalizados encontrados en `log_ops.ph_ns`, en lugar de renderizar `state.equipos` proveniente de `ins_fl`. Ademas, el payload consolidado habia dejado `equipos=[]`, por lo que las relaciones no se enviaban de nuevo al backend.

La validacion exacta del 100% ya existe en backend mediante `applyHitoFinancialRules_cor()`: por cada moneda de General, si la suma de porcentajes no es 1.000000 dentro de la tolerancia vigente, el backend rechaza el guardado. Este FIX agrega la misma lectura visual al formulario y bloquea el boton Guardar antes de enviar cuando la regla no se cumple.

## Comportamiento corregido

### Equipos del proyecto

- La fuente principal de filas vuelve a ser **`ins_fl`**.
- Por cada equipo se muestra:
  - `Ref en sitio / identificador`;
  - PHNS relacionado;
  - origen de la fila.
- Los PHNS disponibles se leen exclusivamente de `log_ops.ph_ns`.
- Los PHNS se normalizan a mayusculas, se filtran al formato `P` + digitos y se eliminan duplicados para visualizacion/resumen.
- No se reintroduce la logica de **Alineacion PHNS**.
- No se usa `ubicacion_torre` para guardar la referencia: se envia `NULL` en este flujo.

### Relacion manual

Se agrega una captura manual de dos datos:

1. **Ref en sitio / identificador** del equipo.
2. **PHNS** de Logistica.

La referencia debe resolver a un equipo real del mismo PPNS ya existente en `ins_fl`. El PHNS se selecciona de los registros reales de `log_ops` del mismo PPNS.

Esto es intencional: el FIX permite una **relacion manual**, no crea equipos ficticios fuera de Instalaciones ni inventa una nueva entidad/columna. Si en el futuro se requiere dar de alta un equipo completamente ajeno a `ins_fl`, eso requiere una decision de modelo de datos independiente.

La persistencia mantiene el modelo existente:

`ins_fl.id_ins_fl` -> `cobranza_equipos_cor.id_ins_fl`  
`log_ops.id_log_ops` -> `cobranza_equipos_cor.id_log_ops`

Si un registro de `log_ops.ph_ns` contiene mas de un PHNS separado por comas, se muestran los IDs normalizados del registro. No se inventa una relacion a nivel de token individual porque la estructura vigente persiste `id_log_ops`.

### Validacion de porcentajes por moneda

Debajo del encabezado de Hitos se muestra el estado de cada moneda de General, por ejemplo:

- `USD 100% / 100% · Correcto`
- `MXN 95% / 100% · Falta 5%`
- `EUR 110% / 100% · Excede 10%`

La validacion se actualiza en tiempo real cuando cambia:

- porcentaje del Hito;
- moneda del Hito;
- alta/baja de Hitos;
- partidas de General.

El boton **Crear Estado de Cuenta / Guardar cambios** permanece deshabilitado mientras cualquier moneda de General no sume exactamente 100%.

El backend conserva la validacion dura existente, por lo que una peticion manipulada tampoco puede omitir esta regla.

## Archivos incluidos

Solo se incluyen archivos modificados o agregados por este FIX, conservando su ruta real:

- `modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js`
- `core/module-loader.js`
- `tests/cobranza-cor-estados-cuenta-equipos-validacion100.test.js`
- `tests/cobranza-cor-estados-cuenta-fase2-equipos-hitos.test.js`
- `tests/cobranza-cor-estados-cuenta-phns-alineacion.test.js`
- `README_FIX_COBRANZA_COR_EQUIPOS_VALIDACION_100_V001.md`

## Base de datos

**No hay cambio de esquema en este FIX.**

No se incluyen SQL, ALTER, CREATE TABLE ni migraciones porque el modelo actual ya dispone de:

- `ins_fl` como fuente de equipos;
- `log_ops` como fuente de PHNS;
- `cobranza_equipos_cor` para la relacion.

## Aplicacion

Copiar los archivos del ZIP sobre la raiz del repositorio respetando exactamente las carpetas incluidas.

Ejemplo de raiz destino:

`C:\...\mantto_gestor_frontend\`

Despues revisar:

```powershell
git status
git diff
```

No se incluye `.ps1`, aplicador, transformador ni herramientas auxiliares.

## Validaciones realizadas antes de entregar

- Revision de `main` vigente en GitHub: **SI**.
- Revision del flujo actual `ins_fl` / `log_ops` / `cobranza_equipos_cor`: **SI**.
- Confirmacion en codigo del bloqueo backend de 100% por moneda: **SI**.
- `node --check modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js`: **PASS**.
- `node --check core/module-loader.js`: **PASS**.
- Test nuevo `cobranza-cor-estados-cuenta-equipos-validacion100.test.js`: **6/6 PASS**.
- Test actualizado `cobranza-cor-estados-cuenta-phns-alineacion.test.js`: **3/3 PASS**.
- Test historico Fase 2 actualizado: sintaxis **PASS**; debe ejecutarse dentro del repositorio completo porque lee archivos backend que no forman parte de este ZIP.
- Prueba contra Aiven live: **NO ejecutada**.
- Validacion E2E en navegador contra backend desplegado: **NO ejecutada**.
- Despliegue Azure: **NO ejecutado**.
- Despliegue Netlify/GitHub Pages: **NO ejecutado**.

## Sistemas modificados por esta entrega

Ninguno. Este ZIP solo contiene el FIX preparado.

- GitHub: **sin cambios**
- Aiven: **sin cambios**
- Azure: **sin cambios**
- Netlify: **sin cambios**

