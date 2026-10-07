# FASE 1 - CUSTOMER EXPERIENCE / DASHBOARD CX V001

## Base de integracion

- Repositorio: `ziSirrush/GestorMantto`
- Rama revisada: `main`
- Commit base: `c53d1ae348c310b2abf4ff86a9b7cc3145c41212`
- Version base observada: `Version 100526.3`
- Fecha de preparacion: 2026-10-07

Este FIX fue preparado contra el estado anterior y conserva la estructura incremental del Gestor.

## Prerrequisito

La Fase 0 ya fue aplicada manualmente en Aiven y debe conservarse:

- `cx_venta_instalacion_encuestas`
- `cx_mantenimiento_encuestas`

Este ZIP **NO crea, altera, elimina ni carga datos en Aiven**.

## Alcance Fase 1

Integra solamente `Customer Experience > Dashboard CX`.

Backend:

- `GET /api/customer-experience/opciones`
- `GET /api/customer-experience/dashboard`
- Fuente unica: Aiven.
- Permiso funcional: `CUSTOMER_EXPERIENCE_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`.
- Agrupacion de informacion: `CUSTOMER_EXPERIENCE`.
- Dominio: `CORELLIAN`.
- Por tratarse de indicadores agregados y no existir una llave de record-scope inequívoca en las tablas CX, las consultas exigen alcance completo CORELLIAN y fallan cerrado.

Frontend:

- Activa el acceso existente `Dashboard CX`.
- Carga diferida del modulo; no se integran `Encuestas` ni `Visitas`.
- Selector de area: Ambas / Venta-Instalaciones / Mantenimiento.
- Venta/Instalaciones: filtros Tipo de encuesta, Vendedor y Supervisor; total, NPS, clasificacion y desgloses.
- Mantenimiento: filtros Estado, Zona general, Superintendente, Supervisor operativo, Categoria y Prioridad; total, NPS, Confianza, Valor, Riesgo de cambio, CSAT y desgloses.
- Responsive incluido.

## Archivos incluidos

Modificados completos:

- `core/app.js`
- `backend/src/routes/index.js`

Nuevos:

- `backend/src/modules/customer-experience/customer-experience.routes.js`
- `backend/src/modules/customer-experience/customer-experience.controller.js`
- `backend/src/modules/customer-experience/customer-experience.service.js`
- `backend/src/modules/customer-experience/customer-experience.repository.js`
- `modules/customer-experience-dashboard/customer-experience-dashboard.js`
- `modules/customer-experience-dashboard/customer-experience-dashboard.css`

No se modifican `core/router.js`, `core/module-loader.js`, `index.html`, permisos SQL, otras agrupaciones ni otros modulos.

## Aplicacion

Extraer el ZIP **sobre la raiz del repositorio**, conservando las rutas y sustituyendo los dos archivos modificados.

Despues aplicar el flujo normal del proyecto para desplegar backend/frontend. Este paquete no realiza push, deploy ni cambios externos automaticamente.

Si el navegador conserva una copia anterior de `core/app.js`, realizar recarga forzada despues de publicar el frontend.

## Validacion realizada

- Base de `core/app.js` verificada contra el blob GitHub `1ac6a8b13150cef59dcdbaea5998660cab23f652`.
- Base de `backend/src/routes/index.js` verificada contra el blob GitHub `09b10873978e9f1a17dfa6a1c190a8ce238935d2`.
- `node --check`: OK en todos los JavaScript incluidos.
- Prueba unitaria aislada del servicio CX: OK para opciones, promedios NPS, clasificacion, CSAT y area invalida.
- Verificacion estatica de rutas, permiso, tablas y modulo frontend: OK.

No ejecutado desde este entorno:

- E2E en navegador real.
- Consulta contra Aiven despues de la creacion manual de tablas.
- Deploy en Azure.
- Publicacion frontend.

## Sistemas externos modificados por este paquete

Ninguno. No se escribio en GitHub, Aiven, Azure ni plataforma de publicacion frontend.

## Rollback Fase 1

1. Restaurar `core/app.js` y `backend/src/routes/index.js` desde el commit base indicado arriba.
2. Eliminar:
   - `backend/src/modules/customer-experience/`
   - `modules/customer-experience-dashboard/`
3. Reiniciar/republicar los componentes correspondientes.

No eliminar las tablas de Fase 0 como parte de este rollback: Fase 1 no las creo ni las modifico.
