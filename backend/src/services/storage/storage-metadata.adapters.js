const TABLES = Object.freeze({
  SOPORTE_ADJUNTOS: 'sup_adjuntos',
  PENDIENTES_COMENTARIOS: 'pendientes_comentarios_adjuntos',
  PENDIENTES_DIRECTOS: 'pendientes_archivos',
  VENTAS_COTIZACIONES: 'ventas_cotizaciones_archivos',
  VENTAS_PROSPECCION: 'ventas_prospeccion_archivos',
  VENTAS_REDES: 'ventas_redes_archivos',
  VENTAS_REDES_COMENTARIOS: 'ventas_redes_comentarios_adjuntos'
});

function common_gnral(storage) {
  return {
    storage_provider: storage.storage_provider,
    storage_container: storage.storage_container,
    storage_blob_name: storage.storage_blob_name,
    storage_url: storage.storage_url,
    mime_type: storage.mime_type,
    nombre_original: storage.nombre_original,
    tamano_bytes: storage.tamano_bytes
  };
}

function forSupAdjuntos_gnral(storage) {
  return {
    nombre_original: storage.nombre_original,
    nombre_servidor: storage.nombre_archivo,
    ruta_archivo: storage.storage_blob_name,
    extension_archivo: storage.extension,
    mime_type: storage.mime_type,
    peso_archivo: storage.tamano_bytes,
    storage_provider: storage.storage_provider,
    storage_container: storage.storage_container,
    storage_blob_name: storage.storage_blob_name
  };
}

function forPendientesDirectos_gnral(storage, userId, tipoArchivo) {
  return {
    tipo_archivo: String(tipoArchivo || '').trim().toUpperCase() === 'FOTO' ? 'FOTO' : 'ADJUNTO',
    nombre_original: storage.nombre_original,
    mime_type: storage.mime_type,
    tamano_bytes: storage.tamano_bytes,
    storage_provider: storage.storage_provider,
    storage_container: storage.storage_container,
    storage_blob_name: storage.storage_blob_name,
    storage_url: storage.storage_url,
    subido_por: userId,
    activo: 1
  };
}

function forPendientesComentarios_gnral(storage, userId) {
  return {
    nombre_archivo: storage.nombre_original,
    archivo_url: storage.storage_url,
    tipo_archivo: storage.mime_type,
    storage_provider: storage.storage_provider,
    storage_container: storage.storage_container,
    storage_blob_name: storage.storage_blob_name,
    tamano_bytes: storage.tamano_bytes,
    subido_por: userId,
    activo: 1
  };
}

function forVentasCotizaciones_gnral(storage) {
  return {
    nombre_archivo: storage.nombre_archivo,
    nombre_original: storage.nombre_original,
    extension: storage.extension,
    mime_type: storage.mime_type,
    tamanio_bytes: storage.tamano_bytes,
    storage_provider: storage.storage_provider,
    storage_url: storage.storage_url,
    storage_container: storage.storage_container,
    storage_blob_name: storage.storage_blob_name
  };
}

function forVentasProspeccion_gnral(storage) {
  return {
    nombre_archivo: storage.nombre_archivo,
    nombre_original: storage.nombre_original,
    extension: storage.extension,
    mime_type: storage.mime_type,
    tamano_bytes: storage.tamano_bytes,
    storage_provider: storage.storage_provider,
    storage_url: storage.storage_url,
    storage_container: storage.storage_container,
    storage_blob_name: storage.storage_blob_name,
    es_imagen: String(storage.mime_type || '').startsWith('image/') ? 1 : 0
  };
}

function forVentasRedes_gnral(storage) {
  return {
    nombre_archivo: storage.nombre_archivo,
    nombre_original: storage.nombre_original,
    extension: storage.extension,
    mime_type: storage.mime_type,
    tamanio_bytes: storage.tamano_bytes,
    storage_provider: storage.storage_provider,
    storage_url: storage.storage_url,
    storage_container: storage.storage_container,
    storage_blob_name: storage.storage_blob_name
  };
}

module.exports = {
  TABLES,
  common_gnral,
  forSupAdjuntos_gnral,
  forPendientesDirectos_gnral,
  forPendientesComentarios_gnral,
  forVentasCotizaciones_gnral,
  forVentasProspeccion_gnral,
  forVentasRedes_gnral
};
