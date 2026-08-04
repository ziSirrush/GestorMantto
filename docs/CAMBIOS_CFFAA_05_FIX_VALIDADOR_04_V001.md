# CFFAA-05 FIX VALIDADOR 04 V001

## Correccion

Se restaura el archivo faltante:

- `backend/scripts/validate-cffaa-04.js`

El archivo estaba incluido en CFFAA-04, pero no quedo presente en el arbol local al aplicar las entregas secuenciales. CFFAA-05 no lo modificaba y por eso no lo repetia en su ZIP incremental.

## Aplicacion

Copiar el archivo conservando su ruta y ejecutar desde `backend`:

```bash
npm run check
node scripts/validate-cffaa-04.js
node scripts/validate-cffaa-05.js
```
