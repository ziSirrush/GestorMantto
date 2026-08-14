'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function git(args) {
  try {
    return execFileSync('git', args, { encoding:'utf8', stdio:['ignore','pipe','ignore'] }).trim();
  } catch (_) {
    return '';
  }
}

const commit = String(process.env.GITHUB_SHA || process.env.COMMIT_REF || git(['rev-parse','HEAD']) || '').trim();
const commitShort = commit ? commit.slice(0,7) : '';
let message = commit ? git(['log','-1','--pretty=%s',commit]) : '';
if (!message) message = String(process.env.MANTTO_COMMIT_MESSAGE || '').trim();

let provider = 'DEPLOY';
if (String(process.env.GITHUB_ACTIONS || '').toLowerCase() === 'true') provider = 'GITHUB_PAGES';
else if (process.env.NETLIFY || process.env.CONTEXT || process.env.DEPLOY_URL) provider = 'NETLIFY';

const payload = {
  environment:'DEPLOY',
  provider,
  localVersion:'FIX V016.2',
  message,
  commit,
  commitShort,
  generatedAt:new Date().toISOString()
};

const output = path.resolve(__dirname,'..','core','build-info.generated.js');
fs.writeFileSync(output,'window.MANTTO_BUILD_INFO = Object.freeze('+JSON.stringify(payload,null,2)+');\n','utf8');
console.log('[Mantto Build] '+provider+' · '+(message||'Sin mensaje')+' · '+(commitShort||'sin SHA'));
