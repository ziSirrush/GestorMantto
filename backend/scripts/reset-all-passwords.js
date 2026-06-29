require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../src/config/db');

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
  const [usuarios] = await db.query(`
    SELECT id_SB, nombre, correo
    FROM usuarios
    WHERE estado = 1
    ORDER BY nombre ASC
  `);

  const salida = [
    ['id_SB', 'nombre', 'correo', 'password_temporal']
  ];

  for (const usuario of usuarios) {
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
        updated_by = 'reset_masivo_script'
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
  }

  const csv = salida
    .map(row => row.map(csvEscape).join(','))
    .join('\n');

  const outputPath = path.join(__dirname, 'usuarios_passwords_temporales.csv');
  fs.writeFileSync(outputPath, csv, 'utf8');

  console.log('Contraseñas actualizadas correctamente.');
  console.log('Usuarios actualizados:', usuarios.length);
  console.log('Archivo generado:', outputPath);

  await db.end?.();
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});