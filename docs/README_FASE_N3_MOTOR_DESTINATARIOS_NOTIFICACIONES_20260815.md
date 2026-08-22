# FASE N3 - Motor de destinatarios de Notificaciones

Fecha: 2026-08-15  
Proyecto: Mantto Gestor  
Dependencias: **N1 aplicada en Aiven** (`notificacion_evento_roles`) + **N2 backend** + **FIX 03 Motor Sync / Notificaciones**.

## Objetivo

Centralizar la elegibilidad final de una notificacion configurada por matriz sin inventar destinatarios nuevos.

Flujo N3:

`destinatarios relacionados entregados por el modulo -> actor excluido -> Rol Principal -> Interaccion/Rol habilitado -> Zona Operativa -> Politica -> Campana/Push`

N3 no conecta todavia Comentario ni las tres interacciones de Direccion. Esa migracion se conserva para N6.

## Regla de relacion con la entidad

El servicio general **no busca personas adicionales por rol**.

Cada modulo debe seguir entregando a `notificationService.emit(...)` solamente usuarios que ya esten relacionados con la entidad que genero la interaccion. N3 toma esa lista como conjunto candidato y solamente la reduce.

Por lo tanto, configurar un rol en Panel de Control **nunca amplia por si solo el acceso a un registro**.

## Rol Principal

Para eventos administrados por la nueva matriz se usa exclusivamente:

- `usuario_roles.activo = 1`
- `usuario_roles.principal = 1`
- rol activo en `roles`

Si un usuario no tiene exactamente un Rol Principal activo, N3 lo omite de forma segura.

Los roles secundarios no agregan destinatarios ni cambian la politica.

## Matriz Interaccion -> Rol -> Politica

Un evento entra en modo matriz cuando ya existe al menos una fila para su `codigo_evento` en `notificacion_evento_roles`, activa o inactiva.

En modo matriz:

- Rol sin relacion activa: no recibe.
- `OBLIGATORIA`: Campana + Push, sin permitir que preferencias personales la silencien.
- `OPCIONAL`: respeta las preferencias personales de Campana/Push y `silenciada`.
- Si no existe preferencia personal, se utilizan los defaults ya existentes del catalogo `notificacion_eventos` (`campana_default` y `push_default`).

Los eventos que todavia no tienen ninguna fila en `notificacion_evento_roles` conservan temporalmente el comportamiento legacy. Esto permite migrar modulo por modulo sin apagar las notificaciones actuales.

## Zona Operativa

Para un evento administrado por matriz, el modulo debe declarar expresamente uno de estos contextos al llamar `emit`:

```js
{
  zonaOperativaId: 4
}
```

Tambien se admite una lista:

```js
{
  zonasOperativasIds: [4, 5]
}
```

El usuario solamente permanece como destinatario si existe una relacion activa en `usuario_zop` para alguna de esas zonas.

Para una interaccion que realmente no tenga dimension de Zona Operativa, el modulo debe declararlo explicitamente:

```js
{
  zonaOperativaNoAplica: true
}
```

Si un evento ya esta administrado por matriz y el modulo no declara ni una zona ni `zonaOperativaNoAplica`, N3 trabaja **fail-closed**: no crea la notificacion y registra la causa `ZONA_OPERATIVA_NO_DECLARADA`.

Esto evita que una futura integracion omita accidentalmente el filtro zonal.

**Zona Administrativa no se implementa en N3**, de acuerdo con la decision actual. Se incorporara cuando se entregue la relacion correspondiente.

## Canales

N3 hace que la politica por Rol Principal sea consistente tambien con los canales:

- OBLIGATORIA -> Campana visible + Push elegible.
- OPCIONAL -> Campana y Push se evalúan independientemente.

Para soportar `Push activo + Campana desactivada` sin crear una tabla nueva, la fila puede existir en `sup_notificaciones` como cola interna, pero las consultas de Campana la ocultan mediante la politica/preferencia efectiva. El job Push consulta la misma politica antes de enviar.

FIX 03 se conserva: el endpoint ligero `/api/notificaciones/estado` sigue existiendo y ahora cuenta solamente notificaciones visibles por Campana cuando el evento ya usa matriz.

## Compatibilidad con notificaciones existentes

Para eventos todavia no migrados a la matriz:

- se conserva el comportamiento legacy del servicio general;
- se conserva el criterio legacy del job Push;
- la Campana no cambia su visibilidad por N3.

Esto evita un corte masivo durante la migracion incremental.

## Importante sobre inserciones directas legacy

N3 puede filtrar Rol Principal/Politica/Canal al mostrar Campana y al procesar Push, pero **Zona Operativa solo puede validarse antes de crear la notificacion**, porque `sup_notificaciones` no almacena la zona de origen.

Por eso los eventos que deban respetar zona deben migrarse en N6 a `notificationService.emit(...)` entregando el contexto zonal. N3 no modifica ni inventa esa relacion por modulo.

## Optimizacion de consultas

La ruta nueva del motor evita el patron N+1 del servicio anterior:

- 1 consulta para obtener el evento y saber si usa matriz.
- 1 consulta masiva para Rol Principal + politica + preferencias + Zona Operativa de todos los candidatos.
- 1 INSERT masivo para las notificaciones elegibles.

No se ejecuta una consulta de preferencias por cada destinatario.

El modo legacy tambien agrupa las preferencias y el INSERT para conservar compatibilidad con menos consultas.

## Archivos incluidos

### Nuevo

- `backend/src/services/notifications/notification-policy.js`

### Modificados

- `backend/src/services/notifications/notification.repository.js`
- `backend/src/services/notifications/notification.service.js`
- `backend/src/modules/notificaciones/notificaciones.repository.js`
- `backend/src/modules/home/home.repository.js`
- `backend/src/modules/push-notifications/push-notifications.repository.js`

No se incluye el proyecto completo.

## Lo que N3 NO hace

- No agrega ni modifica tablas o columnas.
- No inserta configuraciones en `notificacion_evento_roles`.
- No modifica la vista de Panel de Control; corresponde a N4.
- No modifica Mi Perfil; corresponde a N5.
- No conecta Comentario ni las tres interacciones nuevas; corresponde a N6.
- No implementa Zona Administrativa.
- No agrega destinatarios por cargo, rol o relacion no confirmada.
- No elimina Web Push ni cambia el job a SSE.
- No cambia la frecuencia de polling de FIX 03.

## Validaciones realizadas

- `node --check` correcto en los 6 archivos de N3.
- `npm run check` del backend completo: `Estructura base validada correctamente.`
- Verificado que la base acumulada contiene simultaneamente:
  - FIX 03: `/api/notificaciones/estado`;
  - N2: `/api/panel-control/notificaciones/matriz` GET/PUT.
- Pruebas aisladas del motor, sin Aiven, para:
  - politica OBLIGATORIA en zona autorizada;
  - OPCIONAL con Push activo y Campana desactivada;
  - rol no habilitado;
  - usuario fuera de Zona Operativa;
  - ausencia de contexto zonal en modo fail-closed;
  - declaracion explicita `zonaOperativaNoAplica`;
  - compatibilidad legacy.
- Verificado que solo cambian los 6 archivos listados respecto de la base acumulada FIX 03 + N2.
- No se inicio el backend con credenciales reales ni se ejecutaron consultas contra Aiven durante la generacion.

## Estado al desplegar N3 ahora

Como la tabla `notificacion_evento_roles` inicia vacia y N3 no agrega filas, desplegar N3 por si solo **no activa la nueva politica sobre ningun evento**. La migracion comienza cuando una interaccion reciba configuracion de matriz y posteriormente sea conectada correctamente por su modulo.

## Siguiente fase

N4: **Panel de Control -> Notificaciones**, para administrar visualmente la matriz Interaccion -> Rol -> Obligatoria/Opcional respetando la paleta actual del Gestor.
