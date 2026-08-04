function timestamp() {
  return new Date().toISOString();
}

function info(message, details) {
  console.log(`[${timestamp()}] [INFO] ${message}`, details || '');
}

function warn(message, details) {
  console.warn(`[${timestamp()}] [WARN] ${message}`, details || '');
}

function error(message, details) {
  console.error(`[${timestamp()}] [ERROR] ${message}`, details || '');
}

module.exports = { info, warn, error };
