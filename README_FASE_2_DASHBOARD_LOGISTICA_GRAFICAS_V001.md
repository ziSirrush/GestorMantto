# FASE 2 — Dashboard Logística · Gráficas por Macroetapa V001

**Proyecto:** Mantto Gestor  
**Fecha:** 23/09/2026  
**Base de código verificada:** `ziSirrush/GestorMantto` · `main` · commit `e82d048f360455351b3e50bf9339d97d31498b6b` (`Version 092126.5 Resp BLT`)  
**Prerrequisito funcional:** `FASE_1_DASHBOARD_LOGISTICA_ANALITICA_V001` aplicada y disponible en backend/Aiven.  
**Alcance:** FASE 2 únicamente. Sustituye el pipeline visual por gráficas de columnas; no agrega todavía las tablas analíticas ni el ring de contenedores de FASE 3.

## 1. Objetivo

Reemplazar en `Logística > Dashboard` la presentación vertical tipo pipeline por cuatro gráficas independientes de columnas, acomodadas en una cuadrícula 2 x 2 en escritorio:

1. **Sin Producción**
2. **Producción**
3. **Logística**
4. **Entregados por año**

Las barras crecen hacia arriba y las categorías se distribuyen horizontalmente, conforme al diseño validado antes de programar.

## 2. Fuente de datos

La vista deja de reconstruir localmente los conteos del pipeline para las gráficas y consume el contrato creado en FASE 1:

```text
GET /api/logistica/dashboard
```

Se conservan las llamadas existentes para:

```text
GET /api/logistica?limit=5000
GET /api/logistica/cortes/semanales/ultimo
```

porque continúan alimentando `Proyectos sin PP NS`, `Movimientos semanales` y el detalle de registros.

## 3. Gráficas implementadas

### 3.1 Sin Producción

Muestra, como columnas independientes:

```text
Documentación Pendiente
Primera Visita a Obra
Pendiente Liberación Cliente
Programados a Producción
```

Cada columna conserva navegación a `Logística > Reporte` filtrando por el estatus correspondiente.

### 3.2 Producción

Muestra:

```text
En Producción
Parados por Cliente
Pendiente Pago Liberación
Programado
```

Cada columna conserva navegación a `Logística > Reporte` por estatus.

### 3.3 Logística

Muestra:

```text
En Tránsito
Programa Entrega
Almacenados
```

Cada columna conserva navegación a `Logística > Reporte` por estatus.

### 3.4 Entregados por año

Usa exclusivamente el arreglo `graficas.entregados_por_anio` generado por FASE 1, cuya fuente canónica es:

```text
log_ops.fecha_entrega_real_obra
```

La vista vuelve a ordenar defensivamente:

```text
año ASC
```

por lo que se presenta siempre del año más antiguo al más reciente.

Las columnas de años son informativas en esta fase. No se fuerza navegación al Reporte porque el Reporte de Logística vigente admite filtro inicial por estatus, pero no un filtro inicial por año de `fecha_entrega_real_obra`; agregar ese comportamiento sin modificar el Reporte produciría una navegación ambigua.

## 4. Responsive / PWA

- Escritorio: las cuatro gráficas se acomodan en **2 columnas x 2 filas**.
- Pantallas más estrechas: las cards pasan a una columna.
- **Las barras dentro de cada gráfica no se convierten en una lista vertical.**
- Cuando el ancho no es suficiente, cada gráfica conserva las columnas verticales y usa desplazamiento horizontal local.
- `Entregados por año` puede crecer horizontalmente conforme existan más años sin deformar el resto del Dashboard.

## 5. Archivos modificados

```text
modules/dashboard-logistica/dashboard-logistica.js
modules/dashboard-logistica/dashboard-logistica.css
core/module-loader.js
```

`core/module-loader.js` cambia únicamente el cache-bust de los assets de `logistica-dashboard` a:

```text
20260923-dashboard-f2-v001
```

## 6. Archivo nuevo de validación

```text
tests/logistica_dashboard_fase2.test.js
```

## 7. Archivos que NO se modifican en esta fase

No se modifica:

```text
backend/
sql/
modules/reporte-logistica/
index.html
Aiven
Azure
Netlify
GitHub
```

FASE 2 depende del endpoint de FASE 1, pero no vuelve a entregar ni regenerar los archivos backend/SQL de FASE 1.

## 8. Orden correcto de aplicación

### Paso 1 — Confirmar FASE 1

Antes de instalar FASE 2, comprobar que el backend desplegado responde correctamente:

```text
GET /api/logistica/dashboard
```

con sesión/permisos autorizados.

### Paso 2 — Copiar los archivos

Copiar respetando exactamente las rutas:

```text
modules/dashboard-logistica/dashboard-logistica.js
modules/dashboard-logistica/dashboard-logistica.css
core/module-loader.js
```

### Paso 3 — Validación local

Ejecutar:

```text
node --check modules/dashboard-logistica/dashboard-logistica.js
node --check core/module-loader.js
node tests/logistica_dashboard_fase2.test.js
```

También se recomienda:

```text
cd backend
npm run check
```

### Paso 4 — Validación funcional

En `Logística > Dashboard` validar:

1. Ya no existe el bloque `Pipeline por estatus`.
2. Aparecen cuatro cards:
   - Sin Producción.
   - Producción.
   - Logística.
   - Entregados por año.
3. Las columnas de las primeras tres gráficas son verticales y clickeables.
4. El clic abre `Logística > Reporte` en el estatus elegido.
5. `Entregados por año` se ordena de izquierda a derecha del año más antiguo al más reciente.
6. `Proyectos sin PP NS` y `Movimientos semanales` conservan su comportamiento anterior.
7. En PWA/móvil las columnas siguen hacia arriba; si no caben, la gráfica tiene scroll horizontal local.

## 9. Rollback

Esta fase no modifica datos ni esquema.

Para revertirla, restaurar desde Git los tres archivos modificados a la versión inmediatamente anterior a FASE 2:

```text
modules/dashboard-logistica/dashboard-logistica.js
modules/dashboard-logistica/dashboard-logistica.css
core/module-loader.js
```

No ejecutar ningún rollback SQL para FASE 2.

## 10. Validaciones ejecutadas al generar el entregable

Se ejecutó correctamente:

```text
node --check modules/dashboard-logistica/dashboard-logistica.js
node --check core/module-loader.js
node --check tests/logistica_dashboard_fase2.test.js
node tests/logistica_dashboard_fase2.test.js
node tests/logistica_dashboard_fase1.test.js
cd backend && npm run check
```

Resultado específico FASE 2:

```text
OK - FASE_2_DASHBOARD_LOGISTICA_GRAFICAS_V001
4 gráficas de columnas independientes
Entregados por año orden ascendente
Navegación por estatus conservada
Responsive con scroll horizontal local
```

La validación realizada es **estática/automatizada sobre código local**. No se declara despliegue en GitHub Pages/Netlify, despliegue en Azure ni prueba E2E contra Aiven productivo.

## 11. Siguiente fase

FASE 3 agregará los componentes ya definidos:

```text
Tabla — promedio de salida por puerto
Ring — contenedores 20' DC vs 40' HQ del año actual
Tabla — promedio de tránsito por puerto destino + modo
```

Esos elementos no se adelantan en este entregable.
