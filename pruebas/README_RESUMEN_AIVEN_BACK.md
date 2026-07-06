# Ajuste Resumen del Día - Aiven y navegación interna

## Cambios aplicados

1. Se eliminaron los datos precargados del módulo `Resumen del día`.
   - Ya no existe fallback con tickets demo.
   - Si el backend no responde o Aiven no devuelve datos, el módulo queda vacío y muestra aviso de conexión/datos.

2. El módulo `Resumen del día` consume únicamente datos reales desde backend:
   - `GET http://localhost:3001/api/tickets`
   - `GET http://localhost:3001/api/portafolio`

3. Se agregó navegación interna tipo historial del sistema:
   - El botón de regreso en la barra contextual vuelve al módulo anterior dentro de Mantto Gestor.
   - Si no hay historial, regresa a Inicio.
   - Los destinos clickeables del módulo siguen pasando por `ManttoRouter.openTarget(...)`.

4. Se ajustó consulta de proyectos del backend para usar columnas reales de Aiven:
   - `zona_operativa`
   - `supervisor_zona`

## Importante

Para probar con datos reales debes levantar dos procesos:

Terminal 1:

```powershell
cd "C:\Users\T14s\Desktop\Nueva-estructura-Modulos\backend"
node server.js
```

Terminal 2:

```powershell
cd "C:\Users\T14s\Desktop\Nueva-estructura-Modulos\pruebas"
npx http-server
```

El frontend de `pruebas` no se conecta directo a Aiven. Consume el backend local, y el backend es quien consulta Aiven.
