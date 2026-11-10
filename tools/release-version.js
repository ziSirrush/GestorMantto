'use strict';
// BLT NOW
// Nomenclatura OFICIAL de commits: Version MMDDYY.N (consecutivo global por repositorio y día).
// Metadatos de despliegue heredados: API DDMMYY.N | Frontend DDMMYY.N | Publicación API.FE.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const API_FILE = path.join(ROOT, 'config', 'releases', 'api.json');
const FRONT_FILE = path.join(ROOT, 'config', 'releases', 'frontend.json');

function zonedParts(date = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', year: '2-digit', month: '2-digit', day: '2-digit'
  }).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}

// Formato heredado usado solo por los manifiestos técnicos de API/Frontend.
function releaseDate(date = new Date()) {
  const parts = zonedParts(date);
  return parts.day + parts.month + parts.year;
}

// Formato oficial de commits definido por la Constitución.
function commitVersionDate(date = new Date()) {
  const parts = zonedParts(date);
  return parts.month + parts.day + parts.year;
}

function parsePart(value, label = 'version') {
  const source = String(value || '');
  const match = /^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(\d{2})\.([1-9]\d*)$/.exec(source);
  if (!match) throw new Error(label + ' debe ser DDMMYY.N: ' + source);
  const day = Number(match[1]), month = Number(match[2]), year = 2000 + Number(match[3]);
  const verified = new Date(Date.UTC(year, month - 1, day));
  if (verified.getUTCFullYear() !== year || verified.getUTCMonth() !== month - 1 || verified.getUTCDate() !== day) {
    throw new Error(label + ' contiene una fecha invalida: ' + source);
  }
  const revision = Number(match[4]);
  if (!Number.isSafeInteger(revision)) throw new Error(label + ' tiene una revision invalida');
  return { date: match[1] + match[2] + match[3], revision };
}

function parseOfficialVersion(value, label = 'commit') {
  const source = String(value || '');
  const match = /^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(\d{2})\.([1-9]\d*)$/.exec(source);
  if (!match) throw new Error(label + ' debe ser MMDDYY.N: ' + source);
  const month = Number(match[1]), day = Number(match[2]), year = 2000 + Number(match[3]);
  const verified = new Date(Date.UTC(year, month - 1, day));
  if (verified.getUTCFullYear() !== year || verified.getUTCMonth() !== month - 1 || verified.getUTCDate() !== day) {
    throw new Error(label + ' contiene una fecha invalida: ' + source);
  }
  const revision = Number(match[4]);
  if (!Number.isSafeInteger(revision)) throw new Error(label + ' tiene una revision invalida');
  return { date: match[1] + match[2] + match[3], revision, version: source };
}

function parseOfficialSubject(subject) {
  const source = String(subject || '').trim();
  const match = /^Version (.+)$/.exec(source);
  if (!match) throw new Error('Commit esperado: "Version MMDDYY.N", recibido: "' + source + '"');
  return parseOfficialVersion(match[1], 'Commit');
}

function version(part) { return part.date + '.' + part.revision; }

function normalize(api, frontend) {
  const base = version(parsePart(api.version, 'API'));
  const front = version(parsePart(frontend.version, 'Frontend'));
  if (frontend.apiVersion !== base) throw new Error('La revision frontend no corresponde a la API base.');
  return Object.freeze({ api: base, frontend: front, combined: base + '.' + front });
}

function read() {
  return normalize(JSON.parse(fs.readFileSync(API_FILE, 'utf8')),
    JSON.parse(fs.readFileSync(FRONT_FILE, 'utf8')));
}

function bump(kind, current = read(), date = releaseDate()) {
  if (!/^\d{6}$/.test(date)) throw new Error('Fecha invalida');
  parsePart(date + '.1', 'Fecha');
  if (kind !== 'api' && kind !== 'frontend') throw new Error('Uso: bump api|frontend');
  const base = parsePart(current.api, 'API');
  const front = parsePart(current.frontend, 'Frontend');
  const api = kind === 'api'
    ? version({ date, revision: base.date === date ? base.revision + 1 : 1 })
    : current.api;
  const frontend = version({
    date,
    revision: kind === 'api' ? 1 : front.date === date ? front.revision + 1 : 1
  });
  return normalize({version:api},{apiVersion:api,version:frontend});
}

function save(state) {
  fs.mkdirSync(path.dirname(API_FILE), {recursive: true});
  fs.writeFileSync(API_FILE, JSON.stringify({version:state.api}, null, 2) + '\n');
  fs.writeFileSync(FRONT_FILE, JSON.stringify({apiVersion:state.api, version:state.frontend}, null, 2) + '\n');
}

function git(args) {
  return cp.execFileSync('git', args, {cwd:ROOT, encoding:'utf8'}).trim();
}

function gitSubject() {
  return git(['log', '-1', '--pretty=%s']);
}

function gitCommitDate(ref = 'HEAD') {
  return git(['show', '-s', '--format=%cI', ref]);
}

function gitSubjects(ref = 'HEAD') {
  const out = git(['log', ref, '--pretty=%s']);
  return out ? out.split(/\r?\n/).filter(Boolean) : [];
}

function previousSubjects() {
  try { return gitSubjects('HEAD^'); }
  catch (_) { return []; }
}

function nextOfficialRevision(subjects, date) {
  let max = 0;
  for (const subject of subjects || []) {
    try {
      const parsed = parseOfficialSubject(subject);
      if (parsed.date === date) max = Math.max(max, parsed.revision);
    } catch (_) {}
  }
  return max + 1;
}

function nextCommitTitle(date = new Date()) {
  const commitDate = commitVersionDate(date);
  return 'Version ' + commitDate + '.' + nextOfficialRevision(gitSubjects(), commitDate);
}

function verify({checkCommit = process.env.GITHUB_EVENT_NAME === 'push'} = {}) {
  const current = read();
  if (checkCommit) {
    const parsed = parseOfficialSubject(gitSubject());
    const actualDate = commitVersionDate(new Date(gitCommitDate('HEAD')));
    if (parsed.date !== actualDate) {
      throw new Error('La fecha del commit debe ser ' + actualDate + ' (America/Mexico_City), recibido: ' + parsed.date);
    }
    return Object.freeze({...current, commitVersion: parsed.version});
  }
  return current;
}

function verifyHistory() {
  const current = verify({checkCommit:true});
  const parsed = parseOfficialVersion(current.commitVersion, 'Commit');
  const expectedRevision = nextOfficialRevision(previousSubjects(), parsed.date);
  if (parsed.revision !== expectedRevision) {
    throw new Error('Consecutivo global esperado para ' + parsed.date + ': .' + expectedRevision +
      ', recibido: .' + parsed.revision);
  }
  return current;
}

function run(args) {
  const command = args[0] || 'show';
  if (command === 'show') {
    const current=read();
    console.log(JSON.stringify({...current, officialCommitTitle:nextCommitTitle()}, null, 2));
  } else if (command === 'verify') {
    const current=verify();
    console.log('Nomenclatura oficial verificada: Version ' + current.commitVersion);
  } else if (command === 'verify-history') {
    const current=verifyHistory();
    console.log('Nomenclatura oficial y consecutivo global verificados: Version ' + current.commitVersion);
  } else if (command === 'bump') {
    const before=read();
    const after=bump(args[1],before);
    save(after);
    console.log('Metadatos de despliegue: ' + before.combined + ' -> ' + after.combined);
    console.log('Mensaje de commit oficial: ' + nextCommitTitle());
  } else {
    throw new Error('Uso: node tools/release-version.js show|verify|verify-history|bump api|bump frontend');
  }
}

if (require.main === module) {
  try { run(process.argv.slice(2)); }
  catch (error) { console.error('[release-version] ' + error.message); process.exitCode = 1; }
}

module.exports={
  releaseDate,commitVersionDate,parsePart,parseOfficialVersion,parseOfficialSubject,
  normalize,read,bump,save,nextOfficialRevision,nextCommitTitle,verify,verifyHistory
};
