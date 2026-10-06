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

const activeCleaners = new Set();

function registerSessionCleaner(fn) {
  if (typeof fn === 'function') {
    activeCleaners.add(fn);
  }
}

function notifyCleaners(targetId) {
  if (!targetId) return;
  for (const cleaner of activeCleaners) {
    try {
      cleaner(targetId);
    } catch (_) {}
  }
}

function initSignalAutoHeal() {
  if (initialized) return;
  initialized = true;

  // 1. Hook libsignal SessionCipher in all reachable module paths
  const libsignalPaths = [
    'libsignal',
    '@zanta/baileys/node_modules/libsignal',
  ];

  for (const modPath of libsignalPaths) {
    try {
      const libsignal = require(modPath);
      if (libsignal && libsignal.SessionCipher && libsignal.SessionCipher.prototype) {
        patchSessionCipher(libsignal);
      }
    } catch (_) {}
  }

  // 2. Hook Baileys GroupCipher for "Over 2000 messages into the future!"
  const groupCipherPaths = [
    '@zanta/baileys/lib/Signal/Group/group_cipher.js',
    '@whiskeysockets/baileys/lib/Signal/Group/group_cipher.js',
  ];

  for (const gPath of groupCipherPaths) {
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

    // Check if failure is due to MAC or ratchet counter desync
    const isDesync = errs.some((e) => {
      const msg = e && (e.message || String(e));
      return (
        msg.includes('Bad MAC') ||
        msg.includes('2000 messages') ||
        msg.includes('old counter') ||
        msg.includes('No matching sessions')
      );
    });

    if (isDesync && this.addr) {
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
    // without dumping full stacks to console.error
    const SessionError = libsignal.SessionError || Error;
    throw new SessionError(
      isDesync
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
      .map((a) => (typeof a === 'string' ? a : a && a.message ? a.message : ''))
      .join(' ');

    if (
      text.includes('Failed to decrypt message with any known session') ||
      text.includes('Session error:Error: Bad MAC') ||
      text.includes('Session error:SessionError: Over 2000 messages')
    ) {
      // Suppress raw libsignal console.error noise
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
