/**
 * Message Store & Cache for Baileys
 * Fixes "Waiting for this message. This may take a while."
 * Resolves retries for both incoming and outgoing messages.
 */

const { makeInMemoryStore } = require('@whiskeysockets/baileys');
const pino = require('pino');

const sessionStores = new Map();
const recentMessages = new Map(); // keyId or jid:keyId -> message object
const MAX_RECENT_MESSAGES = 6000;

class RetryCounterCache {
  constructor(maxSize = 2500) {
    this.map = new Map();
    this.maxSize = maxSize;
  }
  get(key) {
    return this.map.get(key);
  }
  set(key, val) {
    if (this.map.size >= this.maxSize) {
      const firstKey = this.map.keys().next().value;
      if (firstKey) this.map.delete(firstKey);
    }
    this.map.set(key, val);
  }
  del(key) {
    this.map.delete(key);
  }
  delete(key) {
    this.map.delete(key);
  }
  flushAll() {
    this.map.clear();
  }
}

const retryCounterCache = new RetryCounterCache();

function getStore(sessionId) {
  const sid = sessionId || 'default';
  if (!sessionStores.has(sid)) {
    const store = makeInMemoryStore({
      logger: pino({ level: 'silent' }),
    });
    sessionStores.set(sid, store);
  }
  return sessionStores.get(sid);
}

function recordMessage(msg) {
  if (!msg || !msg.key) return;
  const id = msg.key.id;
  if (!id) return;

  if (recentMessages.size >= MAX_RECENT_MESSAGES) {
    const deleteBatch = Array.from(recentMessages.keys()).slice(0, 500);
    for (const k of deleteBatch) recentMessages.delete(k);
  }

  // Store raw message object
  recentMessages.set(id, msg);
  if (msg.key.remoteJid) {
    recentMessages.set(`${msg.key.remoteJid}:${id}`, msg);
  }
}

async function getMessage(key, sessionId) {
  if (!key) return undefined;

  // 1. Check quick in-memory map
  const cached =
    recentMessages.get(key.id) ||
    (key.remoteJid ? recentMessages.get(`${key.remoteJid}:${key.id}`) : null);

  if (cached) {
    if (cached.message) return cached.message;
    return cached;
  }

  // 2. Check Baileys inMemoryStore
  const store = getStore(sessionId);
  if (store && key.remoteJid && key.id) {
    try {
      const loaded = await store.loadMessage(key.remoteJid, key.id);
      if (loaded?.message) {
        return loaded.message;
      }
      if (loaded) return loaded;
    } catch (_) {}
  }

  return undefined;
}

function bindStoreToSocket(sock, sessionId) {
  const store = getStore(sessionId);
  if (store && sock.ev) {
    try {
      store.bind(sock.ev);
    } catch (e) {
      console.error('[messageStore] bind error:', e.message);
    }
  }

  // Wrap sock.sendMessage so every outgoing message sent by bot is cached for retries!
  const originalSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async function (...args) {
    const result = await originalSendMessage(...args);
    if (result && result.key) {
      recordMessage(result);
    }
    return result;
  };

  // Wrap sock.relayMessage so every interactive/button message is cached for retries!
  if (sock.relayMessage) {
    const originalRelayMessage = sock.relayMessage.bind(sock);
    sock.relayMessage = async function (jid, message, options = {}) {
      const result = await originalRelayMessage(jid, message, options);
      const messageId = options.messageId || result;
      if (messageId) {
        recordMessage({
          key: {
            remoteJid: jid,
            id: messageId,
            fromMe: true,
          },
          message,
        });
      }
      return result;
    };
  }
}

module.exports = {
  getStore,
  recordMessage,
  getMessage,
  bindStoreToSocket,
  retryCounterCache,
};
