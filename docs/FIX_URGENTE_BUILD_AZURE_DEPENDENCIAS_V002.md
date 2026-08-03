# FIX urgente build Azure dependencias V002

## Causa encontrada

`backend/package.json` incluye `@azure/identity` y `@azure/storage-blob`, pero el `package-lock.json` de la versión entregada aún no contiene esas dependencias. Por esa razón `npm ci` termina con `EUSAGE` antes del build.

En localhost, si no se ejecutó `npm install` después de aplicar la Fase 3, Node tampoco encuentra `@azure/identity` y termina con `MODULE_NOT_FOUND`.

## Cambio aplicado

Se modificó únicamente el workflow de Azure/GitHub para usar:

```bash
npm install --no-audit --no-fund
npm run check
npm run build --if-present
npm run test --if-present
```

Esto permite que el runner resuelva e instale las dependencias declaradas en `package.json`, incluida la cadena completa de Azure, antes de validar y desplegar.

## Archivos modificados

- `.github/workflows/main_mantto-gestor-api.yml`

## Validación local requerida una sola vez

Dentro de `backend`:

```bash
npm install
npm run check
npm start
```

Ese `npm install` también actualizará el `package-lock.json` local. El lock actualizado debe subirse posteriormente al repositorio; después de consolidarlo se podrá regresar el workflow a `npm ci`.

## Alcance

- No modifica código funcional.
- No modifica rutas ni `/api/health`.
- No modifica SQL.
- No modifica frontend ni módulos en Nevera.
