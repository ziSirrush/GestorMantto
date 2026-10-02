# FIX COBRANZA COR · PAGOS · LIST BUSCABLE ESTILO TRADICIONAL V004

**Fecha:** 2026-10-02  
**Base GitHub verificada:** `8addea56c10a85f417e9aab2f941e6412c1077af`  
**Base funcional acumulada:** `FIX_COBRANZA_COR_PAGOS_CATALOGO_BUSCABLE_V003`

## Objetivo

Mantener el selector de proyectos escribible, pero reemplazar el desplegable nativo del navegador por un list visual con apariencia tradicional del Gestor.

## Resultado

- campo escribible en asignación individual y masiva;
- lista blanca, con borde y flecha de selector tradicional;
- opciones filtradas mientras se escribe;
- búsqueda por PPNS, Proyecto o Cliente;
- navegación por teclado con flechas, Enter y Escape;
- catálogo completo agrupado de Fuente conservado;
- no se reincorpora `limit` al catálogo;
- asignación individual y masiva sin cambios de lógica.

## Archivos modificados

```text
modules/cobranza-cor/cobranza-cor-pagos.js
modules/cobranza-cor/cobranza-cor-pagos.css
core/module-loader.js
```

No modifica backend, tablas, rutas API ni esquema de base de datos.

## Validación

- `node --check`: PASS.
- pruebas dirigidas: 7/7 PASS.
- `<datalist>` nativo: eliminado.
- `list="..."` nativo: eliminado.
- catálogo `/pagos/proyectos`: sigue sin parámetro `limit`.
- asignación individual: conservada.
- asignación masiva: conservada.
