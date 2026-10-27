# BLT NOW — Experimental NS — Fase 3

Fecha: 26/10/2026. Entrega LOCAL, sin commit ni despliegue.

## Alcance
Resumen del Día Experimental NS. Reutiliza únicamente el DOM visual y CSS del módulo original, sin ejecutar su JavaScript ni consultar sus endpoints. Lecturas GET exclusivamente de `ns_tickets_pruebas` y `ns_portafolio_pruebas`. Mantiene tablas, indicadores, filtros, gráficas, navegación por fecha y detalles de prueba, sin escritura. Los indicadores de criticidad quedan explícitamente en espera hasta la fase 4; Vo.Bo. productivo y acciones de escritura están deshabilitados.

Se agrega endpoint autenticado `GET /api/experimental-ns/resumen-dia/inicial`, protegido por rol Programador, permiso individual y puerta `EXPERIMENTAL_NS` con motor UNITED. El ámbito territorial se resuelve con el servicio oficial y se restringe estrictamente a tablas NS; si el esquema de tablas, autorización o expresión territorial no son compatibles, responde error sin consultar tablas de producción.

## Prerrequisitos
Fase 1 y 2 aplicadas y validadas LOCALMENTE. Configuración de catálogo de permisos y puerta de información aprobada e instalada por el procedimiento oficial. Estructuras actuales de Aiven compatibles y `custeventblt_mot_det` presente. La tabla experimental puede estar vacía: no se consulta producción como respaldo.

## Límites y riesgos
- Datos históricos se muestran en memoria hasta 50,000 registros por tabla, truncando muestras mayores (no supone equivalencia funcional con el módulo productivo para volúmenes superiores). Evaluar paginación backend antes de tráfico intensivo.
- Se conserva cálculo visual aproximado con datos disponibles en las sábanas; **no se certifica equivalencia exacta** de todos los indicadores con el módulo en producción hasta realizar QA comparativo con datos autorizados.
- `ns_portafolio_pruebas` debe tener `zona_id` canónica para usuarios con filtro territorial. Sin mapeo no se amplia alcance.
- La conexión directa a Aiven real y pruebas HTTP en Azure **no se ejecutaron**. Prohibido habilitar NetSuite o publicar sin autorización.
- El instalador sólo modifica localmente el agregador de rutas y reemplaza el JS de la agrupación F1 con copia de seguridad. No toca el HTML ni módulos existentes en producción.

## Pruebas
`node --test backend/tests/experimental-ns-fase2.test.js backend/tests/experimental-ns-fase3.test.js` con mocks; `node --check` de todos los JS; comprobar `git diff --check` local.
