# Fase 2 — Atención Prioritaria Experimental

Fecha: 05/08/2026  
Versión: V001

## Alcance

Se integró el primer módulo funcional de la agrupación **Experimental**: **Atención Prioritaria**.

La vista conserva el propósito, los indicadores y las tablas del prototipo `Desarrollo_United_Experimental`, pero fue adaptada a la arquitectura vigente de Mantto Gestor:

- Frontend modular.
- Backend Node.js + Express.
- Aiven MySQL como fuente operativa.
- Permiso visual independiente.
- Navegación hacia el detalle global de Ticket.
- Diseño responsivo para escritorio y dispositivos móviles.

## Fuente de datos

Se reutiliza exclusivamente la tabla existente:

- `tickets`

No se crean tablas nuevas, no se alteran tablas existentes y no se agregan registros operativos.

## Endpoint agregado

`GET /api/experimental/atencion-prioritaria`

Filtros opcionales:

- `estado`
- `zona`

El endpoint requiere:

- Sesión autenticada.
- Permiso efectivo `ATENCION_PRIORITARIA_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`.

## Reglas funcionales conservadas

### 1. Personas atrapadas

Incluye tickets no cerrados cuando la combinación de `descripcion`, `causa` y `accion_en_cierre` contiene alguno de estos términos:

- atrapado
- atrapada
- encerrado
- encerrada
- persona atrapada
- personas atrapadas
- rescate

### 2. Sin reporte de llegada en más de dos horas

Incluye tickets no cerrados que:

- Tienen fecha y hora de reporte válidas.
- No tienen hora de llegada registrada.
- Han permanecido abiertos durante más de dos horas.

El tiempo transcurrido se calcula en backend usando la zona horaria `America/Mexico_City`.

### 3. Equipos críticos reincidentes

Un equipo se considera crítico para esta vista cuando acumula, de forma predeterminada:

- Tres o más fallas con responsabilidad BLT.
- Dentro de los últimos 35 días.

La respuesta presenta un solo registro activo por equipo crítico y muestra su reincidencia:

- En siete días cuando existen más de una llamada en ese período.
- En caso contrario, en treinta días.

Los valores predeterminados se conservan separados dentro del servicio para poder revisarlos posteriormente sin modificar el frontend.

## Interfaz

La vista incluye:

- Filtro por Estado.
- Filtro por Zona Operativa.
- KPI de tickets de personas atrapadas.
- KPI de tickets sin llegada después de dos horas.
- KPI de equipos críticos reincidentes.
- Tabla independiente para cada categoría.
- Apertura del detalle estandarizado de Ticket al seleccionar una fila o número de ticket.
- Conversión de tablas a tarjetas en pantallas pequeñas.

## Archivos modificados o agregados

- `index.html`
- `modules/experimental/experimental.js`
- `modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.js`
- `modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.css`
- `backend/src/routes/index.js`
- `backend/src/modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.routes.js`
- `backend/src/modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.controller.js`
- `backend/src/modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.service.js`
- `backend/src/modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.repository.js`
- `docs/FASE_2_ATENCION_PRIORITARIA_EXPERIMENTAL_V001.md`

## Despliegue

1. Confirmar que las migraciones de Fase 0 y Fase 1 ya fueron ejecutadas en Aiven.
2. Desplegar los archivos del backend.
3. Publicar los archivos del frontend.
4. Activar el permiso visual del módulo para los usuarios o roles autorizados.
5. Validar los conteos contra datos reales de Aiven.

Esta fase no incluye un nuevo SQL.

## Validaciones realizadas

- Sintaxis de los archivos JavaScript nuevos y modificados.
- Validación estructural del backend.
- Prueba controlada del servicio con datos simulados para las tres categorías.
- Coincidencia del permiso backend con el permiso registrado en Fase 0.
- Existencia única de la ruta API y de los recursos frontend.
- Comparación contra la Fase 1 para confirmar que el entregable contiene únicamente los archivos relacionados con esta integración.
- Confirmación de que no existen instrucciones `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE` ni migraciones operativas en esta fase.

No fue posible ejecutar una consulta real contra Aiven desde este entorno por un error temporal de resolución DNS (`EAI_AGAIN`). No se intentó ni realizó ninguna modificación de datos.

## Fuera de alcance

- Resumen del Día Experimental.
- Entregas Recientes.
- Equipos Críticos Experimental.
- Dashboard Call Center Experimental.
- Equipos Críticos Original Experimental.
- Proyectos Críticos y su PDF.
- Creación o modificación de tablas.
