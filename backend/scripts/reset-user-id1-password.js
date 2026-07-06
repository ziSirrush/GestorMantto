require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../src/config/db');

const ID_USUARIO = 1;

function generarPassword() {
  return crypto.randomBytes(9).toString('base64')
    .replace(/[+/=]/g, '')
    .slice(0, 10) + 'A1!';
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function main() {

  const [usuarios] = await db.query(
    `
    SELECT id_SB, nombre, correo
    FROM usuarios
    WHERE id_SB = ?
    LIMIT 1
    `,
    [ID_USUARIO]
  );

  if (!usuarios.length) {
    console.log(`No se encontró el usuario con id_SB = ${ID_USUARIO}`);
    await db.end?.();
    return;
  }

  const salida = [
    ['id_SB', 'nombre', 'correo', 'password_temporal']
  ];

  const usuario = usuarios[0];

  const passwordTemporal = generarPassword();
  const hash = await bcrypt.hash(passwordTemporal, 10);

  await db.query(
    `
    UPDATE usuarios
    SET
      pass = ?,
      must_change_password = 1,
      first_login_completed_at = NULL,
      failed_login_attempts = 0,
      locked_until = NULL,
      password_changed_at = NULL,
      updated_at = NOW(),
      updated_by = 'reset_individual_script'
    WHERE id_SB = ?
    `,
    [hash, usuario.id_SB]
  );

  salida.push([
    usuario.id_SB,
    usuario.nombre,
    usuario.correo,
    passwordTemporal
  ]);

  const csv = salida
    .map(row => row.map(csvEscape).join(','))
    .join('\n');

  const outputPath = path.join(__dirname, 'usuario_password_temporal.csv');
  fs.writeFileSync(outputPath, csv, 'utf8');

  console.log('==========================================');
  console.log('Contraseña restablecida correctamente.');
  console.log(`Usuario: ${usuario.nombre}`);
  console.log(`Correo: ${usuario.correo}`);
  console.log('Archivo generado:', outputPath);
  console.log('==========================================');

  await db.end?.();
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});