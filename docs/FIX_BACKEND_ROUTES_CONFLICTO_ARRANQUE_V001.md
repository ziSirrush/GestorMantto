# FIX Backend - conflicto pendiente en rutas

## Problema corregido

Azure no podía iniciar Node porque `backend/src/routes/index.js` contenía marcadores de conflicto Git como:

```text
<<<<<<< HEAD
=======
>>>>>>> ...
```

Node los interpreta como JavaScript inválido y termina con:

```text
SyntaxError: Unexpected token '<<'
```

## Archivo reemplazado

```text
backend/src/routes/index.js
```

El archivo limpio conserva el registro de las rutas existentes y de los módulos nuevos:

- Ventas Cotizaciones
- Ventas Clientes
- Ventas Clientes Contactos
- Catálogo General
- Instalaciones Drive
- Instalaciones Proyecto Drive
- Rutas generales existentes

## Aplicación

Copiar el contenido del FIX sobre la raíz del proyecto y reemplazar el archivo existente.

## Validación antes del push

Desde la raíz del proyecto:

```powershell
git grep -n -E "^(<<<<<<<|=======|>>>>>>>)" -- backend
node --check backend/src/routes/index.js
cd backend
npm run check
cd ..
```

El primer comando no debe devolver marcadores de conflicto.
