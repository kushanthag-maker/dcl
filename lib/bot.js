/**
 * DCL MINI - Core Bot Logic
 * Baileys Multi-Device + MongoDB Session + Auto Reconnect
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
const { useMongoAuthState, closeMongo } = require('../database/mongoAuthState');
const config = require('../config');
const logger = require('./logger');
const { loadCommands } = require('./commandHandler');
const { handleMessage } = require('../events/message');
require('./signalAutoHeal');

let sock = null;
let isConnecting = false;
let pairingCode = null;
let lastQR = null;
let botHeartbeat = null;

function safeEndSocket(targetSock) {
  if (!targetSock) return;
  try {
    if (targetSock.ws) {
      if (typeof targetSock.ws.setMaxListeners === 'function') targetSock.ws.setMaxListeners(0);
      targetSock.ws.on('error', () => {});
      if (targetSock.ws.socket) {
        if (typeof targetSock.ws.socket.setMaxListeners === 'function') targetSock.ws.socket.setMaxListeners(0);
        targetSock.ws.socket.on('error', () => {});
      }
    }
    if (targetSock.ev && typeof targetSock.ev.removeAllListeners === 'function') {
      targetSock.ev.removeAllListeners();
    }
    targetSock.end(undefined);
  } catch (_) {}
}

function startBotHeartbeat(targetSock) {
  stopBotHeartbeat();
  if (!targetSock) return;

  botHeartbeat = setInterval(async () => {
    try {
      if (!targetSock || global.botStatus !== 'online') {
        stopBotHeartbeat();
        return;
      }
      const ws = targetSock.ws;
      const isSocketOpen = Boolean(ws && (ws.isOpen || (ws.socket && ws.socket.readyState === 1)));
      if (!isSocketOpen) {
        logger.warn('[Single-Bot] Heartbeat detected dead socket. Auto-reconnecting...');
        stopBotHeartbeat();
        global.botStatus = 'offline';
        safeEndSocket(targetSock);
        setTimeout(() => startBot(), 2500);
        return;
      }
      try {
        if (isSocketOpen) {
          await targetSock.sendPresenceUpdate('available').catch(() => {});
        }
      } catch (_) {}
      try {
        if (ws && ws.socket && typeof ws.socket.ping === 'function') {
          ws.socket.ping();
        } else if (ws && typeof ws.ping === 'function') {
          ws.ping();
        }
      } catch (_) {}
    } catch (_) {}
  }, 25000);

  if (botHeartbeat.unref) botHeartbeat.unref();
}

function stopBotHeartbeat() {
  if (botHeartbeat) {
    clearInterval(botHeartbeat);
    botHeartbeat = null;
  }
}

async function startBot(options = {}) {
  if (isConnecting) return;
  isConnecting = true;

  try {
    if (!config.mongoUri) {
      logger.warn('MONGODB_URI not set — using local session store');
    }

    const { state, saveCreds, clearSession } = await useMongoAuthState(
      config.mongoUri,
      config.sessionId
    );

    const { version } = await fetchLatestBaileysVersion();
    logger.info(`Using Baileys version: ${version.join('.')}`);

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
      },
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      markOnlineOnConnect: true,
      maxMsgRetryCount: 8,
      generateHighQualityLinkPreview: false,
      patchMessageBeforeSending: function (message) {
        var requiresPatch = !!(
          message.buttonsMessage ||
          message.templateMessage ||
          message.listMessage ||
          message.interactiveMessage
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
        } else if (message.viewOnceMessage && message.viewOnceMessage.message) {
          if (!message.viewOnceMessage.message.messageContextInfo) {
            message.viewOnceMessage.message.messageContextInfo = {
              deviceListMetadataVersion: 2,
              deviceListMetadata: {},
            };
          }
        }
        return message;
      },
      getMessage: async () => undefined,
    });

    if (sock.ws) {
      if (typeof sock.ws.setMaxListeners === 'function') sock.ws.setMaxListeners(0);
      sock.ws.on('error', (err) => {
        logger.warn('[Single-Bot] WS error absorbed: ' + (err?.message || err));
      });
      if (sock.ws.socket) {
        if (typeof sock.ws.socket.setMaxListeners === 'function') sock.ws.socket.setMaxListeners(0);
        sock.ws.socket.on('error', () => {});
      }
    }

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // Connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        lastQR = qr;
        logger.connection('QR Code received. Scan or use pairing code.');
        try {
          const qrDataUrl = await qrcode.toDataURL(qr);
          global.currentQR = qrDataUrl;
        } catch (e) {
          global.currentQR = null;
        }
      }

      if (connection === 'open') {
        isConnecting = false;
        pairingCode = null;
        global.currentQR = null;
        global.currentPairingCode = null;
        global.botStatus = 'online';
        global.botError = null;
        logger.success(`${config.botName} is now ONLINE!`);
        logger.info(`Logged in as: ${sock.user?.id || 'unknown'}`);
      }

      if (connection === 'close') {
        isConnecting = false;
        global.botStatus = 'offline';
        const statusCode = (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output?.statusCode
          : 0;

        const shouldReconnect =
          statusCode !== DisconnectReason.loggedOut &&
          statusCode !== DisconnectReason.badSession;

        logger.warn(`Connection closed. Status: ${statusCode}. Reconnect: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
          logger.warn('Session invalid. Clearing MongoDB session...');
          await clearSession();
        }

        if (shouldReconnect) {
          logger.connection('Auto-reconnecting in 5 seconds...');
          setTimeout(() => startBot(options), 5000);
        } else {
          logger.error('Logged out. Please pair again via website.');
        }
      }
    });

    // Messages — FIXED: allow fromMe commands (self-chat)
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message) continue;
        
        // Allow fromMe ONLY if it looks like a command (owner testing from same number)
        if (msg.key.fromMe) {
          const messageType = Object.keys(msg.message)[0];
          let text = '';
          if (messageType === 'conversation') text = msg.message.conversation || '';
          else if (messageType === 'extendedTextMessage') text = msg.message.extendedTextMessage?.text || '';
          else if (messageType === 'imageMessage') text = msg.message.imageMessage?.caption || '';
          else if (messageType === 'videoMessage') text = msg.message.videoMessage?.caption || '';

          if (!text.trim().startsWith(config.prefix)) continue; // ignore non-command self messages
        }

        try {
          await handleMessage(sock, msg);
        } catch (err) {
          logger.error('Message handler error', err);
        }
      }
    });

    // Load commands once
    await loadCommands();

    // Pairing code request helper (called from website)
    global.requestPairing = async (phoneNumber) => {
      if (!sock) throw new Error('Bot not started');
      if (sock.authState.creds.registered) {
        throw new Error('Already registered. Clear session first.');
      }
      const clean = phoneNumber.replace(/[^0-9]/g, '');
      if (clean.length < 10) throw new Error('Invalid phone number');
      const code = await sock.requestPairingCode(clean);
      pairingCode = code;
      global.currentPairingCode = code;
      logger.success(`Pairing code generated for ${clean}: ${code}`);
      return code;
    };

    global.getBotStatus = () => ({
      status: global.botStatus || 'starting',
      user: sock?.user || null,
      qr: global.currentQR || null,
      pairingCode: global.currentPairingCode || null,
      registered: sock?.authState?.creds?.registered || false,
    });

    global.restartBot = async () => {
      logger.warn('Restart requested...');
      if (sock) {
        safeEndSocket(sock);
        sock = null;
      }
      setTimeout(() => startBot(options), 2000);
    };

    global.shutdownBot = async () => {
      logger.warn('Shutdown requested...');
      if (sock) {
        safeEndSocket(sock);
        sock = null;
      }
      await closeMongo();
      process.exit(0);
    };

  } catch (err) {
    isConnecting = false;
    global.botStatus = 'error';
    global.botError = err.message || String(err);
    logger.error('Failed to start bot', err);
    throw err;
  }
}

function getSocket() {
  return sock;
}

module.exports = { startBot, getSocket };
