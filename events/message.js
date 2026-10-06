const config = require('../config');
const logger = require('../lib/logger');
const { getCommand } = require('../lib/commandHandler');
const { isPanelReply } = require('../lib/settingsPanelStore');
const { getSettings } = require('../lib/botSettings');
const antiLinkStore = require('../lib/antiLinkStore');

const groupMetaCache = new Map();
async function getCachedGroupMetadata(sock, jid) {
  const now = Date.now();
  const cached = groupMetaCache.get(jid);
  if (cached && now - cached.time < 60000) {
    return cached.data;
  }
  try {
    const data = await sock.groupMetadata(jid);
    groupMetaCache.set(jid, { data, time: now });
    return data;
  } catch (e) {
    return cached?.data || null;
  }
}

const rateMap = new Map();

function checkRateLimit(jid) {
  const now = Date.now();
  const entry = rateMap.get(jid) || { count: 0, reset: now + 60000 };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + 60000;
  }
  entry.count++;
  rateMap.set(jid, entry);
  return entry.count <= (config.rateLimit || 20);
}

function unwrapMessage(msg) {
  let m = msg?.message || {};
  let depth = 0;
  while (depth < 6) {
    if (m.ephemeralMessage?.message) {
      m = m.ephemeralMessage.message;
    } else if (m.viewOnceMessage?.message) {
      m = m.viewOnceMessage.message;
    } else if (m.viewOnceMessageV2?.message) {
      m = m.viewOnceMessageV2.message;
    } else if (m.viewOnceMessageV2Extension?.message) {
      m = m.viewOnceMessageV2Extension.message;
    } else if (m.documentWithCaptionMessage?.message) {
      m = m.documentWithCaptionMessage.message;
    } else {
      break;
    }
    depth++;
  }
  return m;
}

/** Extract interactive reply id (buttons / list / native flow) */
function extractInteractiveId(msg) {
  const m = unwrapMessage(msg);
  if (!m) return null;

  if (m.buttonsResponseMessage?.selectedButtonId) {
    return String(m.buttonsResponseMessage.selectedButtonId).trim();
  }
  if (m.buttonsResponseMessage?.selectedDisplayText) {
    return String(m.buttonsResponseMessage.selectedDisplayText).trim();
  }
  if (m.templateButtonReplyMessage?.selectedId) {
    return String(m.templateButtonReplyMessage.selectedId).trim();
  }
  if (m.templateButtonReplyMessage?.selectedDisplayText) {
    return String(m.templateButtonReplyMessage.selectedDisplayText).trim();
  }
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return String(m.listResponseMessage.singleSelectReply.selectedRowId).trim();
  }
  if (m.listResponseMessage?.title) {
    return String(m.listResponseMessage.title).trim();
  }

  // native flow / interactive response (list + quick reply)
  const ir = m.interactiveResponseMessage;
  if (ir) {
    const nf = ir.nativeFlowResponseMessage || ir;
    const raw = nf.paramsJson || nf.params_json || ir.paramsJson;
    if (raw) {
      try {
        const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (p.id) return String(p.id).trim();
        if (p.selected_row_id) return String(p.selected_row_id).trim();
        if (p.selectedRowId) return String(p.selectedRowId).trim();
        if (p.row_id) return String(p.row_id).trim();
        if (p.rowId) return String(p.rowId).trim();
        if (p.button_id) return String(p.button_id).trim();
        if (p.selectedId) return String(p.selectedId).trim();
        if (p.params && p.params.id) return String(p.params.id).trim();
        if (p.response && p.response.id) return String(p.response.id).trim();
        for (const k of Object.keys(p)) {
          const v = p[k];
          if (typeof v === 'string') {
            if (
              v.startsWith('dqcat_') ||
              v.startsWith('dqmenu_') ||
              v.startsWith('dqcmd_') ||
              v.startsWith('dqset_') ||
              v.startsWith('dqtheme_') ||
              v.startsWith('csub_') ||
              v.startsWith('mbox_') ||
              v.startsWith('ssub_')
            ) {
              return v.trim();
            }
          }
        }
        if (p.title) return String(p.title).trim();
      } catch (_) {}
    }
    if (ir.body && ir.body.text) return String(ir.body.text).trim();
    if (ir.title) return String(ir.title).trim();
  }
  return null;
}

function extractBody(msg) {
  const m = unwrapMessage(msg);
  if (!m) return '';

  // 1. Interactive button / list row ID
  const interId = extractInteractiveId(msg);
  if (interId) return interId;

  // 2. Direct property checking (never Object.keys[0] which can be messageContextInfo)
  if (typeof m.conversation === 'string' && m.conversation) {
    return m.conversation.trim();
  }
  if (m.extendedTextMessage?.text) {
    return m.extendedTextMessage.text.trim();
  }
  if (m.imageMessage?.caption) {
    return m.imageMessage.caption.trim();
  }
  if (m.videoMessage?.caption) {
    return m.videoMessage.caption.trim();
  }
  if (m.documentMessage?.caption) {
    return m.documentMessage.caption.trim();
  }
  if (m.buttonsResponseMessage?.selectedButtonId) {
    return m.buttonsResponseMessage.selectedButtonId.trim();
  }
  if (m.buttonsResponseMessage?.selectedDisplayText) {
    return m.buttonsResponseMessage.selectedDisplayText.trim();
  }
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return m.listResponseMessage.singleSelectReply.selectedRowId.trim();
  }
  if (m.listResponseMessage?.title) {
    return m.listResponseMessage.title.trim();
  }
  if (m.templateButtonReplyMessage?.selectedId) {
    return m.templateButtonReplyMessage.selectedId.trim();
  }
  if (m.templateButtonReplyMessage?.selectedDisplayText) {
    return m.templateButtonReplyMessage.selectedDisplayText.trim();
  }
  if (m.interactiveResponseMessage?.body?.text) {
    return m.interactiveResponseMessage.body.text.trim();
  }

  return '';
}

function resolveCategoryKey(input) {
  if (!input) return null;
  const raw = String(input).trim();
  const numMap = {
    '1': 'download', '2': 'ai', '3': 'group', '4': 'utility', '5': 'fun', '6': 'owner',
    '1️⃣': 'download', '2️⃣': 'ai', '3️⃣': 'group', '4️⃣': 'utility', '5️⃣': 'fun', '6️⃣': 'owner',
  };
  if (numMap[raw]) return numMap[raw];

  let str = raw.replace(/^dqcat_/, '');
  str = str.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  str = str.replace(/^[0-9]\.?\s*/, '').trim();

  if (['download', 'ai', 'group', 'utility', 'fun', 'owner'].includes(str)) return str;
  if (numMap[str]) return numMap[str];
  if (str.includes('down') || str.includes('dl') || str.includes('song') || str.includes('video') || str.includes('yt') || str.includes('apk') || str.includes('movie')) return 'download';
  if (str.includes('ai') || str.includes('gpt') || str.includes('smart') || str.includes('claude') || str.includes('llama')) return 'ai';
  if (str.includes('group') || str.includes('gp') || str.includes('tagall')) return 'group';
  if (str.includes('util') || str.includes('tool') || str.includes('setting') || str.includes('alive') || str.includes('ping')) return 'utility';
  if (str.includes('fun') || str.includes('game') || str.includes('joke')) return 'fun';
  if (str.includes('owner') || str.includes('restart') || str.includes('shutdown')) return 'owner';
  return null;
}

/**
 * Map interactive ids → command invocation
 */
function routeInteractive(body) {
  if (!body) return null;
  const id = String(body).trim();

  if (id.startsWith('baiscope_')) {
    return { commandName: 'baiscope', args: [id] };
  }
  if (id.startsWith('csub_')) {
    return { commandName: 'cinesubz', args: [id] };
  }
  if (id.startsWith('mbox_')) {
    return { commandName: 'moviebox', args: [id] };
  }
  if (id.startsWith('ssub_')) {
    return { commandName: 'ssub', args: [id] };
  }
  if (id.startsWith('dqset_')) {
    return { commandName: 'settings', args: [id] };
  }
  // category list selection
  if (id.startsWith('dqcat_')) {
    const key = resolveCategoryKey(id) || id.replace('dqcat_', '');
    return { commandName: 'menu', args: ['cat', key] };
  }
  const matchedCat = resolveCategoryKey(id);
  if (matchedCat && (id.includes('💎') || id.includes('🤖') || id.includes('👥') || id.includes('🌸') || id.includes('🎀') || id.includes('👑') || id.toLowerCase().includes('category') || id.toLowerCase().includes('module'))) {
    return { commandName: 'menu', args: ['cat', matchedCat] };
  }

  if (id.startsWith('dqtheme_')) {
    const theme = id.replace('dqtheme_', '').trim().toLowerCase();
    return { commandName: 'menu', args: ['style', theme] };
  }
  if (id === 'dqtheme_picker') {
    return { commandName: 'menu', args: ['style'] };
  }
  // run a command from category list (dqcmd_song → .song)
  if (id.startsWith('dqcmd_')) {
    const name = id.slice(6).trim().toLowerCase();
    if (name) return { commandName: name, args: [] };
  }
  // quick reply shortcuts
  if (id.startsWith('dqmenu_')) {
    const name = id.slice(7).trim().toLowerCase();
    if (name === 'menu' || name === 'help') {
      return { commandName: 'menu', args: [] };
    }
    if (name === 'style' || name === 'theme' || name === 'themes') {
      return { commandName: 'menu', args: ['style'] };
    }
    if (name) return { commandName: name, args: [] };
  }
  return null;
}

async function handleMessage(sock, msg, sessionId) {
  try {
    if (!msg.message || !sock) return;

    const from = msg.key.remoteJid;
    if (!from || from === 'status@broadcast') return;

    const isGroup = from.endsWith('@g.us');
    const isFromMe = !!msg.key.fromMe;

    let sender = isGroup ? msg.key.participant || from : from;
    if (isFromMe && sock.user?.id) {
      sender = sock.user.id;
    }

    const senderNumber = (sender?.split('@')[0] || '').split(':')[0];

    let body = extractBody(msg);

    // AntiLink Protection Check in Groups
    const currentSettings = getSettings(sessionId);
    const isAntiLinkActive = isGroup && (antiLinkStore.isGroupEnabled(from) || !!currentSettings.antiLink);

    if (isAntiLinkActive) {
      const waLinkRegex = /(https?:\/\/|www\.)?(chat\.whatsapp\.com\/[0-9A-Za-z_-]{10,40}|whatsapp\.com\/channel\/[0-9A-Za-z_-]{10,40}|wa\.me\/[0-9+]+|api\.whatsapp\.com\/send|t\.me\/[0-9A-Za-z_]+|telegram\.me\/[0-9A-Za-z_]+|(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/i;
      const rawText = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.extendedTextMessage?.matchedText ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        msg.message?.documentMessage?.caption ||
        body ||
        ''
      );
      if (waLinkRegex.test(rawText)) {
        try {
          const groupMeta = await getCachedGroupMetadata(sock, from);
          if (groupMeta && groupMeta.participants) {
            const botNum = (sock.user?.id || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            const botLid = sock.user?.lid ? sock.user.lid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : null;
            const senderNum = senderNumber.replace(/[^0-9]/g, '');
            const senderLid = msg.key.participant?.includes('@lid')
              ? msg.key.participant.split('@')[0].split(':')[0].replace(/[^0-9]/g, '')
              : null;

            const botPart = groupMeta.participants.find((p) => {
              const pNum = p.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
              return pNum === botNum || (botLid && pNum === botLid);
            });
            const isBotAdmin = botPart?.admin === 'admin' || botPart?.admin === 'superadmin';

            const senderPart = groupMeta.participants.find((p) => {
              const pNum = p.id.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
              return pNum === senderNum || (senderLid && pNum === senderLid);
            });
            const ownerNum = (config.ownerNumber || '').replace(/[^0-9]/g, '');
            const isSenderAdmin =
              senderPart?.admin === 'admin' ||
              senderPart?.admin === 'superadmin' ||
              (ownerNum && senderNum === ownerNum);

            if (!isSenderAdmin) {
              if (isBotAdmin) {
                const deleteKey = {
                  remoteJid: from,
                  fromMe: !!msg.key.fromMe,
                  id: msg.key.id,
                  participant: msg.key.participant || sender,
                };
                try {
                  await sock.sendMessage(from, { delete: deleteKey });
                } catch (_) {
                  try {
                    await sock.sendMessage(from, { delete: msg.key });
                  } catch (_) {}
                }
                try {
                  await sock.sendMessage(from, {
                    text: `🚫 @${senderNumber} *Links are strictly forbidden in this group!* 🚫\n_Message deleted by AntiLink protection._`,
                    mentions: [sender],
                  });
                } catch (_) {}
              } else {
                try {
                  await sock.sendMessage(from, {
                    text: `⚠️ @${senderNumber} *Warning:* Group links are prohibited in this group! 🚫\n\n_Admins: Please promote the bot to Group Admin so it can automatically delete link messages._`,
                    mentions: [sender],
                  });
                } catch (_) {}
              }
              return;
            }
          }
        } catch (err) {
          logger.warn('AntiLink check error: ' + err.message);
        }
      }
    }

    let commandName = '';
    let args = [];

    // Normalize emoji numbers (e.g. 1️⃣ -> 1)
    const emojiMap = {
      '1️⃣': '1', '2️⃣': '2', '3️⃣': '3', '4️⃣': '4', '5️⃣': '5', '6️⃣': '6', '7️⃣': '7', '8️⃣': '8', '9️⃣': '9'
    };
    if (emojiMap[body]) {
      body = emojiMap[body];
    }
    const matchNumPrefix = body.match(/^([1-6])[\.\s]+[a-zA-Z]+/);
    if (matchNumPrefix) {
      body = matchNumPrefix[1];
    }

    // 1) Interactive id routing (works even without prefix)
    const routed = routeInteractive(body);
    if (routed) {
      commandName = routed.commandName;
      args = routed.args;
    } else if (/^\d+$/.test(body)) {
      // 1b) Active movie selection / direct quality pick for all movie commands
      const cinesubz = getCommand('cinesubz') || require('../commands/download/cinesubz');
      const moviebox = getCommand('moviebox') || require('../commands/download/moviebox');
      const ssub = getCommand('ssub') || require('../commands/download/ssub');

      if (cinesubz && cinesubz.hasPending && cinesubz.hasPending(from)) {
        commandName = 'cinesubz';
        args = [body];
      } else if (moviebox && moviebox.hasPending && moviebox.hasPending(from)) {
        commandName = 'moviebox';
        args = [body];
      } else if (ssub && ssub.hasPending && ssub.hasPending(from)) {
        commandName = 'ssub';
        args = [body];
      } else if (/^[1-9]$/.test(body) && isPanelReply(msg, 'settings')) {
        commandName = 'settings';
        args = ['num', body];
      } else if (/^[1-6]$/.test(body)) {
        const catMap = { '1': 'download', '2': 'ai', '3': 'group', '4': 'utility', '5': 'fun', '6': 'owner' };
        commandName = 'menu';
        args = ['cat', catMap[body]];
      } else if (body === '7') {
        commandName = 'settings';
        args = ['num', '7'];
      }
    } else if (body.startsWith(config.prefix || '.')) {
      // 2) Normal prefix commands
      const parts = body.slice((config.prefix || '.').length).trim().split(/\s+/);
      commandName = (parts.shift() || '').toLowerCase();
      args = parts;

      // Special alias: .download, .ai, .group, .utility, .fun
      if (['download', 'ai', 'group', 'utility', 'fun'].includes(commandName)) {
        args = ['cat', commandName];
        commandName = 'menu';
      }
    } else {
      // Check if user simply typed a category name without prefix (e.g. "download", "ai", "group", "utility", "fun")
      const catDirect = resolveCategoryKey(body);
      if (catDirect && ['download', 'ai', 'group', 'utility', 'fun', 'owner'].includes(body.toLowerCase().trim())) {
        commandName = 'menu';
        args = ['cat', catDirect];
      } else {
        return;
      }
    }

    if (!commandName) return;

    const cmd = getCommand(commandName);
    if (!cmd) return;

    const ownerNum = (config.ownerNumber || '').replace(/[^0-9]/g, '');
    const isOwner = isFromMe || (ownerNum && senderNumber === ownerNum);

    // Bot Work Mode enforcement (public, private, inbox)
    const workMode = (currentSettings && currentSettings.workMode) || 'public'; // 'public' | 'private' | 'inbox'

    if (!isOwner) {
      if (workMode === 'private') {
        try {
          await sock.sendMessage(
            from,
            { text: '🔒 *Dark Queen is currently in Private Mode.*\nOnly the bot owner can use commands.' },
            { quoted: msg }
          );
        } catch (_) {}
        return;
      }

      if (workMode === 'inbox' && isGroup) {
        try {
          await sock.sendMessage(
            from,
            { text: '📥 *Dark Queen is currently in Inbox-Only Mode.*\nCommands can only be used in private chat (DM).' },
            { quoted: msg }
          );
        } catch (_) {}
        return;
      }
    }

    if (!isOwner && !checkRateLimit(sender)) {
      try {
        await sock.sendMessage(from, { text: 'Rate limit exceeded. Please wait.' }, { quoted: msg });
      } catch {}
      return;
    }

    if (cmd.ownerOnly && !isOwner) {
      try {
        await sock.sendMessage(from, { text: 'This command is only for the bot owner.' }, { quoted: msg });
      } catch {}
      return;
    }

    if (cmd.groupOnly && !isGroup) {
      try {
        await sock.sendMessage(from, { text: 'This command can only be used in groups.' }, { quoted: msg });
      } catch {}
      return;
    }

    logger.command(commandName, senderNumber + (isFromMe ? ' (self)' : ''));

    await cmd.execute({
      sock,
      msg,
      from,
      sender,
      senderNumber,
      isGroup,
      isFromMe,
      isOwner,
      args,
      body,
      config,
      sessionId: sessionId || null,
      commandName,
    });
  } catch (err) {
    if (err && err.message && err.message.includes('rate-overlimit')) {
      logger.warn('WhatsApp server rate-overlimit throttled outgoing message.');
      return;
    }
    logger.error('handleMessage error', err);
  }
}

module.exports = { handleMessage };
