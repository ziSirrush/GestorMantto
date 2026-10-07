# FIX FASE 1 · ENTREGAS · VISIBILIDAD V002

## Causa confirmada
La agrupación `Entregas` sí está incluida en `index.html`, pero `core/app.js` ejecuta `applyTemporarySidebarPermissions()` al iniciar la navegación.

El mapa `TEMP_SIDEBAR_PERMISSIONS` no incluía `entregas_control`, por lo que el botón `data-permission="entregas_control"` quedaba oculto antes de que el flujo de permisos nativos terminara de resolver el catálogo.

## Cambio
Se agrega exclusivamente:

```js
entregas_control:true
```

al mapa temporal existente, siguiendo el mismo patrón actualmente usado por Customer Experience.

## Archivo modificado
- `core/app.js`

El archivo se entrega completo y conserva su ruta original.

## Seguridad / permisos
Este cambio corrige la visibilidad temporal del sidebar. No sustituye los permisos nativos.

El acceso final continúa dependiendo de:
`ENTREGAS_CONTROL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`

y del backend de Entregas.

Fase 0 concede inicialmente los permisos de Entregas al rol `DIRECTOR_GENERAL` (rol 1). Otros roles/usuarios requieren que el permiso efectivo se habilite desde el esquema normal de permisos del Gestor.

## Dependencias
- Fase 0 Entregas aplicada.
- Fase 1 Entregas V001 corregida aplicada.

## Validaciones realizadas
- `node --check core/app.js`: PASS.
- Confirmación de que `index.html` de Fase 1 contiene `data-group="entregas"`: PASS.
- Confirmación de código visual: `ENTREGAS_CONTROL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`: PASS.
- Confirmación de que Fase 0 crea exactamente ese código de permiso: PASS.
- Diff contra Fase 1 corregida: solo una línea funcional agregada.

## No ejecutado
- No se modificó GitHub.
- No se modificó Aiven.
- No se desplegó Azure.
- No se publicó Netlify.
- No se ejecutó E2E en navegador real.
