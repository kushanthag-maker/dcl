/**
 * DCL MINI - Multi-Session WhatsApp Bot
 * Entry Point (Heroku safe)
 */

console.log('[BOOT] Starting DCL MINI Multi-Session...');
try { require('./scripts/patch-baileys'); } catch (_) {}
require('./lib/signalAutoHeal');
console.log('[BOOT] Node version:', process.version);
console.log('[BOOT] PORT:', process.env.PORT || 'not set');

try {
  require('dotenv').config();
  console.log('[BOOT] dotenv loaded');
} catch (e) {
  console.error('[BOOT] dotenv failed:', e.message);
}

const config = require('./config');
console.log('[BOOT] config loaded, mongoUri set:', !!config.mongoUri);

const { startServer } = require('./lib/server');
console.log('[BOOT] server module loaded');

try {
  startServer();
  console.log('[BOOT] Express server started — open the website to pair bots');
} catch (e) {
  console.error('[BOOT] FATAL - server failed to start:', e);
  setTimeout(() => process.exit(1), 3000);
}

// Auto-restore paired sessions after Heroku restart
const { restoreAllSessions } = require('./lib/sessionManager');
restoreAllSessions()
  .then(function (ids) {
    console.log('[BOOT] Restored sessions:', ids.length ? ids.join(', ') : '(none)');
  })
  .catch(function (err) {
    console.error('[BOOT] Session restore error:', err.message);
  });

process.on('uncaughtException', (err) => {
  const msg = err?.message || String(err || '');
  const isTransientSocket =
    msg.includes('WebSocket was closed') ||
    msg.includes('Opening handshake has timed out') ||
    msg.includes('Connection Closed') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('EPIPE') ||
    msg.includes('1006');

  if (isTransientSocket) {
    console.warn('[WA-SOCKET-DROP] Transient socket uncaught exception handled gracefully:', msg);
    return;
  }
  console.error('[UNCAUGHT]', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason || '');
  const payloadError = reason?.output?.payload?.error || '';
  const payloadMessage = reason?.output?.payload?.message || '';
  const statusCode = reason?.output?.statusCode || (typeof reason === 'number' ? reason : 0);

  const isTransientSocketEvent =
    msg.includes('Timed Out') ||
    msg.includes('Request Time-out') ||
    msg.includes('Connection Closed') ||
    msg.includes('Precondition Required') ||
    msg.includes('WebSocket was closed') ||
    msg.includes('Opening handshake has timed out') ||
    msg.includes('WebSocket Error') ||
    msg.includes('Connection Terminated') ||
    msg.includes('rate-overlimit') ||
    msg.includes('QR refs attempts ended') ||
    msg.includes('conflict') ||
    msg.includes('SessionError') ||
    msg.includes('Bad MAC') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('EPIPE') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('1006') ||
    msg === '1006' ||
    reason === 1006 ||
    statusCode === 1006 ||
    payloadError.includes('Time-out') ||
    payloadError.includes('Precondition Required') ||
    payloadError.includes('Connection Closed') ||
    payloadMessage.includes('internal server error') ||
    statusCode === 408 ||
    statusCode === 428 ||
    statusCode === 440 ||
    statusCode === 500 ||
    statusCode === 503;

  if (isTransientSocketEvent) {
    console.warn('[WA-SOCKET-DROP] Transient socket event handled gracefully:', msg || payloadError || statusCode);
    return;
  }
  console.warn('[UNHANDLED REJECTION]', msg || reason);
});

process.on('SIGTERM', () => {
  console.log('[BOOT] SIGTERM received');
  process.exit(0);
});

console.log('[BOOT] Ready. Pair bots from the website.');
