# ADR - DOMINIO_COMPLETO UNITED sin filtro territorial V001

## Estado

ACEPTADO

## Base verificada

- Repositorio: `JIVMBLT/updated_code`
- Rama: `main`
- Commit base: `c9815bca3f3bd1573e7ee35f49ba35f484d6b5e5`
- Mensaje: `fix FASES DE ALCANCE 1 - 11 . 2`
- Blob base `alcance-uni.service.js`: `b37d303408b4622bc0fe45a20ec4f20a4cb40af0`
- Blob base `informacion-cruzada.service.js`: `4a3bd32c48abdefdce75b3a246c06b614849b967`

## Contexto

La implementacion vigente trataba la llave `DOMINIO_COMPLETO UNITED` como una llave que abria puertas, pero conservaba el filtro territorial de `usuario_zop`.

La regla funcional oficial queda corregida asi: cada llave maestra afecta solo a su propio dominio, pero dentro de ese dominio concede alcance completo de registros. La llave maestra no sustituye los permisos funcionales.

## Decision

1. `DOMINIO_COMPLETO UNITED` elimina el filtro territorial dentro de UNITED.
2. El permiso funcional de cada ruta o bloque sigue siendo obligatorio.
3. La validacion de la llave maestra permanece en la capa superior/resolver; el motor UNITED recibe `masterAccess` ya validado.
4. Con llave maestra, `resolveAlcanceUni_uni` no consulta `usuario_zop`.
5. El contexto master UNITED devuelve:
   - `llave_maestra: true`
   - `requiere_filtro_zona: false`
   - `zona_ids: null`
   - `zona_codigos: null`
   - `zonas_operativas: null`
   - `llave_maestra_ignora_zonas: true`
6. Los builders territoriales devuelven `1 = 1` solo cuando `context.llave_maestra === true`.
7. La informacion cruzada no vuelve a imponer `recordScopeCheck` si el alcance ya contiene una llave maestra validada.
8. El comportamiento UNITED sin llave maestra no cambia: se consulta `usuario_zop`, se filtra por zona y sin zonas se falla cerrado.
9. GENERAL y CORELLIAN no se modifican.

## Seguridad

- La llave maestra no crea permisos funcionales.
- El bypass territorial se activa unicamente con `llave_maestra === true` en el contexto resuelto.
- Un usuario UNITED normal sin zonas conserva `1 = 0`.
- La puerta sigue siendo resuelta antes del alcance.

## Impacto

Archivos runtime modificados:

- `backend/src/services/alcance/alcance-uni.service.js`
- `backend/src/services/alcance/informacion-cruzada.service.js`

No requiere cambios SQL, frontend, rutas ni migraciones.

## Rollback

Reemplazar los dos archivos runtime por sus blobs base indicados arriba.
