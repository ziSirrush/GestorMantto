# Fase B2 - Dashboard Ventas - Datos para PDF

## Base acumulativa

- `ult ver 1420hrs 0805.zip`
- `FASE_B1_DASHBOARD_VENTAS_PDF_V001.zip`
- Esquema revisado: `Dump20260805.sql`

## Alcance

Esta fase prepara datos reales para el futuro PDF. No genera todavía un archivo PDF.

Se agregó el endpoint:

```text
GET /api/ventas/dashboard/pdf/data?tipo=individual&usuario_id=<ID>
GET /api/ventas/dashboard/pdf/data?tipo=general
```

El endpoint mantiene las validaciones de B1:

1. acceso visual a Dashboard Ventas;
2. permiso PDF correspondiente;
3. para PDF general, rol de acceso total de Ventas;
4. identidad efectiva mediante `req.contextUser || req.user`.

## Paquete de datos

Por asesor se preparan:

- KPIs;
- Vendidos agrupados por año ascendente y total anual de equipos;
- Perdidos agrupados por año descendente;
- Cotizaciones activas ordenadas por estatus y proyecto;
- comentarios activos de Cotizaciones en orden cronológico;
- Prospección;
- Redes;
- Proyectos activos de Instalaciones;
- Logística ordenada por prioridad operativa;
- Clientes.

Las tareas colaborativas se preparan una sola vez para el usuario efectivo que genera el PDF y se colocan al final del paquete. Si no existen, la propiedad `tareas_colaborativas` no se devuelve.

## Regla de equipos

Para Cotizaciones, Vendidos, Perdidos y KPIs:

```text
numero_equipos_total =
ventas_cotizaciones_cor.numero_equipos
+ SUM(ventas_cotizaciones_equipos_cor.cantidad activa)
```

Actualmente la tabla hija es nueva; por tanto el resultado esperado es `X + 0` mientras no existan cantidades adicionales.

## PDF general

Toma todos los responsables comerciales activos del selector actual de Dashboard Ventas y prepara un bloque completo por cada uno. No usa `usuarios_rel_admin` ni `reporta_a` para reducir la lista del PDF general.

## PDF individual

Valida que el usuario seleccionado sea un responsable comercial activo y prepara únicamente su bloque.

## Cambios de frontend

Los botones de B1 ahora llaman al endpoint real de datos. En esta fase solo muestran la confirmación del número de asesores y, cuando aplica, el número de tareas colaborativas. La descarga del PDF se implementará en B3/B4.

## Archivos modificados

- `backend/src/modules/ventas-dashboard/ventas-dashboard.repository.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.service.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.controller.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.routes.js`
- `modules/ventas-dashboard/ventas-dashboard.js`

## Validaciones

- `node --check` en los cinco archivos JavaScript modificados.
- `npm run check` sobre el proyecto acumulado.
- Validación de nombres de tablas y columnas contra `Dump20260805.sql`.

No se ejecutaron consultas contra Aiven desde este entorno. El resultado real debe verificarse después del despliegue.
