# FIX_DASHBOARD_LOGISTICA_PROMEDIOS_POR_ANIO_V001

Fecha: 2026-09-23
Módulo: Logística → Dashboard
Alcance: Promedio de salida por puerto + Promedio de tránsito según modo

## Objetivo

Los dos promedios del Dashboard dejan de cargar todo el histórico por defecto.

Nuevo comportamiento:

- Al abrir el Dashboard, ambos promedios usan el **año actual de CDMX**.
- El año de una operación para estos promedios se determina por **`fecha_salida_real`**.
- Se agrega una barra de búsqueda con sugerencias para consultar:
  - **Todos los años**.
  - Cada **año registrado** en `log_ops.fecha_salida_real`.
- El filtro se aplica simultáneamente a:
  - Promedio de salida por puerto: `fecha_exw → fecha_salida_real`.
  - Promedio de tránsito según modo: `fecha_salida_real → fecha_llegada_real`.
- El ring y las dos tablas mensuales de contenedores **siguen usando el año actual por ETD (`fecha_salida_estimada`)** y no cambian al buscar otro periodo de promedios.
- El historial de cortes semanales de Logística se conserva sin cambios.

## Contrato del endpoint

Se reutiliza el endpoint existente:

```text
GET /api/logistica/dashboard
```

Sin parámetro:

```text
GET /api/logistica/dashboard
```

→ promedios del año actual.

Año específico:

```text
GET /api/logistica/dashboard?anio_promedios=2025
```

→ promedios únicamente de operaciones cuya `fecha_salida_real` corresponde a 2025.

Histórico completo:

```text
GET /api/logistica/dashboard?anio_promedios=all
```

→ promedios de todos los años con pares de fechas válidos.

La respuesta agrega:

```json
{
  "promedios": {
    "periodo": 2026,
    "etiqueta": "Año actual 2026",
    "criterio_anio": "fecha_salida_real",
    "anios_disponibles": [2026, 2025, 2024]
  }
}
```

Los años concretos dependen de los registros reales existentes en Aiven.

## Fuente de años disponibles

El catálogo se obtiene de valores válidos con formato `YYYY-MM-DD` en:

```text
log_ops.fecha_salida_real
```

No se crea catálogo manual ni tabla nueva.

## Archivos modificados

```text
backend/src/modules/logistica-dashboard/logistica-dashboard.repository.js
backend/src/modules/logistica-dashboard/logistica-dashboard.service.js
backend/src/modules/logistica-dashboard/logistica-dashboard.controller.js
modules/dashboard-logistica/dashboard-logistica.js
modules/dashboard-logistica/dashboard-logistica.css
core/module-loader.js
```

Prueba agregada:

```text
tests/logistica_dashboard_promedios_anio.test.js
```

## Fuente base verificada

Antes de generar el FIX se compararon los archivos locales usados como base contra `ziSirrush/GestorMantto`, rama `main`, mediante sus blob SHA de GitHub:

```text
repository.js  3e2f6094605797e41e37037474ef1accb0d161fd
service.js     8e40262c73d07ba02e964930bebbb327aa105d2e
dashboard.js   42b3b404d868d633a1c28d761ce70f21dab30592
dashboard.css  a66b5007b3157cae8654dce6078fba2e0b4d49a7
module-loader   8887a97024e27993efe713338cb373acd72d767c
controller.js  a98deaa063a4ab4e57e1fe6ed6a8c90c5578fb5a
```

## Validación ejecutada

Pasaron:

```text
node --check modules/dashboard-logistica/dashboard-logistica.js
node --check core/module-loader.js
node --check backend/src/modules/logistica-dashboard/logistica-dashboard.repository.js
node --check backend/src/modules/logistica-dashboard/logistica-dashboard.service.js
node --check backend/src/modules/logistica-dashboard/logistica-dashboard.controller.js
node --check tests/logistica_dashboard_promedios_anio.test.js
node tests/logistica_dashboard_promedios_anio.test.js
```

La prueba específica valida:

- Año actual por defecto.
- `all` elimina únicamente el filtro anual de los promedios.
- Un año histórico se aplica a los dos promedios.
- El criterio anual es `fecha_salida_real`.
- El ring permanece en el año actual por ETD.
- Se conserva el selector de cortes semanales históricos.
- Se conservan las dos tablas mensuales del ring.
- La barra de búsqueda y el catálogo de años están presentes.
- El cache-bust del módulo cambia a `20260923-dashboard-promedios-anio-v001`.

No se ejecutó prueba E2E contra Azure/Aiven productivo desde este entorno y no se realizó ningún despliegue remoto.

## Base de datos

Este FIX:

- No crea tablas.
- No agrega columnas.
- No modifica datos.
- Solo cambia las consultas de lectura del Dashboard.

## Aplicación

Copiar los archivos del ZIP sobre la raíz del proyecto conservando sus rutas y desplegar según el flujo autorizado del proyecto.

Después validar en el Dashboard:

1. Entrada inicial → barra muestra el año actual.
2. Consultar un año registrado anterior.
3. Consultar `Todos los años`.
4. Confirmar que las dos tablas de promedios cambian.
5. Confirmar que ring, meses y cortes semanales permanecen sin cambios.
