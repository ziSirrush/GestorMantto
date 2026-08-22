# FASE 2 - Frontend Instalaciones > Carpetas V001

## Alcance

Esta fase monta el modulo visual de Carpetas sobre el backend de Fase 1 y el catalogo de permisos de Fase 0.

No modifica los modulos congelados Reporte de Instalaciones, Ajuste ni Dashboard.
No modifica las rutas M2M de sincronizacion de Drive.
No crea tablas nuevas.

## Vista implementada

El modulo contiene tres paneles:

1. Carpetas registradas
   - nombre de carpeta;
   - ID de carpeta Drive;
   - enlace a Drive cuando el permiso REDIRIGIR es efectivo;
   - proyecto relacionado o Sin relacionar;
   - estatus Relacionada / Disponible;
   - ultima sincronizacion.

2. Proyectos sin carpeta
   - ID Proyecto;
   - Proyecto;
   - Supervisor;
   - Estatus.

3. Relacionar proyecto con carpeta
   - selector de proyectos sin relacion activa;
   - selector de carpetas disponibles;
   - Guardar relacion.

## Permisos consumidos

- INSTALACIONES_CARPETAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL
- INSTALACIONES_CARPETAS_CARPETAS_REGISTRADAS_LISTADO.VER
- INSTALACIONES_CARPETAS_CARPETAS_REGISTRADAS_LISTADO.BUSCAR
- INSTALACIONES_CARPETAS_CARPETAS_REGISTRADAS_LISTADO.REDIRIGIR
- INSTALACIONES_CARPETAS_PROYECTOS_SIN_CARPETA_LISTADO.VER
- INSTALACIONES_CARPETAS_PROYECTOS_SIN_CARPETA_LISTADO.BUSCAR
- INSTALACIONES_CARPETAS_RELACIONADOR_FORMULARIO.VER
- INSTALACIONES_CARPETAS_RELACIONADOR_FORMULARIO.CREAR

## Endpoints consumidos

- GET /api/instalaciones/carpetas/bootstrap
- POST /api/instalaciones/carpetas/relacion

Despues de una relacion exitosa se vuelve a consultar unicamente el bootstrap del modulo. No se recarga la aplicacion completa.

## Navegacion

Se integra la ruta frontend:

- instalaciones-carpetas

La opcion se agrega dentro de la agrupacion Instalaciones, despues de Documentacion Pendiente y antes de Proyectos Cerrados.

Back conserva el contexto mediante el router general. Una apertura nueva del modulo limpia busquedas y seleccion del relacionador.

## Responsive / PWA

- Panel 1 ocupa el ancho disponible.
- Paneles 2 y 3 se muestran en columnas cuando existe espacio.
- En pantallas angostas se apilan sin ocultar informacion.
- Las tablas conservan todas sus columnas mediante desplazamiento horizontal.

## Archivos modificados / nuevos

Modificados:
- index.html
- core/router.js

Nuevos:
- modules/instalaciones-carpetas/instalaciones-carpetas_cor.html
- modules/instalaciones-carpetas/instalaciones-carpetas_cor.css
- modules/instalaciones-carpetas/instalaciones-carpetas_cor.js

## Dependencias previas

Requiere:
- FASE_0_INSTALACIONES_CARPETAS_V001
- FASE_1_BACKEND_INSTALACIONES_CARPETAS_V001

## Validaciones realizadas

- node --check del JavaScript del modulo y core/router.js.
- Verificacion de una sola ruta instalaciones-carpetas en sidebar, vista y router.
- Verificacion de referencias CSS/JS del nuevo modulo en index.html.
- Verificacion de los ocho codigos de permiso de Fase 0.
- Verificacion de que el frontend solo consume los dos endpoints definidos en Fase 1.
- Verificacion de que el ZIP contiene solo archivos nuevos o modificados de Fase 2.

## Validacion runtime pendiente

No se puede confirmar desde este paquete el estado del backend desplegado ni los datos reales de Aiven. Despues del deploy debe validarse:
- acceso con permisos efectivos;
- carga de carpetas;
- proyectos sin carpeta;
- apertura de enlace Drive;
- guardado Proyecto - Carpeta;
- actualizacion inmediata de los tres paneles;
- bloqueo en Modo Visor;
- comportamiento responsive.
