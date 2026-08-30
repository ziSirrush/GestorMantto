# FASE 1 — Optimización Dashboard Ventas V001

Fecha: 2026-08-30  
Proyecto: Gestor Mantto  
Repositorio fuente verificado: `ziSirrush/GestorMantto` · rama `main`

## Objetivo

Aplicar al Dashboard de Ventas la misma filosofía de optimización de información acordada para el Gestor, sin modificar backend ni Aiven.

### Reglas implementadas

1. Al abrir Dashboard Ventas, el responsable inicia **siempre en `Todos`**.
2. Al abrir Dashboard Ventas, la información visible inicia **siempre en `Todas las secciones`**.
3. La selección parcial de secciones **no se persiste** al salir y volver a entrar al módulo.
4. Los pills/checks de secciones se sustituyen por **una lista desplegable única**.
5. La lista conserva el orden oficial:
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
6. `Todas las secciones` muestra simultáneamente todas las secciones disponibles/autorizadas que devuelve el backend.
7. Si se selecciona una sección individual, solo se renderiza esa sección usando los datos ya cargados; **no se hace una consulta adicional innecesaria**.
8. El Dashboard ocupa el **100% del ancho útil** de la vista y elimina el `max-width:1600px` anterior.
9. Responsable + Año + Información visible + PDF quedan en una barra horizontal de escritorio, con responsive en 2 columnas y 1 columna.
10. Se conserva `TABLE_PAGE_SIZE = 30`, las paginaciones independientes y toda la lógica funcional acumulada de las Fases 1–6 anteriores.

## Archivos modificados

- `modules/ventas-dashboard/ventas-dashboard.html`
- `modules/ventas-dashboard/ventas-dashboard.css`
- `modules/ventas-dashboard/ventas-dashboard.js`
- `core/module-loader.js`

## Baseline verificado contra GitHub main

- `modules/ventas-dashboard/ventas-dashboard.html` — blob SHA `084f514b9d342f0d0acdd3d9843a89d23f987801`
- `modules/ventas-dashboard/ventas-dashboard.css` — blob SHA `e3e301e142b7b353d7d835f315f630a617476036`
- `modules/ventas-dashboard/ventas-dashboard.js` — blob SHA `8ac8c58875e7fa681bebbae1396310fd395a4702`
- `core/module-loader.js` — blob SHA `bdb70a8d7063b614964db4f43f9ace946066421f`

Los archivos JS/HTML/module-loader usados como baseline local fueron comprobados mediante `git hash-object` contra esos SHA de GitHub.

## Qué NO modifica esta fase

- No modifica backend.
- No modifica endpoints.
- No modifica Aiven.
- No contiene SQL.
- No crea tablas ni columnas.
- No modifica permisos ni Alcance de Información.
- No cambia las fórmulas de Logística o Activos.
- No cambia la paginación 30×30.
- No modifica Proyectos de interés.
- No hace commit, push ni deploy.

## Integración

Copiar los archivos completos respetando las rutas indicadas. Después reiniciar/recargar el frontend para tomar el cache-bust nuevo del `module-loader.js`.

Versión de cache nueva para Dashboard Ventas:

`20260830-fase1-optimizacion-info-v001`

## Validación incluida

Ejecutar:

```bash
node --check modules/ventas-dashboard/ventas-dashboard.js
node --check core/module-loader.js
node tests/fase1_optimizacion_dashboard_contract.test.js
```

## Validación pendiente en ambiente real

La validación estática pasó. No se ejecutó navegador conectado al backend/Aiven ni despliegue. Por ello, el comportamiento visual final en producción debe verificarse después de integrar el ZIP.
