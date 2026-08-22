'use strict';

function normalizedRoleValue(value) {
  return String(value || '').trim().toUpperCase();
}

function hasGlobalProgrammerRole(user) {
  const roles = Array.isArray(user?.roles_detalle) ? user.roles_detalle : [];
  return roles.some((role) => (
    role &&
    Number(role.activo) === 1 &&
    normalizedRoleValue(role.codigo) === 'PROGRAMADOR' &&
    normalizedRoleValue(role.empresa) === 'GENERAL'
  ));
}

module.exports = { hasGlobalProgrammerRole };
