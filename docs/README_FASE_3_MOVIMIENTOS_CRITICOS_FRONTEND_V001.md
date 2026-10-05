# Fase 3 · Movimientos Críticos · Frontend V001

**Fecha:** 03/10/2026  
**Repositorio revisado:** `ziSirrush/GestorMantto`  
**Rama:** `main`  
**Commit base revisado:** `e5d0d3f5b7ab4bf85a3ed7d89557ee9566068a0c` (`Version 100226.9`)

## Objetivo

Crear el frontend modular de **Operación > Movimientos Críticos** sin mezclarlo con Movimientos Portafolio y sin adelantar la Fase 4 de navegación/integración del Core.

## Dependencias

Esta entrega presupone:

1. tabla `criticos_cortes_semanales` creada;
2. Backend V001 de Movimientos Críticos aplicada;
3. Fase 2 de permisos/catálogo aplicada, incluido el permiso:
   `OPERACION_MOVIMIENTOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`.

## Archivos nuevos

```text
modules/movimientos-criticos/movimientos-criticos.html
modules/movimientos-criticos/movimientos-criticos.css
modules/movimientos-criticos/movimientos-criticos.js
```

## Archivos documentales

```text
docs/BACKEND_ARQUITECTURA/Catalogo/modules/movimientos-criticos.md
docs/README_FASE_3_MOVIMIENTOS_CRITICOS_FRONTEND_V001.md
docs/VALIDACION_FASE_3_MOVIMIENTOS_CRITICOS_FRONTEND_V001.txt
docs/MANIFEST_FASE_3_MOVIMIENTOS_CRITICOS_FRONTEND_V001.txt
docs/CHECKSUMS_FASE_3_MOVIMIENTOS_CRITICOS_FRONTEND_V001_SHA256.txt
```

## Contrato visual

La vista es semanal desde origen. No replica la sección mensual de Movimientos Portafolio.

Indicadores:

- movimientos según filtros;
- equipos que entran a crítico;
- equipos que salen de crítico;
- equipos críticos al corte dentro del alcance visible;
- equipos evaluados dentro del alcance visible.

Tabla:

- tipo;
- fecha de movimiento;
- equipo;
- proyecto;
- zona;
- fallas del corte anterior;
- fallas del corte actual;
- supervisor.

## Independencia

El JS no contiene llamadas a `/api/portafolio` ni consume el módulo `ManttoMovimientosPortafolio`.

Los únicos endpoints del dominio funcional utilizados son:

```text
GET  /api/movimientos-criticos/semanas
GET  /api/movimientos-criticos?anio=...&semana=...
GET  /api/movimientos-criticos/snapshot?anio=...&semana=...
POST /api/movimientos-criticos/corte
```

## Seguridad

La visibilidad futura del módulo depende del permiso propio creado en Fase 2. El frontend no sustituye la autorización: todos los endpoints permanecen protegidos por la backend UNITED/OPERACION y su alcance ZOP.

El botón de corte manual se muestra solo para Programador y se oculta durante modo visor; la backend vuelve a validar el rol mediante `requireProgrammerRole`.

## Alcance de esta fase

**No se modifica:**

- `index.html`;
- `core/router.js`;
- `core/module-loader.js`;
- `core/data-sync.js`;
- `core/user-viewer.js`;
- backend;
- SQL;
- Movimientos Portafolio;
- Equipos Críticos.

Por lo tanto, el módulo queda **preparado pero todavía no navegable**. Esa integración corresponde expresamente a Fase 4.

## Aplicación

Copiar los archivos conservando sus rutas. Esta fase puede aplicarse encima de Fase 1 + Fase 2 sin reemplazar archivos de esos fixes.

No requiere ejecución SQL.

## No realizado

- No se hizo push a GitHub.
- No se desplegó GitHub Pages/Netlify.
- No se ejecutaron consultas contra Aiven desde este entorno.
- No se realizó prueba E2E con sesión real.
