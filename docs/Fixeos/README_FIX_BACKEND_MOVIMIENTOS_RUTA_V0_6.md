# Fix backend Movimientos Portafolio v0.6

Objetivo: resolver el warning del frontend:

```txt
[Movimientos] Endpoint /api/portafolio/movimientos no disponible, usando /api/portafolio: Respuesta invalida del backend.
```

## Archivos incluidos

- `backend/src/routes/data.routes.js`
- `backend/src/controllers/data.controller.js`

## Cambio esperado

El backend debe exponer estas rutas:

```js
router.get('/portafolio/movimientos', dataController.getPortafolioMovimientos);
router.get('/portafolio/movimientos/:codigo/detalle', dataController.getPortafolioMovimientoDetalle);
```

Y el controller debe exportar:

```js
getPortafolioMovimientos,
getPortafolioMovimientoDetalle
```

## Validacion rapida

Con backend corriendo:

```txt
GET /api/portafolio/movimientos
```

Debe responder JSON con esta forma:

```json
{
  "ok": true,
  "source": "aiven",
  "kpis": {},
  "corte": null,
  "filters": { "zonas": [] },
  "data": []
}
```

Si el navegador sigue mostrando el warning despues de aplicar estos archivos, revisar que el frontend este apuntando al backend correcto en `MANTTO_API_BASE` y que Railway tenga desplegada esta version.
