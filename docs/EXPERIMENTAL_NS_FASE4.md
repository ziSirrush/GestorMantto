# BLT NOW · Experimental NS · Fase 4 · Equipos Críticos

**Fecha:** 26/10/2026  
**Alcance:** código local, NO desplegado, NO ejecutado en Aiven, sin commit.  
**Referencia GitHub de los módulos productivos:** `ziSirrush/GestorMantto` rama `main`, commit `aaa1f1ed30798716d0885dee1692ce56b1583402`.  
**Precedencia:** Fases 1, 2 y 3 aplicadas en el repositorio local.

## Desarrollo

Nuevo módulo independiente dentro de **Experimental NS** → **Equipos Críticos**. Se copia el patrón visual (se reutiliza la hoja CSS original de Equipos Críticos para mantener apariencia), pero **NO** se importa ni ejecuta el JavaScript productivo. El nuevo JavaScript consume solamente:

- `GET /api/experimental-ns/equipos-criticos/inicial`
- `GET /api/experimental-ns/equipos-criticos/detalle?tipo=equipo|proyecto&valor=...&dias=...`

Son las únicas rutas nuevas; no se introducen escrituras, preferencias, cambios de perfil, historial global, notificaciones, ni sincronización NS. Se preserva la agrupación F1/F3 de modo que Resumen del Día sigue usando su propia ruta. La tabla de Proyectos de Mantenimiento se implementará en F5; «Proyectos Críticos» es únicamente una subsección del módulo Equipos Críticos de F4.

## Reglas de cálculo

- Criterio de equipos: al menos N tickets con `responsabilidad` que incluya «BLT» durante los últimos D días, replicando el umbral y semántica de la consulta productiva.
- Indicadores: fallas BLT período, año actual, U365; llamadas año; responsabilidad CLIENTE; último BLT/CLIENTE; MTBC del período, año actual y U365.
- U365: equipos con al menos tres fallas BLT dentro de los 365 días calendario.
- Proyectos críticos: umbral configurable de fallas BLT totales y mínimo configurable por equipo. El MTBC utiliza equipos con fallas y fallas BLT del intervalo.
- Fechas de calendario de `America/Mexico_City`; el repositorio extrae `DATE_FORMAT` directamente de MySQL para evitar desviaciones de un día por conversión de zonas horarias.
- Las preferencias del usuario solo se leen como valores iniciales; editar criterios **no escribe en el perfil** ni modifica la semántica visual del sistema productivo.
- Vistas de detalle exclusivamente NS, con máximo 1,000 tickets; exportación PDF de la página actual (no pretende ser exportación total).

## Seguridad y separación

- `JWT + rol Programador + permiso funcional + puerta de información EXPERIMENTAL_NS + alcance UNITED` mediante middleware y servicio oficial de F2.
- Las consultas de datos mencionan únicamente `ns_portafolio_pruebas` y `ns_tickets_pruebas`. Sólo `INFORMATION_SCHEMA` para verificación de metadatos; nunca se usa un fallback productivo.
- El alcance de tickets usa la expresión oficial territorial con rebinding estricto a Portafolio NS de F2. Cada ticket se relaciona únicamente por `codigo_equipo` con `numero_equipo` de Portafolio NS, NO por texto de nombre de proyecto del propio ticket.
- En cálculos agrupados se prioriza `id_proyecto_cobranza`, si existe; si no está presente se utiliza zona estructurada y nombre, pero este último caso **no garantiza desambiguar proyectos homónimos en la misma zona**. Validarlo antes de declarar equivalencia con Producción.
- Datos sin código relacionado, inactivos y «No en Servicio» no se cuentan como equipos activos. Códigos duplicados abortan con HTTP 503. No se usan tablas productivas para completar relaciones.
- Consulta acotada: máximo 50,000 registros de cada tabla en F4. Si hay más, responde 503 antes de generar totales incompletos. Se deberá migrar a agregación/paginación SQL antes de volúmenes mayores.
- El backend exige columnas de la tabla clonada, además del campo `custeventblt_mot_det`. Un esquema incompatible devuelve 503.
- Para usuarios sin llave maestra, la tabla de prueba debe contener `zona_id` oficial. Si sólo llega `zona_operativa` como texto, no se suple el FK por equivalencia libre.

## Diferencias identificadas frente al módulo original

- Se conserva el estilo y las tablas/criterios principales, pero no se ejecutan complementos productivos de `EstadosVisuales`, `ManttoDetails`, personalización persistente ni exportación PDF masiva. Son funcionalidades de la versión productiva que requieren adaptación NS adicional antes de afirmar equivalencia total.
- Las fechas y conteos dependen del histórico real disponible en las tablas NS. Una extracción de últimos 20 minutos **no permite reconstruir U365/año actual completos**. F4 no fabrica tickets faltantes ni consulta producción.
- La interfaz indica «Solo NS» de manera visible.

## Archivos afectados

**Creados:** `backend/src/modules/experimental-ns/experimental-ns-equipos-criticos.{metrics,repository,service,controller,routes}.js`, `backend/tests/experimental-ns-fase4.test.js`, `modules/experimental-ns/equipos-criticos/equipos-criticos-ns.{js,css}` y este documento.

**Modificado completo:** `modules/experimental-ns/experimental-ns.js` (basado exactamente en F3).

**Montaje incremental de rutas:** `backend/src/routes/index.js`, por instrucciones PowerShell con validación y respaldo; no se sustituye por una versión tomada del GitHub `main` que todavía no contiene F1–F3.

## Verificaciones

- `node --check` para todos los JS nuevos/modificados.
- `node --test backend/tests/experimental-ns-fase2.test.js backend/tests/experimental-ns-fase3.test.js backend/tests/experimental-ns-fase4.test.js`: **46/46 pruebas unitarias con fixtures/mocks aprobadas**, incluidas fechas, no mezcla por nombre de proyecto, límites, permisos, endpoints GET, no consultas productivas y métricas.
- **No se probaron** endpoints HTTP contra Azure, una conexión real MySQL Aiven, ni el navegador/PWA. No se validó la exactitud de un año de métricas contra NetSuite en vivo.
- No ejecutar commit/push, NetSuite, SQL ni despliegue hasta autorización.
