# FIX_COBRANZA_COR_BOTONES_CI_V004

Fecha: 23/09/2026
Base verificada: `main` @ `a89f94b249cfb181ce9750ff8b88ff81320fa61e`
Dominio: CORELLIAN
Agrupacion: Cobranza
Modulo: Estados de Cuenta

## Causa confirmada

El FIX V003 de botones si quedo aplicado en `main` y GitHub Pages desplego correctamente.
El fallo ocurrio en el workflow de Azure durante `npm test`.

La prueba `validation/seguimiento-especial-notificaciones.test.js` conservaba una asercion obsoleta que exigia exactamente:

`core/module-loader.js?v=20260921-proyectos-layout-metricas-v007`

El V003 cambio correctamente ese cache-bust a la version de Cobranza, por lo que la prueba fallo aunque el archivo cargado era valido.

Adicionalmente, la prueba especifica de Cobranza COR tambien tenia dos expectativas obsoletas:

- esperaba `ppns:normalized` aunque la implementacion vigente usa `ppns:normalizedPpns`;
- esperaba cache-bust exacto de V002 aunque `main` ya usa V003.

## Reparacion

Se ajustan unicamente las pruebas afectadas. No se modifica codigo funcional, frontend, backend, BD, permisos ni rutas.

### validation/seguimiento-especial-notificaciones.test.js

La validacion de `core/module-loader.js` ahora comprueba que exista un cache-bust valido, sin acoplarse a una version de otro modulo.

### tests/cobranza-cor-estados-cuenta-crud-form.test.js

- valida el nombre real `normalizedPpns` usado por el flujo Editar;
- valida que Estados de Cuenta y el formulario CRUD esten registrados con cache-bust valido;
- valida JS y CSS del formulario sin depender de un numero de version fijo.

## Archivos modificados

- `validation/seguimiento-especial-notificaciones.test.js`
- `tests/cobranza-cor-estados-cuenta-crud-form.test.js`

## Validacion realizada

Sobre snapshot del `main` indicado arriba:

- `node --check validation/seguimiento-especial-notificaciones.test.js`: OK
- `node --check tests/cobranza-cor-estados-cuenta-crud-form.test.js`: OK
- `node --test tests/cobranza-cor-estados-cuenta-crud-form.test.js`: 6/6 OK
- `backend/npm run check`: OK
- `backend/npm test`: 76/76 OK

Para reproducir `npm test` localmente se repuso en el snapshot de GitHub Pages el workflow `.github/workflows/main_mantto-gestor-api.yml`, porque los artifacts de Pages no incluyen `.github`.

## Sistemas modificados por esta entrega

Ninguno. Este ZIP solo contiene archivos completos para aplicar en una copia local del repositorio.

- GitHub: sin cambios
- Aiven: sin cambios
- Azure: sin cambios
- Netlify: sin cambios

## Nota

El error reparado era de CI/validacion, no de la implementacion de los botones. En `main` ya existen:

- `+ Crear nuevo` en Estados de Cuenta;
- `Editar` dentro del detalle;
- carga de `cobranza-cor-estados-cuenta-form.js` y `.css` desde `core/module-loader.js`.
