# FIX Dashboard Ventas A2 V003

## Correcciones

1. En ejecución local, Dashboard Ventas consulta `http://localhost:3001` aunque `core/config.js` conserve la API publicada para producción.
2. Se incluye `backend/src/routes/index.js` para montar `/api/ventas/dashboard/usuarios` y `/api/ventas/dashboard/kpis`.
3. El selector ya no queda permanentemente en `Cargando usuarios...`; muestra estado real de error o lista disponible.
4. Las opciones de Información visible permanecen como selección múltiple. `Todos` marca/desmarca el conjunto y una opción individual solo cambia esa opción.
5. Se agregó timeout de 15 segundos y mensajes diferenciados para conexión, HTTP y contenido no JSON.

## Prueba local

- Backend: puerto 3001.
- Abrir Dashboard Ventas desde el frontend local.
- Confirmar que el selector carga responsables comerciales.
- Confirmar que al elegir una opción individual las demás conservan su estado.
