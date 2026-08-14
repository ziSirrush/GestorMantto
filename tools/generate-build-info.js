'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    return '';
  }
}

const commit = String(process.env.COMMIT_REF || process.env.GITHUB_SHA || git(['rev-parse', 'HEAD']) || '').trim();
const commitShort = commit ? commit.slice(0, 7) : '';
let message = '';

if (commit) message = git(['log', '-1', '--pretty=%s', commit]);
if (!message) message = String(process.env.MANTTO_COMMIT_MESSAGE || '').trim();

const payload = {
  environment: 'DEPLOY',
  localVersion: 'FIX V016',
  message,
  commit,
  commitShort,
  generatedAt: new Date().toISOString()
};

const output = path.resolve(__dirname, '..', 'core', 'build-info.generated.js');
fs.writeFileSync(
  output,
  'window.MANTTO_BUILD_INFO = Object.freeze(' + JSON.stringify(payload, null, 2) + ');\n',
  'utf8'
);

console.log('[Mantto Build] ' + (message || 'Sin mensaje') + ' · ' + (commitShort || 'sin SHA'));
