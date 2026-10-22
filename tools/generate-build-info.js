'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.join(ROOT, 'dist', 'web', 'core', 'build-info.generated.js');

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {
    return '';
  }
}

function providerFromEnvironment() {
  if (String(process.env.GITHUB_ACTIONS || '').toLowerCase() === 'true') return 'GITHUB_PAGES';
  if (process.env.NETLIFY || process.env.CONTEXT || process.env.DEPLOY_URL) return 'NETLIFY';
  return 'DEPLOY';
}

function generate({ output = DEFAULT_OUTPUT, commit, generatedAt, message, provider, localVersion = 'FIX V016.2' } = {}) {
  const buildCommit = String(commit || process.env.GITHUB_SHA || process.env.COMMIT_REF || git(['rev-parse', 'HEAD']) || '').trim();
  const buildMessage = String(message || (buildCommit ? git(['log', '-1', '--pretty=%s', buildCommit]) : '') || process.env.MANTTO_COMMIT_MESSAGE || '').trim();
  const payload = {
    environment: 'DEPLOY',
    provider: provider || providerFromEnvironment(),
    localVersion,
    message: buildMessage,
    commit: buildCommit,
    commitShort: buildCommit.slice(0, 7),
    generatedAt: generatedAt || new Date().toISOString()
  };
  const json = JSON.stringify(payload, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `window.MANTTO_BUILD_INFO = Object.freeze(${json});\n`, 'utf8');
  return payload;
}

if (require.main === module) {
  try {
    const payload = generate();
    console.log(`[Mantto Build] ${payload.provider} · ${payload.message || 'Sin mensaje'} · ${payload.commitShort || 'sin SHA'} · dist/web`);
  } catch (error) {
    console.error('[Mantto Build] ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { DEFAULT_OUTPUT, generate };
