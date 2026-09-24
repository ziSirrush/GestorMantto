# FIX COBRANZA COR - ESTADOS DE CUENTA RESPONSIVE MOVIL V001

Fecha: 24/09/2026
Base oficial revisada: `main` commit `c279fb827a81c5b063d906e06bf403848e3f67fa`.

## Objetivo
Adaptar Cobranza COR > Estados de Cuenta (Main, Detalle y Crear/Editar) a pantallas de telefono sin romper la vista de escritorio.

## Cambios
- Main: debajo de 760 px cada PPNS deja de depender de la tabla de 1480 px y se muestra como tarjeta vertical.
- Detalle: movimientos y totales financieros se apilan como tarjetas debajo de 760 px.
- Crear/Editar: General, KPIs y acciones se apilan; Equipos e Hitos pasan a tarjetas verticales.
- Controles tactiles: botones e inputs relevantes usan altura minima de 44 px; inputs de formulario usan 16 px en movil para evitar zoom automatico en iOS.
- A 480 px, etiquetas y valores quedan en una sola columna.
- Escritorio conserva las tablas y disposicion actuales.
- Cache-bust actualizado para CSS y module-loader.

## Fondo de Garantia
Este paquete es acumulativo respecto a `FIX_COBRANZA_COR_FONDO_GARANTIA_GENERAL_V002`: Fondo de Garantia queda en General y el porcentaje general se aplica por igual a los hitos activos.

## Archivos funcionales incluidos
- `backend/src/modules/cobranza-cor/cobranza-cor.service.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta.css`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js`
- `core/module-loader.js`
- `index.html`
- `tests/cobranza-cor-estados-cuenta-crud-form.test.js`
- `tests/cobranza-cor-estados-cuenta-responsive.test.js`

## Alcance
No modifica tablas ni datos de Aiven. No crea rutas ni modulos nuevos. No modifica permisos.

## Aplicacion
Copiar los archivos completos sobre el repositorio respetando exactamente sus rutas. Este entregable no contiene `.patch`, aplicadores ni scripts de despliegue.
