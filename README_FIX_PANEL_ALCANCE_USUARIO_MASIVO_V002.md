# FIX_PANEL_ALCANCE_USUARIO_MASIVO_V002

## Base revisada

- Repositorio: `ziSirrush/GestorMantto`
- Base backend / repo revisada: `e898d5e111c4b4ae0db5bdf09c4fd9cea84be853`
- Cambio exclusivamente frontend del Panel de Control.
- No modifica backend, SQL ni módulos operativos.

## Objetivo

Completar visualmente **Alcance de Información** respetando la arquitectura ya implementada en backend: cada alcance pertenece a un usuario individual. La selección masiva únicamente repite la misma activación sobre varios `id_usuario`; no crea un alcance global ni una relación compartida.

## Cambios

### Editor individual

- Mantiene el panel lateral de usuarios como selector principal.
- Agrega **Llaves / Acceso General** por empresa:
  - United completo.
  - Corellian completo.
- Agrega **Puertas / agrupaciones** usando el catálogo real de agrupaciones ya cargado por Panel de Control.
- Si una llave maestra está activa, sus puertas quedan cubiertas y no se guardan duplicadas.
- Conserva Alcance Automático:
  - Propio, siempre incluido.
  - `REPORTA_A`.
  - `REL_ADMIN`.
- Conserva Usuarios adicionales como excepción individual.
- Usuarios adicionales solo pueden ser modificados cuando backend devuelve la capacidad correspondiente para Programador.

### Asignación masiva

- Sigue siendo una herramienta secundaria dentro del panel de usuarios.
- Agrega filtro por **rol**, además de búsqueda y empresa; permite casos como filtrar todos los Supervisores y seleccionar los visibles.
- Permite aplicar las mismas llaves, puertas y reglas automáticas a varios usuarios.
- El payload manda `usuario_ids` y `agrupaciones` al endpoint masivo existente.
- La operación sigue siendo **aditiva**, como está implementada actualmente en backend:
  - activa lo seleccionado;
  - no desactiva configuraciones existentes;
  - no modifica Usuarios adicionales.
- Cada usuario queda persistido individualmente en `usuarios_alcance_informacion`.

## Separación de conceptos

- **Permisos funcionales:** qué módulo / acción puede usar; se administran en Roles y Permisos / Permisos por usuario.
- **Alcance de Información:** qué información puede consultar dentro de las áreas autorizadas.
- Tener una llave o puerta no concede un permiso funcional.
- Tener un permiso funcional no concede automáticamente acceso a información fuera del Alcance.

## Archivos modificados

- `modules/panel-control/panel-control.js`
- `modules/panel-control/panel-control.css`

## Validaciones realizadas

- `node --check modules/panel-control/panel-control.js` OK.
- Verificación estática de editor individual por usuario OK.
- Verificación de `agrupaciones` individuales y masivas OK.
- Filtro por rol OK.
- Texto y flujo de persistencia individual en masivo OK.
- Restricción visual de Usuarios adicionales según capacidad backend OK.
- Balance de bloques CSS OK.
- El ZIP no contiene scripts aplicadores.

## Aplicación

Copia/reemplaza directamente estos dos archivos conservando la estructura:

```text
modules/panel-control/panel-control.js
modules/panel-control/panel-control.css
```

No hay ningún script adicional que ejecutar.

Después valida:

```powershell
node --check .\modules\panel-control\panel-control.js
git status
```

QA mínimo recomendado en Panel de Control > Alcance de información:

1. Seleccionar un usuario y confirmar que solo se edita su alcance.
2. Activar/desactivar una puerta y guardar; volver a abrir el usuario y confirmar lectura.
3. Activar United/Corellian completo y comprobar que las puertas correspondientes quedan cubiertas.
4. Filtrar Rol = Supervisor, entrar en Asignación masiva, seleccionar visibles y aplicar una puerta.
5. Reabrir dos Supervisores de forma individual y confirmar que cada uno conserva su propio registro de alcance.
6. Confirmar que la asignación masiva no altera Usuarios adicionales.
7. Confirmar que un actor sin capacidad de Programador no puede editar Usuarios adicionales.

## Git

```powershell
git add modules/panel-control/panel-control.js
git add modules/panel-control/panel-control.css
git add README_FIX_PANEL_ALCANCE_USUARIO_MASIVO_V002.md
git commit -m "Implementacion de Norma 081926.8 - Alcance de Informacion Frontend"
git push
```

## Nota de validación

La sintaxis y las reglas estáticas del frontend fueron verificadas. El funcionamiento runtime contra Aiven debe confirmarse después del despliegue con el QA anterior.