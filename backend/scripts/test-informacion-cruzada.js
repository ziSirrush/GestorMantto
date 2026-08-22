'use strict';

const assert = require('assert');

// Los resolvers de permisos cargan el pool por compatibilidad. La prueba usa
// dobles y no establece conexiones reales.
process.env.DB_HOST ||= 'localhost';
process.env.DB_PORT ||= '3306';
process.env.DB_USER ||= 'test';
process.env.DB_PASSWORD ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.DB_SSL ||= 'false';
const {
  CROSS_BLOCK_REASON,
  resolveCrossInformationBlock_gnral,
  loadCrossInformationBlock_gnral,
  mergeCrossInformationPayload_gnral
} = require('../src/services/alcance/informacion-cruzada.service');

function mockExecutor() {
  return {
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes('FROM perm_agrupaciones')) {
        const code = String(params[0] || '').trim().toUpperCase();
        if (code === 'OPERACION') {
          return [[{ id_agrupacion: 30, codigo: 'OPERACION', nombre: 'Operacion', empresa: 'UNITED', activo: 1 }]];
        }
        if (code === 'GENERAL') {
          return [[{ id_agrupacion: 1, codigo: 'GENERAL', nombre: 'General', empresa: 'GENERAL', activo: 1 }]];
        }
        return [[]];
      }
      if (text.includes("tipo_alcance = 'DOMINIO_COMPLETO'")) return [[]];
      if (text.includes("tipo_alcance = 'AGRUPACION'")) return [[{ id_alcance: 1 }]];
      throw new Error(`SQL no contemplado por la prueba: ${text}`);
    }
  };
}

async function main() {
  const db = mockExecutor();
  const source = {
    contextUser: { id_SB: 77 },
    user: { id_SB: 999 }
  };

  // Caso solicitado: puede abrir Portafolio padre, pero NO tiene permiso de
  // Tickets. El bloque se oculta y su loader nunca debe ejecutarse.
  let loaderCalls = 0;
  let scopeResolverCalls = 0;
  const deniedByPermission = await loadCrossInformationBlock_gnral(db, source, {
    codigo: 'TICKETS_PROYECTO',
    payloadKey: 'tickets',
    permissionCodesAny: ['TICKETS.VER'],
    groupingRef: 'OPERACION',
    recordScopeCheck: async () => true,
    load: async () => {
      loaderCalls += 1;
      return [{ ticket: 'NO-DEBE-CARGARSE' }];
    }
  }, {
    permissionResolver: async (userId) => {
      assert.strictEqual(userId, 77); // Viewer usa contextUser.
      return false;
    },
    scopeResolver: async () => {
      scopeResolverCalls += 1;
      return { motor: 'alcance_uni', empresa: 'UNITED', llave_maestra: false };
    }
  });

  assert.strictEqual(deniedByPermission.incluido, false);
  assert.strictEqual(deniedByPermission.acceso.motivo, CROSS_BLOCK_REASON.FUNCTIONAL_PERMISSION_DENIED);
  assert.strictEqual(loaderCalls, 0);
  assert.strictEqual(scopeResolverCalls, 0);
  assert.deepStrictEqual(
    mergeCrossInformationPayload_gnral({ proyecto: { id: 1 } }, [deniedByPermission]),
    { proyecto: { id: 1 } }
  );

  // Tiene permiso, pero no alcanza el registro concreto: tampoco consulta data.
  const deniedByScope = await loadCrossInformationBlock_gnral(db, source, {
    codigo: 'TICKETS_PROYECTO',
    payloadKey: 'tickets',
    permissionCodesAny: ['TICKETS.VER'],
    groupingRef: 'OPERACION',
    recordScopeCheck: async ({ scope }) => {
      assert.deepStrictEqual(scope.zona_ids, [2, 5]);
      return { allowed: false, reason: 'FUERA_ZONA' };
    },
    load: async () => {
      loaderCalls += 1;
      return [];
    }
  }, {
    permissionResolver: async () => true,
    scopeResolver: async () => ({
      motor: 'alcance_uni',
      empresa: 'UNITED',
      llave_maestra: false,
      zona_ids: [2, 5],
      agrupacion: { codigo: 'OPERACION', empresa: 'UNITED' }
    })
  });

  assert.strictEqual(deniedByScope.incluido, false);
  assert.strictEqual(deniedByScope.acceso.motivo, 'FUERA_ZONA');
  assert.strictEqual(loaderCalls, 0);

  // Permiso + alcance = el bloque si se consulta y se incorpora.
  const allowed = await loadCrossInformationBlock_gnral(db, source, {
    codigo: 'TICKETS_PROYECTO',
    payloadKey: 'tickets',
    permissionCodesAny: ['TICKETS.VER'],
    groupingRef: 'OPERACION',
    recordScopeCheck: async ({ userId }) => userId === 77,
    load: async ({ scope }) => {
      loaderCalls += 1;
      assert.strictEqual(scope.motor, 'alcance_uni');
      return [{ ticket: 'T-001' }, { ticket: 'T-002' }];
    }
  }, {
    permissionResolver: async () => true,
    scopeResolver: async () => ({
      motor: 'alcance_uni',
      empresa: 'UNITED',
      llave_maestra: false,
      zona_ids: [2],
      agrupacion: { codigo: 'OPERACION', empresa: 'UNITED' }
    })
  });

  assert.strictEqual(allowed.incluido, true);
  assert.strictEqual(loaderCalls, 1);
  assert.deepStrictEqual(
    mergeCrossInformationPayload_gnral({ proyecto: { id: 1 } }, [allowed], { includeVisibility: true }),
    {
      proyecto: { id: 1 },
      tickets: [{ ticket: 'T-001' }, { ticket: 'T-002' }],
      secciones_disponibles: { tickets: true }
    }
  );

  // Llave maestra de ALCANCE no omite la pregunta de permiso funcional.
  let masterScopeCheckCalls = 0;
  const masterAllowed = await loadCrossInformationBlock_gnral(db, source, {
    codigo: 'TICKETS_PROYECTO',
    payloadKey: 'tickets',
    permissionCodesAny: ['TICKETS.VER'],
    groupingRef: 'OPERACION',
    recordScopeCheck: async () => {
      masterScopeCheckCalls += 1;
      return false;
    },
    load: async () => [{ ticket: 'T-MASTER' }]
  }, {
    permissionResolver: async () => true,
    scopeResolver: async () => ({
      motor: 'alcance_uni',
      empresa: 'UNITED',
      llave_maestra: true,
      agrupacion: { codigo: 'OPERACION', empresa: 'UNITED' }
    })
  });
  assert.strictEqual(masterAllowed.incluido, true);
  assert.strictEqual(masterScopeCheckCalls, 0);

  const masterWithoutPermission = await resolveCrossInformationBlock_gnral(db, source, {
    codigo: 'TICKETS_PROYECTO',
    payloadKey: 'tickets',
    permissionCodesAny: ['TICKETS.VER'],
    groupingRef: 'OPERACION',
    recordScopeCheck: async () => true
  }, {
    permissionResolver: async () => false,
    scopeResolver: async () => ({ llave_maestra: true })
  });
  assert.strictEqual(masterWithoutPermission.visible, false);
  assert.strictEqual(masterWithoutPermission.motivo, CROSS_BLOCK_REASON.FUNCTIONAL_PERMISSION_DENIED);

  // Chats: el alcance se decide a nivel del hilo. Si el hilo es visible, la
  // carga conserva TODO su historial; esta capa no filtra mensajes por autor.
  const chat = await loadCrossInformationBlock_gnral(db, source, {
    codigo: 'CHAT_SOLICITUD',
    payloadKey: 'chat',
    permissionCodesAny: ['CHAT.VER'],
    groupingRef: 'GENERAL',
    recordScopeCheck: async () => true,
    load: async () => [
      { id: 1, autor: 77, texto: 'inicio' },
      { id: 2, autor: 88, texto: 'respuesta' },
      { id: 3, autor: 99, texto: 'seguimiento' }
    ]
  }, {
    permissionResolver: async () => true,
    scopeResolver: async () => ({
      motor: 'alcance_gnral',
      empresa: 'GENERAL',
      llave_maestra: false,
      agrupacion: { codigo: 'GENERAL', empresa: 'GENERAL' }
    })
  });
  assert.deepStrictEqual(chat.data.map((item) => item.autor), [77, 88, 99]);

  // Fail closed: permiso + motor sin checker de registro no puede abrir bloque.
  await assert.rejects(
    () => resolveCrossInformationBlock_gnral(db, source, {
      codigo: 'SIN_CHECKER',
      permissionCodesAny: ['X.VER'],
      groupingRef: 'GENERAL'
    }, {
      permissionResolver: async () => true,
      scopeResolver: async () => ({ motor: 'alcance_gnral', empresa: 'GENERAL', llave_maestra: false })
    }),
    (error) => error && error.code === 'INFORMACION_CRUZADA_CONFIGURATION_ERROR'
  );

  console.log('INFORMACION_CRUZADA_V001: OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
