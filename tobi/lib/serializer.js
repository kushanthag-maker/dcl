/**
 * Tobi - High-Speed Message Serializer & Router
 * Optimized for rapid parsing with zero external dependencies.
 */

const { jidNormalizedUser } = require('@whiskeysockets/baileys');

function extractMessageBody(message) {
  if (!message) return '';

  // Standard text
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;

  // Media captions
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;

  // Modern Baileys v6+ Interactive NativeFlow responses
  if (message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
    try {
      const params = JSON.parse(message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
      return params.id || message.interactiveResponseMessage.body?.text || '';
    } catch {
      return message.interactiveResponseMessage.body?.text || '';
    }
  }

  // Legacy button / list responses
  if (message.buttonsResponseMessage?.selectedButtonId) {
    return message.buttonsResponseMessage.selectedButtonId;
  }
  if (message.templateButtonReplyMessage?.selectedId) {
    return message.templateButtonReplyMessage.selectedId;
  }
  if (message.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return message.listResponseMessage.singleSelectReply.selectedRowId;
  }

  return '';
}

/**
 * Serializes raw Baileys WAMessage into a clean, feature-rich context object
 */
function serializeMessage(sock, msg, tobiInstance) {
  if (!msg || !msg.message) return null;

  const key = msg.key || {};
  const from = key.remoteJid || '';
  const isGroup = from.endsWith('@g.us');
  const isStatus = from === 'status@broadcast';
  const fromMe = Boolean(key.fromMe);

  // Participant or remote jid
  const senderRaw = fromMe
    ? sock.user?.id
    : isGroup
      ? key.participant || msg.participant
      : from;
  const sender = senderRaw ? jidNormalizedUser(senderRaw) : '';

  // Extract body
  const rawBody = extractMessageBody(msg.message);
  const body = (rawBody || '').trim();

  // Determine prefix and command
  const prefixes = tobiInstance?.prefixes || ['.', '/', '!'];
  let matchedPrefix = null;
  let command = '';
  let args = [];
  let text = '';

  for (const p of prefixes) {
    if (body.startsWith(p)) {
      matchedPrefix = p;
      break;
    }
  }

  // Prefixless support
  if (matchedPrefix !== null) {
    const afterPrefix = body.slice(matchedPrefix.length).trim();
    const parts = afterPrefix.split(/\s+/);
    command = (parts[0] || '').toLowerCase();
    args = parts.slice(1);
    text = args.join(' ');
  } else if (tobiInstance?.allowPrefixless) {
    const parts = body.split(/\s+/);
    command = (parts[0] || '').toLowerCase();
    args = parts.slice(1);
    text = args.join(' ');
  }

  // Quoted message resolution
  let quoted = null;
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo ||
    msg.message?.documentMessage?.contextInfo;

  if (contextInfo?.quotedMessage) {
    const qMsg = contextInfo.quotedMessage;
    const qSender = contextInfo.participant ? jidNormalizedUser(contextInfo.participant) : '';
    quoted = {
      id: contextInfo.stanzaId,
      sender: qSender,
      isGroup,
      body: extractMessageBody(qMsg),
      message: qMsg,
      key: {
        remoteJid: from,
        fromMe: qSender === jidNormalizedUser(sock.user?.id || ''),
        id: contextInfo.stanzaId,
        participant: contextInfo.participant
      }
    };
  }

  const isOwner = tobiInstance?.isOwner(sender) || false;

  // Build lightweight serialized object
  const m = {
    raw: msg,
    key,
    id: key.id,
    from,
    sender,
    isGroup,
    isStatus,
    fromMe,
    isOwner,
    pushName: msg.pushName || 'WhatsApp User',
    timestamp: msg.messageTimestamp,
    body,
    prefix: matchedPrefix,
    command,
    args,
    text,
    quoted,

    // Shortcut: reply text with auto-quoted
    reply: async (content, options = {}) => {
      const messageContent = typeof content === 'string' ? { text: content } : content;
      return sock.sendMessage(from, messageContent, {
        quoted: options.quoted !== false ? msg : undefined,
        ...options
      });
    },

    // Shortcut: emoji reaction
    react: async (emoji) => {
      return sock.sendMessage(from, {
        react: { text: emoji, key: msg.key }
      });
    },

    // Shortcut: send interactive buttons
    sendButtons: async (options) => {
      return tobiInstance.sendButtons(from, {
        quoted: options.quoted !== false ? msg : undefined,
        ...options
      });
    },

    // Shortcut: send list menu
    sendList: async (options) => {
      return tobiInstance.sendList(from, {
        quoted: options.quoted !== false ? msg : undefined,
        ...options
      });
    },

    // Shortcut: send large streaming media
    sendFile: async (source, options = {}) => {
      return tobiInstance.sendFile(from, source, {
        quoted: options.quoted !== false ? msg : undefined,
        ...options
      });
    }
  };

  return m;
}

module.exports = { serializeMessage, extractMessageBody };
