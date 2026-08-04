# Mantto Gestor - Ventas > Asignacion a Redes

## Correccion V003: importacion historica unica sin token

### Objetivo
Corregir el flujo de carga de las hojas 7 y 8 para que funcione como una importacion manual unica, igual al patron historico compartido para Prospeccion.

### Rutas temporales

```text
POST /api/ventas/redes/importar-backup
POST /api/ventas/redes/comentarios/importar-backup
```

Estas rutas no requieren token Bearer ni Script Properties.

El resto de las rutas operativas de Asignacion a Redes conserva `requireAuth`.

### Validacion interna
Las rutas temporales solo aceptan payloads con:

```json
{
  "origen": "GLIDE_BACKUP_SHEETS",
  "carga_unica": true,
  "registros": []
}
```

Esto evita que una solicitud accidental con otro formato ejecute la importacion.

### Google Apps Script
La funcion a ejecutar es:

```javascript
enviarRedesYComentariosAiven();
```

No requiere:

```text
MANTTO_GESTOR_API_TOKEN
MANTTO_GESTOR_API_BASE_URL
Authorization: Bearer
```

El orden es:

```text
Hoja 7 -> registros y evidencias
Hoja 8 -> comentarios y adjuntos
```

### Archivos modificados

```text
backend/src/modules/ventas-redes/ventas-redes.routes.js
backend/src/modules/ventas-redes/ventas-redes-sync.service.js
google-apps-script/IMPORTAR_VENTAS_REDES_HOJAS_7_Y_8.gs
```

### Validaciones realizadas

- Sintaxis Node.js de rutas y servicio.
- Sintaxis JavaScript del Apps Script.
- `npm run check` exitoso.
- Registro confirmado de las dos rutas `importar-backup`.
- Eliminacion de referencias a token y encabezado Authorization.

### Riesgo conocido y retiro posterior
Estas rutas son publicas mientras permanezcan desplegadas. Deben retirarse de `ventas-redes.routes.js` despues de confirmar la importacion unica. La backend operativa del modulo continuara protegida por autenticacion.
