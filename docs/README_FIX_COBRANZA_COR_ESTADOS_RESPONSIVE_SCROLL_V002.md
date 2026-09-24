# FIX COBRANZA COR - ESTADOS DE CUENTA RESPONSIVE SCROLL V002

Fecha: 24/09/2026
Base oficial revisada: `main` commit `4315589d690b8f65b03fb05e63a5704b6d9a2b37`.

## Correccion de norma responsive

Este V002 sustituye el comportamiento movil de V001.

Regla aplicada:
- paneles, tarjetas, ventanas, botones, filtros y formularios permanecen contenidos dentro del ancho visible;
- las tablas **no** se convierten a tarjetas ni expanden la vista completa;
- únicamente el contenedor inmediato de cada tabla permite desplazamiento horizontal;
- el encabezado y estructura de cada tabla se conservan en celular.

## Estados de Cuenta

- Main: tabla PPNS conserva ancho funcional de `1480px` y hace scroll horizontal dentro de su tarjeta.
- Detalle: tablas Suministro / Instalacion conservan ancho funcional de `1100px` y hacen scroll dentro de su seccion.
- Crear / Editar: General, KPIs y controles se adaptan al viewport.
- Equipos: tabla conserva ancho funcional de `980px`.
- Hitos: tabla conserva ancho funcional de `2700px`.
- Botones `Crear nuevo`, `Editar`, `Actualizar`, `Cancelar`, `Guardar` y `Agregar hito` permanecen fuera del desplazamiento horizontal de las tablas.
- Fondo de Garantia permanece en General y no cambia su logica.

## Archivos incluidos

- `modules/cobranza-cor/cobranza-cor-estados-cuenta.css`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css`
- `core/module-loader.js`
- `index.html`
- `tests/cobranza-cor-estados-cuenta-responsive.test.js`
- `docs/README_FIX_COBRANZA_COR_ESTADOS_RESPONSIVE_SCROLL_V002.md`

## Alcance

No modifica backend, Aiven, rutas, permisos, datos ni calculos de Cobranza COR.
No contiene `.patch`, aplicadores ni scripts de despliegue.
