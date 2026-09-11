# FIX DETALLE PROYECTO UNITED - RESP BLT V001

## Base verificada

- Proyecto: `Mantto Gestor`
- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit base: `fd59b650cc8c03fc850d078603936c461ccf1277`
- Version base: `Version 091026.2 - HomeFix`
- Fecha del commit base: `2026-09-10T18:58:47Z`
- Fuente de archivos completos: artefacto exitoso `github-pages` del workflow de ese mismo commit.
- Digest del artefacto base: `sha256:d29370139fc3dbbd970bbae7b7137a53dcff07f99bfc51155a7b50ebcdfabbe5`

Este FIX fue preparado sobre archivos completos correspondientes al `main` verificado arriba.

## Solicitud

En `Detalle Proyecto > Equipos del Proyecto` de UNITED agregar una columna `Resp BLT` inmediatamente despues de `Fallas al año`.

La nueva columna debe mostrar, por equipo, el conteo de llamadas del año actual cuya responsabilidad sea BLT.

## Alcance aplicado

El orden queda:

`Equipo | Referencia | Operativo | Fallas al año | Resp BLT | Resp. BLT Ultima | Resp. Cliente | Ultima Resp. Cliente | MTBC Año | MTBC U365`

### Regla de conteo de `Resp BLT`

Para cada equipo se cuenta en `tickets`:

- mismo `codigo_equipo`;
- `fecha_reporte` desde el primer dia del año actual;
- `fecha_reporte` hasta el dia actual inclusive;
- `responsabilidad`, normalizada con `TRIM` + `UPPER`, exactamente igual a `BLT`.

No se modifica ni reinterpreta la logica existente de `Fallas al año`; el cambio es aditivo.

## Archivos del repo modificados e incluidos completos

1. `backend/src/modules/proyectos/proyectos.service.js`
   - Agrega el campo por equipo `resp_blt_anio` en el detalle de Proyecto.
   - El calculo se realiza en backend/Aiven, sin crear una segunda fuente de verdad en frontend.

2. `core/details.js`
   - Agrega la columna visual `Resp BLT` despues de `Fallas al año`.
   - Muestra `e.resp_blt_anio`.
   - Ajusta el `colspan` de estado vacio de 9 a 10 columnas.
   - No modifica la tabla `Tickets del Proyecto`.

3. `index.html`
   - Actualiza unicamente el cache-bust de `core/details.js` a:
     `20260911-detalle-proyecto-resp-blt-v001`.

Los tres archivos anteriores se entregan completos y conservan su ruta original.

## No modifica

- Tabla visual `Tickets del Proyecto`.
- Logica existente de `Fallas al año`.
- Esquema de Aiven/MySQL.
- Datos de Aiven/MySQL.
- Tablas, columnas, indices o relaciones de BD.
- Permisos, Guards ni alcance UNITED/ZOP.
- Catalogo visual.
- Router.
- Service Worker.
- Otros modulos.
- GitHub, Azure, GitHub Pages ni Netlify durante la preparacion del FIX.

## Validaciones realizadas

Sobre una copia completa del artefacto correspondiente al commit base:

- `node --check core/details.js` -> OK
- `node --check backend/src/modules/proyectos/proyectos.service.js` -> OK
- `npm run check` desde `backend/` -> OK
- `npm test` desde `backend/` -> 27/27 PASS, 0 FAIL

La copia del artefacto de GitHub Pages no incluye `.github/`. Para ejecutar la prueba 27 se agrego exclusivamente en la copia temporal de validacion el workflow vigente `main_mantto-gestor-api.yml` obtenido en modo lectura desde GitHub. Ese workflow no forma parte del FIX y no fue modificado.

### Validacion pendiente

No se ejecuto una consulta real contra Aiven ni una prueba E2E desplegada. Por lo tanto no se afirma validacion contra Produccion.

Despues de aplicar el FIX debe comprobarse en Local y posteriormente en GitHub Pages:

1. Abrir UNITED > Proyectos > Detalle Proyecto.
2. Confirmar que `Resp BLT` aparece inmediatamente despues de `Fallas al año`.
3. Elegir un equipo con tickets del año actual.
4. Comparar `Resp BLT` contra el conteo de tickets del mismo equipo cuya `responsabilidad = BLT`.
5. Confirmar que la tabla `Tickets del Proyecto` no cambio.
6. Confirmar responsive/scroll horizontal de la tabla con la columna adicional.

## Aplicacion

Copiar/sobrescribir en la raiz del repositorio local unicamente:

- `backend/src/modules/proyectos/proyectos.service.js`
- `core/details.js`
- `index.html`

Respetar exactamente las rutas incluidas en este ZIP.

Despues ejecutar:

```powershell
Set-Location C:\Users\T14s\Downloads\mantto_gestor_frontend

node --check .\core\details.js
node --check .\backend\src\modules\proyectos\proyectos.service.js
npm run check --prefix .\backend
npm test --prefix .\backend

git status
git diff
```

## Promocion

Flujo normativo del frontend:

`Local -> GitHub Pages -> Netlify`

Netlify de Produccion requiere despliegue manual. Este paquete no realiza deploy.

El backend autorizado es Azure. Este paquete no realiza deploy ni escritura en Azure.

## Rollback

Restaurar los tres archivos desde el commit base:

`fd59b650cc8c03fc850d078603936c461ccf1277`

Archivos:

- `backend/src/modules/proyectos/proyectos.service.js`
- `core/details.js`
- `index.html`

## Nivel de validacion

- Revision de `main` vigente: SI
- Archivos completos obtenidos del commit base: SI
- Revision estatica: SI
- Sintaxis JS: SI
- Validacion estructural: SI
- Suite automatizada local: SI, 27/27 PASS
- Prueba contra Aiven: NO
- Validacion E2E en navegador: NO
- Commit/push GitHub: NO
- Deploy GitHub Pages: NO
- Deploy Azure: NO
- Deploy Netlify: NO
