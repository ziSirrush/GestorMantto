# FIX COBRANZA COR - ADM / SUP / VEND POR USUARIO ID V007

Base verificada: `ziSirrush/GestorMantto` / `main` / commit `4e2bac8dfd03e8e47d73a7a4161c7ad8ac491f1d` (`Version 091126.20 - Edo Cta`).

## Objetivo

Hacer que los campos de INDICE:

- `ADM`
- `SUP`
- `VEND`

se interpreten de forma canonica como `usuarios.id_SB`, para que el alcance de informacion de CORELLIAN pueda filtrar los proyectos por usuario de manera inequívoca.

## Regla de seguridad

El Guard ya entrega al modulo la lista `usuarios_visibles` como IDs de usuario. Este FIX hace que `buildIndiceScope_cor()` compare esa lista exclusivamente contra:

- `cobranza_indice_cor.adm = usuarios.id_SB`
- `cobranza_indice_cor.sup = usuarios.id_SB`
- `cobranza_indice_cor.vend = usuarios.id_SB`

Se elimina del filtro de alcance la compatibilidad anterior por `usuarios.iniciales`.

Por lo tanto, iniciales coincidentes ya no conceden visibilidad. La decision de alcance utiliza el ID numerico.

## Carga INDICE

`normalizeIndice_cor()` ahora valida ADM, SUP y VEND como IDs enteros positivos o NULL.

Valores permitidos:

- `66`
- `44`
- `51`
- vacio / NULL / `-` -> NULL

Valores de texto o iniciales ya no se aceptan como usuario valido para esos tres campos.

No es necesario recargar INDICE para que el Guard use los IDs que ya existen en Aiven. La validacion nueva protege cargas futuras.

## Resolucion para pantalla

El backend hace `LEFT JOIN usuarios` por `id_SB` para ADM, SUP y VEND y devuelve, ademas del ID:

- `nombre`
- `iniciales`

El frontend deja de mostrar solamente `66 / 44 / 51` y muestra el nombre del usuario. El `title` conserva nombre, iniciales e ID para consulta rapida.

Ejemplo de la SABANA de referencia:

- ID 66 -> Yageri Garcia / YG
- ID 44 -> Aldo Mendez / AM
- ID 51 -> Ignacio Neri / IN

La SABANA es referencia historica. El nombre mostrado en ejecucion siempre se obtiene de la tabla `usuarios` de Aiven mediante el ID guardado en INDICE.

## Estado de Cuenta / FUENTE

Este FIX NO cambia la regla acordada anteriormente:

- MAIN Estados de Cuenta nace de `cobranza_indice_cor`.
- La resolucion flexible PP/Nombre contra `cobranza_fuente_cor` sigue ocurriendo solo al abrir el DETALLE del Estado de Cuenta.

## Archivos modificados completos

- `backend/src/modules/cobranza-cor/cobranza-cor.repository.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.service.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta.js`

No requiere SQL, ALTER TABLE, tabla nueva ni FK nueva.

## Validaciones ejecutadas

- `node --check backend/src/modules/cobranza-cor/cobranza-cor.repository.js` -> OK
- `node --check backend/src/modules/cobranza-cor/cobranza-cor.service.js` -> OK
- `node --check modules/cobranza-cor/cobranza-cor-estados-cuenta.js` -> OK
- `buildIndiceScope_cor()` ya no usa `u_scope.iniciales` -> OK
- ADM / SUP / VEND en la carga se validan como IDs enteros positivos -> OK
- El MAIN y el DETALLE resuelven nombre/iniciales por `usuarios.id_SB` -> OK

## Prueba recomendada despues del deploy

1. Abrir Cobranza > Estados de Cuenta con un usuario con llave maestra CORELLIAN: debe ver el alcance completo autorizado.
2. Abrir con un usuario sin llave maestra y alcance limitado: solo deben llegar proyectos donde ADM, SUP o VEND corresponda a uno de sus `usuarios_visibles`.
3. Revisar un proyecto con ADM=66, SUP=44, VEND=51 y confirmar que la interfaz resuelva los usuarios por ID.
4. Abrir el detalle del Estado de Cuenta y confirmar que la logica FUENTE por PP/Nombre se mantiene sin cambios.
