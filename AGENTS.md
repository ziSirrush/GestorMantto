# Instrucciones operativas para agentes — BLT NOW

Antes de modificar código, preparar una versión o publicar, leer la norma de
[versionado API + Frontend](docs/RELEASE_NOMENCLATURA_DOBLE_FECHA_Y_PERMISOS_V001.md#nomenclatura-aprobada).

## Regla obligatoria de versionado (reforma 2026-11-19.1)

- API y Frontend tienen fechas y consecutivos funcionales independientes (DDMMYY.N, America/Mexico_City).
- Solo API: conservar íntegra la versión Frontend; usar `bump api`.
- Solo Frontend: conservar íntegra la versión API; usar `bump frontend`.
- Ambos: usar `bump both`; cada componente incrementa su propio consecutivo.
- Sin cambio funcional: conservar ambas versiones. Actualizar `frontend.apiVersion` no es un cambio funcional Frontend.
- Reiniciar a .1 únicamente cuando cambia la fecha de la publicación funcional del propio componente.
- No aplicar reglas históricas que reinicien Frontend al cambiar API.
- Usar `node tools/release-version.js show` y el motor `node tools/release-version.js bump ...`; no inventar consecutivos ni editar manualmente para eludirlo.
- Mensaje completo: exclusivamente `Version <VER_API>.<VER_FRONTEND>`, una línea, sin cuerpo.
- Revisar el diff y el estado vigente de main; ejecutar las pruebas pertinentes y `node tools/release-version.js verify --commit` antes del push.
- No reescribir historial ni modificar Aiven o Netlify para corregir versiones.

Esta instrucción no sustituye los permisos, alcances ni autorizaciones de entrega del proyecto.
