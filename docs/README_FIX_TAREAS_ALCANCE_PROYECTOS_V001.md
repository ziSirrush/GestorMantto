# FIX_TAREAS_ALCANCE_PROYECTOS_V001

Fecha: 2026-08-27
Proyecto: Gestor Mantto
Base revisada: `ziSirrush/GestorMantto` `main` en commit `b8c1031afc40e39a00850290a83a1241a4f864e6` (`Alcance Completo 082626.1 - FIX Cobranza`).

## Objetivo

Corregir el catalogo **Empresa / Razon social -> Proyecto -> Equipo** de Tareas Personales y Colaborativas sin duplicar las reglas de Alcance de Informacion.

## Regla funcional implementada

1. La empresa predeterminada se toma de `usuarios.empresa` del usuario efectivo.
2. Se validan las llaves maestras reales `DOMINIO_COMPLETO` de CORELLIAN y UNITED mediante el resolver central de Alcance.
3. El selector existente **Empresa / Razon social** solo permite cambiar entre Corellian y United cuando el usuario tiene **ambas** llaves maestras.
4. Si no tiene ambas llaves, la empresa queda limitada a su empresa predeterminada. El rol, `multiempresa`, Programador o Director no amplian este selector.
5. Para CORELLIAN se reutiliza `alcance_cor`; los proyectos/equipos se filtran con el conjunto de usuarios visibles que ya resuelve el motor sobre las columnas reales `ins_fl.id_asesor`, `ins_fl.id_sup` e `ins_fl.id_admin`.
6. Para UNITED se reutiliza `alcance_uni`; los proyectos/equipos se filtran por el `portafolio.zona_id` autorizado por el motor. Una llave maestra UNITED usa el comportamiento vigente del motor y no aplica filtro zonal.
7. Equipo siempre depende del Proyecto seleccionado. Sin proyecto, el catalogo de equipos queda vacio.
8. En POST/PUT se vuelve a validar en backend que el Proyecto y el Equipo pertenezcan al alcance permitido; no se confia en el valor enviado por el navegador.
9. Si tiene ambas llaves maestras se muestra bajo el selector la nota aprobada:

> Tienes acceso a ambas razones sociales. Selecciona la empresa para consultar los proyectos disponibles correspondientes a esa razón social.

## Fuentes de datos utilizadas

- CORELLIAN: `ins_fl` (`proyecto`, `id_proyecto`, `referencia_sitio`, `id_asesor`, `id_sup`, `id_admin`, `activo`).
- UNITED: `portafolio` (`proyecto`, `numero_equipo`, `identificacion_sitio`, `zona_id`, `estado_registro`).
- Llaves maestras y reglas de alcance: servicios centrales existentes `alcance-resolver`, `alcance-cor` y `alcance-uni`.

No se crea ni modifica ninguna tabla.

## Archivos incluidos

- `backend/src/modules/pendientes/pendientes.routes.js`
  - Cambia solamente el endpoint de catalogos al nuevo servicio de alcance.
  - Agrega validacion de Proyecto/Equipo despues del parser de archivos y antes de crear/editar la tarea.
- `backend/src/modules/pendientes/pendientes-project-scope.service.js`
  - Nuevo servicio aislado para resolver las dos llaves, empresa efectiva, motor de alcance, catalogos y validacion anti-manipulacion.
- `styles/home.css`
  - Conserva el archivo actual y agrega solo las reglas visuales del selector de razon social.
  - Oculta la opcion legacy `Sin filtro de empresa`.
  - Con una sola razon social el selector queda visualmente bloqueado.
  - La nota aparece unicamente cuando el backend entrega las dos razones sociales, condicion que el nuevo servicio solo cumple cuando existen ambas llaves maestras.

`modules/home/home.js` no se modifica: ya contiene el comportamiento validado de limpiar Proyecto/Equipo al cambiar Empresa y de recargar Equipo al cambiar Proyecto. Se evita tocar ese archivo para reducir riesgo.

## Validaciones realizadas

- `node --check backend/src/modules/pendientes/pendientes.routes.js`: OK.
- `node --check backend/src/modules/pendientes/pendientes-project-scope.service.js`: OK.
- Balance de llaves CSS: OK.
- Se verifico que la parte preexistente de `styles/home.css` conserva exactamente el blob Git original `e72338e0dffb8123e158a099f096e8a7c7835b5d`; el FIX se agrega al final.
- No se realizaron escrituras en Aiven ni en GitHub.
- No se pudo ejecutar una prueba E2E contra Aiven/Netlify desde este entorno; debe validarse tras el deploy con usuarios representativos.

## Pruebas funcionales recomendadas despues del deploy

- Usuario CORELLIAN sin ambas llaves: una sola razon social; proyectos segun `alcance_cor`; equipos solo del proyecto elegido.
- Usuario UNITED sin ambas llaves: una sola razon social; proyectos por `zona_id`; equipos solo del proyecto elegido.
- Usuario con llave CORELLIAN + llave UNITED: aparecen ambas razones sociales, inicia con `usuarios.empresa`, muestra la nota y permite alternar catalogos.
- Usuario Director/Programador sin ambas llaves: no obtiene selector multiempresa por rol.
- Intento manual de enviar un proyecto o equipo fuera de alcance: backend responde 403.
