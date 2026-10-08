# FASE 4 - INSTALACIONES / ADMINISTRACION - FORMULARIOS Y GUARDADO V001

Fecha: 2026-10-08
Repositorio de referencia: ziSirrush/GestorMantto
Rama revisada: main
Commit base verificado: 9a744173990386cc0c64f6e1225ab9b07cf273cb
Version: Version 100826.3

## Alcance implementado

- Conserva el frontend de Fase 3: buscador, cabecera, selector de grupos y acordeones.
- Habilita formulario por grupo UNICAMENTE cuando `can_edit` lo autoriza.
- Renderiza controles por metadata `field_meta`: texto, multilinea, fecha, porcentaje, monto,
  seleccion de usuario y activo/inactivo.
- Nuevo GET `/api/instalaciones/administracion/usuarios`: solo usuarios activos; protegido
  con Guard CORELLIAN / INSTALACIONES + EDITAR RESPONSABLES en el servicio.
- El frontend envia PATCH UNICAMENTE con `changes` modificados y `expected` originales.
- El backend valida de nuevo el grupo, permiso, viewer, campos, fechas, porcentajes,
  montos, responsables activos y alcance de registro.
- Concurrencia optimista por campo bajo `SELECT ... FOR UPDATE`, respuesta 409 para
  conflictos: no pisa ediciones ajenas del mismo campo.
- Una sola transaccion de UPDATE + auditoria before/after en `usuario_interacciones`.
  Sin diferencia real no registra auditoria ni hace UPDATE.
- Recarga selectiva del registro desde backend despues de cada PATCH exitoso. El
  cliente central de autenticacion emite tambien `mantto:data-mutated`.
- Correccion preventiva: el listado de busqueda SOLO proyecta y permite buscar por
  columnas de grupos efectivamente visibles; las rutas por ID mantienen scope.
- Ajuste de pruebas historicas F1/F3 para que ya no exijan Fase 1 cerrada o Fase 3 sin PATCH.

## Limites y decisiones conservadas

- No se modifican tablas ni columnas. Se reutilizan `ins_fl`, `usuarios`,
  `usuario_interacciones` y permisos de Fase 2.
- El SQL de Fase 2 y los permisos asignados al usuario son prerrequisitos. Esta
  entrega no ejecuta el SQL y no confirma su aplicacion en Aiven.
- Siguen bloqueados por politica: `id_proyecto`, `referencia_sitio`,
  `dias_restantes`, `dias_sin_visita`, `dias_sin_ccnr`, `meses_garantia_restantes`.
- Las fechas historicas no se transforman automaticamente. Al editar fechas se
  usa AAAA-MM-DD (ISO) para guardar en columnas VARCHAR/TEXT de `ins_fl`; la
  consulta presenta DD/MM/AAAA cuando puede interpretar la fecha.
- Porcentajes editados se guardan como numero decimal 0-100 seguido de `%`.
  Montos editados se guardan como texto numerico sin separadores ni moneda;
  no se presupone divisa ni se convierte el dato historico.
- Los cambios al contrato PATCH son intencionales: `expected` es obligatorio
  en peticiones humanas nuevas para prevenir sobrescrituras silenciosas.
- No se incorporan filtros de empresa nuevos al catalogo de responsables,
  porque la regla vigente de F1 valida usuarios activos por ID sin esa condicion.
- La sincronizacion externa (GAS -> ins_fl), reglas de autoridad por campo y
  prueba E2E contra Aiven/Azure quedan para Fase 5.

## Archivos entregados

MODIFICADOS (archivos completos):

- `backend/src/modules/instalaciones-administracion/instalaciones-administracion.controller.js`
- `backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js`
- `backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js`
- `backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js`
- `modules/instalaciones-administracion/instalaciones-administracion_cor.html`
- `modules/instalaciones-administracion/instalaciones-administracion_cor.js`
- `tests/instalaciones-administracion-fase1-backend.test.js`
- `tests/instalaciones-administracion-fase3-frontend-base.test.js`

NUEVOS (archivos completos):

- `backend/src/modules/instalaciones-administracion/instalaciones-administracion.field-policy.js`
- `modules/instalaciones-administracion/instalaciones-administracion-form_cor.css`
- `tests/instalaciones-administracion-fase4-formularios-guardado.test.js`
- `ACTUALIZAR_CACHE_BUST_FASE_4.ps1`
- `README_FASE_4_INSTALACIONES_ADMINISTRACION_FORMULARIOS_GUARDADO_V001.md`
- `MANIFEST_FASE_4_INSTALACIONES_ADMINISTRACION_FORMULARIOS_GUARDADO_V001.txt`
- `SHA256SUMS_FASE_4_INSTALACIONES_ADMINISTRACION_FORMULARIOS_GUARDADO_V001.txt`

## Instalacion LOCAL (sin escrituras externas)

1. Confirmar que el checkout es la base vigente o revisar diferencias antes de aplicar:

   `git rev-parse HEAD`

   Base usada: `9a744173990386cc0c64f6e1225ab9b07cf273cb`.

2. Extraer el ZIP EN LA RAIZ del repositorio, conservando las carpetas.

3. Ejecutar EN LA RAIZ con PowerShell:

   `powershell -NoProfile -ExecutionPolicy Bypass -File .\ACTUALIZAR_CACHE_BUST_FASE_4.ps1`

   El script es idempotente, valida primero los dos archivos y solo cambia
   la version del JS del modulo en `core/module-loader.js` y la version de
   `core/module-loader.js` en `index.html`. Ninguna otra linea de core cambia.
   Son dos modificaciones locales adicionales; se generan desde el script para
   evitar enviar/copiar dos archivos gigantes no relacionados.

4. Revisar:

   `git status`
   `git diff --check`
   `git diff --stat`

5. Ejecutar en la raiz:

   `node --test tests/instalaciones-administracion-fase1-backend.test.js tests/instalaciones-administracion-fase2-permisos-auditoria.test.js tests/instalaciones-administracion-fase3-frontend-base.test.js tests/instalaciones-administracion-fase4-formularios-guardado.test.js`

6. Probar con usuario autorizado en Local: consulta, edicion de cada grupo,
   fechas, porcentajes, montos, selectores, guardado parcial, 403, 409,
   auditoria, perdida de alcance tras reasignacion y regreso de datos desde Aiven.

7. Desplegar backend en Azure y promover frontend Local -> GitHub Pages ->
   Netlify UNICAMENTE mediante el flujo autorizado (Netlify deploy manual).

## Validacion REAL ejecutada durante la preparacion

- `node --check` de todos los JS entregados: PASS.
- `node --test tests/instalaciones-administracion-fase4-formularios-guardado.test.js`: 11/11 PASS,
  con repositorio MySQL simulado (no Aiven real).
- Revisado esquema de `ins_fl`, `usuarios` y `usuario_interacciones` contra la
  sabana de estructura de 2026-10-07, considerada snapshot de referencia.
- No ejecutado: pruebas contra Aiven, integracion backend Azure, pruebas E2E,
  suite F1/F2/F3 sobre checkout completo, despliegues y verificacion del
  estado real de SQL/permisos en Aiven.

## Pendiente

FASE 5 - Integracion y QA: migracion de permisos F2 aplicada, E2E con
 backend/Aiven, pruebas de concurrencia reales, auditoria atomica, autorizacion
 por cada grupo, convivencia con sincronizador GAS, recarga/refresco y PWA.

## Sistemas modificados

Este entregable solo genera archivos en `/mnt/data`. NO modifica GitHub,
Aiven, Azure, Netlify ni Google Sheets. No fue aplicado al repositorio remoto.
