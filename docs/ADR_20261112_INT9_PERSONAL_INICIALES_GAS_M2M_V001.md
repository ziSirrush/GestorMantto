# BLT NOW · INT9 · Recepcion de iniciales en Programacion de Personal

**Fecha:** 2026-11-12. **Alcance:** backend de catalogo y Apps Script M2M/HMAC, sin modificar la programacion existente.

## Contrato de Google Sheets

Encabezados exactos A:H:

`tipo_personal | nombre | contratista | puesto | categoria | experiencia | iniciales | activo`

- **G: iniciales.** Texto capturado, trim de bordes, hasta 30 caracteres, opcional. No calcular, inferir ni convertir a mayusculas.
- **H: activo.** En GAS V004, tanto `1` como `0` se envían por POST. `0` crea únicamente registros nuevos inactivos; NO desactiva los existentes.
- Los montadores mantienen contratista obligatorio y puesto `Mecánico` o `Ayudante`. La restriccion sobre experiencia de montadores continua intacta.
- Los ajustadores siguen sin `contratista` ni `puesto`. Ambos tipos pueden proporcionar `iniciales`.
- La prevalidacion completa precede a toda solicitud. Mantiene un POST por persona, firma de exactamente los bytes del JSON y los 409 como duplicados no actualizados.

## SQL y despliegue

El respaldo DDL `Corte_Estructura20261110.sql` no incorpora `iniciales`. Ejecutar manualmente la siguiente migración SQL en Aiven, después de comprobar que la columna aún no existe. Por normas del repositorio, el SQL no se agrega como archivo `.sql` al árbol de GitHub:

```sql
SELECT COLUMN_NAME FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'instalaciones_personal' AND COLUMN_NAME = 'iniciales';

-- Solo si no existe todavía:
ALTER TABLE instalaciones_personal
  ADD COLUMN iniciales VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  NULL DEFAULT NULL AFTER experiencia;

SELECT COLUMN_NAME,DATA_TYPE,CHARACTER_MAXIMUM_LENGTH,IS_NULLABLE
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'instalaciones_personal' AND COLUMN_NAME = 'iniciales';
```

La migración NO forma parte del despliegue de Azure/GitHub Pages.

El backend comprueba la existencia de la columna con `SHOW COLUMNS` una vez por ventana de un minuto y conserva operaciones de catalogo antiguo si aun no se ha migrado Aiven. Si se intenta crear o editar con `iniciales` no nulas sin la columna, devuelve **HTTP 503 / INT9_COLUMNA_INICIALES_PENDIENTE**, sin realizar la escritura. Las consultas anteriores y altas sin iniciales conservan compatibilidad. La API GET y PUT pueden leer/editar `iniciales` despues de migrar.

Este commit no ejecuta DDL ni instala el script en Google Sheets. Apps Script: reemplazar el codigo anterior por `scripts/INT9_PERSONAL_ENVIO_INICIALES_V003.gs`, utilizar `INT9_PERSONAL_ValidarHoja()` y despues `INT9_PERSONAL_EnviarAiven()`, solo tras verificar SQL.

**Importante:** por diseño original, los registros existentes generan 409 y **no actualizan iniciales** al reenviarse. Una carga historica de iniciales necesita un procedimiento de actualizacion expresamente aprobado, separado del alta M2M.

## Seguridad y QA

Se conserva M2M/HMAC de Ventas (ID e identidad de integracion existentes, sin claves hardcodeadas), y el flujo JWT para usuarios humanos. Sin acceso M2M a PUT, DELETE ni GET. Las pruebas aisladas comprueban encabezados, offsets, iniciales, compatibilidad SQL antigua y denegacion por columna faltante.

## Adenda V004 — Alta de inactivos (12/11/2026)

El endpoint M2M de alta acepta `activo:0` y `activo:1` sin cambiar el tipo de ruta, credenciales ni permisos. Si no recibe el campo, mantiene `activo=1` para clientes anteriores. La respuesta 201 confirma el estado persistido.

La importación con GAS V004 prepara las filas inactivas sin saltarlas, incrementa el límite de prevalidación a 200 registros y verifica el estado devuelto antes de continuar. Las bajas de personal existente siguen requiriendo el flujo protegido habitual: una fila inactiva cuyo nombre/tipo/contratista ya existe produce 409, sin UPDATE. Los calendarios y listados siguen filtrando `activo=1`. No se requieren nuevas columnas SQL para `activo`; `iniciales` continúa sujeto a la migración independiente si se utiliza.

**Aplicación operativa:** Azure se despliega desde GitHub; el GAS V004 debe instalarse manualmente desde el ZIP autorizado. No se ejecuta Google Sheets ni Aiven al publicar el commit. La comprobación de duplicados inactivos es por consulta previa y no constituye restricción atómica ante cargas concurrentes.
