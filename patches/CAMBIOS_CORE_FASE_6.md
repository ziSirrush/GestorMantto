# Cambios de integración Core — Fase 6

Estos cambios se aplican automáticamente con `APLICAR_FASE_6.ps1`. Se documentan aquí para revisión manual.

## `index.html`

1. En Ventas, después de `Proyección`:

```html
<button class="side-item" data-permission="ventas_cotizaciones" data-route="ventas-proyectos-interes" type="button"><span>⭐</span><b>Proyectos de interés</b></button>
```

Se reutiliza `ventas_cotizaciones`: esta vista no crea un nuevo alcance; solo lista cotizaciones que el mismo usuario marcó y que todavía están dentro de su alcance comercial.

2. Después de `view-ventas-proyeccion`:

```html
<section aria-label="Proyectos de interés" class="view" data-view="ventas-proyectos-interes" id="view-ventas-proyectos-interes"></section>
```

## `core/router.js`

- Agregar `ventas-proyectos-interes` a `routeNames`.
- Agregar `showVentasProyectosInteres()` después de `showVentasProyeccion()`.
- Agregar el caso en `showPlaceholder()` inmediatamente después de `ventas-proyeccion`.

## `core/module-loader.js`

Se entrega el archivo completo acumulado F1→F6 y agrega:

```js
'ventas-proyectos-interes':{
  css:['./modules/ventas-proyectos-interes/ventas-proyectos-interes.css?v=20260830-fase6-v001'],
  js:['./modules/ventas-proyectos-interes/ventas-proyectos-interes.js?v=20260830-fase6-v001']
},
```
