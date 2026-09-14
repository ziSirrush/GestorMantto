'use strict';

function cleanText_gnral(value, max = 255) {
  const text = String(value == null ? '' : value).trim();
  return text ? text.slice(0, max) : '';
}

function siteLabel_gnral(source = {}) {
  const project = cleanText_gnral(
    source.proyecto ?? source.proyecto_padre ?? source.project
  );
  const reference = cleanText_gnral(
    source.referencia_en_zona_operativa ??
    source.identificacion_sitio ??
    source.referencia_sitio ??
    source.referencia_en_sitio ??
    source.reference
  );

  if (project && reference) return `${project} - ${reference}`;
  if (project) return project;
  if (reference) return reference;
  return 'Sitio sin referencia';
}

function replaceEquipmentWithSite_gnral(value, equipment, siteLabel) {
  const text = cleanText_gnral(value, 1000);
  const equipmentText = cleanText_gnral(equipment, 255);
  const site = cleanText_gnral(siteLabel, 510);
  if (!text || !equipmentText || !site) return text;

  const escaped = equipmentText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'gi'), site);
}

module.exports = {
  siteLabel_gnral,
  replaceEquipmentWithSite_gnral
};
