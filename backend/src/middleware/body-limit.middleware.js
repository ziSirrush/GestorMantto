'use strict';
// [Aster | 2026-10-29 | ASTER-MG | AST-06 PER ROUTE BODY LIMIT V001]
function chooseBodyLimit_aster(req) {
  const path=String(req?.originalUrl||req?.url||'').split('?')[0].toLowerCase();
  if(path.startsWith('/api/auth/'))return '64kb';
  if(path.endsWith('/sync')||path.includes('/sync/')||path.endsWith('/importar-backup')||path.includes('/netsuite'))return '12mb';
  return '1mb';
}
module.exports={chooseBodyLimit_aster};
