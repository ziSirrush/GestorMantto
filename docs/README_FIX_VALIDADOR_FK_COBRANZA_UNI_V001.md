# FIX VALIDADOR FK COBRANZA UNITED V001

**Base GitHub revisada:** `ziSirrush/GestorMantto`, `main`, commit `fb348b875663677adb22b3e7d84814745fb3a10c` (13/10/2026).

## Problema demostrado

La sabana SQL del 07/10/2026 contiene IDs `id_proyecto_cobranza` desplazados en `detalle_mp_2026` y `pc`; el SQL manual `03_APLICAR_ALINEAR_FK_COBRANZA_GC_MP_VA_V003.sql` corrige un corte puntual, pero no revisa futuras cargas. Los tres sincronizadores del backend guardan por `id_gc`, `id_dmp` e `id_pc` y no asignan automaticamente el ID comun.

## Alcance

- **Motor 2 UNITED**: el mismo algoritmo SQL V003 para `gestion_credito`, `detalle_mp_2026` y `pc` (PC **es** la tabla fisica de Venta Adicional).
- Cada sincronizacion dispara una revision selectiva de sus IDs exitosos **despues de su COMMIT**.
- Un job verifica las tres tablas enteras **al minuto del arranque y cada 15 minutos**, incluso tras escrituras ajenas a los endpoints conocidos.
- Usa `proyectos_mantto.cobranza` como puente **y verifica** que el ID pertenezca a `cobranza_proyectos` con el mismo nombre exacto.
- Exige nombre unico ignorando solamente mayusculas y espacios externos (`utf8mb4_0900_as_ci`) e ID de Cobranza unico en `proyectos_mantto`.
- **Solo escribe** `id_proyecto_cobranza` de esas tres tablas, cuando esta en NULL o no coincide. Preserva todos los otros campos, importes e IDs propios.
- Un `GET_LOCK` distinto por tabla previene reconciliaciones simultaneas del mismo modulo en varias instancias Azure.
- Transaccion con `ROLLBACK` en error; restaura `SQL_SAFE_UPDATES`; si falla un modulo, los otros continuan.
- Si la validacion post-sync falla, **la carga que ya hizo COMMIT sigue siendo exitosa**. El fallo se registra y el ciclo periodico puede reintentar.
- Registra muestras de `id_registro`, `id_anterior` e `id_nuevo` en logs tecnicos, mas cantidades sin ID y nombres discordantes para revision.

## Exclusiones deliberadas

- **No crea** tablas, columnas, indices, catalogos ni IDs en `cobranza_proyectos`.
- **No modifica** `portafolio`, `proyectos_mantto`, Corellian o frontend.
- **No unifica** proyectos por alias, nombre aproximado, IDNS o relaciones ambiguas. Esos casos se dejan pendientes.
- **No modifica las consultas de lectura** que usan `ID OR proyecto`: ese problema requiere un FIX de lectura independiente; no basta con el validador para impedir toda mezcla de informacion si quedan relaciones sin mapa seguro.
- No agrega endpoint publico ni permiso nuevo.

## Archivos del FIX

**Nuevos**:

1. `backend/src/services/cobranza-uni/fk-validator.service.js`
2. `backend/src/jobs/cobranzaUniFkValidator.job.js`
3. `tests/cobranza-uni-fk-validator.test.js`
4. `docs/README_FIX_VALIDADOR_FK_COBRANZA_UNI_V001.md`

**Modificados**:

5. `backend/src/bootstrap.js`
6. `backend/src/controllers/cobranza-uni.controller.js`
7. `backend/src/controllers/detalle-mp-2026.controller.js`
8. `backend/src/controllers/pc.controller.js`

## Validacion, respaldo y despliegue

1. **ANTES de activar en Azure**: respaldar los FK actuales de `gestion_credito`, `detalle_mp_2026` y `pc`, por ID primario; exportar el SELECT de respaldo V003 D7. Guardar evidencia fuera del servidor.
2. Ejecutar `00_VALIDACION_PREVIA_SOLO_LECTURA.sql` adjunto y confirmar que `proyectos_mantto.cobranza` es `BIGINT UNSIGNED` y que sus puentes al catalogo son correctos.
3. Descomprimir el ZIP. Dentro de una copia del repositorio en `main`:
   ```powershell
   git status --short
   git apply --check "RUTA\FIX_VALIDADOR_FK_COBRANZA_UNI_V001.patch"
   git apply "RUTA\FIX_VALIDADOR_FK_COBRANZA_UNI_V001.patch"
   node --check backend/src/services/cobranza-uni/fk-validator.service.js
   node --check backend/src/jobs/cobranzaUniFkValidator.job.js
   node --check backend/src/bootstrap.js
   node --test tests/cobranza-uni-fk-validator.test.js
   git diff --check
   ```
4. Validar en **laboratorio** con una copia restaurada de la sabana y comparacion de IDs antes/despues; posteriormente revisar un despliegue controlado de Azure.
5. Verificar logs `[COBRANZA_UNI_FK]` tras cada sincronizacion y al minuto de arrancar la API. Volver a ejecutar el SQL de lectura para confirmar disminucion de discrepancias.
6. Si se requiere revertir el cambio de codigo: `git apply -R "RUTA\FIX_VALIDADOR_FK_COBRANZA_UNI_V001.patch"` antes de hacer commits locales. Los **datos** modificados por el job NO se revierten automaticamente con `git apply -R`; restaurarlos desde el respaldo FK previo por PK si una auditoria autoriza dicha accion.

## Limitaciones y evidencia

- Pruebas locales incluidas: unitarias simuladas para SQL, error, rollback, lock y auditoria. No son una ejecucion real contra Aiven.
- El codigo no se ha aplicado en GitHub, Azure ni Aiven desde esta entrega.
- Revisar previamente cualquier variacion de `main` posterior a `fb348b875663677adb22b3e7d84814745fb3a10c` antes de aplicar el patch.
