# FIX_CARRUSEL_FOTOS_V003

## Objetivo

Agregar carga real de fotografías al carrusel del detalle estandarizado de Proyecto de Instalaciones.

## Alcance aprobado

- Pueden agregar fotografías únicamente usuarios con rol activo **Director General** o **Programador**.
- Si el proyecto no tiene fotografías, esos roles ven **+ Agregar foto** en el espacio de portada.
- Si el proyecto ya tiene fotografías, esos roles ven **+ Agregar foto** dentro del carrusel/lightbox.
- Máximo: **7 fotografías por proyecto**.
- La primera fotografía cargada se registra automáticamente como `foto_principal`.
- El cambio manual de foto principal conserva la regla existente del sistema: endpoint restringido a `Programador`.
- La fotografía se guarda en Azure Blob Storage privado y Aiven conserva la URL estable en el siguiente campo libre `foto_blt_1` ... `foto_blt_7`.
- Al consultar fotografías almacenadas en Azure, backend entrega una URL SAS temporal de lectura.
- HEIC/HEIF se rechaza para evitar guardar una imagen que el carrusel web no pueda mostrar de forma consistente.
- JPG, PNG, WEBP, GIF y AVIF quedan habilitados según la política de archivos existente.

## Archivos modificados

- `core/details.js`
- `backend/src/routes/ins-fl.routes.js`
- `backend/src/controllers/ins-fl.controller.js`

No se modifica ningún otro archivo.

## Base verificada antes del FIX

Los tres archivos de origen usados para construir este entregable coinciden byte a byte con los blobs observados en `JIVMBLT/updated_code`:

- `core/details.js` -> Git blob `dd5e44cd1ce52c1143d4be4d8b72f54767c433e4`
- `backend/src/controllers/ins-fl.controller.js` -> Git blob `f82d1546b0777c4e07ef249afd3779a371ec8d07`
- `backend/src/routes/ins-fl.routes.js` -> Git blob `37cb321849c32cf47dafb3f94d92120499d71f7b`

## Base de datos

No requiere ALTER, CREATE ni migración SQL.

El DUMP `Estruturacompleta081626.sql` ya contiene en `ins_proyecto_fotos`:

- `foto_blt_1` ... `foto_blt_7`
- `foto_principal`
- `activo`
- `created_by`
- `updated_by`

El mismo dump confirma los roles `Director General` y `Programador`.

## Backend

Se agrega:

`POST /api/ins-fl/proyectos/fotografias/:id_ppns`

Formato: `multipart/form-data`, campo `foto`.

Validaciones:

- sesión requerida;
- rol Director General o Programador;
- proyecto existente en `ins_fl`;
- máximo 7 fotos también validado en servidor;
- archivo sujeto a la política IMAGE y límites globales existentes;
- rollback de Aiven y compensación del Blob si falla la operación antes de completarse.

La ruta existente para cambiar la fotografía principal no se amplía ni modifica en permisos.

## Frontend

- Proyecto sin foto: botón visible únicamente para los dos roles autorizados.
- Proyecto con 1 a 6 fotos: botón dentro del lightbox.
- Proyecto con 7 fotos: no se muestra agregar foto.
- Después de guardar se actualiza el carrusel y la portada sin esperar el refresco periódico.

## Validaciones realizadas

- `node --check core/details.js` -> OK.
- `node --check backend/src/controllers/ins-fl.controller.js` -> OK.
- `node --check backend/src/routes/ins-fl.routes.js` -> OK.
- Ruta POST y export del controlador presentes -> OK.
- Máximo de siete aplicado en frontend y backend -> OK.
- Uso de las columnas existentes del DUMP -> OK.
- Dependencias utilizadas (`multer`, Azure Storage) ya existen en el backend actual -> OK.

## Pendiente de prueba después del deploy

No se realizaron escrituras reales contra Aiven ni cargas reales a Azure durante la construcción del FIX.

Validar después del deploy:

1. Director General: agregar primera foto a un proyecto sin fotos.
2. Programador: agregar foto a un proyecto con fotos.
3. Usuario no autorizado: no debe ver el botón y un POST manual debe devolver 403.
4. Confirmar que la primera foto se vuelve portada.
5. Confirmar que las fotos 2 a 7 se agregan al carrusel.
6. Confirmar que al llegar a 7 desaparece el botón y el backend rechaza una octava foto.
7. Recargar la aplicación y comprobar que las fotografías persisten.
