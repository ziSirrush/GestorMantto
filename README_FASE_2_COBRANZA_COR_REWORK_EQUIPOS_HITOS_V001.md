# FASE 2 · COBRANZA COR · REWORK EQUIPOS + HITOS V001

Fecha de preparación: 30/09/2026  
Dominio: CORELLIAN  
Agrupación: Cobranza  
Módulo: Estados de Cuenta  
`main` revisado: `794a40e2afb909026f440e59fcd5858ae321209c` (`Version 092926.3`)

## Dependencia

Esta fase se aplica **después de FASE 1 · REWORK GENERAL V001**. No duplica la migración de General. El aplicador valida marcadores de Fase 1 antes de escribir.

Los archivos funcionales de Cobranza COR que usa esta entrega conservan los mismos blobs base entre `50ea479...` y `794a40e...`; el commit `794a40e...` solo cambió archivos del Runner de pruebas de carga.

## Alcance aprobado

Fase 2 cubre únicamente **Equipos + Hitos**. Fase 3 queda reservada para consolidación final de Crear/Editar y Fase 4 para Detalle.

### Equipos

- la visualización se toma de `log_ops.ph_ns`;
- `ph_ns` se separa por comas;
- los IDs se normalizan a mayúsculas;
- solo se muestran tokens `Pxxxxx`;
- se eliminan duplicados internos y entre registros;
- se muestran una sola vez y también como lista separada por comas;
- se elimina del flujo visual **Ubicación / Torre**;
- se elimina del flujo visual toda **Alineación PHNS** y el refresco automático deja de operar;
- Crear/Editar ya no exige selección manual de equipos. `cobranza_equipos_cor` queda como compatibilidad histórica: esta fase no lo borra ni migra.

### Hitos

La plantilla expone los campos funcionales existentes y mantiene fuera de edición IDs, `activo`, timestamps y campos de auditoría/control.

Campos funcionales de Hito incluidos:

- Orden hito;
- Hito / Condición;
- %;
- Año;
- Moneda;
- Subtotal;
- IVA;
- Total;
- Factura;
- Pago total;
- Estatus factura;
- Fecha pago;
- Fecha vencimiento;
- Días vencimiento;
- Estimado pago;
- Estatus vencimiento;
- Fecha programada;
- Fecha notificada;
- Estatus hito.

Reglas:

1. **Año es opcional.** Un `NULL` se mantiene `NULL`; ya no se transforma a `0` por el serializador.
2. **Orden hito es manipulable**; deja de depender exclusivamente del índice visual.
3. **Moneda** solo puede elegirse entre las monedas activas de las Partidas de General.
4. Las Partidas repetidas de la misma moneda se suman para obtener la base 100% de esa moneda.
5. El **% de Hitos por cada moneda de General debe sumar exactamente 100%**.
6. **Subtotal, IVA y Total son automáticos y de solo lectura**:
   - `Subtotal = Base 100% de la moneda × % del Hito`;
   - `IVA = Subtotal × IVA general`;
   - `Total = Subtotal + IVA`.
7. El backend vuelve a calcular esos tres importes y no confía únicamente en el cálculo del navegador.
8. Si el IVA general está `NULL`, el Subtotal puede calcularse, pero IVA/Total quedan sin inferir hasta definir IVA.
9. **Factura es de solo lectura** en Hitos. Se conserva el valor actual cargado; la relación con 1+ facturas se implementará en su fase correspondiente, no se inventa aquí.
10. **Estatus factura** se limita a vacío / `No pagado` / `Pagado`.
11. Pago total y las fechas existentes continúan disponibles como captura funcional.

## Dependencias futuras que NO se implementan en Fase 2

Se conserva la necesidad funcional ya acordada de que un Hito pueda depender de **1+ facturas**, pagos parciales/acumulados y TDC del día para moneda extranjera, pero esta fase **no implementa**:

- tabla de Facturas;
- tabla de Pagos;
- pagos parciales/acumulados;
- conversión TDC;
- actualización automática de Factura desde una tabla todavía inexistente;
- rework del Detalle.

No se simulan ni se inventan esas relaciones.

## Base de datos

**Fase 2 no requiere DDL nuevo.** Reutiliza `cobranza_fuente_cor`, `cobranza_partidas_cor` y `log_ops` ya existentes.

Se incluyen solo consultas de lectura:

- `sql/00_PRECHECK_COBRANZA_COR_REWORK_FASE_2_EQUIPOS_HITOS_V001.sql`;
- `sql/01_SMOKE_READ_COBRANZA_COR_REWORK_FASE_2_EQUIPOS_HITOS_V001.sql`.

No hay script ALTER, DROP ni UPDATE en esta fase.

## Archivos modificados por transformaciones controladas

- `backend/src/modules/cobranza-cor/cobranza-cor.service.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css`
- `core/module-loader.js`
- `index.html`

No modifica repository, controller ni routes.

## Archivos nuevos

- `tests/cobranza-cor-estados-cuenta-fase2-equipos-hitos.test.js`
- los dos SQL de lectura;
- este README.

## Aplicación local

Con Fase 1 ya aplicada en la misma copia local:

```powershell
$REPO="C:\Users\T14s\Downloads\mantto_gestor_frontend"
& ".\APLICAR_FIX_LOCAL.ps1" -Repo $REPO
```

El aplicador:

1. valida `.git`;
2. valida que los blobs base de los archivos afectados sigan siendo los revisados;
3. exige marcadores funcionales de Fase 1;
4. rechaza una segunda aplicación;
5. aplica bloques delimitados;
6. copia prueba/SQL/README;
7. ejecuta `node --check`;
8. ejecuta test específico de Fase 2;
9. ejecuta test de Fase 1 si está presente;
10. ejecuta regresión existente de Crear/Editar;
11. ejecuta `git diff --check`;
12. si algo falla, restaura lo que alcanzó a tocar.

## Validación manual posterior

1. Abrir Crear/Editar Estado de Cuenta.
2. Confirmar que Equipos muestra únicamente IDs `Pxxxxx` de `log_ops.ph_ns`, sin duplicados.
3. Confirmar que no existen controles de Alineación ni Ubicación/Torre.
4. Crear dos Partidas MXN y confirmar que Hitos calcula sobre la suma de ambas.
5. Crear Hitos MXN cuyos porcentajes sumen 100% y comprobar Subtotal/IVA/Total automáticos.
6. Intentar 99% o 101% y confirmar rechazo.
7. Dejar Año vacío y confirmar que no aparece `0` ni `Revisa el año...`.
8. Confirmar Factura de solo lectura y Estatus factura vacío/No pagado/Pagado.
9. Repetir con USD/EUR sin conversión TDC.

## Validaciones de esta entrega

- `main` actual revisado: **sí**, `794a40e...`.
- comparación `50ea479... → 794a40e...`: **sí**; los cambios son solo del Runner, no de Cobranza COR.
- sintaxis del aplicador: **validada en el paquete**.
- prueba estática específica: **incluida**.
- prueba contra Aiven live: **NO ejecutada**.
- E2E contra backend desplegado: **NO ejecutada**.
- GitHub: **sin cambios**.
- Aiven: **sin cambios**.
- Azure: **sin cambios**.
- Netlify: **sin cambios**.

## Nota de seguridad de entrega

El paquete no hace `push`, no ejecuta SQL y no despliega servicios. La aplicación es local y fail-closed.
