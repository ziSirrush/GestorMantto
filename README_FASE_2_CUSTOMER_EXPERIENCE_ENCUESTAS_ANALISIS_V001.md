# FASE 2 - CUSTOMER EXPERIENCE / ENCUESTAS + ANALISIS V001

## Base de integracion

- Repositorio destino: `ziSirrush/GestorMantto`
- Rama revisada: `main`
- Commit base vigente verificado: `c53d1ae348c310b2abf4ff86a9b7cc3145c41212`
- Version base observada: `Version 100526.3`
- Prerrequisito directo: `FIX_FASE_1_CUSTOMER_EXPERIENCE_DASHBOARD_V001.zip`
- Referencia funcional: INT-5 `cd240273be52014ee294b82bb4d34ba1139cd2e7` + INT-6 `2f57761f3d5defca2f5b6e9d64e61ae067d2cc6f` de `JIVMBLT/updated_code`.
- Fecha de preparacion: 2026-10-07

Este FIX es incremental sobre Fase 1. No debe aplicarse sobre `main` limpio sin aplicar primero Fase 1, porque reutiliza el montaje `/api/customer-experience` incorporado en esa fase.

## Alcance Fase 2

Integra `Customer Experience > Encuestas` y mantiene `Visitas` fuera de alcance.

### Frontend

- Activa el acceso existente `Encuestas`.
- Reutiliza `#view-placeholder` para no modificar `router.js`, `module-loader.js` ni `index.html`.
- Dos pestañas:
  - Venta / Instalaciones.
  - Mantenimiento.
- Filtros Venta / Instalaciones: tipo de encuesta, vendedor y supervisor.
- Filtros Mantenimiento: estado, superintendente y categoria.
- Listado individual y modal de detalle completo.
- Las etiquetas de detalle reutilizan el mapeo funcional documentado en INT-5.
- Mantenimiento agrega panel colapsable con:
  - 16 preguntas cerradas.
  - porcentajes por respuesta;
  - soporte de seleccion multiple;
  - drill-down a las encuestas que dieron cada respuesta;
  - 5 campos narrativos con frecuencia de palabras presentes en 2 o mas encuestas;
  - drill-down desde cada tema al detalle individual.
- Responsive incluido.

### Backend

Rutas nuevas:

- `GET /api/customer-experience/venta-instalacion/encuestas`
- `GET /api/customer-experience/mantenimiento/encuestas`
- `GET /api/customer-experience/mantenimiento/analisis-preguntas`
- `GET /api/customer-experience/mantenimiento/analisis-preguntas/detalle`
- `GET /api/customer-experience/mantenimiento/analisis-temas`
- `GET /api/customer-experience/mantenimiento/analisis-temas/detalle`

La ruta existente `/api/customer-experience/opciones` se ajusta para aceptar cualquiera de estos permisos, evitando que Encuestas dependa funcionalmente del permiso del Dashboard:

- `CUSTOMER_EXPERIENCE_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`
- `CUSTOMER_EXPERIENCE_ENCUESTAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`

Las rutas de Encuestas usan exclusivamente:

`CUSTOMER_EXPERIENCE_ENCUESTAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`

Dominio: `CORELLIAN`.
Agrupacion: `CUSTOMER_EXPERIENCE`.

Las tablas CX no exponen una llave inequívoca de usuario/territorio para aplicar record-scope sin ambiguedad. Como el detalle contiene tambien PII, Fase 2 exige alcance completo CORELLIAN y falla cerrado.

## Base de datos

No hay cambios de esquema ni datos.

Se reutilizan exclusivamente:

- `cx_venta_instalacion_encuestas`
- `cx_mantenimiento_encuestas`

Este ZIP no contiene `CREATE`, `ALTER`, `INSERT`, `UPDATE` ni `DELETE` SQL.

**No puedo confirmar desde este entorno que el permiso `CUSTOMER_EXPERIENCE_ENCUESTAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL` ya exista y este concedido en Aiven.** No se inventan IDs numericos ni se incluye una migracion de permisos sin verificar antes el catalogo real de Aiven.

## Archivos incluidos

Modificado respecto a Fase 1:

- `core/app.js`
- `backend/src/modules/customer-experience/customer-experience.routes.js`
- `backend/src/modules/customer-experience/customer-experience.controller.js`
- `backend/src/modules/customer-experience/customer-experience.service.js`
- `backend/src/modules/customer-experience/customer-experience.repository.js`

Nuevos:

- `modules/customer-experience-encuestas/customer-experience-encuestas.js`
- `modules/customer-experience-encuestas/customer-experience-encuestas.css`

No se repiten archivos de Fase 1 que no cambian. En particular no se incluye `backend/src/routes/index.js` ni `modules/customer-experience-dashboard/*`.

## Aplicacion

1. Aplicar primero Fase 1.
2. Extraer este ZIP sobre la raiz del repositorio conservando estructura.
3. Revisar `git diff`.
4. Verificar en Aiven que existe y esta concedido el permiso exacto de Encuestas antes de desplegar.
5. Ejecutar el flujo normal de despliegue backend/frontend del proyecto.

El paquete no realiza push, deploy ni cambios externos automaticamente.

## Validacion realizada

- `main` vigente verificado en `c53d1ae348c310b2abf4ff86a9b7cc3145c41212`.
- Fase 1 usada como base incremental exacta.
- `node --check`: OK en todos los JavaScript incluidos.
- Prueba aislada del servicio con repositorio simulado: PASS.
- Confirmado en la prueba:
  - listado Venta / Instalaciones;
  - listado Mantenimiento;
  - 16 preguntas cerradas;
  - conteo y drill-down de pregunta;
  - 5 campos narrativos;
  - frecuencia por tema y drill-down;
  - rechazo 400 de campo de analisis invalido.
- Verificacion de alcance del ZIP: solo 5 archivos modificados respecto a Fase 1 + 2 archivos nuevos + README.

No ejecutado desde este entorno:

- Consulta real contra Aiven.
- Verificacion real del catalogo/permisos Aiven.
- E2E en navegador.
- Deploy Azure.
- Publicacion frontend.

## Sistemas externos modificados

Ninguno. No se escribio en GitHub, Aiven, Azure ni plataforma frontend.

## Rollback Fase 2

1. Restaurar estos archivos desde Fase 1:
   - `core/app.js`
   - `backend/src/modules/customer-experience/customer-experience.routes.js`
   - `backend/src/modules/customer-experience/customer-experience.controller.js`
   - `backend/src/modules/customer-experience/customer-experience.service.js`
   - `backend/src/modules/customer-experience/customer-experience.repository.js`
2. Eliminar:
   - `modules/customer-experience-encuestas/`
3. Reiniciar/republicar los componentes correspondientes.

No eliminar tablas CX ni Dashboard CX: ambos pertenecen a fases anteriores.
