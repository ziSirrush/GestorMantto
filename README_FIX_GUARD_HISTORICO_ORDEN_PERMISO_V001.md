# FIX menor — Guard General · orden historico permiso → agrupacion V001

## Base verificada

- Repositorio: `JIVMBLT/updated_code`
- Rama: `main`
- Commit base: `759309e37fdc8f40ddd0c3670e4863495c631426`
- Mensaje: `fix FASES DE ALCANCE 1 - 11 . 1`
- Blob base del middleware: `19f08e82f60b92586994ae1c30b7c6e410aa13b5`

## Hallazgo corregido

El FIX F3/F4 introdujo correctamente `groupingPermissionPairsAny`, pero movio la resolucion de `perm_agrupaciones` antes de la validacion funcional para todos los modos del Guard.

En el modo historico esto cambiaba el orden previo:

`permiso funcional -> agrupacion -> puerta`

por:

`agrupacion -> permiso funcional -> puerta`

No abria informacion, pero podia ejecutar consultas innecesarias y convertir una denegacion funcional esperada en un error de configuracion si la agrupacion estaba invalida/inactiva.

## Cambio

Solo se modifica:

- `backend/src/middleware/information-access-gnral.middleware.js`

El Guard ahora declara `groupings` vacio y lo resuelve en el punto correcto de cada modalidad:

- **Modo emparejado F3/F4:** conserva el comportamiento nuevo y resuelve agrupaciones antes de evaluar cada par `permiso + puerta`.
- **Modo historico:** primero valida el permiso funcional; si falla responde `403 FUNCTIONAL_PERMISSION_DENIED` sin consultar `perm_agrupaciones`. Solo con permiso valido resuelve agrupaciones y despues la puerta.

No se modifica:

- rutas de Tickets;
- `groupingPermissionPairsAny`;
- llaves maestras;
- `usuario_zop` ni cuartos UNITED;
- frontend;
- BD/Aiven;
- permisos o catalogos;
- consultas de detalle Ticket;
- endpoints M2M.

## Archivo de validacion incluido

- `backend/scripts/test-fix-guard-historico-orden-permiso.js`

Comprueba:

1. modo historico sin permiso: `403 FUNCTIONAL_PERMISSION_DENIED` y **0 consultas** a `perm_agrupaciones`;
2. modo historico con permiso + puerta: sigue autorizando;
3. modo emparejado: permiso PORTAFOLIO + puerta OPERACION sigue rechazado;
4. modo emparejado: PORTAFOLIO + PORTAFOLIO sigue autorizado.

## Aplicacion

Copiar los archivos conservando la estructura de carpetas. El unico archivo runtime que reemplaza codigo existente es:

`backend/src/middleware/information-access-gnral.middleware.js`

El script de validacion es nuevo y puede conservarse en `backend/scripts/`.
