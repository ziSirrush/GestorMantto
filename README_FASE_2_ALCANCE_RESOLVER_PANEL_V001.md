# Mantto Gestor - Fase 2 Alcance de Informacion

Base fija verificada:

- Repositorio: `ziSirrush/GestorMantto`
- Commit: `a76872eaa59c0a2d3ed37e446cc33a5546ad3336`
- `modules/panel-control/panel-control.js` blob esperado: `136fc0a6776c26324c46d69f5abd5148f780110e`
- BD: Fase 1 ya aplicada sobre `usuarios_alcance_informacion` con `AGRUPACION` + `id_agrupacion`.

## Objetivo

Implementar el contrato oficial de Alcance de Informacion sin migrar aun los modulos operativos:

1. **Acceso General**
   - `DOMINIO_COMPLETO`: United o Corellian completo.
   - `AGRUPACION`: areas/secciones especificas reutilizando `perm_agrupaciones`.
2. **Alcance Automatico**
   - Propio, implicito.
   - `REPORTA_A` mediante `usuarios.reporta_a`.
   - `REL_ADMIN` mediante `usuarios_rel_admin`.
3. **Usuarios adicionales**
   - `USUARIO`.
   - Solo el rol exacto `Programador` puede agregarlos o retirarlos.

Los permisos funcionales siguen siendo independientes. Esta fase NO implementa todavia el Guard General sobre Tickets, Portafolio, Ventas, Instalaciones ni otros modulos.

## Archivos backend para reemplazar

- `backend/src/services/information-scope-gnral.service.js`
- `backend/src/controllers/panel-control-alcance.controller.js`

No cambia `backend/src/routes/panel-control.routes.js`: las rutas existentes ya soportan esta fase.

## Frontend Panel de Control

El archivo frontend se modifica mediante:

- `APLICAR_FASE_2_PANEL_CONTROL.js`

Se usa un aplicador protegido porque debe partir exactamente del `panel-control.js` de la version fija indicada arriba. El script calcula el **Git blob SHA** antes de escribir y se cancela sin modificar nada si el archivo no corresponde a `136fc0a6776c26324c46d69f5abd5148f780110e`.

Desde la raiz del repositorio, despues de copiar el aplicador:

```powershell
node .\APLICAR_FASE_2_PANEL_CONTROL.js
```

El aplicador:

1. verifica que `modules/panel-control/panel-control.js` sea exactamente la base aprobada;
2. agrega soporte frontend para `AGRUPACION`;
3. separa visualmente Acceso General, Alcance Automatico y Usuarios adicionales;
4. presenta las areas United/Corellian desde el catalogo existente de `perm_agrupaciones`;
5. deja BLT/GENERAL fuera del Acceso General empresarial;
6. deja Usuarios adicionales en solo lectura para quien no tenga el rol exacto `Programador`;
7. valida la sintaxis del archivo resultante antes de reemplazar el original.

## Compatibilidad de despliegue

El backend protege configuraciones existentes durante una transicion de frontend:

- Si un frontend anterior no envia `agrupaciones`, conserva las agrupaciones ya registradas.
- Un actor que no sea `Programador` no puede cambiar `usuarios_adicionales`.
- `Director General` puede administrar el alcance general, pero no modificar Usuarios adicionales.
- La administracion usa `req.actorUser || req.user`, de modo que el modo Visor no presta privilegios del actor al usuario visualizado ni elimina los del actor real.

## Resolver resultante

Ademas del contrato compatible anterior, el resolver devuelve:

- `acceso_general.dominios_completos`
- `acceso_general.agrupaciones`
- `acceso_general.agrupaciones_detalle`
- `alcance_automatico.usuarios`
- `usuarios_automaticos`
- `usuarios_adicionales`
- `usuarios_visibles`

Y expone helpers para Fase 3:

- `accessGeneralAllows_gnral`
- `automaticScopeAllowsUser_gnral`
- `additionalScopeAllowsUser_gnral`
- `hasInformationScopeGrouping_gnral`

Cuando se valida `dominio + agrupacion`, el resolver confirma que la agrupacion pertenece realmente al dominio solicitado. Si no puede confirmarlo, cierra el acceso.

## Validaciones realizadas

- `node --check backend/src/services/information-scope-gnral.service.js` - OK
- `node --check backend/src/controllers/panel-control-alcance.controller.js` - OK
- `node --check APLICAR_FASE_2_PANEL_CONTROL.js` - OK
- Prueba pura de normalizacion de `agrupaciones` - OK
- Prueba de mapeo `perm_agrupaciones.empresa` a UNITED/CORELLIAN - OK
- Prueba de rechazo de agrupacion Corellian usada como United - OK
- Prueba sintetica del aplicador frontend + `node --check` del resultado - OK

No se ejecuto la backend contra Aiven ni se realizo deploy desde este entorno, por lo que la validacion runtime debe hacerse despues de aplicar los archivos.

## Orden recomendado de aplicacion

1. Reemplazar los dos archivos backend.
2. Ejecutar desde la raiz: `node .\APLICAR_FASE_2_PANEL_CONTROL.js`.
3. Validar localmente:

```powershell
node --check .\backend\src\services\information-scope-gnral.service.js
node --check .\backend\src\controllers\panel-control-alcance.controller.js
node --check .\modules\panel-control\panel-control.js
```

4. Reiniciar/desplegar backend.
5. Publicar frontend.
6. En Panel de Control > Alcance de informacion, validar un usuario de prueba antes de pasar a Fase 3.

## Pruebas manuales sugeridas antes de Fase 3

- Guardar solo una agrupacion United y confirmar lectura posterior.
- Guardar solo una agrupacion Corellian y confirmar lectura posterior.
- Activar dominio completo y confirmar que las agrupaciones de ese mismo dominio dejan de persistirse por redundancia.
- Activar `REPORTA_A` / `REL_ADMIN` y confirmar lectura posterior.
- Con `Director General`, confirmar que Usuarios adicionales se muestran pero no pueden editarse.
- Con `Programador`, agregar y retirar un Usuario adicional y confirmar lectura posterior.

