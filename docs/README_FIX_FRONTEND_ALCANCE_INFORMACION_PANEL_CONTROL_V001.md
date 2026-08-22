# FIX FRONTEND ALCANCE DE INFORMACION PANEL DE CONTROL V001

Fecha: 2026-08-19
Proyecto: Mantto Gestor
Estado: Frontend integrado / Backend pendiente

## Objetivo

Integrar dentro del Panel de Control real una nueva pestaña **Alcance de información** a nivel usuario, separada de los permisos funcionales por modulo.

- Permisos actuales: definen a que modulos/acciones puede entrar el usuario.
- Alcance de informacion: define de que usuarios/dominios puede consultar informacion dentro de esos modulos autorizados.

## Archivos modificados

- `index.html`
- `modules/panel-control/panel-control.js`
- `modules/panel-control/panel-control.css`

## Interfaz integrada

La pestaña reutiliza el patron visual actual de Usuarios en Panel de Control:

- selector lateral de usuarios;
- agrupacion por area y nivel jerarquico;
- filtro por empresa;
- editor derecho del usuario seleccionado;
- responsive/PWA.

Configuracion mostrada:

### Acceso general

- Ver toda la informacion de United.
- Ver toda la informacion de Corellian.

Estos checks no conceden acceso a modulos. Solo amplian la informacion visible dentro de los modulos ya autorizados en Permisos.

### Alcance automatico

- Ver su propia informacion.
- Ver usuarios que le reportan (`usuarios.reporta_a`).
- Ver usuarios relacionados por Rel_Admin (`usuarios_rel_admin`).

### Usuarios adicionales

Permite agregar multiples usuarios aunque no exista una relacion jerarquica o administrativa.

La relacion es global. No se limita por area; los permisos funcionales del modulo siguen siendo la primera barrera de acceso.

## Contrato backend reservado

El frontend ya apunta a un unico recurso por usuario:

```text
GET /api/panel-control/usuarios/:id/alcance-informacion
PUT /api/panel-control/usuarios/:id/alcance-informacion
```

### GET esperado

```json
{
  "data": {
    "id_usuario": 46,
    "dominios_completos": ["CORELLIAN"],
    "ver_propio": true,
    "ver_reporta_a": false,
    "ver_rel_admin": false,
    "usuarios_adicionales": [69, 42]
  }
}
```

`usuarios_adicionales` puede devolverse como IDs. El frontend tambien tolera objetos que contengan `id_SB`, `id_usuario` o `id_usuario_visible`.

### PUT enviado

```json
{
  "dominios_completos": ["CORELLIAN"],
  "ver_propio": true,
  "ver_reporta_a": false,
  "ver_rel_admin": false,
  "usuarios_adicionales": [42, 69]
}
```

Despues del PUT, el frontend ejecuta un GET del mismo recurso y verifica que la configuracion leida coincida con la solicitada. Si no coincide, no presenta el guardado como confirmado.

## Mapeo acordado hacia `usuarios_alcance_informacion`

La backend futura debe traducir el contrato anterior a la tabla ya creada:

| Frontend | Tabla |
|---|---|
| `dominios_completos: ["UNITED"]` | `tipo_alcance='DOMINIO_COMPLETO'`, `dominio='UNITED'` |
| `dominios_completos: ["CORELLIAN"]` | `tipo_alcance='DOMINIO_COMPLETO'`, `dominio='CORELLIAN'` |
| `ver_propio=true` | `tipo_alcance='USUARIO'`, `id_usuario_visible=id_usuario` |
| `ver_reporta_a=true` | `tipo_alcance='REPORTA_A'` |
| `ver_rel_admin=true` | `tipo_alcance='REL_ADMIN'` |
| `usuarios_adicionales=[69]` | `tipo_alcance='USUARIO'`, `id_usuario_visible=69` |

No se requiere ALTER adicional para representar `ver_propio`: la tabla actual permite que `id_usuario_visible` sea igual a `id_usuario`.

## Comportamiento mientras la backend no existe

Al seleccionar un usuario, el frontend intenta el GET reservado. Mientras el endpoint no exista:

- muestra claramente que la backend esta pendiente;
- permite revisar visualmente la interfaz;
- bloquea el boton local Guardar para evitar falsos guardados o llamadas PUT conocidas como invalidas.

Cuando se cree la backend con el contrato documentado, la misma interfaz comenzara a cargar y guardar informacion real sin redisenar la pestaña.

## No incluido en esta fase

- No se modifica backend.
- No se eliminan ni cambian los filtros actuales de Ventas, Instalaciones u otros modulos.
- No se modifica la tabla `usuarios_alcance_informacion`.
- No se modifica `usuarios_rel_admin`.
- No se modifica `usuarios.reporta_a`.
- No se aplica todavia el alcance efectivo a consultas operativas.

La retirada/consolidacion de filtros actuales debe hacerse en la fase backend, una vez que exista un resolvedor global de alcance.

## Validaciones realizadas

- `panel-control.js`: validacion de sintaxis con `node --check`.
- Base de `panel-control.js`: coincide con blob actual de `main` (`7206509f35ff1f388156203ed5228f7032df056f`).
- Base de `panel-control.css`: coincide con blob actual de `main` (`0c911afc2acbbdeb0d15260d8f9efde978854957`).
- Base de `index.html`: coincide con blob actual de `main` (`ce14fbbab8f5fce10e434f549c3a5af23ef428f4`).
- `index.html`: solo cambia el cache-bust de Panel de Control a `20260819-alcance-informacion-v001`.
