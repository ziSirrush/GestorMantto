# FIX Build Azure - Restaurar validador V004

## Causa

`backend/package.json` contiene el script:

```json
"check": "node scripts/validate-structure.js"
```

pero el archivo `backend/scripts/validate-structure.js` no estaba presente en el repositorio publicado. Por eso GitHub Actions terminó con `MODULE_NOT_FOUND` al ejecutar `npm run check`.

## Corrección

Se restaura únicamente:

- `backend/scripts/validate-structure.js`

No se elimina la validación, no se modifica el workflow y no se cambian dependencias.

## Aplicación

Copiar el archivo conservando exactamente la ruta:

```text
backend/scripts/validate-structure.js
```

Después confirmar el cambio en GitHub y volver a ejecutar el workflow.
