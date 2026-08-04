# FIX Build Azure - Restaurar manifiestos V003

## Causa confirmada

El workflow `.github/workflows/main_mantto-gestor-api.yml` usa:

```yaml
cache-dependency-path: './backend/package-lock.json'
```

En la versión revisada no existían `backend/package.json` ni `backend/package-lock.json`. Por eso `actions/setup-node@v4` detuvo el build con:

```text
Some specified paths were not resolved, unable to cache dependencies.
```

## Corrección

Se restauran los dos manifiestos del backend desde la última versión completa disponible:

- `backend/package.json`
- `backend/package-lock.json`

El workflow ya usa `npm install`, por lo que en el runner actualizará el lock temporalmente e instalará también las dependencias de Azure declaradas en `package.json`.

## Alcance

- No modifica frontend.
- No modifica SQL.
- No modifica rutas ni lógica funcional.
- No modifica módulos en Nevera.
- No cambia el workflow porque su ruta de caché es correcta una vez restaurado el lockfile.

## Validación posterior

Después de aplicar el FIX, confirmar que GitHub contenga físicamente:

```text
backend/package.json
backend/package-lock.json
```

Luego volver a ejecutar el workflow.
