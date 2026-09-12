# FIX COBRANZA COR - COLLATION ADM / SUP / VEND V008

Base verificada: `ziSirrush/GestorMantto` / `main` / commit `53a4cc1bfa34759e50982ed031f0d15f80ba65d7` (`Version 091126.21 - Edo Cta`).

## Error corregido

Después de V007 el backend podía responder:

`ER_CANT_AGGREGATE_2COLLATIONS: Illegal mix of collations (utf8mb4_unicode_ci,IMPLICIT) and (utf8mb4_general_ci,IMPLICIT) for operation '='`

La causa estaba en la resolución de ADM / SUP / VEND: las columnas de `cobranza_indice_cor` son texto y V007 las comparaba contra `usuarios.id_SB` convirtiendo el ID numérico a `CHAR`.

Ejemplo anterior:

`TRIM(COALESCE(i.adm, '')) = CAST(u_adm.id_SB AS CHAR)`

Eso convertía una relación que conceptualmente es numérica en una comparación textual y podía enfrentar collations distintas.

## Corrección

ADM / SUP / VEND son IDs de usuario. Por lo tanto, V008 convierte el valor guardado en INDICE a `UNSIGNED` y compara número contra número:

`usuarios.id_SB = CAST(NULLIF(TRIM(indice.adm), '') AS UNSIGNED)`

Se aplica a:

- alcance de información (`buildIndiceScope_cor`);
- JOIN de ADM para mostrar usuario;
- JOIN de SUP para mostrar usuario;
- JOIN de VEND para mostrar usuario;
- listado MAIN;
- encabezado/detalle del proyecto.

El Guard continúa usando exclusivamente `usuarios.id_SB`.

## Lo que NO cambia

- No cambia la lógica FUENTE del detalle del Estado de Cuenta.
- No cambia PP / nombre de proyecto.
- No cambia frontend.
- No cambia service.
- No se cambian collations de tablas.
- No requiere SQL, ALTER TABLE, tabla nueva ni FK nueva.

## Archivo modificado completo

- `backend/src/modules/cobranza-cor/cobranza-cor.repository.js`

## Validaciones ejecutadas

- `node --check backend/src/modules/cobranza-cor/cobranza-cor.repository.js` -> OK
- No quedan comparaciones `CAST(u_*.id_SB AS CHAR)` -> OK
- ADM / SUP / VEND se comparan numéricamente contra `usuarios.id_SB` -> OK

## Prueba después del deploy

1. Abrir `Cobranza > Estados de Cuenta`.
2. Confirmar que el MAIN responde 200 y ya no presenta `ER_CANT_AGGREGATE_2COLLATIONS`.
3. Confirmar que ADM / SUP / VEND muestran el usuario resuelto por `id_SB`.
4. Probar con usuario de alcance limitado y confirmar que el Guard filtra por los IDs ADM / SUP / VEND.
5. Abrir un proyecto y confirmar que el detalle FUENTE sigue funcionando con la lógica ya acordada.
