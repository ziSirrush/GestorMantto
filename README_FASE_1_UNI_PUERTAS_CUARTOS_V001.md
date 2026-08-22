# FASE 1 - UNITED Puertas / Cuartos V001

Fecha: 20/08/2026  
Repositorio base: `JIVMBLT/updated_code`  
Rama base: `main`  
Commit base verificado: `f4e7b56b25d4c34e67ccd17aaceacbe8f0e5687b`

## Objetivo

Corregir el contrato central de Alcance UNITED antes de migrar consultas de Portafolio, Tickets y el resto de módulos.

Regla aprobada:

- **Puertas**: se administran en Panel de Control > Alcance.
- **Cuartos**: se administran en Panel de Control > Usuarios > Zonas Op.
- `usuario_zop` es la autoridad territorial del usuario.
- `z_op` es el catálogo referencial de zonas.
- La llave maestra UNITED abre puertas, pero sigue respetando los cuartos de `usuario_zop`.

## Archivos modificados

- `backend/src/services/alcance/alcance-uni.service.js`
- `backend/src/services/alcance/alcance-panel.service.js`
- `backend/src/services/information-record-scope-gnral.service.js`
- `backend/src/services/alcance/informacion-cruzada.service.js`
- `backend/src/middleware/information-access-gnral.middleware.js`
- `backend/scripts/test-alcance-uni.js`
- `backend/scripts/test-fase-6-alcances.js`

## Archivo nuevo

- `ADR_ALCANCE_UNI_PUERTAS_CUARTOS_V001.md`

## Cambios funcionales

### Motor `alcance_uni`

Antes:

```text
masterAccess = true
-> no consulta usuario_zop
-> requiere_filtro_zona = false
-> builders = 1 = 1
```

Ahora:

```text
masterAccess = true
-> abre puertas
-> consulta usuario_zop
-> requiere_filtro_zona = true
-> builders filtran por zona_ids
```

Un usuario sin zonas activas falla cerrado (`1 = 0`) incluso con llave maestra UNITED.

### Panel de Alcance

Guardar Alcance ya no ejecuta `DELETE/INSERT` sobre `usuario_zop`.

Las zonas recibidas accidentalmente en el payload de Alcance se ignoran. La lectura puede seguir mostrando las zonas actuales como referencia.

La modificación real de zonas permanece en Panel de Control > Usuarios, cuya implementación actual valida contra `z_op` y guarda en `usuario_zop`.

### Bridge de registros

Los helpers UNITED ya no consideran `llave_maestra` como bypass territorial. Los builders directos e inline siguen usando `zona_ids`.

### Información cruzada

Un bloque UNITED con llave maestra debe ejecutar `recordScopeCheck` para validar el cuarto del registro. CORELLIAN conserva su comportamiento actual.

### Guard General

Se separa:

- `llave_maestra`: abre puertas;
- `acceso_dominio_completo`: acceso sin filtro de registros.

Para UNITED zonal, llave maestra no equivale a acceso completo al dominio.

## No incluido en esta fase

- No se modifican consultas concretas de Portafolio.
- No se modifican consultas concretas de Tickets.
- No se cambia `tickets.zona` ni se homologa todavía con `z_op.zona`.
- No se modifica SQL/Aiven.
- No se crean tablas/columnas.
- No se modifica frontend de módulos operativos.

## Validación esperada

1. `node --check` en todos los JS modificados.
2. `node backend/scripts/test-alcance-uni.js` debe terminar en:
   `ALCANCE_UNI_PUERTAS_CUARTOS_V001: OK`
3. `node backend/scripts/test-fase-6-alcances.js` debe terminar en:
   `FASE_6_ALCANCES_GLOBALES_V001 + UNI_PUERTAS_CUARTOS: OK`
4. Validación estática: `alcance-panel.service.js` no debe contener escrituras `DELETE FROM usuario_zop` ni `INSERT INTO usuario_zop`.
5. Validación estática: los builders UNITED no deben retornar acceso irrestricto por `llave_maestra`.

## Validación runtime pendiente

No puedo confirmar el comportamiento contra Aiven desde este entorno. Después de aplicar la fase debe validarse con un usuario que tenga, por ejemplo, CNA-01/CNA-02/CNA-03 en `usuario_zop` y puertas UNITED activas.

La Fase 2 será la integración de este contrato en las consultas completas de Portafolio.
