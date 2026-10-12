/**
 * Signal Protocol Self-Healing & Decryption Error Recovery
 * 
 * Automatically resolves:
 * 1. "Failed to decrypt message with any known session..."
 * 2. "Session error: Error: Bad MAC"
 * 3. "Session error: SessionError: Over 2000 messages into the future!"
 *
 * Prevents log spam, resets desynchronized ratchet states, and
 * prompts WhatsApp to cleanly re-establish encryption sessions.
 */

let initialized = false;

const activeCleanersMap = new Map();

function registerSessionCleaner(keyOrFn, fn) {
  if (typeof keyOrFn === 'string' && typeof fn === 'function') {
    activeCleanersMap.set(keyOrFn, fn);
  } else if (typeof keyOrFn === 'function') {
    activeCleanersMap.set(keyOrFn, keyOrFn);
  }
}

function notifyCleaners(targetId) {
  if (!targetId) return;
  for (const cleaner of activeCleanersMap.values()) {
    try {
      cleaner(targetId);
    } catch (_) {}
  }
}

function initSignalAutoHeal() {
  if (initialized) return;
  initialized = true;

  // 1. Hook libsignal SessionCipher in all reachable module paths
  const path = require('path');
  const fs = require('fs');

  const libsignalCandidates = [
    'libsignal',
    path.join(__dirname, '../node_modules/libsignal'),
    '@whiskeysockets/baileys/node_modules/libsignal',
  ];

  // Also auto-scan for any nested libsignal in node_modules
  try {
    const nmDir = path.join(__dirname, '../node_modules');
    if (fs.existsSync(nmDir)) {
      function findLibsignals(dir, depth = 0) {
        if (depth > 6) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const sub = path.join(dir, entry.name);
            if (entry.name === 'libsignal') {
              libsignalCandidates.push(sub);
            } else if (entry.name !== '.git' && !entry.name.startsWith('@types')) {
              findLibsignals(sub, depth + 1);
            }
          }
        }
      }
      findLibsignals(nmDir);
    }
  } catch (_) {}

  for (const modPath of Array.from(new Set(libsignalCandidates))) {
    try {
      const libsignal = require(modPath);
      if (libsignal && libsignal.SessionCipher && libsignal.SessionCipher.prototype) {
        patchSessionCipher(libsignal);
      }
    } catch (_) {}
  }

  // 2. Hook Baileys GroupCipher for "Over 2000 messages into the future!"
  const groupCipherCandidates = [
    '@whiskeysockets/baileys/WASignalGroup/group_cipher.js',
    path.join(__dirname, '../node_modules/@whiskeysockets/baileys/WASignalGroup/group_cipher.js'),
    '@whiskeysockets/baileys/lib/Signal/Group/group_cipher.js',
  ];

  for (const gPath of Array.from(new Set(groupCipherCandidates))) {
    try {
      const gcMod = require(gPath);
      const GroupCipher = gcMod.GroupCipher || gcMod.default || gcMod;
      if (GroupCipher && GroupCipher.prototype) {
        patchGroupCipher(GroupCipher);
      }
    } catch (_) {}
  }

  // 3. Filter raw console.error log spam from third-party CJS libraries
  patchConsoleError();
}

function patchSessionCipher(libsignal) {
  const proto = libsignal.SessionCipher.prototype;
  if (proto.__autoHealPatched) return;
  proto.__autoHealPatched = true;

  const originalDecryptWithSessions = proto.decryptWithSessions;

  proto.decryptWithSessions = async function (data, sessions) {
    if (!sessions || !sessions.length) {
      const errors = libsignal.SessionError || Error;
      throw new errors('No sessions available');
    }

    const errs = [];
    for (const session of sessions) {
      try {
        const plaintext = await this.doDecryptWhisperMessage(data, session);
        session.indexInfo.used = Date.now();
        return {
          session,
          plaintext,
        };
      } catch (e) {
        errs.push(e);
      }
    }

    // Check if failure is due to MAC, ratchet counter desync, or duplicate message counter
    const isDesync = errs.some((e) => {
      const msg = e && (e.message || String(e));
      return (
        msg.includes('Bad MAC') ||
        msg.includes('2000 messages') ||
        msg.includes('old counter') ||
        msg.includes('No matching sessions') ||
        msg.includes('Key used already') ||
        msg.includes('never filled') ||
        msg.includes('MessageCounterError')
      );
    });

    const isMessageCounterOnly = errs.every((e) => {
      const msg = e && (e.message || String(e));
      return (
        msg.includes('Key used already') ||
        msg.includes('never filled') ||
        msg.includes('MessageCounterError')
      );
    });

    // Only force clean corrupted state on hard MAC/future desyncs,
    // do NOT delete valid sessions on duplicate message replay.
    if (isDesync && !isMessageCounterOnly && this.addr) {
      const addrId = this.addr.id || '';
      const addrStr = this.addr.toString ? this.addr.toString() : String(this.addr);

      // Trigger automatic session cleanup
      notifyCleaners(addrId);
      notifyCleaners(addrStr);

      try {
        if (this.storage && typeof this.storage.storeSession === 'function') {
          const emptyRecord = new libsignal.SessionRecord();
          await this.storage.storeSession(addrStr, emptyRecord);
        }
      } catch (_) {}
    }

    // Throw clean SessionError so Baileys sends a retry receipt
    // without dumping full stacks or MessageCounterError to console.error
    const SessionError = libsignal.SessionError || Error;
    throw new SessionError(
      isMessageCounterOnly
        ? 'Duplicate message or counter already consumed'
        : isDesync
        ? 'Session desynchronized, requested re-establishment'
        : 'No matching sessions found for message'
    );
  };
}

function patchGroupCipher(GroupCipher) {
  const proto = GroupCipher.prototype;
  if (proto.__autoHealPatched) return;
  proto.__autoHealPatched = true;

  const originalGetSenderKey = proto.getSenderKey;

  proto.getSenderKey = function (senderKeyState, iteration) {
    let senderChainKey = senderKeyState.getSenderChainKey();
    const currentIter = senderChainKey.getIteration();

    // If future iteration gap is huge (>2000), gracefully fast-forward or reset
    if (iteration - currentIter > 2000) {
      // Fast-forward chain key to iteration to avoid bricking group cipher
      try {
        senderKeyState.setSenderChainKey(senderChainKey.getNext());
      } catch (_) {}
      throw new Error('Over 2000 messages into the future! Resetting sender key.');
    }

    return originalGetSenderKey.call(this, senderKeyState, iteration);
  };

  const originalDecrypt = proto.decrypt;
  proto.decrypt = async function (senderKeyMessage) {
    try {
      return await originalDecrypt.call(this, senderKeyMessage);
    } catch (err) {
      const msg = err && (err.message || String(err));
      if (msg.includes('2000 messages') || msg.includes('old counter')) {
        // Invalidate corrupt sender key from store
        try {
          if (this.senderKeyStore) {
            if (typeof this.senderKeyStore.removeSenderKey === 'function') {
              await this.senderKeyStore.removeSenderKey(this.senderKeyName);
            } else if (typeof this.senderKeyStore.delete === 'function') {
              await this.senderKeyStore.delete(this.senderKeyName);
            }
          }
        } catch (_) {}

        if (this.senderKeyName) {
          notifyCleaners(this.senderKeyName);
        }
      }
      throw err;
    }
  };
}

function patchConsoleError() {
  const originalConsoleError = console.error;

  console.error = function (...args) {
    const text = args
      .map((a) => {
        if (typeof a === 'string') return a;
        if (a && a.message) return a.message;
        if (a && a.stack) return a.stack;
        try {
          return JSON.stringify(a);
        } catch (_) {
          return String(a || '');
        }
      })
      .join(' ');

    if (
      text.includes('Failed to decrypt message with any known session') ||
      text.includes('Session error:') ||
      text.includes('MessageCounterError') ||
      text.includes('Key used already or never filled') ||
      text.includes('Bad MAC') ||
      text.includes('Over 2000 messages') ||
      text.includes('No matching sessions')
    ) {
      // Suppress raw libsignal console.error noise completely
      return;
    }

    return originalConsoleError.apply(console, args);
  };
}

// Initialize immediately on require
initSignalAutoHeal();

module.exports = {
  initSignalAutoHeal,
  registerSessionCleaner,
  notifyCleaners,
};
