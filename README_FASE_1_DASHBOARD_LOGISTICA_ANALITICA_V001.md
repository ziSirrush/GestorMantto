# FASE 1 — Dashboard Logística · Datos y Backend Analítico V001

**Proyecto:** Mantto Gestor  
**Fecha:** 23/09/2026  
**Base verificada:** `ziSirrush/GestorMantto` · `main` · commit `e82d048f360455351b3e50bf9339d97d31498b6b` (`Version 092126.5 Resp BLT`)  
**Alcance:** FASE 1 únicamente. No modifica todavía la vista del Dashboard.

## 1. Objetivo

Preparar en backend/Aiven el contrato de datos que usarán las FASES 2 y 3 del nuevo `Logística > Dashboard`.

La FASE 1 deja disponibles:

1. Conteos por estatus separados en:
   - Sin Producción.
   - Producción.
   - Logística.
2. Entregados por año usando exclusivamente `log_ops.fecha_entrega_real_obra`, ordenados del año más antiguo al más reciente.
3. Tabla de promedio de días de salida por puerto.
4. Tabla de promedio de días de llegada/tránsito por modo + puerto.
5. Datos para el ring de contenedores `20' DC` vs `40' HQ` del año actual.

## 2. Endpoint nuevo

```text
GET /api/logistica/dashboard
```

Requiere:

```text
Sesión válida
+ LOGISTICA_DASHBOARD_PIPELINE_POR_ESTATUS_ETAPAS.VER
+ Puerta de información LOGISTICA / CORELLIAN
+ alcance completo CORELLIAN
```

La consulta es agregada a nivel global. `log_ops` todavía identifica asesor/supervisor mediante texto y no mediante una FK estructurada apta para aplicar record-scope de forma inequívoca; por ello el endpoint falla cerrado para alcance parcial en lugar de ampliar acceso por coincidencias textuales.

La respuesta usa exclusivamente Aiven como fuente operativa:

```text
{
  ok,
  source: "aiven",
  generated_at,
  data: {
    anio_actual,
    graficas: {
      sin_produccion,
      produccion,
      logistica,
      entregados_por_anio
    },
    tablas: {
      salida_por_puerto,
      llegada_por_modo_puerto
    },
    contenedores,
    reglas_calculo
  }
}
```

## 3. Reglas de cálculo implementadas

### 3.1 Entregados por año

Fuente de fecha confirmada:

```text
log_ops.fecha_entrega_real_obra
```

Regla:

```text
estatus = ENTREGADO
+ año(fecha_entrega_real_obra)
+ COUNT(*)
+ ORDER BY año ASC
```

No se usa fecha de creación, año del PP ni otra fecha alternativa.

### 3.2 Promedio de días de salida por puerto

Agrupación:

```text
puerto_origen
```

Duración real:

```text
fecha_salida_real - fecha_exw
```

Solo participan filas con ambas fechas válidas y duración no negativa.

La salida incluye:

```text
puerto
operaciones
promedio_dias_salida
```

### 3.3 Promedio de llegada según modo + puerto

Agrupación:

```text
puerto_destino + ict
```

Duración real:

```text
fecha_llegada_real - fecha_salida_real
```

Solo participan filas con ambas fechas válidas y duración no negativa.

La salida incluye:

```text
puerto_destino
modo
operaciones
promedio_dias_llegada
```

> Esta definición corresponde al tránsito real salida -> llegada. Si posteriormente se decide que "llegada" debe significar entrega final en obra, el cambio queda aislado en el Repository antes de programar la FASE 3 visual.

### 3.4 Contenedores del año actual

La fuente histórica revisada contiene dos columnas reales:

```text
20' DC
40' HQ
```

`log_ops` no contenía esos campos en la sábana revisada, por lo que esta FASE reutiliza la tabla existente y agrega únicamente:

```text
contenedores_20_dc INT UNSIGNED NULL
contenedores_40_hq INT UNSIGNED NULL
```

No se crea ninguna tabla nueva.

El backend de sincronización acepta ambos contratos:

```text
contenedores_20_dc
contenedores_40_hq
```

y también los encabezados originales:

```text
20' DC
40' HQ
```

Para el ring del año actual, la FASE 1 deja el criterio temporal como:

```text
año(fecha_salida_estimada / ETD) = año actual de America/Mexico_City
```

El conteo es físico, no TEU equivalente:

```text
SUM(contenedores_20_dc)
SUM(contenedores_40_hq)
```

## 4. Archivos modificados

```text
backend/src/controllers/logistica.controller.js
backend/src/routes/index.js
```

## 5. Archivos nuevos

```text
backend/src/modules/logistica-dashboard/logistica-dashboard.repository.js
backend/src/modules/logistica-dashboard/logistica-dashboard.service.js
backend/src/modules/logistica-dashboard/logistica-dashboard.controller.js
backend/src/modules/logistica-dashboard/logistica-dashboard.routes.js
sql/20260923_FASE_1_DASHBOARD_LOGISTICA_ANALITICA_V001.sql
sql/20260923_FASE_1_DASHBOARD_LOGISTICA_ANALITICA_V001_ROLLBACK.sql
tests/logistica_dashboard_fase1.test.js
README_FASE_1_DASHBOARD_LOGISTICA_ANALITICA_V001.md
```

## 6. Orden correcto de aplicación

### Paso 1 — Respaldo

Antes de modificar Aiven, generar respaldo de `log_ops` o respaldo completo según el procedimiento vigente.

### Paso 2 — Laboratorio

Aplicar primero:

```text
sql/20260923_FASE_1_DASHBOARD_LOGISTICA_ANALITICA_V001.sql
```

en una restauración/laboratorio y validar el POSTCHECK.

### Paso 3 — Aiven

Una vez validado, aplicar el mismo SQL en Aiven.

### Paso 4 — Backend Azure

Desplegar los archivos backend de esta FASE.

### Paso 5 — Sincronización de Logística

Ejecutar la sincronización normal de `log_ops` para comenzar a poblar los dos conteos de contenedores.

## 7. Dependencia externa detectada

El emisor Google Apps Script que envía `Logistica-Ops` a `/api/logistica/sync` **no está dentro del repositorio validado**.

Por ello no puedo confirmar desde este entregable si hoy el emisor manda todas las columnas crudas o si construye un payload limitado.

El backend queda preparado para recibir tanto:

```text
20' DC / 40' HQ
```

como:

```text
contenedores_20_dc / contenedores_40_hq
```

Si el GAS actual filtra columnas antes de enviar, será necesario agregar esos dos campos en ese script. No se inventó ni modificó un `.gs` que no fue entregado.

## 8. Validaciones ejecutadas

### Sintaxis Node

Validado con `node --check`:

```text
backend/src/modules/logistica-dashboard/logistica-dashboard.repository.js
backend/src/modules/logistica-dashboard/logistica-dashboard.service.js
backend/src/modules/logistica-dashboard/logistica-dashboard.controller.js
backend/src/modules/logistica-dashboard/logistica-dashboard.routes.js
backend/src/controllers/logistica.controller.js
backend/src/routes/index.js
```

Resultado: **OK**.

### Pruebas unitarias de esta FASE

```text
node --test tests/logistica_dashboard_fase1.test.js
```

Resultado:

```text
6 pruebas
6 OK
0 fallidas
```

Se validó:

- normalización de estatus con/sin acentos;
- orden ascendente de entregados por año;
- conteo físico y porcentajes 20' DC / 40' HQ;
- reutilización de `log_ops` sin crear tabla nueva;
- contrato de sincronización de contenedores;
- Guard General + permiso funcional + fail-closed para consultas agregadas con alcance parcial.

### Estructura backend

```text
cd backend
npm run check
```

Resultado: **Estructura base validada correctamente**.

## 9. Validaciones NO ejecutadas

No se ejecutó:

- ALTER sobre Aiven;
- consulta real del endpoint contra Aiven productivo;
- despliegue en Azure;
- prueba E2E desde frontend;
- modificación de GitHub;
- despliegue de GitHub Pages;
- despliegue de Netlify.

Por lo tanto esta entrega está **validada estáticamente y por pruebas unitarias**, no desplegada.

## 10. Rollback

Si es necesario revertir completamente la estructura nueva y ya existe respaldo:

```text
sql/20260923_FASE_1_DASHBOARD_LOGISTICA_ANALITICA_V001_ROLLBACK.sql
```

Advertencia: ese rollback elimina también los valores que ya se hayan sincronizado en las dos columnas de contenedores.

## 11. Lo que NO cambia en esta FASE

- No se toca `modules/dashboard-logistica/dashboard-logistica.js`.
- No se toca `modules/dashboard-logistica/dashboard-logistica.css`.
- El pipeline actual sigue visible hasta FASE 2.
- No se toca Reporte Logística.
- No se crean tablas nuevas.
- No se modifica Aiven, Azure, GitHub ni Netlify desde este entregable.
