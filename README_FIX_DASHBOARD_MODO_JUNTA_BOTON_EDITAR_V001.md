# FIX_DASHBOARD_MODO_JUNTA_BOTON_EDITAR_V001

## Objetivo
Vista previa del acomodo del boton **Editar** para la futura Edicion rapida de `Instalaciones > Dashboard > Modo Junta`.

## Alcance
Este fix es **solo visual**. No agrega endpoints, no hace UPDATE, no modifica Aiven y no guarda cambios.

## Comportamiento
- El boton `✏ Editar` aparece solamente cuando `Modo Junta` esta activo.
- Se muestra solo en las secciones autorizadas para Edicion rapida: `02-OC`, `03-PM`, `04-M`, `05-PA`, `06-A`, `07-PE` y `08-T`.
- `01-SUS` no muestra boton porque no se definieron campos editables para esa seccion.
- El boton se coloca como ultima columna de la tabla y queda **sticky a la derecha**, para permanecer visible aunque la tabla tenga scroll horizontal.
- En movil conserva el icono y oculta la palabra `Editar` para reducir ancho.
- Al pulsarlo, solo resalta temporalmente el row y muestra una leyenda de vista previa. No abre formulario ni guarda datos.

## Archivos modificados
- `index.html` — cache bust de CSS/JS del Dashboard.
- `modules/instalaciones-dashboard/instalaciones-dashboard_cor.js` — render visual del boton por row en Modo Junta.
- `modules/instalaciones-dashboard/instalaciones-dashboard_cor.css` — columna sticky y estilos del boton.

## No modificado
- Backend.
- SQL/permisos.
- Reporte de Instalaciones congelado.
- Ajuste congelado.
- Cobranza Corellian/United.

## Validaciones realizadas
- `node --check` del JS modificado.
- Confirmado que `Editar` no aparece en `01-SUS` ni fuera de Modo Junta.
- Confirmado que no existen `fetch` de mutacion (`POST`, `PUT`, `PATCH`, `DELETE`) nuevos.
- Confirmado que el fix contiene solo los 3 archivos modificados y este README/checksums.
