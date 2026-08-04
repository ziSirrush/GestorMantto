function validatePasswordRules(password) {
  const value = String(password || '');
  if (value.length < 10) return 'La contraseña debe tener mínimo 10 caracteres.';
  return null;
}

module.exports = { validatePasswordRules };
