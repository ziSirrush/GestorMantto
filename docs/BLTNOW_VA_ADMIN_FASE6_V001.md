# BLT NOW | UNITED > Cobranza > Administracion > Venta Adicional | Fase 6 V001

**Base:** `ziSirrush/GestorMantto`, rama `main`, commit `a9098077bdcb3bae54e0e5ea71c81ef20874e9f8` (Version 102326.3 del 23/oct/2026). **Prerequisitos:** fases 1 a 5 de Venta Adicional ya instaladas localmente, y panel lateral de Administración integrado. El ZIP es incremental, **no sustituye todas las fases anteriores**. Si hay modificaciones locales posteriores, compararlas antes de sustituir los archivos completos.

## Alcance F6

- Formulario amplio/adaptable para **crear** un registro `pc`, con 15 campos manuales, fechas e importes validados. Las 14 columnas derivadas y la FK son **solo del backend**.
- **Simular alta:** `POST /api/cobranza-uni/administracion/tablas/pc/registros/validar-alta`. Aunque utiliza POST por contener un formulario, el servicio ejecuta exclusivamente **SELECT**, sin escrituras. Usa permisos MAIN + VA VER + VA EDITAR, contexto UNITED y alcance territorial. Simula formulas F4, BUSCARV F5 y acumulados con la nueva venta incluida, sin duplicarlos.
- **Crear registro:** `POST /api/cobranza-uni/administracion/tablas/pc/registros`. Implementado, pero **BLOQUEADO por defecto**. Revalida permisos, identidad canonica, alcance, relaciones sin ambiguedad, formulas completas y consecutivo `id_pc` antes de abrir escritura. Inserta los 31 campos calculados/origen, registra auditoria con la misma conexion, y confirma ambos en **una transaccion**. Si falla, revierte. No modifica las ventas anteriores.
- **ID:** `pc.id_pc` es BIGINT sin AUTO_INCREMENT. Se sugiere `MAX(id_pc)+1` en consulta, sin reservarlo; el usuario **confirma explicitamente el ID**, y el servidor valida unicidad por llave primaria. Nunca se reintenta con un ID diferente de forma silenciosa. Si se reutiliza, devuelve conflicto 409.
- **Proyecto:** resolucion estricta por `proyectos_mantto`, `cobranza_proyectos` y Portafolio; asigna `id_proyecto_cobranza` solamente desde el validador oficial. No admite nombres genericos/ambiguos sin identidad y cobertura comprobada. Campos relacionados de MP inconsistentes rechazan el alta, nunca se adivinan.
- **Acumulados:** se calculan para la nueva fila usando todas las ventas del proyecto autorizado. Los otros registros existentes **NO se actualizan en esta fase**; el panel sigue presentando derivados F4/F5 virtuales. La futura consolidacion y reconciliacion de columnas persistidas requiere validacion al finalizar las tres tablas.

## GAS: no desactivar

Regla expresa del propietario: el activador GAS **permanece ACTIVO hasta terminar las tres tablas GC, VA y MP** y autorizar la transicion. F6 no modifica GAS ni activa escrituras. Para que el endpoint real de alta funcione **DESPUES** del corte se requeriran **LOS TRES FLAGS**: `PC_ADMIN_EDIT_ENABLED=true`, `PC_ADMIN_CREATE_ENABLED=true` y `PC_ADMIN_GAS_CUTOVER_CONFIRMED=true`. **NO configurarlos ahora**. La simulacion sigue habilitada solo para usuarios que tengan VER+EDITAR, sin depender de esos flags.

## Archivos incluidos

- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-contract.js` (politica de ID definida)
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-create-validation.js` (nuevo)
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-create-service.js` (nuevo)
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-create-audit.js` (nuevo)
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-edit-service.js` (reutilizacion de autorizador)
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-relations-service.js` (propuesta de nueva fila para calculos F5)
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js` (rutas y permisos F6)
- `modules/cobranza-uni/administracion/main/main.js` (acceso al formulario, cache F6)
- `modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js` (formulario y simulacion)
- `modules/cobranza-uni/administracion/venta-adicional/venta-adicional.css` (panel ancho y adaptable)
- `tests/cobranza-uni-administracion-venta-adicional-fase{1,2,3,4,5,6}.test.js` (compatibilidad de suites y pruebas nuevas)
- `docs/BLTNOW_VA_ADMIN_FASE6_V001.md` (esta guia)

## Aplicacion local (PowerShell en la raiz del repositorio)

1. Descomprime el ZIP en la **raiz** de `mantto_gestor_frontend` y conserva la estructura completa de carpetas. Requiere las fases 1-5 ya instaladas.
2. Ejecuta:

```powershell
node --check backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-create-service.js
node --check modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js
node --test tests/cobranza-uni-administracion-venta-adicional-fase1.test.js tests/cobranza-uni-administracion-venta-adicional-fase2.test.js tests/cobranza-uni-administracion-venta-adicional-fase3.test.js tests/cobranza-uni-administracion-venta-adicional-fase4.test.js tests/cobranza-uni-administracion-venta-adicional-fase5.test.js tests/cobranza-uni-administracion-venta-adicional-fase6.test.js
git status --short
```

La prueba ejecutada en este paquete usa espejo parcial (GC y VA), no representa el CI completo de `main`. Pruebas locales de suites GC+VA: **143/143 correctas**. Chromium verifico 1440 y 390 px: formulario de 15 campos, simulacion correcta, boton Crear deshabilitado con GAS y sin errores JS. **No se probo INSERT HTTP sobre MySQL real** por la instruccion de conservar GAS y Aiven intactos.

## Limites y reglas

- Los calculos historicos/dinamicos del resto de filas continuan por las vistas previas F4/F5; F6 solo persiste 14 derivados en una nueva alta tras corte. El corte coordinado GC+VA+MP y reconciliacion final NO se realizan aqui.
- Los registros sin identidad verificable, o con condiciones MP ambiguas, no pueden recibir alta en esta version. No se auto-generan nuevos proyectos ni se corrigen FKs historicos.
- En caso de error, el usuario debe revisar si el `id_pc` solicitado ya existe. El sistema no reintenta creando una segunda venta.
- Ningun archivo `*.sql`, `.patch` ni instalador. `.gitignore` sin cambios y sin bypass. Sin escrituras sobre Aiven, activadores GAS, GitHub ni despliegues.
