# FASE 1 · COBRANZA COR · REWORK GENERAL V001

Fecha de preparación: 29/09/2026  
Dominio: CORELLIAN  
Agrupación: Cobranza  
Módulo: Estados de Cuenta  
Base GitHub validada: `ziSirrush/GestorMantto` · `main` @ `50ea479dd35d7b1527240a7578f99fe9c1dbcfc4` (`Version 092926.2`)

## Objetivo de esta fase

Rehacer únicamente la zona **General** de Crear/Editar Estado de Cuenta, dejando la base persistente para las fases posteriores de Equipos, Hitos y Detalle.

Esta fase agrega:

1. **N partidas monetarias** por Estado de Cuenta.
2. Monedas permitidas: **MXN / USD / EUR**.
3. Se permiten **varias partidas de la misma moneda**; se suman para formar el 100% base de esa moneda.
4. El monto de cada partida se captura **antes de IVA**.
5. Un único **IVA general** con opciones `0%`, `8%`, `16%` para el Estado de Cuenta.
6. Persistencia de partidas en una nueva tabla `cobranza_partidas_cor`.
7. Persistencia del IVA general en `cobranza_fuente_cor.iva_general_pct`, replicado sobre los hitos activos del PPNS igual que hoy ocurre con la configuración general de Fondo de Garantía.

## Alcance deliberadamente limitado

Esta entrega **NO** implementa todavía:

- rework de Equipos;
- eliminación de Alineación PHNS;
- eliminación de Ubicación / Torre;
- rework funcional de Hitos;
- moneda del Hito limitada a las monedas de General;
- cálculo automático de Subtotal / IVA / Total del Hito;
- validador de 100% de Hitos por moneda;
- nueva lógica de Facturas;
- tabla de Facturas;
- tabla de Pagos;
- cambios al Detalle del Estado de Cuenta;
- seguro de desbloqueo por código maestro para IVA.

**Importante:** el problema previo de Año que puede mostrarse como `0` y provocar `Revisa el año de la fila ...` pertenece al rework de Hitos y **no se declara resuelto por esta Fase 1**.

## Modelo de datos nuevo

### `cobranza_partidas_cor`

Una fila representa una partida base del Estado de Cuenta.

Campos propuestos:

- `id_partida_cor`: identificador técnico.
- `ppns`: PPNS del Estado de Cuenta.
- `orden`: orden visual.
- `moneda`: `MXN`, `USD` o `EUR`.
- `monto_base`: importe antes de IVA.
- `activo`: baja lógica.
- `created_by`, `updated_by`, `created_at`, `updated_at`: control/auditoría.

No existe restricción UNIQUE por moneda porque el requisito permite varias partidas de una misma moneda.

Ejemplo:

```text
MXN  300,000.00
MXN  200,000.00
USD   25,000.00
EUR   10,000.00
```

Resultado funcional:

```text
100% MXN = 500,000.00
100% USD =  25,000.00
100% EUR =  10,000.00
```

### `cobranza_fuente_cor.iva_general_pct`

Se agrega como fracción decimal:

- 0% = `0.000000`
- 8% = `0.080000`
- 16% = `0.160000`

Los Estados de Cuenta históricos quedan con `NULL` hasta que se editen/normalicen. No se infiere automáticamente un IVA histórico.

## Comportamiento de Crear / Editar

### General

Se conserva lo ya existente:

- PPNS;
- Proyecto;
- Cliente;
- Contractual;
- Fondo de Garantía;
- % Fondo de Garantía;
- responsables/informativos actuales.

Y se agrega:

- selector de IVA general;
- tabla/listado de Partidas;
- botón `+ Agregar partida`;
- selector de moneda por partida;
- monto base por partida;
- eliminación lógica de partidas existentes.

### Totales de referencia de General

Los indicadores laterales dejan de depender del Total de Hitos para esta fase y muestran los **100% base capturados en Partidas**:

- Base 100% MXN.
- Base 100% de monedas extranjeras, separadas por moneda.

No se mezclan monedas entre sí.

## Compatibilidad

- Los Estados de Cuenta existentes siguen pudiendo abrirse aunque aún no tengan Partidas.
- `iva_general_pct = NULL` se admite para datos históricos sin inferir un valor.
- Un cliente anterior que no envíe `partidas` no debe borrar las partidas existentes.
- Las bajas de partidas son lógicas (`activo=0`).
- No se eliminan columnas históricas de `cobranza_fuente_cor`.

## Seguridad y alcance

Se conserva el motor de alcance CORELLIAN actual y el Visor de Usuarios en modo solo lectura.

Los campos de control de `cobranza_partidas_cor` no son editables desde la UI. `created_by` y `updated_by` se resuelven con el actor autenticado en backend.

## Archivos existentes modificados mediante transformaciones controladas

El aplicador exige el commit y blobs exactos de la base validada antes de escribir:

- `backend/src/modules/cobranza-cor/cobranza-cor.repository.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.service.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css`
- `core/module-loader.js`
- `index.html`

## Archivos nuevos que el aplicador copia al repositorio

- `sql/00_PRECHECK_COBRANZA_COR_REWORK_FASE_1_GENERAL_V001.sql`
- `sql/01_BACKUP_COBRANZA_COR_REWORK_FASE_1_GENERAL_V001.sql`
- `sql/02_MIGRAR_COBRANZA_COR_REWORK_FASE_1_GENERAL_V001.sql`
- `sql/03_SMOKE_COBRANZA_COR_REWORK_FASE_1_GENERAL_V001.sql`
- `sql/99_ROLLBACK_COBRANZA_COR_REWORK_FASE_1_GENERAL_V001.sql`
- `tests/cobranza-cor-estados-cuenta-fase1-general.test.js`
- `README_FASE_1_COBRANZA_COR_REWORK_GENERAL_V001.md`

## Aplicación local del código

El paquete **no modifica GitHub, Aiven, Azure ni Netlify automáticamente**.

Desde PowerShell, con el ZIP extraído:

```powershell
$REPO="C:\Users\T14s\Downloads\mantto_gestor_frontend"
& ".\APLICAR_FIX_LOCAL.ps1" -Repo $REPO
```

El aplicador:

1. exige `HEAD = 50ea479dd35d7b1527240a7578f99fe9c1dbcfc4`;
2. exige que los seis archivos base estén limpios;
3. valida sus blob SHA exactos;
4. aplica solo transformaciones previamente delimitadas;
5. copia SQL, prueba y README;
6. ejecuta `node --check` sobre los JS afectados;
7. ejecuta la prueba específica de Fase 1;
8. ejecuta la prueba existente de Crear/Editar;
9. ejecuta `git diff --check`;
10. si una validación posterior falla, restaura los archivos locales que tocó.

## Secuencia correcta de BD / despliegue

El aplicador local **NO ejecuta SQL**.

Antes de desplegar backend/frontend que lean la nueva estructura:

1. Ejecutar `00_PRECHECK...sql` en Aiven y revisar el resultado.
2. Si el esquema no coincide con lo esperado, **detenerse**.
3. Ejecutar `01_BACKUP...sql` y validar el respaldo.
4. Ejecutar `02_MIGRAR...sql`.
5. Ejecutar `03_SMOKE...sql`.
6. Solo después desplegar el backend/frontend de esta fase.

Esto evita que el backend intente leer `cobranza_partidas_cor` antes de que exista.

## Rollback

### Código

Si el aplicador falla durante la instalación, realiza rollback local automático de lo que alcanzó a tocar.

Si ya terminó correctamente y se decide revertir, usar Git para devolver únicamente los archivos afectados después de revisar el diff.

### BD

`99_ROLLBACK...sql` elimina la tabla y columna agregadas por esta fase. **No debe ejecutarse si ya existe información nueva que deba conservarse sin antes exportarla/resguardarla.**

El respaldo `bk_20260929_cobranza_fuente_cor_f1` no se elimina automáticamente.

## Validaciones realizadas al preparar esta entrega

- Lectura de `main` vigente: **sí**.
- Commit base verificado: **sí**.
- Sintaxis del aplicador Node: **OK**.
- Prueba específica incluida: **sí**.
- SQL preparado: **sí**.
- Aplicación real contra Aiven: **NO ejecutada**.
- `SHOW CREATE TABLE` live de Aiven: **NO ejecutado en esta sesión**.
- Despliegue a Azure: **NO ejecutado**.
- Push a GitHub: **NO ejecutado**.
- Deploy Netlify: **NO ejecutado**.
- E2E contra backend desplegado: **NO ejecutado**.

Por lo anterior, el SQL debe pasar primero por el PRECHECK del entorno real. Si la estructura live difiere, no debe forzarse la migración.

## Sistemas modificados por esta entrega

Ninguno. Este ZIP únicamente prepara la Fase 1 para aplicación controlada.

- GitHub: **sin cambios**
- Aiven: **sin cambios**
- Azure: **sin cambios**
- Netlify: **sin cambios**
