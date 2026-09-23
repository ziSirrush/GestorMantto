# FIX COBRANZA COR · CREAR ESTADO DE CUENTA V001

Fecha: 17/09/2026
Base revisada: `main` commit `d1db90ef732e0bae8eae16293394f5cbc08b0619`.

## Alcance

Agrega la ruta frontend `cobranza-estados-cuenta-crear-nuevo` para `Cobranza COR > Estados de Cuenta > Crear nuevo`.

La creación usa:

- `cobranza_fuente_cor` para los hitos financieros.
- `cobranza_equipos_cor` para la relación de equipos del Estado de Cuenta.
- `ins_fl` como fuente del proyecto/equipo y control de alcance CORELLIAN.
- `log_ops` como relación logística opcional por equipo.

No usa `portafolio`, no usa tablas UNITED y no reintroduce `cobranza_indice_cor`.

## Prerrequisitos de BD

Este FIX supone que ya fueron aplicados en Aiven:

- `cobranza_fuente_cor.orden_hito`
- `cobranza_fuente_cor.fecha_programada`
- `cobranza_fuente_cor.fecha_notificada`
- `cobranza_fuente_cor.estatus_hito`
- tabla `cobranza_equipos_cor`

No ejecuta SQL ni realiza cambios de BD.

## Comportamiento

1. Estados de Cuenta muestra `+ Crear nuevo`.
2. La pantalla solo ofrece PPNS activos de `ins_fl` dentro del alcance del usuario y que todavía no tienen filas activas en `cobranza_fuente_cor`.
3. Proyecto, cliente, supervisor, asesor y administrativo se resuelven del backend; no se aceptan como texto libre para crear.
4. Los equipos se leen de `ins_fl`. `log_ops` se presenta como relación opcional; no se fuerza una relación 1:1 porque esa cardinalidad no está confirmada.
5. Se exige al menos un equipo y un hito.
6. Los hitos admiten `Pendiente`, `Programado`, `Notificado` y `Cerrado`.
7. `total` se recalcula en backend como `subtotal + iva`.
8. Alta de hitos + relaciones de equipos se ejecuta en una sola transacción.
9. El Visor de Usuarios permanece en solo lectura.
10. Al guardar, vuelve al detalle del Estado de Cuenta creado por PPNS.

## Aplicación local

Extrae este ZIP. Desde PowerShell:

```powershell
$REPO="C:\Users\T14s\Downloads\mantto_gestor_frontend"
$FIX="C:\RUTA\DONDE\EXTRAJISTE\APLICAR_FIX_COBRANZA_COR_CREAR_ESTADO_CUENTA_V001.js"

Set-Location $REPO
node $FIX .

git status
git diff
```

El aplicador hace un **precheck completo antes de escribir**. Si algún bloque ya no coincide con el `main` revisado, se detiene sin empezar a modificar archivos.

## Validaciones posteriores

```powershell
Set-Location "C:\Users\T14s\Downloads\mantto_gestor_frontend"

node --check ".\backend\src\modules\cobranza-cor\cobranza-cor.repository.js"
node --check ".\backend\src\modules\cobranza-cor\cobranza-cor.service.js"
node --check ".\backend\src\modules\cobranza-cor\cobranza-cor.controller.js"
node --check ".\backend\src\modules\cobranza-cor\cobranza-cor.routes.js"
node --check ".\modules\cobranza-cor\cobranza-cor-estados-cuenta.js"
node --check ".\modules\cobranza-cor\cobranza-cor-estados-cuenta-crear-nuevo.js"
node --check ".\core\module-loader.js"
node --check ".\core\router.js"
node --test ".\tests\cobranza-cor-crear-estado-cuenta.test.js"

Set-Location ".\backend"
npm run check
npm test
```

## Validación manual sugerida

En local:

1. Abrir `Cobranza > Estados de Cuenta`.
2. Pulsar `+ Crear nuevo`.
3. Elegir un PPNS sin Estado de Cuenta.
4. Confirmar equipos de `ins_fl` y, si corresponde, relacionar un registro de `log_ops`.
5. Capturar al menos un hito.
6. Guardar.
7. Confirmar que abre el detalle por PPNS y que el registro aparece en el Main.

## Nota sobre sincronización

La carga actual de `cobranza_fuente_cor` en el backend revisado es `insert_only`. Este FIX no elimina filas creadas manualmente. Sin embargo, una integración futura que envíe el mismo PPNS/hito sin deduplicación podría generar duplicados; ese comportamiento debe resolverse cuando se defina la llave funcional de sincronización de FUENTE.
