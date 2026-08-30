# FASE 2 — Cierre Optimización Dashboard Ventas V001

Fecha: 2026-08-30  
Proyecto: Gestor Mantto  
Repositorio fuente verificado: `ziSirrush/GestorMantto` · rama `main`

## Objetivo

Cerrar la optimización visual/funcional del Dashboard de Ventas iniciada en Fase 1, sin cambiar backend, permisos ni estructura de Aiven.

Esta entrega es **acumulativa**: los cuatro archivos productivos incluidos ya contienen la Fase 1 de optimización y los ajustes de cierre de esta Fase 2.

## Reglas cerradas

1. Cada apertura del Dashboard inicia en **Responsable = Todos**.
2. Cada apertura inicia en **Información visible = Todas las secciones**.
3. Cada apertura inicia en **Año comercial = año actual**; cambiar el año dentro de la sesión sigue funcionando normalmente.
4. No se persiste una selección parcial anterior de responsable/sección entre entradas al módulo.
5. La lista conserva el orden oficial 1–10:
   1. Prospección
   2. Redes
   3. Cotizaciones
   4. Clientes
   5. Ventas
   6. Perdidos
   7. Logística
   8. Activos
   9. Pendientes asignados
   10. Pendientes creados
6. `Todas las secciones` renderiza simultáneamente todas las secciones disponibles/autorizadas que devuelve el backend.
7. Se conserva `TABLE_PAGE_SIZE = 30` y la paginación independiente de cada tabla.
8. Logística conserva sus **12 subsecciones** y cada subsección conserva su paginación independiente de 30.
9. En modo `Todos`, las tablas comerciales conservan la columna de responsable. En modo individual, se oculta la columna redundante donde ya estaba definido; Logística conserva `Supervisor(a)` y `Asesor` en ambos modos.
10. El Dashboard ocupa el **100% del ancho útil** y usa `box-sizing:border-box` defensivo para evitar que padding/controles generen ancho extra.
11. Las subsecciones de Logística ya no usan `width:100% + margin:14px`; ahora viven dentro de un contenedor con `gap/padding`, evitando desbordamiento horizontal por márgenes externos.
12. Al reingresar al módulo se limpia el contenido visual anterior antes de consultar Aiven, evitando mostrar momentáneamente datos de un responsable/filtro anterior.
13. Si falla la carga de usuarios, el selector vuelve a habilitarse mediante `finally`.
14. Se preserva la ruta/carga de **Ventas · Proyectos de interés** introducida previamente.

## Archivos productivos incluidos

- `modules/ventas-dashboard/ventas-dashboard.html`
- `modules/ventas-dashboard/ventas-dashboard.css`
- `modules/ventas-dashboard/ventas-dashboard.js`
- `core/module-loader.js`

## Baseline

### GitHub `main` verificado antes de Fase 1

- `modules/ventas-dashboard/ventas-dashboard.html` — blob `084f514b9d342f0d0acdd3d9843a89d23f987801`
- `modules/ventas-dashboard/ventas-dashboard.css` — blob `e3e301e142b7b353d7d835f315f630a617476036`
- `modules/ventas-dashboard/ventas-dashboard.js` — blob `8ac8c58875e7fa681bebbae1396310fd395a4702`
- `core/module-loader.js` — blob `bdb70a8d7063b614964db4f43f9ace946066421f`

### Baseline local Fase 1 utilizado para construir Fase 2

- HTML — git blob `8ecdde55c53ff110df1f54ac9eb8a93ffb54d184`
- CSS — git blob `92ba30416e7f427a1430f3d6dd71b7c365c6fa48`
- JS — git blob `161ce3a3987bb499d52e5b2b08ddaca9f29fb61f`
- module-loader — git blob `26596db0614abc6a98270491109cfacf0a6c0717`

## Backend verificado, no modificado

El servicio actual del Dashboard ya resuelve `Todos` mediante el alcance comercial central y valida que un usuario individual esté dentro del alcance autorizado. El año del backend también usa el año actual cuando no se proporciona `anio`.

Por ello Fase 2 no reconstruye seguridad ni filtros de información en frontend y no modifica backend.

## Cache

Versión nueva:

`20260830-fase2-cierre-optimizacion-v001`

Se actualiza únicamente la entrada de `ventas-dashboard` en `core/module-loader.js`. La entrada existente de `ventas-proyectos-interes` se conserva.

## SQL / Aiven

**No hay SQL nuevo en esta fase.**  
No se crean tablas, columnas, índices ni triggers.  
No se modifica Aiven.

## Aplicación

Esta Fase 2 puede aplicarse:

- después de `FASE_1_OPTIMIZACION_DASHBOARD_VENTAS_V001`, o
- directamente sobre los mismos cuatro archivos si Fase 1 todavía no se copió, porque esta entrega es acumulativa.

Sigue requiriendo que las Fases funcionales previas del Dashboard (Ventas, Logística, Activos, etc.) ya estén integradas en backend según el plan original.

## Validación incluida

```bash
node --check modules/ventas-dashboard/ventas-dashboard.js
node --check core/module-loader.js
node tests/fase2_cierre_optimizacion_dashboard_contract.test.js
node tests/fase2_dashboard_runtime.test.js
```

## Pendiente de confirmar en ambiente real

Las validaciones de sintaxis, contrato y runtime aislado pasan. No se ejecutó navegador autenticado contra Aiven/Azure ni deploy de producción. Por tanto, el resultado visual/E2E real debe confirmarse después de integrar el ZIP.
