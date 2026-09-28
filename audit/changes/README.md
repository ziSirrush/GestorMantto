# Registro de cambios lógicos

Un archivo `MG-....json` por resultado funcional. Los parches del mismo resultado editan ese archivo y renuevan `finalized_at`, `validation` y `references.commit`; Git conserva las versiones anteriores.

El contrato está en `../change.schema.json`. Un registro `published` requiere todos los campos indicados en la especificación. Un `draft` o `cancelled` no aparece en el artefacto.

Antes de publicar, comprueba que el SHA de 40 caracteres corresponda al resultado final integrado y que la validación declarada se haya ejecutado. Si todavía no existe ese SHA, mantén el registro en `draft`. Ejecuta `node tools/generate-build-info.js` y `node tools/generate-change-audit.js` desde la raíz. El segundo comando también actualiza en `index.html` la versión de caché de ambos metadatos con el SHA del despliegue.

La primera línea base es la tarjeta informativa de la interfaz. No se han incorporado cambios históricos sin evidencia individual verificable.
