# BLT NOW · Experimental NS · Fase 5 — Proyectos de Mantenimiento y QA

**Fecha:** 26/10/2026. **Entrega:** exclusivamente local, sin despliegue/commit/SQL/NetSuite.  
**Base de código productivo consultada:** GitHub `ziSirrush/GestorMantto`, rama `main`, commit `aaa1f1ed30798716d0885dee1692ce56b1583402` y estructura SQL de respaldo 07/10/2026.  
**Requiere:** Fases 1–4 aplicadas en el repositorio local. DDL y catálogo reales aún deben verificarse con Aiven.

## Alcance funcional

- Agrupación **Experimental NS > Proyectos de Mantenimiento** ya creada en F1.
- Reutiliza exclusivamente CSS visual `modules/proyectos/proyectos.css`; JS y backend son independientes.
- Reproduce diseño base: filtros **Zona, Estado, Supervisor y Buscar**; cuatro KPI (**Proyectos, Equipos, Parados, MTBC U365**); tabla principal de **17 columnas**; modal con KPIs, gráficos mensuales, responsabilidad, equipos y tickets. Se agrega paginación de 30 y avisos explícitos de calidad NS.
- Los detalles son solo lectura y se abren **dentro del módulo NS**; no se llama a `ManttoProyectos`, `ManttoDetails`, `EstadosVisuales_gnral` ni rutas productivas.
- El campo de Tickets `custeventblt_mot_det` se presenta en el detalle.

## API y acceso

`GET /api/experimental-ns/proyectos-mantenimiento/inicial` con filtros `zona`, `estado`, `supervisor`, `search`, `page`, `page_size`, `dias_criticos`, `min_fallas`.  
`GET /api/experimental-ns/proyectos-mantenimiento/detalle?proyecto_clave=...` con los mismos filtros opcionales.

Guard de backend obligatorio: JWT humano, **actor Programador**, permiso individual `EXPERIMENTAL_NS_PROYECTOS_MANTENIMIENTO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`, puerta de información `EXPERIMENTAL_NS` y alcance UNITED del usuario efectivo. Las credenciales de NetSuite integrador **no** autorizan esta API humana.

Consultas operativas **exclusivamente** a `ns_portafolio_pruebas` y `ns_tickets_pruebas`. Metadatos en `INFORMATION_SCHEMA`; catálogos de permisos consultados por middleware central. Sin POST/PUT/PATCH/DELETE; no existen escrituras ni relaciones a tablas operativas de producción. Reutiliza `experimental-ns.scope.js` F2 para reemplazo territorial estricto en subconsultas de Tickets.

## Reglas de integridad y cálculos

- **Relación Ticket → Equipo:** únicamente por `tickets.codigo_equipo = portafolio.numero_equipo` normalizado, jamás por nombres de proyecto capturados en Tickets.
- **Clave de proyecto:** `id_proyecto_cobranza` si existe; en ausencia, `zona_id + nombre normalizado` con advertencia explícita **identidad provisional**, que **no garantiza** distinguir homónimos dentro de una zona. Sin ambas señales se omite el registro de agregación.
- Duplicados activos del código de equipo o un ID de proyecto con nombres incompatibles: HTTP 503 y sin totales engañosos. No se atribuyen Tickets que carecen de equipo activo dentro del ámbito autorizado.
- **Activos:** `estado_registro = 1`, no inactivo, no en estatus «NO EN SERVICIO» (mismo criterio del piloto F4). Paros: último ticket cuyo estado final contenga «NO FUNC»/«PARAD»/«NO OPER».
- **Ventanas CDMX:** año en curso desde enero; U365 desde hoy menos 364 días; últimos 35 días desde hoy menos 35 días inclusive (igual al servicio actual). Tickets con fecha futura se excluyen.
- **MTBC proyecto U365:** `(365 × equipos con al menos una falla BLT U365) / total fallas BLT U365`; no se inventa valor si el denominador es cero.
- Se usan sólo tickets presentes en NS. Una carga de últimos **20 minutos no constituye un histórico de 365 días**: el panel puede devolver cero/MTBC vacío aunque el sistema original tenga actividad. **No reemplazar con datos productivos**.
- Límite por snapshot: máximo 50,000 equipos + 50,000 tickets. Al exceder devuelve 503 antes de calcular estadísticas parciales. Detalle: 500 equipos y 1,000 tickets visibles con indicador de truncamiento.

## Archivos

**Nuevos** (9):
- `backend/src/modules/experimental-ns/experimental-ns-proyectos-mantenimiento.repository.js`
- `backend/src/modules/experimental-ns/experimental-ns-proyectos-mantenimiento.metrics.js`
- `backend/src/modules/experimental-ns/experimental-ns-proyectos-mantenimiento.service.js`
- `backend/src/modules/experimental-ns/experimental-ns-proyectos-mantenimiento.controller.js`
- `backend/src/modules/experimental-ns/experimental-ns-proyectos-mantenimiento.routes.js`
- `backend/tests/experimental-ns-fase5.test.js`
- `modules/experimental-ns/proyectos-mantenimiento/proyectos-mantenimiento-ns.js`
- `modules/experimental-ns/proyectos-mantenimiento/proyectos-mantenimiento-ns.css`
- `docs/EXPERIMENTAL_NS_FASE5.md`

**Modificados completos** (2): `modules/experimental-ns/experimental-ns.js` (tomado de F4); `tests/experimental-ns-fase1.test.js` (antes probaba cascarones «En construcción» y queda obsoleto al integrar F3–F5).  
**Cambio localizado durante aplicación local:** importar y montar router F5 desde `backend/src/routes/index.js`, con backup y revisión de F4; ninguna otra ruta de producción se modifica.

## QA ejecutada (sin Aiven)

- `node --check` del código F5 y shell: sintaxis válida.
- `node --test backend/tests/experimental-ns-fase{2,3,4,5}.test.js`: **79/79** con mocks de BD, autorizaciones, fixtures de zona/proyecto, métricas, parámetros, límites, frontend VM y aislamiento.
- F1 actualizado se verifica en PowerShell con el `index.html` y `core/router.js` reales del repositorio local; no se declara completado aquí sin ellos.
- **Pendiente**: HTTP local con cuenta real y permisos, verificación de esquema/zonas y columnas en Aiven, navegador móvil/PWA, comparación de KPIs contra un histórico completo de NetSuite, prueba de regresión general de la aplicación y validación GitHub Pages.

## Limitaciones finales

1. No se declara equivalencia 1:1 del módulo productivo: no se integran `EstadosVisuales`, detalles globales, agrupaciones de equivalencia ni fuentes auxiliares (cobranza/instalaciones).
2. El piloto F3 Resumen del Día todavía declara la criticidad `PENDIENTE_FASE4`; requiere validación funcional adicional para intercambiar métricas de F4, no se tocó en F5 para evitar regresiones.
3. La agrupación F1 tiene control visual provisional por rol; la puerta/permiso/alcance F2 debe existir en Aiven para permitir lectura de datos.
4. No se confirmó el DDL en vivo, el contenido NS ni una ejecución real contra Azure/MySQL; los resultados se basan en mocks, código actual y dump de referencia.

**Producción, GitHub, Azure, Aiven, NetSuite y Netlify permanecieron intactos.**
