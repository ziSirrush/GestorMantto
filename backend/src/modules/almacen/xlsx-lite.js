'use strict';

const zlib = require('zlib');

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)));
}

function findEocd(buffer) {
  const signature = 0x06054b50;
  const start = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset;
  }
  throw new Error('XLSX inválido: no se encontró el directorio ZIP.');
}

function unzipEntries(buffer) {
  const eocd = findEocd(buffer);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  let offset = centralOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('XLSX inválido: directorio ZIP corrupto.');
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8');

    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`XLSX inválido: cabecera local faltante para ${name}.`);
    }
    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = zlib.inflateRawSync(compressed);
    else throw new Error(`XLSX no soportado: método ZIP ${method} en ${name}.`);
    entries.set(name.replace(/^\//, ''), data);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function xmlTextBlocks(xml) {
  const values = [];
  const regex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi;
  let match;
  while ((match = regex.exec(xml))) values.push(decodeXml(match[1]));
  return values.join('');
}

function sharedStrings(entries) {
  const data = entries.get('xl/sharedStrings.xml');
  if (!data) return [];
  const xml = data.toString('utf8');
  const values = [];
  const regex = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gi;
  let match;
  while ((match = regex.exec(xml))) values.push(xmlTextBlocks(match[1]));
  return values;
}

function worksheetDefinitions(entries) {
  const workbook = entries.get('xl/workbook.xml');
  if (!workbook) throw new Error('XLSX inválido: falta xl/workbook.xml.');
  const workbookXml = workbook.toString('utf8');
  const rels = entries.get('xl/_rels/workbook.xml.rels');
  if (!rels) throw new Error('XLSX inválido: faltan relaciones del libro.');
  const relXml = rels.toString('utf8');
  const relations = new Map();
  const relationRegex = /<Relationship\b([^>]*)\/?\s*>/gi;
  let relation;
  while ((relation = relationRegex.exec(relXml))) {
    const attrs = relation[1] || '';
    const id = (attrs.match(/\bId="([^"]+)"/i) || [])[1];
    const target = (attrs.match(/\bTarget="([^"]+)"/i) || [])[1];
    if (id && target) relations.set(id, target);
  }

  const sheets = [];
  const sheetRegex = /<sheet\b([^>]*)\/?\s*>/gi;
  let sheetMatch;
  while ((sheetMatch = sheetRegex.exec(workbookXml))) {
    const attrs = sheetMatch[1] || '';
    const rawName = (attrs.match(/\bname="([^"]*)"/i) || [])[1];
    const relationId = (attrs.match(/\br:id="([^"]+)"/i) || [])[1];
    if (!relationId || !relations.has(relationId)) continue;
    let target = relations.get(relationId).replace(/^\//, '');
    if (!target.startsWith('xl/')) target = 'xl/' + target.replace(/^\.\//, '');
    const worksheet = entries.get(target);
    if (!worksheet) continue;
    sheets.push({ name: decodeXml(rawName || `Hoja${sheets.length + 1}`), xml: worksheet.toString('utf8') });
  }
  if (!sheets.length) throw new Error('XLSX inválido: no se encontró una hoja utilizable.');
  return sheets;
}

function columnIndex(reference) {
  const letters = String(reference || '').match(/^[A-Z]+/i);
  if (!letters) return 0;
  let value = 0;
  for (const char of letters[0].toUpperCase()) value = value * 26 + char.charCodeAt(0) - 64;
  return value - 1;
}

function parseCells(xml, strings) {
  const rows = [];
  const rowRegex = /<row\b([^>]*)>([\s\S]*?)<\/row>/gi;
  let rowMatch;
  let sequentialIndex = 0;
  while ((rowMatch = rowRegex.exec(xml))) {
    const rowAttrs = rowMatch[1] || '';
    const bodyXml = rowMatch[2] || '';
    const explicitRow = Number((rowAttrs.match(/\br="(\d+)"/i) || [])[1]);
    const rowIndex = Number.isInteger(explicitRow) && explicitRow > 0 ? explicitRow - 1 : sequentialIndex;
    sequentialIndex = rowIndex + 1;
    const row = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(bodyXml))) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = (attrs.match(/\br="([^"]+)"/i) || [])[1] || '';
      const type = (attrs.match(/\bt="([^"]+)"/i) || [])[1] || '';
      const index = columnIndex(ref);
      const rawValue = (body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i) || [])[1];
      let value = '';
      if (type === 'inlineStr') value = xmlTextBlocks(body);
      else if (type === 's') value = strings[Number(rawValue)] ?? '';
      else if (type === 'b') value = String(rawValue) === '1' ? 'TRUE' : 'FALSE';
      else if (type === 'str') value = decodeXml(rawValue || '');
      else value = rawValue == null ? '' : decodeXml(rawValue);
      row[index] = value;
    }
    rows[rowIndex] = row;
  }
  for (let index = 0; index < rows.length; index += 1) {
    if (!Array.isArray(rows[index])) rows[index] = [];
  }
  return rows;
}

function parseXlsxSheets(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('Archivo XLSX vacío o inválido.');
  const entries = unzipEntries(buffer);
  const strings = sharedStrings(entries);
  return worksheetDefinitions(entries).map(sheet => ({ sheetName: sheet.name, rows: parseCells(sheet.xml, strings) }));
}

function parseXlsx(buffer) {
  return parseXlsxSheets(buffer)[0];
}

function detectDelimiter(text) {
  const first = String(text || '').split(/\r?\n/).find(line => line.trim()) || '';
  const candidates = [',', ';', '\t'];
  return candidates.map(delimiter => ({ delimiter, count: first.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function parseCsv(buffer) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return { sheetName: 'CSV', rows };
}

module.exports = { parseXlsx, parseXlsxSheets, parseCsv };
