# FASE N2 - Backend de administracion de Notificaciones

Fecha: 2026-08-15  
Proyecto: Mantto Gestor  
Dependencia: **FASE N1 aplicada en Aiven** (`notificacion_evento_roles`)

## Objetivo

Agregar exclusivamente el backend para consultar y guardar la matriz:

`Interaccion -> Rol -> Politica`

Esta fase **no conecta todavia el motor de destinatarios**, no modifica Mi Perfil, no agrega la pestana visual de Panel de Control y no toca FIX 03.

## Archivos incluidos

- `backend/src/controllers/panel-control-notificaciones.controller.js` - nuevo.
- `backend/src/routes/panel-control.routes.js` - modificado.

No se incluye el proyecto completo.

## Endpoints nuevos

### GET `/api/panel-control/notificaciones/matriz`

Devuelve:

- `eventos`: interacciones activas provenientes de `notificacion_eventos`.
- `roles`: roles activos obtenidos dinamicamente de `roles`, respetando el mismo alcance administrativo por empresa usado actualmente por Panel de Control.
- `configuraciones`: relaciones existentes en `notificacion_evento_roles`.
- `alcance`: alcance administrativo efectivo del actor.

N2 no utiliza `notificacion_eventos.obligatoria` como politica por rol. Ese campo global permanece intacto durante la transicion.

### PUT `/api/panel-control/notificaciones/matriz`

Recibe solamente cambios de celdas, no la matriz completa:

```json
{
  "changes": [
    {
      "codigo_evento": "CODIGO_EXISTENTE",
      "id_rol": 1,
      "habilitado": true,
      "politica": "OBLIGATORIA"
    },
    {
      "codigo_evento": "OTRO_CODIGO_EXISTENTE",
      "id_rol": 2,
      "habilitado": false
    }
  ]
}
```

Reglas:

- `habilitado=true` exige `politica=OBLIGATORIA|OPCIONAL`.
- `habilitado=false` desactiva una relacion existente (`activo=0`). Si nunca existio, no crea una fila innecesaria.
- Una relacion habilitada se inserta o reactiva por `codigo_evento + id_rol`.
- Se validan las interacciones activas y los roles activos antes de escribir.
- El actor no puede configurar roles fuera de su alcance administrativo de Panel de Control.
- Los cambios se ejecutan en transaccion.
- Los cambios recibidos se agrupan en operaciones masivas para evitar una consulta por celda.

## Alcance administrativo reutilizado

Se conserva el criterio ya existente de Panel de Control:

- `Programador` y `Director General`: GENERAL + UNITED + CORELLIAN.
- `Programador United`: GENERAL + UNITED.
- `Programador Corellian`: GENERAL + CORELLIAN.

No se hardcodea el catalogo de roles que aparece en la matriz; se consulta desde `roles`.

## Lo que N2 NO hace

- No agrega registros por defecto a `notificacion_evento_roles`.
- No decide que roles reciben Comentarios ni las tres interacciones de Direccion.
- No cambia el motor que genera Campana/Push.
- No aplica todavia Rol Principal al resolver destinatarios.
- No aplica todavia Zona Operativa.
- No implementa Zona Administrativa.
- No cambia `notificacion_preferencias`.
- No cambia `notificacion_eventos`.
- No modifica `sup_notificaciones`.
- No modifica FIX 03.
- No agrega frontend de Panel de Control.

## Validaciones realizadas

- `node --check backend/src/controllers/panel-control-notificaciones.controller.js`.
- `node --check backend/src/routes/panel-control.routes.js`.
- Verificada la ruta existente `/api/panel-control` en `backend/src/routes/index.js`; por tanto los endpoints finales son `/api/panel-control/notificaciones/matriz`.
- Se cargó el router real con las dependencias del proyecto y se confirmó el registro de `GET /notificaciones/matriz` y `PUT /notificaciones/matriz`.
- `npm run check` del proyecto completo terminó con `Estructura base validada correctamente.` después de aplicar N2 sobre la referencia local auditada.
- Verificado que `panel-control.routes.js` parte exactamente del blob de referencia `b16d2ebae9bf2028fa45c2183fcbb00cd7ee49a3` de la base auditada.
- N2 no incluye SQL ni cambios de esquema.
- No se inició el backend con las credenciales reales ni se ejecutó `/api/health`, para no activar jobs o conexiones contra Aiven durante la generación del artefacto. Esa validación queda para el entorno local/deploy controlado.

## Prueba funcional posterior al deploy local/backend

Con una sesion autorizada, primero ejecutar GET. Debe responder `ok:true`; `configuraciones` debe estar vacio mientras no se haya guardado ninguna politica.

Despues puede probarse PUT con **un codigo_evento e id_rol reales** obtenidos del propio GET. No usar valores inventados.

Al deshabilitar esa misma relacion con `habilitado:false`, el registro debe quedar con `activo=0` y dejar de aparecer como habilitado en la futura interfaz.

## Siguiente fase

N3 conectara el motor de destinatarios a la matriz usando el **Rol Principal** (`usuario_roles.principal=1`) y el filtro de **Zona Operativa** (`usuario_zop`), sin ampliar el acceso del usuario al registro que origina la notificacion.
