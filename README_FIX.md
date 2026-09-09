# FIX SEGUIMIENTO ESPECIAL - CONTROL UNICO EN DETALLE V001

## Base verificada

- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit base: `5d75d4026320c32d67d99243fb74827137b090d5`
- Version base: `Version 090926.3 - Comments`

Este FIX fue preparado sobre el estado real de `main` indicado arriba.

## Problema corregido

En la pantalla de Detalle podia aparecer mas de una tarjeta **Seguimiento Especial** al navegar entre Equipo y Proyecto. La causa era una condicion de carrera entre montajes asincronos del control:

1. una navegacion iniciaba la consulta del control A;
2. una navegacion posterior iniciaba la consulta del control B;
3. si A terminaba despues, todavia podia insertar su tarjeta;
4. `clearDetailControl()` eliminaba solo el primer elemento encontrado por ID, por lo que un duplicado podia quedar en el DOM.

El comportamiento correcto es mantener **una sola tarjeta**, alineada a la derecha del encabezado, correspondiente exclusivamente al Proyecto o Equipo actualmente abierto.

## Cambios

### `modules/seguimiento-especial/seguimiento-especial-global.js`

- Agrega una generacion monotona de montaje (`detailMountGeneration`).
- Cada montaje asincrono queda ligado a la generacion que lo creo.
- Una respuesta atrasada se descarta si ya existe una navegacion/montaje posterior.
- Se valida despues del `await` que el detalle visible siga siendo el mismo Proyecto/Equipo.
- Al navegar se invalida inmediatamente cualquier request de detalle anterior.
- `clearDetailControl()` elimina todos los controles residuales con el ID del componente, no solo el primero.
- Antes de insertar la tarjeta final se vuelve a limpiar el DOM y se revalida la generacion/objetivo.
- El `MutationObserver` autocorrige estados con cero o mas de un control.
- Se conserva la tarjeta actual en el mismo encabezado y con el mismo comportamiento de gestion.

### `core/module-loader.js`

- Actualiza unicamente el cache-bust de `seguimiento-especial-global.js` para forzar la carga de la version corregida.

### `index.html`

- Actualiza unicamente el cache-bust de `core/module-loader.js` para que navegadores/PWA obtengan el loader que referencia el nuevo modulo global.
- `core/router.js` no se modifica.

### `validation/seguimiento-especial-notificaciones.test.js`

- Actualiza las aserciones de cache-bust.
- Agrega una regresion especifica para validar:
  - generacion de montaje;
  - invalidacion de requests anteriores;
  - validacion del Proyecto/Equipo vigente;
  - eliminacion de todos los controles duplicados;
  - auto-recuperacion cuando hay cero o mas de un control;
  - una sola ruta de insercion `head.appendChild(root)`.

## Archivos del repo incluidos

1. `modules/seguimiento-especial/seguimiento-especial-global.js`
2. `core/module-loader.js`
3. `index.html`
4. `validation/seguimiento-especial-notificaciones.test.js`

Los archivos anteriores se entregan completos y conservan su ruta original.

## Validaciones realizadas

Sobre una copia del commit base:

- `node --check modules/seguimiento-especial/seguimiento-especial-global.js` -> OK
- `node --check core/module-loader.js` -> OK
- `node --check validation/seguimiento-especial-notificaciones.test.js` -> OK
- `npm run check` desde `backend/` -> OK
- `npm test` desde `backend/` -> **27/27 PASS, 0 FAIL**

La prueba 27 usa una copia de solo lectura del workflow vigente porque el artefacto GitHub Pages no empaqueta `.github/`. El workflow no forma parte de este FIX y no se modifica.

## No modifica

- Backend funcional.
- Aiven/MySQL.
- SQL.
- Azure.
- GitHub Actions.
- `core/router.js`.
- `core/estados-visuales.js`.
- Catalogo `estados_visuales`.
- Logica Native + Follow.
- Permisos ni alcance UNITED/ZOP.

## Aplicacion

Sobrescribir los cuatro archivos del repo incluidos respetando exactamente sus rutas y despues ejecutar desde `backend/`:

```text
npm run check
npm test
```

Resultado esperado de la suite de Seguimiento Especial: **27 pass / 0 fail**.

Despues debe validarse manualmente la navegacion rapida:

- Equipo A -> Proyecto B
- Proyecto B -> Equipo C
- Proyecto -> Proyecto
- Equipo -> Equipo
- Detalle -> otra ruta -> Detalle

En todos los casos debe existir como maximo una tarjeta `Seguimiento Especial` y debe corresponder al detalle actualmente abierto.

## Rollback

Restaurar estos cuatro archivos a su version del commit base `5d75d4026320c32d67d99243fb74827137b090d5`.

## Nivel de validacion

- Revision estatica: SI
- Sintaxis JS: SI
- Suite automatizada local: SI, 27/27
- Simulacion sobre commit base: SI
- Commit/push GitHub: NO
- Deploy GitHub Pages: NO
- Deploy Azure: NO
- Validacion E2E en navegador real despues del deploy: NO
