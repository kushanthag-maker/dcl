/**
 * Message Store & Cache for Baileys
 * Fixes "Waiting for this message. This may take a while."
 * Resolves retries for both incoming and outgoing messages.
 */

const baileys = require('@whiskeysockets/baileys');
const pino = require('pino');
const cacheMod = require('@cacheable/node-cache');
const NodeCache = cacheMod.default || cacheMod.NodeCache;

function createInMemoryStore() {
  const messages = new Map();
  return {
    messages,
    bind(ev) {
      if (!ev) return;
      ev.on('messages.upsert', ({ messages: newMsgs }) => {
        if (!Array.isArray(newMsgs)) return;
        for (const m of newMsgs) {
          if (m && m.key && m.key.id) {
            if (m.key.remoteJid) {
              messages.set(`${m.key.remoteJid}:${m.key.id}`, m);
            }
            messages.set(m.key.id, m);
          }
        }
      });
      ev.on('messages.update', (updates) => {
        if (!Array.isArray(updates)) return;
        for (const u of updates) {
          if (u && u.key && u.key.id && u.key.remoteJid) {
            const key = `${u.key.remoteJid}:${u.key.id}`;
            const existing = messages.get(key);
            if (existing && u.update) {
              Object.assign(existing, u.update);
            }
          }
        }
      });
    },
    async loadMessage(jid, id) {
      return messages.get(`${jid}:${id}`) || messages.get(id);
    },
    writeToFile() {},
    readFromFile() {},
  };
}

const makeInMemoryStore =
  typeof baileys.makeInMemoryStore === 'function'
    ? baileys.makeInMemoryStore
    : createInMemoryStore;

const sessionStores = new Map();

// 24-hour TTL message cache for retries (handles up to 15,000 recent messages)
const recentMessages = new NodeCache({
  stdTTL: 86400,
  useClones: false,
  maxKeys: 15000,
});

// 1-hour TTL retry counter cache
const retryCounterCache = new NodeCache({
  stdTTL: 3600,
  useClones: false,
  maxKeys: 6000,
});

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
  if (!msg) return;
  const key = msg.key;
  if (!key || !key.id) return;

  const id = key.id;
  const remoteJid = key.remoteJid;
  const participant = key.participant;

  const innerMsg = msg.message || (msg.key ? null : msg);
  const entry = {
    key,
    message: innerMsg || msg.message || msg,
    raw: msg,
  };

  recentMessages.set(id, entry);
  if (remoteJid) {
    recentMessages.set(`${remoteJid}:${id}`, entry);
    if (participant) {
      recentMessages.set(`${remoteJid}:${id}:${participant}`, entry);
    }
  }
}

async function getMessage(key, sessionId) {
  if (!key) return undefined;

  const id = key.id;
  const remoteJid = key.remoteJid;
  const participant = key.participant;

  // 1. Look up in ultra-fast in-memory cache
  let cached = null;
  if (remoteJid && id && participant) {
    cached = recentMessages.get(`${remoteJid}:${id}:${participant}`);
  }
  if (!cached && remoteJid && id) {
    cached = recentMessages.get(`${remoteJid}:${id}`);
  }
  if (!cached && id) {
    cached = recentMessages.get(id);
  }

  if (cached) {
    if (cached.message) return cached.message;
    return cached;
  }

  // 2. Check Baileys inMemoryStore
  const store = getStore(sessionId);
  if (store && remoteJid && id) {
    try {
      const loaded = await store.loadMessage(remoteJid, id);
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
      console.warn('[messageStore] bind error:', e.message);
    }
  }

  if (sock.ev) {
    sock.ev.on('messages.upsert', ({ messages }) => {
      if (!Array.isArray(messages)) return;
      for (const m of messages) {
        if (m && m.message && m.key) {
          recordMessage(m);
        }
      }
    });

    sock.ev.on('messages.update', (updates) => {
      if (!Array.isArray(updates)) return;
      for (const u of updates) {
        if (u && u.key && u.update && u.update.message) {
          recordMessage({ key: u.key, message: u.update.message });
        }
      }
    });
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
      const messageId = options.messageId || (typeof result === 'string' ? result : null);
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
