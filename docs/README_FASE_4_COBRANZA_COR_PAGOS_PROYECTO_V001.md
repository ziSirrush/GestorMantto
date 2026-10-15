# FASE 4 - Cobranza COR / Pagos - Relacion Pago -> Proyecto V001

Fecha: 2026-10-02
Proyecto: Mantto Gestor
Base oficial revisada: `ziSirrush/GestorMantto`, rama `main`
Commit base: `bb1294520882e02e12bf8d82cb5387ad244b16d9` - `Version 100226.3`

## Objetivo

Habilitar dentro del modulo **Cobranza > Pagos** la relacion manual de cada Pago con el nombre de proyecto registrado en `cobranza_fuente_cor`, sin crear tablas ni columnas nuevas.

## Regla de estructura

Se reutiliza exclusivamente la estructura existente:

- `cobranza_pagos_cor.id_pp` para guardar exactamente el valor de `cobranza_fuente_cor.proyecto` relacionado.
- `cobranza_fuente_cor.proyecto` como catalogo y llave funcional de alineacion; `ins_fl` no interviene.
- `cobranza_rel_pagos` solo para comprobar relaciones ya existentes con Facturas.

No se incluye SQL de migracion. No hay `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE` ni cambios de esquema.

## Comportamiento incluido

- Buscar proyectos de Fuente por nombre, PPNS de referencia o cliente.
- Relacionar un Pago con un proyecto desde el detalle del mismo Pago.
- Cambiar el proyecto relacionado cuando no entra en conflicto con Facturas ya relacionadas.
- Quitar la relacion solo cuando el Pago no tiene Facturas relacionadas.
- Mostrar el nombre de proyecto relacionado y los PPNS de Fuente solo como referencia.
- Filtro `Con proyecto / Sin proyecto`.
- Edicion dentro de la misma pantalla, sin modal ni ventana flotante.
- Visor de usuarios permanece en solo lectura.

## Archivos modificados

```text
backend/src/modules/cobranza-cor/cobranza-cor.routes.js
backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.controller.js
backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.service.js
backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.repository.js
modules/cobranza-cor/cobranza-cor-pagos.js
modules/cobranza-cor/cobranza-cor-pagos.css
core/module-loader.js
```

## Prerrequisitos

Aplicar antes las Fases 1, 2 y 3 del nuevo modulo Pagos.

## Fuera de alcance

Esta fase no implementa aun:

- Pago -> Factura dentro del Estado de Cuenta.
- Editar datos fuente del Pago.
- Eliminar registros de Pago o Factura.
- QA E2E final.

## Validaciones locales

```text
node --check archivos JS modificados                 PASS
node --test prueba dirigida Fase 4                   10/10 PASS
cobranza_pagos_cor.id_pp existe en dump revisado     PASS
id_pp guarda Fuente.proyecto, no PPNS                 PASS
sin CREATE/ALTER/DROP/TRUNCATE                        PASS
frontend sin modal/window.open/window.confirm        PASS
```

No se ejecutaron escrituras o despliegues en GitHub, Aiven, Azure, Netlify o Google Sheets.
