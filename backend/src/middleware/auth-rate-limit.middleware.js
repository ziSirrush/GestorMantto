'use strict';

const buckets = new Map();

function normalizeEmail(req) {
  return String(req.body && req.body.correo || '').trim().toLowerCase().slice(0, 254);
}

function clientKey(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 96);
  const email = normalizeEmail(req) || 'no-email';
  return `${ip}|${email}`;
}

function pruneExpired(now) {
  if (buckets.size < 2000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  // Mantener el consumo de memoria acotado aun ante claves distribuidas.
  while (buckets.size >= 5000) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey === undefined) break;
    buckets.delete(oldestKey);
  }
}

// [Aster | 2026-10-29 | ASTER-MG | AST-06 DISTRIBUTED AUTH LIMIT V001]
const crypto = require('node:crypto');
async function distributedCount(key,windowMs){
  const url=String(process.env.AUTH_RATE_LIMIT_REDIS_URL||'').trim();
  const token=String(process.env.AUTH_RATE_LIMIT_REDIS_TOKEN||'').trim();
  if(!url && !token)return null;
  if(!url.startsWith('https://')||!token)throw new Error('Redis REST no configurado');
  const hash=crypto.createHash('sha256').update(key).digest('hex');
  const script='local n=redis.call("INCR",KEYS[1]); if n==1 then redis.call("PEXPIRE",KEYS[1],ARGV[1]); end; return {n,redis.call("PTTL",KEYS[1])}';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);
  try{
    const endpoint=url.endsWith('/')?url.slice(0,-1):url;
    const response=await fetch(endpoint+'/pipeline',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify([['EVAL',script,1,'blt:auth:limit:'+hash,String(windowMs)]]),
      signal:controller.signal,redirect:'error'
    });
    if(!response.ok)throw new Error('Redis HTTP '+response.status);
    const result=(await response.json())?.[0]?.result;
    if(!Array.isArray(result)||result.length!==2||!Number.isFinite(Number(result[0])))throw new Error('Redis response invalida');
    return {count:Number(result[0]),retryAfter:Math.max(1,Math.ceil(Number(result[1])/1000)||Math.ceil(windowMs/1000))};
  }finally{clearTimeout(timer)}
}
function createRateLimit({name,windowMs,max}){
  return async function rateLimit(req,res,next){
    const now=Date.now(),key=name+'|'+clientKey(req);
    let count,retryAfterSeconds;
    try{
      const shared=await distributedCount(key,windowMs);
      if(shared){count=shared.count;retryAfterSeconds=shared.retryAfter;}
      else{
        pruneExpired(now);
        let bucket=buckets.get(key);
        if(!bucket||bucket.resetAt<=now){bucket={count:0,resetAt:now+windowMs};buckets.set(key,bucket);}
        bucket.count++;
        count=bucket.count;
        retryAfterSeconds=Math.max(1,Math.ceil((bucket.resetAt-now)/1000));
      }
    }catch(error){
      console.error('[AUTH_RATE_LIMIT_STORE_UNAVAILABLE]',error?.message);
      return res.status(503).json({ok:false,code:'AUTH_RATE_LIMIT_UNAVAILABLE',message:'Control de acceso temporalmente no disponible.'});
    }
    if(count<=max)return next();
    res.set('Retry-After',String(retryAfterSeconds));
    return res.status(429).json({ok:false,code:'AUTH_RATE_LIMITED',message:'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.',retry_after_seconds:retryAfterSeconds});
  };
}

const loginRateLimit = createRateLimit({
  name: 'login',
  windowMs: 15 * 60 * 1000,
  max: 10
});

const recoveryRateLimit = createRateLimit({
  name: 'recovery',
  windowMs: 15 * 60 * 1000,
  max: 5
});

module.exports = {
  createRateLimit,
  loginRateLimit,
  recoveryRateLimit
};
