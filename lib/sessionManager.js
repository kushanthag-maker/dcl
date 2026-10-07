/**
 * Multi-Session Manager
 * Stable reconnect — avoid false auto-logout
 */

const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode');
const { useMongoAuthState, listSavedSessions } = require('../database/mongoAuthState');
const config = require('../config');
const { getSettings, bindPhoneToSession } = require('./botSettings');
const { attachFeatureHooks } = require('./featureHooks');
const logger = require('./logger');
const { loadCommands } = require('./commandHandler');
const { handleMessage } = require('../events/message');
const { onBotConnected } = require('./onConnectHooks');
const {
  bindStoreToSocket,
  getMessage,
  recordMessage,
  retryCounterCache,
} = require('./messageStore');
const { notifyCleaners } = require('./signalAutoHeal');

const sessions = new Map();
let commandsLoaded = false;
let baileysVersion = null;
let versionPromise = null;

async function getVersion() {
  if (baileysVersion) return baileysVersion;
  if (versionPromise) return versionPromise;
  versionPromise = fetchLatestBaileysVersion()
    .then(function (result) {
      baileysVersion = result.version;
      versionPromise = null;
      return baileysVersion;
    })
    .catch(function () {
      versionPromise = null;
      baileysVersion = [2, 3000, 1023223821];
      return baileysVersion;
    });
  return versionPromise;
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

async function waitForSocketReady(sessionId, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  var start = Date.now();
  while (Date.now() - start < timeoutMs) {
    var s = sessions.get(sessionId);
    if (s && s.sock && s.sock.authState) {
      return s.sock;
    }
    await sleep(200);
  }
  throw new Error('Session took too long to start. Try again.');
}

const inFlightStarts = new Map();
let watchdogStarted = false;

function ensureWatchdog() {
  if (watchdogStarted) return;
  watchdogStarted = true;
  setInterval(async function () {
    for (const [id, s] of sessions.entries()) {
      if (!s) continue;
      const isRegistered = !!(s.sock?.authState?.creds?.registered) || s.status === 'online' || (s.user !== null);
      if (isRegistered && (s.status === 'reconnecting' || s.status === 'standby' || s.status === 'error' || s.status === 'offline')) {
        const timeSinceStart = Date.now() - (s.startedAt ? s.startedAt.getTime() : 0);
        if (!s.sock || timeSinceStart > 35000) {
          logger.info('[' + id + '] Watchdog auto-healing connection (current status: ' + s.status + ')...');
          try {
            await startSession(id);
          } catch (err) {
            logger.warn('[' + id + '] Watchdog recovery attempt error: ' + err.message);
          }
        }
      }
    }
  }, 45000).unref();
}

function startSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    return Promise.reject(new Error('sessionId is required'));
  }

  ensureWatchdog();

  var existing = sessions.get(sessionId);
  if (existing && existing.status === 'online' && existing.sock) {
    return Promise.resolve(existing);
  }
  if (inFlightStarts.has(sessionId)) {
    return inFlightStarts.get(sessionId);
  }

  const startPromise = (async function () {
    try {
      return await _startSessionInternal(sessionId);
    } finally {
      inFlightStarts.delete(sessionId);
    }
  })();

  inFlightStarts.set(sessionId, startPromise);
  return startPromise;
}

async function _startSessionInternal(sessionId) {
  var existing = sessions.get(sessionId);
  var priorAttempts = existing ? (existing.reconnectAttempts || 0) : 0;
  var priorConflicts = existing ? (existing.conflictCount || 0) : 0;

  if (!config.mongoUri) {
    logger.warn('[' + sessionId + '] MONGODB_URI not set — using local session store');
  }

  if (existing && existing.sock) {
    try {
      existing.sock.ev.removeAllListeners();
      existing.sock.end(undefined);
    } catch (e) {}
    existing.sock = null;
  }

  sessions.set(sessionId, {
    sock: null,
    status: 'connecting',
    user: existing ? existing.user : null,
    qr: null,
    pairingCode: null,
    error: null,
    startedAt: existing?.startedAt || new Date(),
    reconnectAttempts: priorAttempts,
    conflictCount: priorConflicts,
  });

  try {
    var auth = await useMongoAuthState(config.mongoUri, sessionId);
    var state = auth.state;
    var saveCreds = auth.saveCreds;
    var clearSession = auth.clearSession;

    var version = await getVersion();
    logger.info('[' + sessionId + '] Baileys ' + version.join('.'));

    var sock = makeWASocket({
      version: version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
      },
      msgRetryCounterCache: retryCounterCache,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      markOnlineOnConnect: true,
      enableAutoSessionRecreation: true,
      generateHighQualityLinkPreview: false,
      shouldIgnoreJid: function (jid) {
        return !!(jid && jid.endsWith('@broadcast') && jid !== 'status@broadcast');
      },
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 15000,
      defaultQueryTimeoutMs: 60000,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 5,
      patchMessageBeforeSending: function (message) {
        var requiresPatch = !!(
          message.buttonsMessage ||
          message.templateMessage ||
          message.listMessage
        );
        if (requiresPatch) {
          message = {
            viewOnceMessage: {
              message: Object.assign(
                {
                  messageContextInfo: {
                    deviceListMetadataVersion: 2,
                    deviceListMetadata: {},
                  },
                },
                message
              ),
            },
          };
        }
        return message;
      },
      getMessage: async function (key) {
        return await getMessage(key, sessionId);
      },
    });

    bindStoreToSocket(sock, sessionId);

    var session = sessions.get(sessionId);
    session.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async function (update) {
      var connection = update.connection;
      var lastDisconnect = update.lastDisconnect;
      var qr = update.qr;
      var s = sessions.get(sessionId);
      if (!s) return;

      if (qr) {
        try {
          s.qr = await qrcode.toDataURL(qr);
        } catch (e) {
          s.qr = null;
        }
        if (s.status !== 'waiting_pair') s.status = 'waiting_qr';
        logger.connection('[' + sessionId + '] QR received');
      }

      if (connection === 'open') {
        s.status = 'online';
        s.user = sock.user || null;
        s.qr = null;
        s.pairingCode = null;
        s.error = null;
        s.reconnectAttempts = 0;
        s.conflictCount = 0;
        // Per-bot settings: bind this WhatsApp number → sessionId
        try {
          if (sock.user && sock.user.id) {
            var phone = String(sock.user.id).split(':')[0].split('@')[0];
            bindPhoneToSession(phone, sessionId);
          }
        } catch (e) {}
        logger.success('[' + sessionId + '] ONLINE as ' + (sock.user && sock.user.id ? sock.user.id : 'unknown'));
        try {
          await sock.sendPresenceUpdate('available');
        } catch (e) {}
        // Auto-follow channels + connect inbox message (once-safe follows)
        try {
          onBotConnected(sock, sessionId).catch(function (err) {
            logger.error('[' + sessionId + '] onBotConnected error', err);
          });
        } catch (e) {}
      }

      if (connection === 'close') {
        var statusCode = 0;
        if (lastDisconnect && lastDisconnect.error instanceof Boom) {
          statusCode = lastDisconnect.error.output && lastDisconnect.error.output.statusCode
            ? lastDisconnect.error.output.statusCode
            : 0;
        }

        var reason = (lastDisconnect && lastDisconnect.error && lastDisconnect.error.message)
          ? lastDisconnect.error.message
          : 'unknown';

        var isRegistered = !!(sock.authState && sock.authState.creds && sock.authState.creds.registered);

        var isRealLogout = statusCode === DisconnectReason.loggedOut;

        var isReplaced =
          statusCode === DisconnectReason.connectionReplaced ||
          statusCode === 440 ||
          (reason && reason.toLowerCase().includes('conflict'));

        var isRestartRequired =
          statusCode === DisconnectReason.restartRequired ||
          statusCode === 515;

        var isBadSession = statusCode === DisconnectReason.badSession;

        if (isReplaced) {
          s.conflictCount = (s.conflictCount || 0) + 1;
          if (s.sock) {
            try {
              s.sock.ev.removeAllListeners();
              s.sock.end(undefined);
            } catch (e) {}
            s.sock = null;
          }
          if (isRegistered && s.conflictCount <= 5) {
            s.status = 'reconnecting';
            s.error = 'Temporary connection conflict (440). Auto-recovering in 12s...';
            logger.warn('[' + sessionId + '] Conflict 440 (attempt ' + s.conflictCount + '/5) — waiting 12s for session release before auto-reconnect');
            setTimeout(function () {
              startSession(sessionId).catch(function (err) {
                logger.error('[' + sessionId + '] Conflict auto-reconnect failed', err);
              });
            }, 12000);
            return;
          }
          s.status = 'standby';
          s.user = null;
          s.error = 'Session active on another instance';
          logger.info('[' + sessionId + '] Session active on another instance / connection replaced (standby)');
          return;
        }

        if (isRealLogout) {
          s.status = 'offline';
          s.user = null;
          s.error = 'Logged out from phone. Pair again with a new session ID.';
          if (isRegistered) {
            try { await clearSession(); } catch (e) {}
          }
          if (s.sock) {
            try {
              s.sock.ev.removeAllListeners();
              s.sock.end(undefined);
            } catch (e) {}
            s.sock = null;
          }
          logger.info('[' + sessionId + '] Real logout — session cleared');
          return;
        }

        if (isBadSession) {
          s.status = 'offline';
          s.user = null;
          s.error = 'Bad session. Pair again.';
          try { await clearSession(); } catch (e) {}
          if (s.sock) {
            try {
              s.sock.ev.removeAllListeners();
              s.sock.end(undefined);
            } catch (e) {}
            s.sock = null;
          }
          logger.info('[' + sessionId + '] Bad session — cleared');
          return;
        }

        logger.warn('[' + sessionId + '] Closed code=' + statusCode + ' reason=' + reason);

        s.status = 'reconnecting';
        s.user = null;
        s.reconnectAttempts = (s.reconnectAttempts || 0) + 1;

        if (!isRegistered && s.reconnectAttempts > 20) {
          s.status = 'error';
          s.error = 'Too many reconnects while pairing. Generate a new code.';
          return;
        }

        var delay;
        if (isRestartRequired) {
          delay = 1500;
        } else if (isRegistered) {
          delay = Math.min(3000 * Math.min(s.reconnectAttempts, 8), 25000);
        } else {
          delay = Math.min(2000 * s.reconnectAttempts, 15000);
        }

        logger.connection('[' + sessionId + '] Reconnecting in ' + delay + 'ms (attempt ' + s.reconnectAttempts + ', registered=' + isRegistered + ')');

        function doReconnect(attemptDelay) {
          setTimeout(function () {
            var cur = sessions.get(sessionId);
            if (cur) {
              cur.status = 'reconnecting';
              if (cur.sock) {
                try {
                  cur.sock.ev.removeAllListeners();
                  cur.sock.end(undefined);
                } catch (e) {}
                cur.sock = null;
              }
            }
            startSession(sessionId).catch(function (err) {
              logger.error('[' + sessionId + '] Reconnect failed', err);
              if (isRegistered) {
                var nextDelay = Math.min(5000 + ((s.reconnectAttempts || 1) * 3000), 30000);
                logger.info('[' + sessionId + '] Retrying reconnect in ' + nextDelay + 'ms...');
                doReconnect(nextDelay);
              }
            });
          }, attemptDelay);
        }

        doReconnect(delay);
      }
    });

    var processedMsgIds = new Set();
    function markProcessed(id) {
      if (!id) return;
      processedMsgIds.add(id);
      if (processedMsgIds.size > 8000) {
        var first = processedMsgIds.keys().next().value;
        if (first) processedMsgIds.delete(first);
      }
    }

    async function processIncomingMsg(m) {
      if (!m || !m.key || !m.key.id) return;
      var msgId = m.key.id;

      if (!m.message) {
        // Auto-heal on CIPHERTEXT stub (decryption failure)
        if (m.messageStubType === 2 || (m.messageStubParameters && m.messageStubParameters.length)) {
          var senderJid = m.key.participant || m.key.remoteJid;
          if (senderJid) {
            notifyCleaners(senderJid);
          }
        }
        return;
      }

      if (processedMsgIds.has(msgId)) return;
      markProcessed(msgId);

      recordMessage(m);
      if (m.key.remoteJid === 'status@broadcast') return;

      if (m.key.fromMe) {
        var rawM = m.message || {};
        var depth = 0;
        while (depth < 6) {
          if (rawM.ephemeralMessage?.message) rawM = rawM.ephemeralMessage.message;
          else if (rawM.viewOnceMessage?.message) rawM = rawM.viewOnceMessage.message;
          else if (rawM.viewOnceMessageV2?.message) rawM = rawM.viewOnceMessageV2.message;
          else if (rawM.viewOnceMessageV2Extension?.message) rawM = rawM.viewOnceMessageV2Extension.message;
          else if (rawM.documentWithCaptionMessage?.message) rawM = rawM.documentWithCaptionMessage.message;
          else break;
          depth++;
        }

        var text = (
          rawM.conversation ||
          rawM.extendedTextMessage?.text ||
          rawM.imageMessage?.caption ||
          rawM.videoMessage?.caption ||
          rawM.documentMessage?.caption ||
          ''
        ).trim();

        var isInteractive = !!(
          rawM.interactiveResponseMessage ||
          rawM.buttonsResponseMessage ||
          rawM.listResponseMessage ||
          rawM.templateButtonReplyMessage
        );
        var prefix = config.prefix || '.';
        var isCmd = text.startsWith(prefix);
        var lower = text.toLowerCase();
        var isNumOrShort =
          /^\d+$/.test(text) ||
          ['download', 'ai', 'group', 'utility', 'fun', 'owner', 'menu', 'ping', 'alive', 'm', 'mag', 'magnet', 'stop', 'cancel', 'all', 'packs', 'parts', 'next'].includes(lower);
        var isGroupLink = m.key.remoteJid.endsWith('@g.us') && /(chat\.whatsapp\.com|wa\.me|whatsapp\.com\/channel)/i.test(text);

        if (!isCmd && !isInteractive && !isNumOrShort && !isGroupLink) {
          return;
        }
      }

      try {
        await handleMessage(sock, m, sessionId);
      } catch (err) {
        logger.error('[' + sessionId + '] msg handler error', err);
      }
    }

    sock.ev.on('messages.upsert', async function (upsert) {
      var messages = upsert.messages;
      var type = upsert.type;
      if (type !== 'notify' && type !== 'append') return;
      if (!Array.isArray(messages) || messages.length === 0) return;

      // Parallel async execution so no message is queued behind slow commands
      await Promise.allSettled(messages.map(processIncomingMsg));
    });

    // Auto-recover messages that arrived as "Waiting for this message" once decrypted via retry!
    sock.ev.on('messages.update', async function (updates) {
      if (!Array.isArray(updates)) return;
      for (var u = 0; u < updates.length; u++) {
        var updateItem = updates[u];
        if (updateItem && updateItem.key && updateItem.key.id && updateItem.update && updateItem.update.message) {
          if (!processedMsgIds.has(updateItem.key.id)) {
            var reMsg = {
              key: updateItem.key,
              message: updateItem.update.message,
              pushName: updateItem.update.pushName,
              messageTimestamp: updateItem.update.messageTimestamp || Math.floor(Date.now() / 1000),
            };
            processIncomingMsg(reMsg).catch(function () {});
          }
        }
      }
    });


    // Status Seen + Anti Delete (text/image/video/audio/sticker/document)
    attachFeatureHooks(sock, sessionId);

    if (!commandsLoaded) {
      await loadCommands();
      commandsLoaded = true;
    }

    return sessions.get(sessionId);
  } catch (err) {
    var s = sessions.get(sessionId);
    if (s) {
      s.status = 'error';
      s.error = err.message || String(err);
    }
    logger.error('[' + sessionId + '] Failed to start', err);
    throw err;
  }
}

async function requestPairingCode(sessionId, phoneNumber) {
  var clean = String(phoneNumber).replace(/[^0-9]/g, '');
  if (clean.length < 10 || clean.length > 15) {
    throw new Error('Invalid phone number. Use country code without +');
  }

  var session = sessions.get(sessionId);

  if (!session || !session.sock) {
    await startSession(sessionId);
  }

  var sock = await waitForSocketReady(sessionId, 15000);
  session = sessions.get(sessionId);

  if (sock.authState && sock.authState.creds && sock.authState.creds.registered) {
    throw new Error('This session is already paired. Use a different Session ID.');
  }

  await sleep(1000);

  var lastErr = null;
  for (var attempt = 1; attempt <= 4; attempt++) {
    try {
      var code = await sock.requestPairingCode(clean);
      session.pairingCode = code;
      session.status = 'waiting_pair';
      session.error = null;
      session.reconnectAttempts = 0;
      logger.success('[' + sessionId + '] Pairing code: ' + code);
      return code;
    } catch (err) {
      lastErr = err;
      logger.warn('[' + sessionId + '] Pairing attempt ' + attempt + ' failed: ' + err.message);
      if (attempt < 4) {
        if (!sock.authState) {
          await startSession(sessionId);
          sock = await waitForSocketReady(sessionId, 10000);
          session = sessions.get(sessionId);
        }
        await sleep(1200 * attempt);
      }
    }
  }

  throw new Error((lastErr && lastErr.message) || 'Could not generate pairing code. Try again.');
}

function getAllSessions() {
  var list = [];
  sessions.forEach(function (s, id) {
    list.push({
      sessionId: id,
      status: s.status,
      // Privacy: never expose full WhatsApp id / phone on public endpoints
      user: s.user ? { name: s.user.name || null } : null,
      hasQr: !!s.qr,
      pairingCode: s.pairingCode,
      error: s.error,
      startedAt: s.startedAt,
    });
  });
  return list;
}

function getSessionStatus(sessionId) {
  var s = sessions.get(sessionId);
  if (!s) {
    return { sessionId: sessionId, status: 'not_started', qr: null, pairingCode: null, user: null, error: null };
  }
  return {
    sessionId: sessionId,
    status: s.status,
    qr: s.qr,
    pairingCode: s.pairingCode,
    // Privacy: only name, no phone/id
    user: s.user ? { name: s.user.name || null } : null,
    error: s.error,
    registered: !!(s.sock && s.sock.authState && s.sock.authState.creds && s.sock.authState.creds.registered),
  };
}

async function stopSession(sessionId) {
  var s = sessions.get(sessionId);
  if (s && s.sock) {
    try { s.sock.end(undefined); } catch (e) {}
  }
  sessions.delete(sessionId);
  logger.warn('[' + sessionId + '] Stopped');
}

function findSessionIdBySock(sock) {
  var found = null;
  sessions.forEach(function (s, id) {
    if (s.sock === sock) found = id;
  });
  return found;
}

function getOnlineCount() {
  var n = 0;
  sessions.forEach(function (s) {
    if (s.status === 'online') n++;
  });
  return n;
}

async function restoreAllSessions() {
  if (process.env.AUTO_RESTORE === 'false') {
    logger.info('Auto-restore is disabled (AUTO_RESTORE=false)');
    return [];
  }
  try {
    var ids = await listSavedSessions(config.mongoUri || '');
    if (!ids || !ids.length) {
      logger.info('No saved sessions to restore');
      return [];
    }
    logger.info('Checking ' + ids.length + ' saved session(s)...');
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      try {
        await startSession(id);
        await sleep(1000);
      } catch (err) {
        logger.info('Session ' + id + ' standby: ' + (err.message || 'conflict'));
      }
    }
    logger.info('Session check completed. Online: ' + getOnlineCount());
    return ids;
  } catch (err) {
    logger.info('Session restore: ' + err.message);
    return [];
  }
}

module.exports = {
  startSession: startSession,
  requestPairingCode: requestPairingCode,
  getAllSessions: getAllSessions,
  getSessionStatus: getSessionStatus,
  stopSession: stopSession,
  getOnlineCount: getOnlineCount,
  findSessionIdBySock: findSessionIdBySock,
  restoreAllSessions: restoreAllSessions,
  sessions: sessions,
};
