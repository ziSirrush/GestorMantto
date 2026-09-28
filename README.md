# FIX_PORTAFOLIO_REINICIO_SEMANAL_V001

## Objetivo

Corregir `Portafolio > Movimientos de Portafolio > Histórico semanal` para que cada corte semanal cierre la semana anterior y el corte recién generado se convierta inmediatamente en la nueva línea base.

Después del corte:

- la semana cerrada permanece disponible como histórico;
- la semana siguiente inicia con 0 movimientos si no hubo cambios posteriores al corte;
- los movimientos de la semana en curso se calculan exclusivamente contra el último snapshot semanal cerrado;
- la nueva semana queda disponible como `EN_CURSO`;
- la interfaz NO selecciona ni consulta automáticamente la nueva semana: el usuario debe elegir Año + Semana y pulsar `Consultar`;
- al ejecutar un corte manual, la selección semanal se limpia y se muestra el mensaje de semana reiniciada;
- al volver a abrir el panel semanal se actualiza el catálogo para detectar cortes automáticos recientes.

## Causa corregida

El `main` vigente sólo exponía filas con `estado = 'CERRADO'` en el catálogo y en la consulta semanal. Después de un corte no existía una representación consultable de la nueva semana en curso. Además, el frontend seleccionaba automáticamente el corte más reciente y, después de un corte manual, volvía a cargar el corte recién cerrado.

## Implementación

No se crea una tabla ni un registro `EN_CURSO` en Aiven.

El último corte `CERRADO` sigue siendo la única línea base persistida. El backend construye de forma temporal la metadata de la siguiente semana y, únicamente cuando el usuario la consulta, compara el snapshot del último corte cerrado contra el estado actual de `portafolio`.

Esto conserva el histórico existente y evita una segunda fuente de verdad.

## Archivos modificados

1. `backend/src/modules/portafolio/portafolio-movimientos_uni.js`
   - agrega la semana abierta derivada del último corte cerrado;
   - calcula en lectura los movimientos posteriores al corte;
   - conserva los filtros de alcance UNITED / `usuario_zop` existentes;
   - no modifica el job, rutas, permisos ni esquema.

2. `modules/movimientos-portafolio/movimientos-portafolio.js`
   - versión de módulo: `20260928-reinicio-semanal-v005`;
   - deja Año/Semana sin selección automática;
   - identifica la semana abierta como `EN CURSO`;
   - después de corte manual limpia la selección y no muestra ninguna semana hasta que el usuario la seleccione;
   - refresca el catálogo al abrir el panel semanal.

## Base exacta utilizada

Repositorio: `ziSirrush/GestorMantto`

Rama: `main`

HEAD verificado al preparar esta entrega:

`962c5d0cdba46586c98d6fae1eb4d883afc46ed1` — `Version 092526.7`

Blobs base de los archivos modificados:

- `backend/src/modules/portafolio/portafolio-movimientos_uni.js`: `e12d03a2fd7d3218bdfbaf2ce0b2ad699ba039a3`
- `modules/movimientos-portafolio/movimientos-portafolio.js`: `58fb5f6c018d01a402e06f50bba9eae09b5f1729`

Si cualquiera de esos dos archivos cambió en `main` antes de aplicar el fix, NO se debe sobreescribir a ciegas: hay que rebasar/reintegrar el cambio sobre el nuevo `main`.

## Validaciones realizadas

### Validación estática — PASS

Ejecutado sobre ambos archivos modificados:

```text
node --check backend/src/modules/portafolio/portafolio-movimientos_uni.js
node --check modules/movimientos-portafolio/movimientos-portafolio.js
```

Resultado: PASS.

### Prueba local de comportamiento con DB simulada — PASS

Se ejercitó el handler activo con un último corte cerrado de semana 39:

1. semana 40 inmediatamente después del corte, sin cambios -> `0 movimientos`;
2. cambio posterior de `En Servicio` a `No en Servicio` -> `1 DEGRADADO` en semana 40;
3. semana 39 continúa disponible con `estado = CERRADO`.

Resultado:

```text
PASS reinicio semanal: semana 40 inicia en 0, acumula solo cambios posteriores y semana 39 permanece CERRADA.
```

La prueba fue local con dependencias/DB simuladas. No equivale a una prueba contra Aiven ni a validación E2E.

## No ejecutado / no modificado

- Aiven MySQL: NO modificado; NO se ejecutó migración SQL.
- GitHub: NO modificado; no se hizo commit ni push.
- Azure: NO desplegado ni modificado.
- GitHub Pages: NO desplegado.
- Netlify: NO desplegado ni modificado.
- Prueba E2E contra producción: NO ejecutada.

## Aplicación

Copiar los dos archivos del paquete respetando exactamente su estructura de carpetas sobre una copia actualizada del repositorio.

Después de copiar:

```powershell
Set-Location "C:\RUTA\AL\GestorMantto"

node --check ".\backend\src\modules\portafolio\portafolio-movimientos_uni.js"
node --check ".\modules\movimientos-portafolio\movimientos-portafolio.js"

git diff --check
git diff -- backend/src/modules/portafolio/portafolio-movimientos_uni.js modules/movimientos-portafolio/movimientos-portafolio.js
```

No requiere ejecutar SQL.

## Comportamiento esperado para validación

1. Antes del corte, seleccionar la semana en curso y registrar sus movimientos visibles.
2. Ejecutar/esperar el corte semanal.
3. Confirmar que el corte anterior queda disponible en Histórico semanal.
4. Confirmar que la interfaz no selecciona automáticamente la nueva semana después del corte manual.
5. Seleccionar explícitamente la nueva semana `EN CURSO`.
6. Sin cambios posteriores al corte debe mostrar `SIN MOVIMIENTOS ESTA SEMANA` y KPIs en 0.
7. Provocar/validar un cambio real autorizado posterior al corte.
8. Volver a consultar la semana `EN CURSO`; sólo ese cambio posterior debe aparecer.

## Reversión

Restaurar los dos archivos a sus versiones anteriores o revertir el commit que aplique este fix. No existe reversión de BD porque este fix no cambia esquema ni datos persistidos.
