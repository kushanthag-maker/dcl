/**
 * DARK QUEEN V2 — Main Menu (Multi-Theme Ultra-Aesthetic UI)
 * Themes: Royal Queen (Default), Cyberpunk, Rose Aesthetic, Minimal
 * .menu / .menu <cat> / .menu --<theme> / .menu style
 */
const config = require('../../config');
const { getSettings, updateSettings } = require('../../lib/botSettings');
const { getAllCommands, getCommandsByCategory } = require('../../lib/commandHandler');
const { sendQuickReplies } = require('../../lib/sendButtons');
const moment = require('moment-timezone');

const MENU_VIDEO = 'https://files.catbox.moe/jz1qbc.mp4';
const DEFAULT_LOGO = 'https://files.catbox.moe/yjyx4x.webp';
const DISPLAY_BOT_NAME = '𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐';

const CATEGORY_META = [
  { key: 'download', title: '𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃', emoji: '💎', order: 1, desc: 'YouTube, FB, TT, APK & Media' },
  { key: 'ai', title: '𝐀𝐈 & 𝐒𝐌𝐀𝐑𝐓', emoji: '🤖', order: 2, desc: 'GPT, Claude, Llama & Chat AI' },
  { key: 'group', title: '𝐆𝐑𝐎𝐔𝐏 𝐓𝐎𝐎𝐋𝐒', emoji: '👥', order: 3, desc: 'Promote, Demote, Kick, Tag' },
  { key: 'utility', title: '𝐔𝐓𝐈𝐋𝐈𝐓𝐈𝐄𝐒', emoji: '🌸', order: 4, desc: 'Alive, Ping, QR, News & Tools' },
  { key: 'fun', title: '𝐅𝐔𝐍 & 𝐆𝐀𝐌𝐄𝐒', emoji: '🎀', order: 5, desc: 'Dice, Flip, Joke, Emomix' },
  { key: 'owner', title: '𝐎𝐖𝐍𝐄𝐑 𝐂𝐎𝐍𝐓𝐑𝐎𝐋', emoji: '👑', order: 6, desc: 'Restart, Shutdown, Active' },
];

function getLogo(sessionId) {
  try {
    const logo = getSettings(sessionId).logo || DEFAULT_LOGO;
    if (!logo || logo.includes('4dvou4.png') || logo.includes('bp9p86.png')) return DEFAULT_LOGO;
    return logo;
  } catch {
    return DEFAULT_LOGO;
  }
}

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function greeting() {
  const h = moment().tz(config.timezone || 'Asia/Colombo').hour();
  if (h < 5) return '🌌 Sweet Night';
  if (h < 12) return '🌅 Good Morning';
  if (h < 15) return '☀️ Good Afternoon';
  if (h < 18) return '🌆 Good Evening';
  if (h < 22) return '🌙 Good Night';
  return '🌌 Sweet Dreams';
}

function getUserName(msg) {
  return (
    msg?.pushName ||
    msg?.key?.participant?.split('@')[0] ||
    msg?.key?.remoteJid?.split('@')[0] ||
    'User'
  );
}

// ==========================================
// 1. ROYAL LUXURY THEME (DEFAULT)
// ==========================================
function buildRoyalTheme({ botName, userName, prefix, now, ram, uptime, totalCmds, allCategories }) {
  let text =
    '╔════════════════════════════╗\n' +
    '  👑 𝓓𝓐𝓡𝓚 𝓠𝓤𝓔𝓔𝓝 𝓥𝟐 👑\n' +
    '  ✨ 𝐐𝐔𝐄𝐄𝐍 𝐎𝐅 𝐓𝐇𝐄 𝐒𝐇𝐀𝐃𝐎𝐖𝐒 ✨\n' +
    '╚════════════════════════════╝\n\n' +
    '╭─〔 🌸 𝐔𝐒𝐄𝐑 & 𝐒𝐘𝐒𝐓𝐄𝐌 〕─•\n' +
    `│ 👤 𝐔𝐬𝐞𝐫     : ${userName}\n` +
    `│ 👑 𝐒𝐭𝐚𝐭𝐮𝐬   : 𝐎𝐍𝐋𝐈𝐍𝐄 ⚡\n` +
    `│ 🌏 𝐆𝐫𝐞𝐞𝐭    : ${greeting()}\n` +
    `│ ⏰ 𝐓𝐢𝐦𝐞     : ${now.format('h:mm:ss A')}\n` +
    `│ 📅 𝐃𝐚𝐭𝐞     : ${now.format('YYYY-MM-DD')}\n` +
    `│ ⏳ 𝐔𝐩𝐭𝐢𝐦𝐞   : ${uptime}\n` +
    `│ 💾 𝐑𝐀𝐌      : ${ram}\n` +
    `│ 📦 𝐂𝐨𝐦𝐦𝐚𝐧𝐝𝐬 : ${totalCmds} Available\n` +
    `│ ⚙️ 𝐏𝐫𝐞𝐟𝐢𝐱   : 「 ${prefix} 」\n` +
    `│ 🤖 𝐁𝐨𝐭 𝐍𝐚𝐦𝐞 : ${botName}\n` +
    `│ 👑 𝐎𝐰𝐧𝐞𝐫    : Red Devil × Zayra\n` +
    '╰─────────────────────────•\n';

  for (const cat of allCategories) {
    if (!cat.cmds.length) continue;
    text += `\n╭─〔 ${cat.emoji} ${cat.title} (${cat.cmds.length}) 〕─•\n`;
    for (let i = 0; i < cat.cmds.length; i++) {
      const isLast = i === cat.cmds.length - 1;
      text += `│ ${isLast ? '└' : '├'}─⋄ ${prefix}${cat.cmds[i]}\n`;
    }
    text += '╰─────────────────────────•\n';
  }

  text +=
    '\n╭─〔 💡 𝐐𝐔𝐈𝐂𝐊 𝐓𝐈𝐏 〕─•\n' +
    `│ 🌸 Type ${prefix}menu <category> for single view\n` +
    `│ 🎨 Styles: ${prefix}menu --cyber | --rose | --minimal\n` +
    '╰─────────────────────────•\n' +
    '\n> 𓆩🌸 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐 · 𝐐𝐔𝐄𝐄𝐍 𝐎𝐅 𝐇𝐄𝐀𝐑𝐓𝐒 🌸𓆪';

  return text;
}

// ==========================================
// 2. CYBERPUNK MATRIX THEME
// ==========================================
function buildCyberTheme({ botName, userName, prefix, now, ram, uptime, totalCmds, allCategories }) {
  let text =
    '╔════════════════════════════╗\n' +
    '  ⚡ ⟦ 𝐙𝐀𝐘𝐑𝐀 · 𝐂𝐘𝐁𝐄𝐑 𝐐𝐔𝐄𝐄𝐍 ⟧ ⚡\n' +
    '  [ SYSTEM STATUS : FULL OPERATIONAL ]\n' +
    '╚════════════════════════════╝\n\n' +
    '┌───〔 🌐 NEURAL CORE 〕───\n' +
    `│ ❯ Operator : ${userName}\n` +
    `│ ❯ Sys Time : ${now.format('HH:mm:ss')}\n` +
    `│ ❯ Active   : ${uptime}\n` +
    `│ ❯ Memory   : ${ram}\n` +
    `│ ❯ Modules  : ${totalCmds} Loaded\n` +
    `│ ❯ Command  : [ ${prefix} ]\n` +
    `│ ❯ Core ID  : ${botName}\n` +
    '└───[ ONLINE ]─────────────\n';

  for (const cat of allCategories) {
    if (!cat.cmds.length) continue;
    text += `\n┌───〔 ${cat.emoji} NET_${cat.key.toUpperCase()} (${cat.cmds.length}) 〕───\n`;
    for (let i = 0; i < cat.cmds.length; i++) {
      text += `│ ❯❯ ${prefix}${cat.cmds[i]}\n`;
    }
    text += '└───[ READY ]──────────────\n';
  }

  text +=
    '\n┌───〔 ⚡ PROTOCOL 〕───\n' +
    `│ ❯ Tap button or execute ${prefix}cmd\n` +
    '└──────────────────────────\n' +
    '\n> ⟦ ⚡ DARK QUEEN V2 · NEON MATRIX ⚡ ⟧';

  return text;
}

// ==========================================
// 3. PINK ROSE AESTHETIC THEME
// ==========================================
function buildRoseTheme({ botName, userName, prefix, now, ram, uptime, totalCmds, allCategories }) {
  let text =
    '╭━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n' +
    '  🌸 𓆩 𝐏𝐈𝐍𝐊 𝐑𝐎𝐒𝐄 · 𝐙𝐀𝐘𝐑𝐀 𓆪 🌸\n' +
    '  ╰┈➤ 𝒢𝑒𝓃𝓉𝓁𝑒 & 𝒫𝑜𝓌𝑒𝓇𝒻𝓊𝓁 𝒫𝑟𝒾𝓃𝒸𝑒𝓈𝓈\n' +
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n' +
    '╭───┈〔 ୨୧ 𝓈𝓉𝒶𝓉𝓊𝓈 ୨୧ 〕┈───╮\n' +
    `│ 🌸 𝒽𝑒𝓁𝓁𝑜  : ${userName}\n` +
    `│ 🎀 𝓉𝒾𝓂𝑒   : ${now.format('hh:mm A')}\n` +
    `│ 🌷 𝓊𝓅𝓉𝒾𝓂𝑒 : ${uptime}\n` +
    `│ 🍰 𝓅𝓇𝑒𝓻𝒾𝓍  : 「 ${prefix} 」\n` +
    `│ 🦄 𝒸𝓂𝒹𝓈   : ${totalCmds} features\n` +
    `│ 👑 𝒷𝑜𝓉    : ${botName}\n` +
    '╰───────────────────────────╯\n';

  for (const cat of allCategories) {
    if (!cat.cmds.length) continue;
    text += `\n╭───┈〔 ୨୧ ${cat.emoji} ${cat.title.toLowerCase()} ୨୧ 〕┈───╮\n`;
    for (let i = 0; i < cat.cmds.length; i++) {
      text += `│ ✿ ${prefix}${cat.cmds[i]}\n`;
    }
    text += '╰───────────────────────────────╯\n';
  }

  text +=
    '\n╭───┈〔 ୨୧ 𝒷𝓁𝑜𝑜𝓂 ୨୧ 〕┈───╮\n' +
    '│ 🌷 𝐻𝒶𝓋𝑒 𝒶 𝓂𝒶𝑔𝒾𝒸𝒶𝓁 𝒹𝒶𝓎 𝓈𝓌𝑒𝑒𝓉𝒾𝑒 💕\n' +
    '╰─────────────────────────╯\n' +
    '\n> 𓆩 🌸 𝒟𝒶𝓇𝓀 𝒬𝓊𝑒𝑒𝓃 𝒱𝟤 · 𝒫𝒾𝓃𝓀 𝑅𝑜𝓈𝑒 🌸 𓆪';

  return text;
}

// ==========================================
// 4. MINIMAL DARK PRO THEME
// ==========================================
function buildMinimalTheme({ botName, userName, prefix, now, ram, uptime, totalCmds, allCategories }) {
  let text =
    '┌── 👑 DARK QUEEN V2 ──┐\n' +
    `  Online • ${uptime} • ${totalCmds} cmds\n` +
    '└───────────────────────┘\n\n' +
    `• User: ${userName} | Prefix: ${prefix} | Bot: ${botName}\n` +
    `• Time: ${now.format('HH:mm')} | RAM: ${ram}\n\n`;

  for (const cat of allCategories) {
    if (!cat.cmds.length) continue;
    text += `[ ${cat.emoji} ${cat.title} ]\n`;
    text += cat.cmds.map((c) => `  ${prefix}${c}`).join('  •  ') + '\n\n';
  }

  text += `> ${DISPLAY_BOT_NAME} • Minimal`;
  return text;
}

/** Master Menu Builder */
function buildMenuText(prefix, sessionId, requestedStyle, userName) {
  const settings = (() => { try { return getSettings(sessionId) || {}; } catch { return {}; } })();
  const botName = settings.botName || config.botName || 'Dark Queen';
  const totalCmds = (getAllCommands() || []).length;
  const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1) + ' MB';
  const uptime = formatUptime(process.uptime());
  const now = moment().tz(config.timezone || 'Asia/Colombo');

  const allCategories = CATEGORY_META.map((meta) => {
    const cmds = (getCommandsByCategory(meta.key) || [])
      .map((c) => String(c.name || '').trim())
      .filter(Boolean)
      .sort();
    return { ...meta, cmds };
  });

  const style = (requestedStyle || settings.menuStyle || 'royal').toLowerCase();

  const ctx = {
    botName,
    userName: userName || 'Sweet User',
    prefix,
    now,
    ram,
    uptime,
    totalCmds,
    allCategories,
  };

  if (style === 'cyber' || style === 'matrix' || style === 'neon') {
    return buildCyberTheme(ctx);
  }
  if (style === 'rose' || style === 'pink' || style === 'aesthetic') {
    return buildRoseTheme(ctx);
  }
  if (style === 'minimal' || style === 'clean' || style === 'pro') {
    return buildMinimalTheme(ctx);
  }
  return buildRoyalTheme(ctx);
}

/** Single Category Menu Builder */
function categoryCommandsText(catKey, prefix, sessionId, requestedStyle) {
  const meta = CATEGORY_META.find((c) => c.key === catKey) || {
    key: catKey,
    title: String(catKey).toUpperCase(),
    emoji: '🌹',
  };

  const cmds = (getCommandsByCategory(catKey) || [])
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const settings = (() => { try { return getSettings(sessionId) || {}; } catch { return {}; } })();
  const style = (requestedStyle || settings.menuStyle || 'royal').toLowerCase();

  let text = '';
  if (style === 'cyber') {
    text =
      `╔══════════════════════════╗\n` +
      `  ⚡ [ MODULE : ${meta.title} ] ⚡\n` +
      `╚══════════════════════════╝\n\n` +
      `┌───〔 ${meta.emoji} COMMANDS (${cmds.length}) 〕───\n`;
    if (!cmds.length) {
      text += '│ ❯❯ _No commands available in this module_\n';
    } else {
      for (const cmd of cmds) {
        text += `│ ❯❯ ${prefix}${cmd.name}${cmd.description ? ` - _${cmd.description}_` : ''}\n`;
      }
    }
    text += '└───[ READY ]──────────────\n\n> ⟦ ⚡ DARK QUEEN V2 ⚡ ⟧';
  } else if (style === 'rose') {
    text =
      `╭━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
      `  🌸 ୨୧ ${meta.title} ୨୧ 🌸\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
      `╭───┈〔 ୨୧ ${meta.emoji} 𝒻𝑒𝒶𝓉𝓊𝓇𝑒𝓈 (${cmds.length}) ୨୧ 〕┈───╮\n`;
    if (!cmds.length) {
      text += '│ ✿ _no commands found_ 🌸\n';
    } else {
      for (const cmd of cmds) {
        text += `│ ✿ *${prefix}${cmd.name}*\n│    _${cmd.description || 'Command'}_ \n`;
      }
    }
    text += '╰─────────────────────────────╯\n\n> 𓆩 🌸 𝒟𝒶𝓇𝓀 𝒬𝓊𝑒𝑒𝓃 𝒱𝟤 🌸 𓆪';
  } else {
    // Royal style
    text =
      `╔══════════════════════════╗\n` +
      `  👑 ${meta.emoji} ${meta.title} 👑\n` +
      `╚══════════════════════════╝\n\n` +
      `╭─〔 📜 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 𝐋𝐈𝐒𝐓 (${cmds.length}) 〕─•\n`;
    if (!cmds.length) {
      text += '│ ⋄ _No commands in this section yet_\n';
    } else {
      for (let i = 0; i < cmds.length; i++) {
        const isLast = i === cmds.length - 1;
        text += `│ ${isLast ? '└' : '├'}─⋄ *${prefix}${cmds[i].name}* : _${cmds[i].description || 'Execute'}\_\n`;
      }
    }
    text += '╰─────────────────────────•\n\n> 𓆩👑 DARK QUEEN V2 👑𓆪';
  }

  return { text, meta };
}

/** Relay menu with video/image attachment & native flow buttons */
async function sendMainMenu(sock, jid, { text, footer, buttonText, rows, quickButtons, imageUrl, quoted }) {
  const { generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys');

  const sections = [
    {
      title: '📂 Bot Command Categories',
      rows: rows.map((r) => ({
        header: r.header || '',
        title: String(r.title || '').slice(0, 24),
        description: String(r.description || '').slice(0, 72),
        id: String(r.id),
      })),
    },
  ];

  const nativeFlowButtons = [
    {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({ title: buttonText, sections }),
    },
  ];

  for (const b of (quickButtons || []).slice(0, 3)) {
    nativeFlowButtons.push({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: String(b.text).slice(0, 25),
        id: String(b.id),
      }),
    });
  }

  let header = { title: '👑 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐', hasMediaAttachment: false };
  if (imageUrl) {
    try {
      const media = await prepareWAMessageMedia(
        { image: { url: imageUrl } },
        { upload: sock.waUploadToServer }
      );
      header = { title: '👑 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐', hasMediaAttachment: true, imageMessage: media.imageMessage };
    } catch (_) {}
  }

  const full = generateWAMessageFromContent(
    jid,
    {
      messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
      interactiveMessage: {
        body: { text: text || ' ' },
        footer: { text: footer },
        header,
        nativeFlowMessage: {
          buttons: nativeFlowButtons,
          messageParamsJson: '{}',
        },
      },
    },
    { userJid: sock.user?.id, quoted }
  );

  await sock.relayMessage(jid, full.message, { messageId: full.key.id });
  return full;
}

async function showMain(sock, msg, from, sessionId, requestedStyle) {
  const prefix = config.prefix || '.';
  const logo = getLogo(sessionId);
  const userName = getUserName(msg);

  // Send video note or animated teaser
  try {
    await sock.sendMessage(
      from,
      { video: { url: MENU_VIDEO }, mimetype: 'video/mp4', ptv: true },
      { quoted: msg }
    );
  } catch (e1) {
    try {
      await sock.sendMessage(
        from,
        { video: { url: MENU_VIDEO }, mimetype: 'video/mp4', gifPlayback: true },
        { quoted: msg }
      );
    } catch (_) {}
  }

  const menuText = buildMenuText(prefix, sessionId, requestedStyle, userName);

  // Categories list for interactive select button
  const rows = [];
  for (const meta of CATEGORY_META) {
    const cmds = (getCommandsByCategory(meta.key) || [])
      .map((c) => String(c.name || '').trim())
      .filter(Boolean)
      .sort();
    if (!cmds.length) continue;
    rows.push({
      id: 'dqcat_' + meta.key,
      title: `${meta.emoji} ${meta.title}`,
      description: `${cmds.length} commands · ${meta.desc}`,
    });
  }

  try {
    await sendMainMenu(sock, from, {
      text: menuText,
      footer: '𓆩🌸 DARK QUEEN V2 · ROYAL EDITION 🌸𓆪',
      buttonText: '📂 Explore Categories',
      rows,
      quickButtons: [
        { id: 'dqmenu_settings', text: '⚙️ Settings' },
        { id: 'dqmenu_ping', text: '📡 Ping' },
        { id: 'dqmenu_alive', text: '👑 Alive' },
      ],
      imageUrl: logo,
      quoted: msg,
    });
  } catch (btnErr) {
    console.warn('Interactive menu fallback to regular image message:', btnErr.message);
    // Reliable fallback for non-native flow clients
    await sock.sendMessage(
      from,
      {
        image: { url: logo },
        caption: menuText,
      },
      { quoted: msg }
    );
  }
}

async function showCategory(sock, msg, from, catKey, sessionId, requestedStyle) {
  const prefix = config.prefix || '.';
  const logo = getLogo(sessionId);
  const { text, meta } = categoryCommandsText(catKey, prefix, sessionId, requestedStyle);

  try {
    await sendQuickReplies(sock, from, {
      text,
      footer: `${meta.emoji} ${meta.title} · DARK QUEEN V2`,
      imageUrl: logo,
      buttons: [
        { id: 'dqmenu_menu', text: '⬅️ Full Menu' },
        { id: 'dqmenu_settings', text: '⚙️ Settings' },
        { id: 'dqcat_' + catKey, text: '🔄 Refresh' },
      ],
      quoted: msg,
    });
  } catch (err) {
    await sock.sendMessage(
      from,
      {
        image: { url: logo },
        caption: text,
      },
      { quoted: msg }
    );
  }
}

async function showStylePicker(sock, msg, from, sessionId) {
  const logo = getLogo(sessionId);
  const current = getSettings(sessionId).menuStyle || 'royal';

  const text =
    '╔════════════════════════════╗\n' +
    '  🎨 𝐌𝐄𝐍𝐔 𝐓𝐇𝐄𝐌𝐄 𝐒𝐄𝐋𝐄𝐂𝐓𝐎𝐑 🎨\n' +
    '╚════════════════════════════╝\n\n' +
    `Current Active Style: *${current.toUpperCase()}*\n\n` +
    'Choose your favorite WhatsApp Bot Menu UI:\n' +
    '1️⃣ *Royal Luxury* : 👑 Regal crown & gold ornamental\n' +
    '2️⃣ *Cyberpunk*    : ⚡ Neon matrix terminal brackets\n' +
    '3️⃣ *Pink Rose*    : 🌸 Kawaii aesthetic floral princess\n' +
    '4️⃣ *Minimal Pro*  : 🖤 Sleek & compact modern lines\n\n' +
    '💡 Tap a button below or type:\n' +
    '`.menu --royal` | `.menu --cyber` | `.menu --rose` | `.menu --minimal`';

  try {
    await sendQuickReplies(sock, from, {
      text,
      footer: 'DARK QUEEN OFC · THEME ENGINE',
      imageUrl: logo,
      buttons: [
        { id: 'dqtheme_royal', text: '👑 Royal Queen' },
        { id: 'dqtheme_cyber', text: '⚡ Cyberpunk' },
        { id: 'dqtheme_rose', text: '🌸 Pink Rose' },
      ],
      quoted: msg,
    });
  } catch (_) {
    await sock.sendMessage(from, { text }, { quoted: msg });
  }
}

module.exports = {
  name: 'menu',
  aliases: ['help', 'list', 'm', 'commands', 'allmenu'],
  description: 'Video note + ultra-aesthetic multi-theme menu with commands',
  category: 'utility',

  async execute({ sock, msg, from, args, sessionId }) {
    try {
      try {
        await sock.sendMessage(from, { react: { text: '✨', key: msg.key } });
      } catch (_) {}

      const sid = sessionId || 'default';
      const firstArg = String(args[0] || '').toLowerCase().trim();

      // Theme change handler
      if (firstArg === 'style' || firstArg === 'themes' || firstArg === 'theme') {
        if (args[1]) {
          const chosen = args[1].toLowerCase().replace('--', '');
          if (['royal', 'cyber', 'rose', 'minimal'].includes(chosen)) {
            updateSettings(sid, { menuStyle: chosen });
            return await sock.sendMessage(
              from,
              { text: `✅ *Menu Theme Updated to:* ${chosen.toUpperCase()} 💖\nType *.menu* to view your new menu!` },
              { quoted: msg }
            );
          }
        }
        return await showStylePicker(sock, msg, from, sid);
      }

      // Quick style flag: e.g. .menu --cyber or .menu cyber
      let requestedStyle = null;
      if (firstArg.startsWith('--')) {
        requestedStyle = firstArg.slice(2);
      } else if (['royal', 'cyber', 'rose', 'minimal'].includes(firstArg)) {
        requestedStyle = firstArg;
      }

      // Category filter: e.g. .menu download or .menu cat dqcat_download
      if (firstArg === 'cat' && args[1]) {
        const key = String(args[1]).replace('dqcat_', '').trim();
        return await showCategory(sock, msg, from, key, sid, requestedStyle);
      }

      // Check if first arg is a known category name
      const matchedCat = CATEGORY_META.find(
        (c) => c.key === firstArg || c.title.toLowerCase().includes(firstArg)
      );
      if (matchedCat) {
        return await showCategory(sock, msg, from, matchedCat.key, sid, requestedStyle);
      }

      // Full menu
      return await showMain(sock, msg, from, sid, requestedStyle);
    } catch (err) {
      console.error('Menu Error:', err);
      try {
        await sock.sendMessage(
          from,
          { text: '❌ Menu Error: ' + (err.message || 'Unknown error') },
          { quoted: msg }
        );
      } catch (_) {}
    }
  },
};
