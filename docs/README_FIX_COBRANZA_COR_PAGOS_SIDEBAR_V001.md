# FIX — Cobranza COR · Pagos en panel lateral V001

**Fecha:** 2026-10-02  
**Proyecto:** Mantto Gestor  
**Base GitHub revisada:** `main` — commit `3d4beff86066bae75e81fd3d2049153408f57d1b`

## Causa

El módulo `cobranza-pagos` ya existe en `main` y ya está registrado en `core/module-loader.js`, pero el botón **Pagos** no quedó aplicado en el `index.html` vigente. Por eso el módulo no aparece en el panel lateral.

## Cambio

Se modifica únicamente `index.html` para agregar **Pagos** dentro de:

```text
Cobranza
├── Dashboard Cobranza
├── Estados de Cuenta
├── Pagos
└── Aditivas
```

El botón utiliza:

```text
Ruta: cobranza-pagos
Permiso: COBRANZA_PAGOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL
```

## Archivos de la entrega

```text
index.html
docs/README_FIX_COBRANZA_COR_PAGOS_SIDEBAR_V001.md
```

No se incluyen `.patch`, SQL, tablas, backend ni archivos no modificados.

## Validación realizada

- `index.html` base reconstruido y verificado contra el blob vigente de GitHub: `75004cd8a0c657cd17a71178d874025d0cb1ffa1`.
- `core/module-loader.js` vigente ya contiene `cobranza-pagos`.
- `modules/cobranza-cor/cobranza-cor-pagos.js` y `.css` existen en `main`.
- El diff del FIX agrega únicamente el botón de Pagos al panel lateral.
- No se modificó Aiven, GitHub, Azure ni Netlify durante la generación.

## Aplicación

Copiar `index.html` sobre la raíz del proyecto respetando la estructura actual y validar primero en Local/Pruebas.

Después del despliegue, un usuario con permiso efectivo `COBRANZA_PAGOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL` debe ver **Pagos** entre **Estados de Cuenta** y **Aditivas**.
