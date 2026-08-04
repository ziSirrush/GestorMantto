# CFFAA-05 V001

- Interacción comentario + archivo en una sola petición multipart.
- Texto y archivo opcionales; al menos uno obligatorio.
- Eliminación del comentario artificial `Archivo adjunto` para registros nuevos.
- SAS de Cotizaciones únicamente bajo demanda.
- Presentación de metadatos sin exponer contenedor ni nombre interno del blob.
- Baja lógica coordinada de comentario y archivos.
- Cola CFFAA-01D para eliminaciones Azure fallidas.
- Conservación de campos Drive y versionado histórico.
- Sin migración estructural.
