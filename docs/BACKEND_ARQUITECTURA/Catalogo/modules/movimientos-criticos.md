# Movimientos Críticos

**Proyecto:** Mantto Gestor  
**Fase:** 3 — Frontend modular  
**Dominio:** UNITED  
**Agrupación:** OPERACION  
**Estado:** Frontend preparado; integración de ruta/panel lateral pendiente de Fase 4.

## 1. Propósito

Consultar, por cortes semanales independientes, únicamente las transiciones de equipos que entran o salen de la condición crítica corporativa.

## 2. Regla funcional

- Regla corporativa: `>= 3` fallas con responsabilidad BLT dentro de U35.
- `ENTRA_CRITICO`: corte anterior `< 3` y corte actual `>= 3`.
- `SALE_CRITICO`: corte anterior `>= 3` y corte actual `< 3`.
- Permanecer crítico o permanecer no crítico no genera movimiento.
- El primer corte es línea base y no inventa movimientos.

## 3. Independencia

Este módulo es independiente de **Movimientos Portafolio**:

- no consume `/api/portafolio/*`;
- no consume `portafolio_cortes_semanales`;
- no comparte snapshots ni movimientos;
- no hereda permisos de Portafolio;
- no usa cambios de estatus de servicio para determinar criticidad.

## 4. Backend propietario

```text
backend/src/modules/movimientos-criticos/
├── movimientos-criticos.routes.js
├── movimientos-criticos.controller.js
└── movimientos-criticos.service.js

backend/src/jobs/movimientosCriticosCierreSemanal.job.js
```

## 5. Frontend propietario

```text
modules/movimientos-criticos/
├── movimientos-criticos.html
├── movimientos-criticos.css
└── movimientos-criticos.js
```

El frontend mantiene prefijo DOM/CSS `mc-` y exporta únicamente:

```text
window.ManttoMovimientosCriticos
```

## 6. Endpoints consumidos

Base: `/api/movimientos-criticos`

- `GET /semanas`
- `GET /?anio={anio}&semana={semana}`
- `GET /snapshot?anio={anio}&semana={semana}`
- `POST /corte` — botón visible solamente para Programador; backend conserva la validación autoritativa.

No existe fallback hacia Portafolio.

## 7. Permiso propio

```text
OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL
```

La autorización real permanece en backend mediante:

- dominio `UNITED`;
- agrupación `OPERACION`;
- alcance territorial UNITED/ZOP central;
- política fail-closed.

## 8. Vista Fase 3

La pantalla es exclusivamente semanal y contiene:

- selector de año;
- selector de semana;
- filtro de zona;
- filtro `ENTRA_CRITICO` / `SALE_CRITICO`;
- búsqueda local sobre equipo, proyecto, referencia, zona y supervisor;
- KPI de movimientos;
- KPI de entradas;
- KPI de salidas;
- KPI de equipos críticos al corte dentro del alcance visible;
- KPI de equipos evaluados dentro del alcance visible;
- tabla con fallas anterior/actual;
- enlaces a detalle de equipo y proyecto mediante `ManttoDetails` cuando esté disponible.

## 9. Semántica de estados vacíos

- Primer corte: `CORTE BASE · SIN MOVIMIENTOS COMPARABLES`.
- Semana cerrada sin cruces: `SIN MOVIMIENTOS ESTA SEMANA`.
- Filtros sin coincidencias: `Sin movimientos para los filtros seleccionados`.

## 10. Pendiente de Fase 4

- registrar `movimientos-criticos` en `core/module-loader.js`;
- registrar nombre y handler en `core/router.js`;
- agregar `view-movimientos-criticos` y acceso lateral en `index.html`;
- integrar ciclo de `core/data-sync.js`;
- validar visibilidad con el permiso propio ya creado en Fase 2.

Fase 3 no modifica esos archivos para conservar la separación incremental aprobada.
