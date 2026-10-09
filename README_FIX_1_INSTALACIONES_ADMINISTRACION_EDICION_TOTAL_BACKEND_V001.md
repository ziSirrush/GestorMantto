# Mantto Gestor — FIX 1 · Edición total autorizada (backend y permisos) V001

**Fecha:** 09/10/2026. **Naturaleza:** primer FIX de la serie de edición fantasma con autoguardado.  
**Base oficial comprobada:** `ziSirrush/GestorMantto`, `main`, commit **`2e516699c42f870b730bbee712b437e72e9f4d8d`**, `Version 100926.4` (09/10/2026).  
**Fuente de datos:** `ins_fl` en Aiven MySQL. No crea tablas ni columnas. No toca otros módulos.

## 1. Regla y decisión de autorización

Los **93 campos operativos de los 11 grupos** de Administración quedan habilitados para **edición individual** bajo dos permisos EXPLÍCITOS y existentes en el motor de autorizaciones:

- Ver módulo: `INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL` (permiso existente).
- **Editar todo:** `INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR` (nuevo registro de permiso que debe agregarse manualmente con el SQL entregado y después asignarse en Panel de Control).

Un rol de nombre «Admin Instalaciones», «Administrador» o similar **no** concede edición por sí solo. Las asignaciones de ambos permisos y la puerta CORELLIAN/INSTALACIONES deben ser válidas; además se mantiene el **alcance por registro** y el **Visor de Usuarios solo lectura**. La lectura sola nunca da permisos de escritura, tampoco se crea automáticamente una asignación. Los 22 permisos históricos `GRUPOS_*.VER/EDITAR` **no se borran**: conservan la **lectura limitada por grupos** para quien sólo tenga `ACCESO_VISUAL`, pero nunca habilitan escritura. Quien tenga los dos permisos globales puede ver y editar todos los grupos. Se documenta el cambio en el ADR.

**Archivos técnicos inmutables:** `id_ins_fl`, `created_at`, `updated_at`. La edición de los identificadores operativos `id_proyecto`/`referencia_sitio` solo se autoriza en ficha **individual**. Cambiar estos valores modifica la agrupación/referencia lógica; el índice UNIQUE `(id_proyecto,referencia_sitio)` se respeta y un choque produce HTTP 409 con ROLLBACK. La edición múltiple mantiene el requisito de que todos los equipos pertenezcan al mismo `id_proyecto`, y no permite modificar `id_proyecto` ni `referencia_sitio` en lote. **No** se sincronizan ni renumeran silenciosamente claves de otras tablas.

Los cuatro campos previamente marcados como derivados (`dias_restantes`, `dias_sin_visita`, `dias_sin_ccnr`, `meses_garantia_restantes`) ahora son capturables; **no se garantiza** que una sincronización externa no los sobreescriba. Se exige validación con responsables de las integraciones antes de Producción.

**IMPORTANTE: FIX 1 modifica backend/permisos, no la interfaz.** La eliminación del botón Editar y el guardado automático al perder foco o cambiar selección corresponden al **FIX 2**. El FIX 3 será QA integral.

## 2. Contenido del paquete (solo archivos modificados o nuevos)

**Backend completo:**

```text
backend/src/modules/instalaciones-administracion/instalaciones-administracion.constants.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js
```

**SQL (se ejecutan por separado, manualmente):**

```text
database/FIX_1_INSTALACIONES_ADMINISTRACION_PERMISO_TOTAL_V001.sql
database/QA_FIX_1_INSTALACIONES_ADMINISTRACION_PERMISOS_SOLO_LECTURA_V001.sql
```

**Regresión y trazabilidad:**

```text
tests/instalaciones-administracion-fase1-backend.test.js
tests/instalaciones-administracion-fase2-permisos-auditoria.test.js
tests/instalaciones-administracion-fix2-detalle-equipo.test.js
tests/instalaciones-administracion-fix3-edicion-multiple.test.js
tests/instalaciones-administracion-fix1-edicion-total-backend.test.js
docs/ADR_20261009_INSTALACIONES_ADMINISTRACION_PERMISO_TOTAL_V001.md
EJECUTAR_QA_FIX_1_INSTALACIONES_ADMINISTRACION_EDICION_TOTAL_V001.ps1
README_FIX_1_INSTALACIONES_ADMINISTRACION_EDICION_TOTAL_BACKEND_V001.md
MANIFEST_FIX_1_INSTALACIONES_ADMINISTRACION_EDICION_TOTAL_BACKEND_V001.txt
SHA256SUMS_FIX_1_INSTALACIONES_ADMINISTRACION_EDICION_TOTAL_BACKEND_V001.txt
```

**Sin cambios a:** frontend (incluyendo edición fantasma previa, si se instaló), cache bust, backend común, Guards centrales, `ins_fl` estructura, PWA/otros módulos, credenciales, notificaciones o interacciones.

## 3. Instalación — manual y con preflight

1. En el repositorio local comprobar `git status`, `git rev-parse HEAD` y la rama; validar que la base concuerde con el commit indicado o **detenerse para reconciliar** si `main` avanzó. Respaldar cualquier trabajo propio.
2. Antes de sobrescribir, comprobar que estos tres archivos de backend no tengan diferencias locales ajenas al FIX y que sus SHA de Git originales sean exactamente:

   | Archivo | Git blob SHA de la base verificada |
   | --- | --- |
   | `...instalaciones-administracion.constants.js` | `d01d757c6dbf2d40ed635ceaf178068302b39673` |
   | `...instalaciones-administracion.service.js` | `5c343e796be690b74f442a637eb98f6414527aab` |
   | `...instalaciones-administracion.repository.js` | `2a16f04683835389cf4a93b48d2f752f54bcff40` |

   Comprobar SHA sin modificar: `git hash-object <ruta-del-archivo>`. No usar `git reset --hard` ni `git clean -fd` como parte de este FIX.
3. Revisar el ZIP y **extraer en la raíz del repositorio**, conservando subcarpetas y sobrescribiendo solo los archivos enlistados tras resolver conflictos. No hay scripts que ejecuten SQL automáticamente.
4. Ejecutar QA desde PowerShell, ubicado en el repositorio: 

   ```powershell
   & .\EJECUTAR_QA_FIX_1_INSTALACIONES_ADMINISTRACION_EDICION_TOTAL_V001.ps1
   git diff --check
   git diff -- backend/src/modules/instalaciones-administracion
   git status
   ```

5. **DBA/autorización manual:** respaldar/verificar las tablas de permisos, ejecutar `database/FIX_1_INSTALACIONES_ADMINISTRACION_PERMISO_TOTAL_V001.sql` en el entorno aprobado, revisar su `SELECT` de resultado; ejecutar SQL read-only de QA. El SQL **solo registra el código** `EDITAR`; no asigna usuarios ni roles. Confirmar que `EDITAR` aparece en Panel de Control y asignarlo **únicamente** a destinatarios aprobados que también tengan `ACCESO_VISUAL` y puerta de información CORELLIAN válida.
6. Realizar smoke real en ambiente de pruebas: usuario con sólo `ACCESO_VISUAL` debe leer sin editar; con ambos permisos debe poder editar los 93 campos operativos del equipo dentro de su scope; fuera de scope 404/403; Visor bloqueado; auditoría/ROLLBACK. Revisar que modificar PP NS/referencia no rompa relaciones de otras tablas ni sincronizaciones.
7. **Despliegue separado:** backend Azure sólo con aprobación explícita; GitHub Pages para validar frontend cuando llegue FIX 2; producción Netlify manual después de completar FIX 3. No aplicar a Aiven/producción sin autorización.

## 4. Validación efectivamente realizada

- Fuentes: rama `main` del repositorio verificada (commit arriba) y esquema de `ins_fl`/`perm_*` del dump estructural facilitado (no supone estado actual de Aiven).
- Comparación exacta de SHA Git de las fuentes de backend antes de modificar, verificada para `constants`, `service`, `repository` y `routes`.
- `node --check` y pruebas localizadas con dobles de permisos, SQL, transacciones y auditoría; **no** son E2E.
- Se ejecutó una suite de pruebas aisladas; el resultado exacto y limitaciones se anotan en la respuesta de entrega.
- **No ejecutado:** PowerShell en Windows, SQL en Aiven, conexión a Azure, tests E2E, assignación de permiso en Panel de Control, comparación de relaciones externas y prueba con GAS.

## 5. Riesgo y reversión

**Riesgo de adopción:** quien tuviera un permiso `GRUPOS_*.EDITAR` antiguo, pero no el permiso nuevo `...MODULO.EDITAR`, pasará a lectura. Es deliberado y fail-closed: antes de liberar es obligatorio conciliar la matriz con el propietario del módulo. No borrar los permisos históricos automáticamente.

**Reversión de backend:** reponer los tres archivos backend desde la base Git verificada y redeplegar manualmente cuando corresponda. La reversión de permisos se efectúa por Panel de Control con aprobación, no por script automático. Conservar los datos/auditorías ya registrados; no borrarlos.

**FIX pendientes:** FIX 2 — UI de edición fantasma/autoguardado por campo; FIX 3 — integración, seguridad, concurrencia y QA real.
