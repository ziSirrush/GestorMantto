# FIX_COBRANZA_COR_BOTONES_ESTADOS_CUENTA_V003

Fecha: 23/09/2026  
Dominio: CORELLIAN  
Agrupación: Cobranza  
Módulo: Estados de Cuenta  
Base revisada: `main` commit `158c79320c61c51ed22a9ff1774c1118dc2eedd5`

## Causa verificada

El backend CRUD y el formulario `cobranza-cor-estados-cuenta-form.js/.css` ya existen en `main`, pero el archivo visible `cobranza-cor-estados-cuenta.js` no tenía los botones ni la navegación hacia el formulario. Además, `core/module-loader.js` no cargaba los recursos del formulario.

## Cambio

- Main de Estados de Cuenta: agrega `+ Crear nuevo` junto a `Actualizar`.
- Detalle del PPNS: agrega `Editar` junto al estatus contractual.
- Ambos botones permanecen dentro de la ruta funcional `cobranza-estados-cuenta` usando payload `mode=create` / `mode=edit`.
- `Editar` envía el PPNS actual al formulario existente para que precargue el registro.
- `core/module-loader.js` carga los recursos existentes del formulario.
- `index.html` actualiza el cache-bust del module loader para evitar servir la versión anterior.

## Archivos modificados

- `modules/cobranza-cor/cobranza-cor-estados-cuenta.js`
- `core/module-loader.js`
- `index.html`

No se modifica backend, SQL, permisos, alcance, tablas ni lógica de agrupación de FUENTE en este FIX.

## Validación

- `node --check modules/cobranza-cor/cobranza-cor-estados-cuenta.js`: OK
- `node --check core/module-loader.js`: OK
- Verificación estática de botones `ccor-ec-create-new` y `ccor-ec-edit`: OK
- Verificación estática de carga de `cobranza-cor-estados-cuenta-form.js/.css`: OK
- Verificación de cache-bust de `core/module-loader.js`: OK
- Prueba contra Aiven: no ejecutada; este FIX no cambia BD.
- Despliegue: no ejecutado.
- E2E navegador: no ejecutado.

## Aplicación

Copiar estos tres archivos completos conservando exactamente sus rutas dentro del repositorio y revisar `git diff` antes de commit/push.
