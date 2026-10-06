/**
 * Interactive Panel Tracker
 * Supports number replies (1-7) to Settings and Menu panels
 * whether user quotes the message or types the number directly
 */
const store = new Map(); // jid -> { stanzaId, type, time }
const stanzaStore = new Map(); // stanzaId -> { jid, type, time }
const TTL = 10 * 60 * 1000;
const RECENT_ACTIVE_TTL = 3 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  for (const [jid, entry] of store) {
    if (now - entry.time > TTL) store.delete(jid);
  }
  for (const [id, entry] of stanzaStore) {
    if (now - entry.time > TTL) stanzaStore.delete(id);
  }
}

function rememberPanel(jid, stanzaId, type = 'settings') {
  if (!jid) return;
  cleanup();
  const entry = { stanzaId, type, time: Date.now() };
  store.set(jid, entry);
  if (stanzaId) {
    stanzaStore.set(stanzaId, { jid, type, time: Date.now() });
  }
}

function getActivePanel(jid) {
  cleanup();
  const entry = store.get(jid);
  if (!entry) return null;
  if (Date.now() - entry.time > RECENT_ACTIVE_TTL) return null;
  return entry;
}

function isPanelReply(msg, expectedType = 'settings') {
  try {
    const jid = msg?.key?.remoteJid;
    if (!jid) return false;
    cleanup();

    // 1. If the message specifically quotes a stanza ID
    const ext = msg.message && (
      msg.message.extendedTextMessage ||
      msg.message.interactiveResponseMessage ||
      msg.message.templateButtonReplyMessage ||
      msg.message.buttonsResponseMessage
    );
    const quoted = ext?.contextInfo?.stanzaId;
    if (quoted) {
      const stanzaEntry = stanzaStore.get(quoted);
      if (stanzaEntry) {
        if (expectedType && stanzaEntry.type !== expectedType) {
          return false;
        }
        return true;
      }
    }

    // 2. Direct active session check within recent window for this chat
    const entry = store.get(jid);
    if (!entry) return false;

    if (expectedType && entry.type && entry.type !== expectedType) {
      return false;
    }

    if (Date.now() - entry.time <= RECENT_ACTIVE_TTL) {
      return true;
    }

    return false;
  } catch (_) {
    return false;
  }
}

function clearPanel(jid) {
  if (jid) store.delete(jid);
}

module.exports = { rememberPanel, isPanelReply, getActivePanel, clearPanel };
