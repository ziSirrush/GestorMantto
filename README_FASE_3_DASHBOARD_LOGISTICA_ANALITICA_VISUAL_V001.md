# FASE 3 — Dashboard Logística · Analítica Visual V001

**Proyecto:** Mantto Gestor  
**Fecha:** 23/09/2026  
**Base de código verificada:** `ziSirrush/GestorMantto` · `main` · commit `e82d048f360455351b3e50bf9339d97d31498b6b` (`Version 092126.5 Resp BLT`)  
**Prerrequisitos:** `FASE_1_DASHBOARD_LOGISTICA_ANALITICA_V001` + `FASE_2_DASHBOARD_LOGISTICA_GRAFICAS_V001` aplicadas.  
**Alcance:** FASE 3 únicamente. Agrega la capa visual de analítica acordada debajo de las cuatro gráficas de FASE 2.

## 1. Objetivo

Agregar tres componentes independientes a `Logística > Dashboard`, consumiendo el contrato ya creado en FASE 1:

1. **Tabla — Promedio de salida por puerto**.
2. **Ring — Contenedores del año actual: 20' DC vs 40' HQ**.
3. **Tabla — Promedio de tránsito según modo + puerto destino**.

FASE 3 no vuelve a calcular datos en frontend y no agrega nuevas consultas SQL. El frontend presenta los agregados entregados por:

```text
GET /api/logistica/dashboard
```

## 2. Componente 1 — Tabla de promedio de salida por puerto

Fuente del payload:

```text
data.tablas.salida_por_puerto
```

Columnas visibles:

```text
Puerto origen
Operaciones
Promedio días salida
```

La regla de negocio permanece en backend (FASE 1):

```text
AVG(fecha_salida_real - fecha_exw)
GROUP BY puerto_origen
```

Solo participan pares de fechas válidos y duraciones no negativas.

## 3. Componente 2 — Ring de contenedores del año actual

Fuente del payload:

```text
data.contenedores
```

El ring muestra exclusivamente:

```text
20' DC
40' HQ
```

Incluye:

- total físico de contenedores;
- conteo 20' DC;
- conteo 40' HQ;
- porcentaje de cada tipo;
- año usado por el backend;
- cantidad de operaciones que sí tienen dato de contenedores.

La regla temporal continúa siendo la establecida en FASE 1:

```text
año(fecha_salida_estimada / ETD) = año actual CDMX
```

El conteo es físico y **no convierte 40' HQ a TEU equivalente**.

### Dependencia de datos

FASE 1 agregó en `log_ops`:

```text
contenedores_20_dc
contenedores_40_hq
```

El ring solo mostrará valores distintos de cero cuando la sincronización de Logística esté poblando esas columnas. El GAS emisor no forma parte del repositorio validado, por lo que este entregable no modifica ni puede confirmar ese emisor.

Si no existe dato, la UI muestra un ring vacío y una nota explícita; no inventa valores.

## 4. Componente 3 — Tabla de promedio de tránsito según modo

Fuente del payload:

```text
data.tablas.llegada_por_modo_puerto
```

Columnas visibles:

```text
Puerto destino
Modo ICT
Operaciones
Promedio días llegada
```

La regla de negocio permanece en backend:

```text
AVG(fecha_llegada_real - fecha_salida_real)
GROUP BY puerto_destino + ict
```

Se muestran **todas las combinaciones devueltas por Aiven**, no un top-N.

## 5. Distribución visual

En escritorio:

```text
┌────────────────────────────────────┬─────────────────────────────┐
│ TABLA SALIDA POR PUERTO            │ RING CONTENEDORES           │
└────────────────────────────────────┴─────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ TABLA PROMEDIO DE TRÁNSITO SEGÚN MODO                            │
└──────────────────────────────────────────────────────────────────┘
```

En pantallas menores:

- tabla de salida y ring pasan a una sola columna;
- el ring conserva composición circular;
- las tablas usan desplazamiento horizontal **dentro de su card**;
- no se genera overflow horizontal de la vista completa.

Las cuatro gráficas de columnas de FASE 2 permanecen intactas arriba de esta sección.

## 6. Archivos modificados

```text
modules/dashboard-logistica/dashboard-logistica.js
modules/dashboard-logistica/dashboard-logistica.css
core/module-loader.js
```

`core/module-loader.js` cambia únicamente el cache-bust del módulo a:

```text
20260923-dashboard-f3-v001
```

## 7. Archivo nuevo de validación

```text
tests/logistica_dashboard_fase3.test.js
```

## 8. Archivos/sistemas que NO se modifican en FASE 3

```text
backend/
sql/
modules/reporte-logistica/
index.html
Aiven
Azure
Netlify
GitHub
Google Apps Script
```

FASE 3 consume el contrato de FASE 1 y no requiere cambios adicionales de esquema ni backend.

## 9. Orden correcto de aplicación

### Paso 1 — Confirmar FASE 1

Validar que exista y responda:

```text
GET /api/logistica/dashboard
```

El payload debe contener:

```text
tablas.salida_por_puerto
tablas.llegada_por_modo_puerto
contenedores
```

### Paso 2 — Confirmar FASE 2

Verificar que `Logística > Dashboard` ya muestre las cuatro gráficas:

```text
Sin Producción
Producción
Logística
Entregados por año
```

### Paso 3 — Aplicar FASE 3 frontend

Copiar conservando rutas:

```text
modules/dashboard-logistica/dashboard-logistica.js
modules/dashboard-logistica/dashboard-logistica.css
core/module-loader.js
```

### Paso 4 — Validar Local

Validar:

- tabla por puerto completa;
- promedios con un decimal y sufijo `días`;
- ring 20'/40';
- total y porcentajes del ring;
- tabla por puerto destino + modo ICT;
- gráficas de FASE 2 sin regresión;
- tablas originales `Proyectos sin PP NS` y `Movimientos semanales` sin regresión;
- responsive/PWA.

### Paso 5 — Promoción normal

Conforme a la Constitución:

```text
Local -> GitHub Pages -> Netlify
```

Netlify de Producción requiere despliegue manual.

## 10. Validaciones ejecutadas sobre este entregable

### Sintaxis

```text
node --check modules/dashboard-logistica/dashboard-logistica.js
```

Resultado: **OK**.

### Test específico FASE 3

```text
node tests/logistica_dashboard_fase3.test.js
```

Resultado: **OK**.

Valida entre otros puntos:

- permanencia de las cuatro gráficas de FASE 2;
- tabla de salida por puerto;
- consumo de `salida_por_puerto`;
- ring de contenedores;
- consumo de `contenedores_20_dc` y `contenedores_40_hq`;
- tabla de tránsito por modo + puerto;
- consumo de `llegada_por_modo_puerto`;
- cache-bust FASE 3;
- responsive del bloque analítico.

### Regresión backend FASE 1

```text
node tests/logistica_dashboard_fase1.test.js
```

Resultado:

```text
6 pruebas
6 OK
0 fallidas
```

### Validación estructural backend

```text
cd backend
npm run check
```

Resultado: **OK — Estructura base validada correctamente**.

## 11. Estado de despliegue

Este ZIP fue preparado y validado estáticamente/localmente en el entorno de trabajo.

**No se modificó:**

- GitHub;
- Aiven;
- Azure;
- Netlify;
- Google Apps Script.

No se declara prueba E2E contra Aiven/Azure ni despliegue productivo porque no se ejecutaron desde este entregable.
