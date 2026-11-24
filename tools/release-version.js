'use strict';
// BLT NOW | Versionamiento independiente con doble fecha DDMMYY.
// API: DDMMYY.N | Frontend: DDMMYY.N | Publicacion: API.FE
// Reforma 2026-11-19.1: fecha y consecutivo funcionales independientes.
// Actualizar frontend.apiVersion solo enlaza la API; nunca reinicia version.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const API_FILE = path.join(ROOT, 'config', 'releases', 'api.json');
const FRONT_FILE = path.join(ROOT, 'config', 'releases', 'frontend.json');

function releaseDate(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', year: '2-digit', month: '2-digit', day: '2-digit'
  }).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return parts.day + parts.month + parts.year;
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

function chronologicalKey(date) {
  return date.slice(4,6) + date.slice(2,4) + date.slice(0,2);
}

function advance(part, date, label) {
  if (chronologicalKey(date) < chronologicalKey(part.date)) {
    throw new Error('La fecha de ' + label + ' no puede retroceder.');
  }
  return version({date,revision:part.date === date ? part.revision + 1 : 1});
}

function bump(kind, current = read(), date = releaseDate()) {
  parsePart(date + '.1','Fecha');
  if (!['api','frontend','both'].includes(kind)) throw new Error('Uso: bump api|frontend|both');
  const base = parsePart(current.api,'API');
  const front = parsePart(current.frontend,'Frontend');
  const api = kind === 'api' || kind === 'both' ? advance(base,date,'API') : current.api;
  const frontend = kind === 'frontend' || kind === 'both' ? advance(front,date,'Frontend') : current.frontend;
  return normalize({version:api},{apiVersion:api,version:frontend});
}

// Clasificar recursos funcionales segun los artefactos reales de Azure y Pages.
// Tests, docs, manifiestos de version, CI y metadata generada no son por si
// mismos una nueva version funcional. La infraestructura de publicacion es independiente.
function classifyChanges(paths) {
  const names = Array.from(paths);
  const api = names.some(file => file.startsWith('backend/src/') ||
    ['backend/server.js','backend/package.json','backend/package-lock.json'].includes(file));
  const frontend = names.some(file =>
    !['core/build-info.generated.js','core/change-audit.generated.js'].includes(file) &&
    (/^(core|modules|styles|assets)\//.test(file) ||
      ['index.html','manifest.json','manifest-github.json','service-worker.js','_redirects',
        'tools/build-frontend.js','tools/generate-build-info.js','tools/generate-change-audit.js'].includes(file)));
  return {api,frontend};
}

// Regularizacion documentada: los cinco commits funcionales del 24/11/2026
// ya existen. Solo se acepta una vez, desde el padre exacto y sin nuevos
// cambios funcionales. No permite saltos arbitrarios ni reescribir historial.
const VERSION_RECOVERY_241126 = Object.freeze({
  parent:'72e1e641dc860753a4d74ccc942710d3fa95d790',
  before:'241126.4.241126.2',
  after:'241126.4.241126.5'
});

function verifyTransition(before, after, paths, {date=releaseDate(),parentSha=''}={}) {
  parsePart(date+'.1','Fecha');
  const {api,frontend}=classifyChanges(paths);
  const kind=api && frontend ? 'both' : api ? 'api' : frontend ? 'frontend' : null;
  if (!kind && parentSha === VERSION_RECOVERY_241126.parent &&
      before.combined === VERSION_RECOVERY_241126.before &&
      after.combined === VERSION_RECOVERY_241126.after) return after;
  const expected=kind ? bump(kind,before,date) : before;
  if(after.api !== expected.api || after.frontend !== expected.frontend){
    throw new Error('Versionado independiente: cambios '+(kind||'sin impacto funcional')+
      '; se esperaba '+expected.combined+' y se recibio '+after.combined+'.');
  }
  return after;
}

function save(state) {
  fs.mkdirSync(path.dirname(API_FILE), {recursive: true});
  fs.writeFileSync(API_FILE, JSON.stringify({version:state.api}, null, 2) + '\n');
  fs.writeFileSync(FRONT_FILE, JSON.stringify({apiVersion:state.api, version:state.frontend}, null, 2) + '\n');
}

// Verificar el mensaje almacenado completo; %s solo valida el asunto y omite el cuerpo.
function extractGitMessage(rawCommit) {
  const raw=String(rawCommit);
  const separator=raw.indexOf('\n\n');
  if (separator<0) throw new Error('No se pudo leer el mensaje completo del commit.');
  const message=raw.slice(separator+2);
  // Git puede almacenar un salto final; cualquier salto adicional es invalido.
  return message.endsWith('\n') ? message.slice(0,-1) : message;
}

function gitMessage() {
  const raw=cp.execFileSync('git', ['cat-file', 'commit', 'HEAD'], {cwd:ROOT,encoding:'utf8'});
  return extractGitMessage(raw);
}

function git(args) {
  return cp.execFileSync('git',args,{cwd:ROOT,encoding:'utf8'});
}

function verify({checkCommit = process.env.GITHUB_EVENT_NAME === 'push'} = {}) {
  const current=read();
  if (checkCommit) {
    const expected = 'Version ' + current.combined;
    const actual = gitMessage();
    if (actual !== expected) throw new Error('Commit esperado: "' + expected + '", recibido: "' + actual + '"');
    // CI obtiene el padre inmediato. Las reejecuciones usan la fecha del commit,
    // no la fecha del runner; no se permite saltar la comprobacion por falta de historial.
    const parentSha=git(['rev-parse','HEAD^']).trim();
    const before=normalize(
      JSON.parse(git(['show',parentSha+':config/releases/api.json'])),
      JSON.parse(git(['show',parentSha+':config/releases/frontend.json'])));
    const changed=git(['diff','--name-only','--no-renames','-z',parentSha,'HEAD']).split('\0').filter(Boolean);
    const committedAt=new Date(git(['show','-s','--format=%cI','HEAD']).trim());
    verifyTransition(before,current,changed,{date:releaseDate(committedAt),parentSha});
  }
  return current;
}

function run(args) {
  const command = args[0] || 'show';
  if (command === 'show') {
    const current=read();
    console.log(JSON.stringify({...current,commitTitle:'Version '+current.combined}, null, 2));
  } else if (command === 'verify') {
    const current=verify({checkCommit:process.env.GITHUB_EVENT_NAME === 'push' || args.includes('--commit')});
    console.log('Nomenclatura DDMMYY verificada: ' + current.combined);
  } else if (command === 'bump') {
    const before=read();
    const after=bump(args[1],before);
    save(after);
    console.log('BLT NOW: ' + before.combined + ' -> ' + after.combined);
    console.log('Mensaje de commit: Version ' + after.combined);
  } else {
    throw new Error('Uso: node tools/release-version.js show|verify [--commit]|bump api|frontend|both');
  }
}

if (require.main === module) {
  try { run(process.argv.slice(2)); }
  catch (error) { console.error('[release-version] ' + error.message); process.exitCode = 1; }
}

module.exports={releaseDate,parsePart,normalize,read,bump,classifyChanges,verifyTransition,save,verify,extractGitMessage};
