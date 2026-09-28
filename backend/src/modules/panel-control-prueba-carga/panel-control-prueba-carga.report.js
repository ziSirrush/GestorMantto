'use strict';

function number(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function fixed(value, digits = 2) {
  const parsed = number(value, null);
  if (parsed === null) return 'N/D';
  return parsed.toLocaleString('es-MX', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function count(value) {
  const parsed = number(value, null);
  return parsed === null ? 'N/D' : Math.trunc(parsed).toLocaleString('es-MX');
}

function ms(value) {
  const parsed = number(value, null);
  return parsed === null ? 'N/D' : `${fixed(parsed, parsed >= 100 ? 0 : 2)} ms`;
}

function mb(value) {
  const parsed = number(value, null);
  return parsed === null ? 'N/D' : `${fixed(parsed / (1024 * 1024), 1)} MB`;
}

function percentage(value) {
  const parsed = number(value, null);
  return parsed === null ? 'N/D' : `${fixed(parsed, 2)} %`;
}

function statusClassTotal(status, classDigit) {
  const source = status && typeof status === 'object' ? status : {};
  return Object.entries(source)
    .filter(([code]) => Math.trunc(Number(code) / 100) === classDigit)
    .reduce((sum, [, value]) => sum + integer(value, 0), 0);
}

function averageSample(samples, getter) {
  const values = (Array.isArray(samples) ? samples : [])
    .map(getter)
    .map(Number)
    .filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function firstSample(samples, getter) {
  for (const item of Array.isArray(samples) ? samples : []) {
    const value = Number(getter(item));
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function sanitizeSqlShape(value) {
  return sanitizeLine(value).replace(/'[^']*'/g, '?').replace(/"[^"]*"/g, '?');
}

function sanitizeLine(value, fallback = 'N/D') {
  const text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
  return text || fallback;
}

function reportStatus(session) {
  if (session?.completionIntegrity === 'INCOMPLETO') return 'INCOMPLETO';
  return String(session?.state || 'N/D');
}

function reportIntegrity(session) {
  return String(session?.completionIntegrity || 'N/D');
}

function buildLoadTestReport(session) {
  const telemetry = session?.telemetrySnapshot || {};
  const http = telemetry.http || {};
  const sql = telemetry.sql || {};
  const system = telemetry.system || {};
  const k6 = session?.runnerSummary || null;
  const samples = Array.isArray(session?.telemetry?.system_samples)
    ? session.telemetry.system_samples
    : [];

  const startedAt = number(session?.startedAt, null);
  const stoppedAt = number(session?.stoppedAt, null);
  const backendDurationMs = startedAt !== null && stoppedAt !== null && stoppedAt >= startedAt
    ? stoppedAt - startedAt
    : null;
  const durationMs = number(k6?.duration_ms, backendDurationMs);

  const k6Requests = k6 ? integer(k6.requests, 0) : null;
  const k6Failed = k6 ? integer(k6.failed, 0) : null;
  const k6Success = k6Requests === null || k6Failed === null ? null : Math.max(0, k6Requests - k6Failed);
  const errorRate = k6Requests === null ? null : (k6Requests > 0 ? (k6Failed / k6Requests) * 100 : 0);
  const k6Http = k6?.http || {};

  const endpoints = (Array.isArray(http.endpoints) ? http.endpoints : [])
    .filter(item => item && item.route)
    .slice(0, 5);
  const slowQueries = (Array.isArray(sql.fingerprints) ? sql.fingerprints : [])
    .filter(item => Number(item?.slow_queries || 0) > 0)
    .slice(0, 5);

  const nodeCpuAvg = averageSample(samples, sample => sample?.node?.cpu_percent);
  const nodeRssInitial = firstSample(samples, sample => sample?.node?.rss_bytes);
  const hostCpuMax = number(system?.maxima?.host_cpu_percent, null);
  const hostRamMax = number(system?.maxima?.host_ram_used_percent, null);
  const mysqlConnectedMax = number(system?.maxima?.mysql_threads_connected, null);
  const mysqlRunningMax = number(system?.maxima?.mysql_threads_running, null);

  const lines = [
    '=== MANTTO GESTOR - PRUEBA DE CARGA ===',
    '',
    `Grupo: ${count(session?.vus)} usuarios concurrentes`,
    `Escenario: ${sanitizeLine(session?.scenario)}`,
    `Duracion configurada: ${count(session?.durationSeconds)} s`,
    `Duracion real: ${durationMs === null ? 'N/D' : `${fixed(durationMs / 1000, 2)} s`}`,
    `Estado de ejecucion: ${sanitizeLine(reportStatus(session))}`,
    `Estado tecnico original: ${sanitizeLine(session?.state)}`,
    `Integridad del reporte: ${sanitizeLine(reportIntegrity(session))}`,
    `Motivo de cierre: ${sanitizeLine(session?.stopReason || session?.reportIncompleteReason || 'N/A')}`,
    '',
    'TRAFICO',
    `Requests totales k6: ${count(k6Requests)}`,
    `Requests/s k6: ${fixed(k6?.rps, 2)}`,
    `Exitosos k6: ${count(k6Success)}`,
    `Fallidos k6: ${count(k6Failed)}`,
    `Errores k6: ${percentage(errorRate)}`,
    `Requests terminados backend: ${count(http.completed)}`,
    `Requests/s backend promedio: ${fixed(http.rps_backend_avg, 2)}`,
    '',
    'LATENCIA GLOBAL K6',
    `Min: ${ms(k6?.latency?.min)}`,
    `Media: ${ms(k6?.latency?.avg)}`,
    `p50: ${ms(k6?.latency?.p50)}`,
    `p90: ${ms(k6?.latency?.p90)}`,
    `p95: ${ms(k6?.latency?.p95)}`,
    `p99: ${ms(k6?.latency?.p99)}`,
    `Max: ${ms(k6?.latency?.max)}`,
    '',
    'LATENCIA BACKEND EXPRESS',
    `p50 backend: ${ms(http?.latency?.p50_ms)}`,
    `p95 backend: ${ms(http?.latency?.p95_ms)}`,
    `p99 backend: ${ms(http?.latency?.p99_ms)}`,
    `Max backend: ${ms(http?.latency?.max_ms)}`,
    '',
    'HTTP',
    `2xx k6: ${count(k6Http['2xx'])}`,
    `3xx k6: ${count(k6Http['3xx'])}`,
    `4xx k6: ${count(k6Http['4xx'])}`,
    `5xx k6: ${count(k6Http['5xx'])}`,
    `Timeouts k6: ${count(k6?.timeouts)}`,
    `Errores de red k6: ${count(k6?.network_errors)}`,
    `2xx backend: ${count(statusClassTotal(http.status, 2))}`,
    `3xx backend: ${count(statusClassTotal(http.status, 3))}`,
    `4xx backend: ${count(statusClassTotal(http.status, 4))}`,
    `5xx backend: ${count(statusClassTotal(http.status, 5))}`,
    '',
    'SERVIDOR',
    `CPU Node promedio: ${nodeCpuAvg === null ? 'N/D' : percentage(nodeCpuAvg)}`,
    `CPU Node maximo: ${system?.maxima?.node_cpu_percent == null ? 'N/D' : percentage(system.maxima.node_cpu_percent)}`,
    `RAM Node inicial: ${mb(nodeRssInitial)}`,
    `RAM Node maxima: ${mb(system?.maxima?.node_rss_bytes)}`,
    `Event Loop p95 maximo: ${ms(system?.maxima?.event_loop_delay_p95_ms)}`,
    `CPU host maxima: ${hostCpuMax === null ? 'N/D' : percentage(hostCpuMax)}`,
    `RAM host maxima: ${hostRamMax === null ? 'N/D' : percentage(hostRamMax)}`,
    '',
    'MYSQL',
    `Threads_connected max: ${count(mysqlConnectedMax)}`,
    `Threads_running max: ${count(mysqlRunningMax)}`,
    `Consultas observadas: ${count(sql.completed)}`,
    `Consultas lentas: ${count(sql.slow_queries)}`,
    `Errores SQL: ${count(sql.errors)}`,
    `Espera pool p95: ${ms(sql?.pool?.wait_latency?.p95_ms)}`,
    `Espera pool maxima: ${ms(sql?.pool?.wait_latency?.max_ms)}`,
    '',
    'ENDPOINTS MAS LENTOS POR p95 BACKEND'
  ];

  if (endpoints.length) {
    endpoints.forEach((item, index) => {
      lines.push(`${index + 1}. ${sanitizeLine(item.method)} ${sanitizeLine(item.route)} - ${ms(item?.latency?.p95_ms)} | ${count(item.requests)} requests | ${count(item.errors)} errores`);
    });
  } else {
    lines.push('N/D');
  }

  lines.push('', 'QUERIES LENTAS');
  if (slowQueries.length) {
    slowQueries.forEach((item, index) => {
      lines.push(`${index + 1}. fingerprint: ${sanitizeLine(item.fingerprint)} | ${ms(item?.latency?.max_ms)} max | ${count(item.count)} ejecuciones | ${count(item.slow_queries)} lentas`);
      lines.push(`   SQL: ${sanitizeSqlShape(item.sql_shape)}`);
    });
  } else {
    lines.push('N/D');
  }

  lines.push(
    '',
    'PROTECCION',
    `Abortada automaticamente: ${session?.state === 'ABORTADA_AUTOMATICA' ? 'SI' : 'NO'}`,
    `Motivo de aborto: ${sanitizeLine(session?.cancelReason || session?.stopReason || 'N/A')}`,
    '',
    'RESUMEN DEL RUNNER',
    `Resumen k6 recibido: ${session?.summaryReceivedAt ? 'SI' : 'NO'}`,
    `VUs configurados k6: ${count(k6?.vus_configured)}`,
    `VUs maximos k6: ${count(k6?.vus_max)}`,
    `Iteraciones completas: ${count(k6?.iterations_completed)}`,
    `Iteraciones interrumpidas: ${count(k6?.iterations_interrupted)}`,
    '',
    '=== FIN REPORTE ==='
  );

  return lines.join('\n');
}

module.exports = {
  buildLoadTestReport,
  _helpers: { statusClassTotal }
};
