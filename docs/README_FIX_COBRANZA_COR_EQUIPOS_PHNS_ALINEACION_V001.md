# FIX COBRANZA COR - EQUIPOS PHNS ALINEACION V001

Fecha: 25/09/2026
Base oficial: `main` commit `e2f19360aaa82a794d3ac84dc9a4629484654883`.

## Objetivo
En Crear/Editar Estado de Cuenta, relacionar equipos de `ins_fl` y `log_ops` por PHNS visible, no por el ID físico de las filas.

## Regla
- Instalaciones: un PHNS por fila en `ins_fl.referencia_sitio`.
- Logística: uno o varios PHNS separados por comas en `log_ops.ph_ns`.
- La comparación normaliza espacios exteriores y mayúsculas/minúsculas, separa `log_ops.ph_ns` por coma y compara los valores PHNS.
- `id_ins_fl` e `id_log_ops` siguen guardándose únicamente como relaciones técnicas; no determinan si el equipo está alineado.

## UX
- La tabla Equipos muestra listas para seleccionar PHNS de Instalaciones y el registro PHNS de Logística.
- Si existe una coincidencia PHNS única, el formulario la sugiere automáticamente; el usuario puede corregirla manualmente.
- Se muestran estados `Alineado`, `Revisar PHNS`, `Falta Instalaciones`, `Selecciona Logística` y equivalentes.
- PHNS presentes en Logística pero ausentes en Instalaciones se identifican para revisión de Instalaciones.
- PHNS presentes en Instalaciones pero ausentes del listado actual de Logística se identifican como posible relación incorrecta o cambio de posición a revisar por Cobranza.
- La comparación se actualiza automáticamente cada 60 segundos mientras el formulario está abierto y también mediante `Revisar PHNS`.
- La actualización de fuentes no sobrescribe silenciosamente las selecciones manuales actuales.

## Responsive
Se conserva la norma del Gestor: botones, paneles y formulario quedan dentro del viewport; la tabla Equipos mantiene formato tabla y únicamente su wrapper hace scroll horizontal.

## Base de datos
No crea tablas ni columnas. No escribe en `ins_fl` ni en `log_ops`. No envía notificaciones automáticas; este FIX solo detecta y presenta la discrepancia.

## Archivos
- `modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css`
- `core/module-loader.js`
- `index.html`
- `tests/cobranza-cor-estados-cuenta-responsive.test.js`
- `tests/cobranza-cor-estados-cuenta-phns-alineacion.test.js`

## Validación
Revisar `node --check` de JS, pruebas específicas de Cobranza COR, `backend/npm run check` y `backend/npm test`.
