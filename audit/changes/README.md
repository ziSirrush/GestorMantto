# Registro de cambios lógicos

Un archivo `MG-....json` por resultado funcional. Los parches del mismo resultado editan ese archivo y renuevan `finalized_at`, `validation` y `references.commit`; Git conserva las versiones anteriores. Cada registro publicado identifica fecha, versión, commit, módulo, tipo, resumen, impacto y archivos principales.

El contrato está en `../change.schema.json`. Un registro `published` requiere todos los campos indicados en la especificación. Un `draft` o `cancelled` no aparece en el artefacto.

Antes de publicar, comprueba que el SHA de 40 caracteres corresponda al resultado final integrado y que la validación declarada se haya ejecutado. Si todavía no existe ese SHA, mantén el registro en `draft`.

`node tools/build-frontend.js` genera ambos metadatos dentro de `dist/web/core/` y actualiza únicamente `dist/web/index.html`. Los generadores individuales también escriben en `dist/web`; nunca modifican los archivos tracked de `core/` ni el `index.html` fuente.

La primera línea base es la tarjeta informativa de la interfaz. No se han incorporado cambios históricos sin evidencia individual verificable.
