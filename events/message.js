const config = require('../config');
const logger = require('../lib/logger');
const { getCommand } = require('../lib/commandHandler');
const { isPanelReply } = require('../lib/settingsPanelStore');

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
  if (m.buttonsResponseMessage?.selectedButtonId) {
    return m.buttonsResponseMessage.selectedButtonId;
  }
  if (m.templateButtonReplyMessage?.selectedId) {
    return m.templateButtonReplyMessage.selectedId;
  }
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return m.listResponseMessage.singleSelectReply.selectedRowId;
  }
  if (m.listResponseMessage?.title) {
    return m.listResponseMessage.title;
  }
  // native flow / interactive response (list + quick reply)
  const ir = m.interactiveResponseMessage;
  if (ir) {
    const nf = ir.nativeFlowResponseMessage || ir;
    const raw = nf.paramsJson || nf.params_json || ir.paramsJson;
    if (raw) {
      try {
        const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
        // common shapes
        if (p.id) return String(p.id);
        if (p.selected_row_id) return String(p.selected_row_id);
        if (p.selectedRowId) return String(p.selectedRowId);
        if (p.row_id) return String(p.row_id);
        if (p.rowId) return String(p.rowId);
        if (p.button_id) return String(p.button_id);
        if (p.selectedId) return String(p.selectedId);
        if (p.title) return String(p.title);
        // nested
        if (p.params && p.params.id) return String(p.params.id);
        if (p.response && p.response.id) return String(p.response.id);
        for (const k of Object.keys(p)) {
          const v = p[k];
          if (typeof v === 'string' && (v.startsWith('dqcat_') || v.startsWith('dqmenu_') || v.startsWith('dqcmd_') || v.startsWith('dqset_'))) {
            return v;
          }
        }
      } catch (_) {}
    }
    if (ir.body && ir.body.text) return ir.body.text;
  }
  return null;
}

function extractBody(msg) {
  const m = unwrapMessage(msg);
  const messageType = Object.keys(m || {})[0];
  let body = '';

  if (messageType === 'conversation') body = m.conversation || '';
  else if (messageType === 'extendedTextMessage') body = m.extendedTextMessage?.text || '';
  else if (messageType === 'imageMessage') body = m.imageMessage?.caption || '';
  else if (messageType === 'videoMessage') body = m.videoMessage?.caption || '';
  else if (messageType === 'buttonsResponseMessage') {
    body =
      m.buttonsResponseMessage?.selectedButtonId ||
      m.buttonsResponseMessage?.selectedDisplayText ||
      '';
  } else if (messageType === 'listResponseMessage') {
    body =
      m.listResponseMessage?.singleSelectReply?.selectedRowId ||
      m.listResponseMessage?.title ||
      '';
  } else if (messageType === 'templateButtonReplyMessage') {
    body =
      m.templateButtonReplyMessage?.selectedId ||
      m.templateButtonReplyMessage?.selectedDisplayText ||
      '';
  } else if (messageType === 'interactiveResponseMessage') {
    body = extractInteractiveId(msg) || '';
  }

  if (!body) {
    const interId = extractInteractiveId(msg);
    if (interId) body = interId;
  }

  return (body || '').trim();
}

function resolveCategoryKey(input) {
  if (!input) return null;
  const raw = String(input).trim();
  const numMap = { '1': 'download', '2': 'ai', '3': 'group', '4': 'utility', '5': 'fun', '6': 'owner' };
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
    let commandName = '';
    let args = [];

    // 1) Interactive id routing (works even without prefix)
    const routed = routeInteractive(body);
    if (routed) {
      commandName = routed.commandName;
      args = routed.args;
    } else if (/^[1-9]$/.test(body) && isPanelReply(msg)) {
      // 1b) Settings panel number reply (reply "1" / "2" to the panel)
      commandName = 'settings';
      args = ['num', body];
    } else if (/^[1-6]$/.test(body)) {
      // 1c) Menu category number reply (reply "1" - "6" to the category dashboard)
      const catMap = { '1': 'download', '2': 'ai', '3': 'group', '4': 'utility', '5': 'fun', '6': 'owner' };
      commandName = 'menu';
      args = ['cat', catMap[body]];
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
    });
  } catch (err) {
    logger.error('handleMessage error', err);
  }
}

module.exports = { handleMessage };
