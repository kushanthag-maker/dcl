/**
 * DARK QUEEN V2 — Main Menu (Multi-Theme Ultra-Aesthetic UI)
 * Themes: Royal Queen (Default), Cyberpunk, Rose Aesthetic, Minimal
 * .menu / .menu <cat> / .menu --<theme> / .menu style
 */
const config = require('../../config');
const { getSettings, updateSettings } = require('../../lib/botSettings');
const { getAllCommands, getCommandsByCategory } = require('../../lib/commandHandler');
const { sendQuickReplies } = require('../../lib/sendButtons');
const { rememberPanel } = require('../../lib/settingsPanelStore');
const moment = require('moment-timezone');

const MENU_VIDEO = 'https://files.catbox.moe/jz1qbc.mp4';
const DEFAULT_LOGO = 'https://files.catbox.moe/yjyx4x.webp';
const DISPLAY_BOT_NAME = '𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐';

const CATEGORY_META = [
  { key: 'download', title: '𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃', emoji: '💎', order: 1, desc: 'CineSubz, Song, Video, FB, TT, APK' },
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

/// ==========================================
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
    '╰─────────────────────────•\n\n' +
    '╭─〔 📂 𝐁𝐎𝐓 𝐂𝐀𝐓𝐄𝐆𝐎𝐑𝐈𝐄𝐒 〕─•\n';

  allCategories.forEach((cat, index) => {
    const numEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'][index] || '▫️';
    text += `│ ${numEmoji} ${cat.emoji} *${cat.title}* : ${cat.cmds.length} Commands\n`;
  });

  text +=
    '╰─────────────────────────•\n\n' +
    '╭─〔 💡 𝐇𝐎𝐖 𝐓𝐎 𝐔𝐒𝐄 〕─•\n' +
    '│ 📂 Tap "Select Category" button below\n' +
    '│ 🔢 Or reply with Category Number (1 - 6)\n' +
    `│ 💬 Or type: ${prefix}menu <category> (e.g. ${prefix}menu download)\n` +
    '╰─────────────────────────•\n\n' +
    '> 𓆩🌸 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐 · 𝐐𝐔𝐄𝐄𝐍 𝐎𝐅 𝐇𝐄𝐀𝐑𝐓𝐒 🌸𓆪';

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
    '└───[ ONLINE ]─────────────\n\n' +
    '┌───〔 📂 MODULE DIRECTORY 〕───\n';

  allCategories.forEach((cat, index) => {
    const num = index + 1;
    text += `│ ❯ [0${num}] ${cat.emoji} NET_${cat.key.toUpperCase()} (${cat.cmds.length} protocols)\n`;
  });

  text +=
    '└───[ READY ]──────────────\n\n' +
    '┌───〔 ⚡ PROTOCOL 〕───\n' +
    '│ ❯ Tap "Select Category" to access module\n' +
    '│ ❯ Or reply with module number [1 - 6]\n' +
    `│ ❯ Or execute: ${prefix}menu <category>\n` +
    '└──────────────────────────\n\n' +
    '> ⟦ ⚡ DARK QUEEN V2 · NEON MATRIX ⚡ ⟧';

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
    `│ 🍰 𝓅𝓇𝑒𝒻𝒾𝓍  : 「 ${prefix} 」\n` +
    `│ 🦄 𝒸𝓂𝒹𝓈   : ${totalCmds} features\n` +
    `│ 👑 𝒷𝑜𝓉    : ${botName}\n` +
    '╰───────────────────────────╯\n\n' +
    '╭───┈〔 ୨୧ 𝒸𝒶𝓉𝑒𝑔𝑜𝓇𝒾𝑒𝓈 ୨୧ 〕┈───╮\n';

  allCategories.forEach((cat, index) => {
    const numEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'][index] || '✿';
    text += `│ ${numEmoji} ${cat.emoji} ${cat.title.toLowerCase()} (${cat.cmds.length})\n`;
  });

  text +=
    '╰───────────────────────────────╯\n\n' +
    '╭───┈〔 ୨୧ 𝒽𝑜𝓌 𝓉𝑜 𝓊𝓈𝑒 ୨୧ 〕┈───╮\n' +
    '│ 🌷 𝒯𝒶𝓅 "𝒮𝑒𝓁𝑒𝒸𝓉 𝒞𝒶𝓉𝑒𝑔𝑜𝓇𝓎" 𝒷𝑒𝓁𝑜𝓌 💕\n' +
    '│ 🎀 𝒪𝓇 𝓇𝑒𝓅𝓁𝓎 𝓌𝒾𝓉𝒽 𝓃𝓊𝓂𝒷𝑒𝓇 [𝟣 - 𝟨]\n' +
    '╰─────────────────────────╯\n\n' +
    '> 𓆩 🌸 𝒟𝒶𝓇𝓀 𝒬𝓊𝑒𝑒𝓃 𝒱𝟤 · 𝒫𝒾𝓃𝓀 𝑅𝑜𝓈𝑒 🌸 𓆪';

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
    `• Time: ${now.format('HH:mm')} | RAM: ${ram}\n\n` +
    '[ CATEGORIES ]\n';

  allCategories.forEach((cat, index) => {
    text += `  [${index + 1}] ${cat.emoji} ${cat.title} (${cat.cmds.length})\n`;
  });

  text +=
    `\n💡 Tap "Select Category" or reply [1 - 6] to view commands.\n` +
    `> ${DISPLAY_BOT_NAME} • Minimal`;
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
      `╔════════════════════════════╗\n` +
      `  ⚡ [ MODULE : ${meta.title} ] ⚡\n` +
      `  [ TOTAL : ${cmds.length} PROTOCOLS LOADED ]\n` +
      `╚════════════════════════════╝\n\n` +
      `┌───〔 ${meta.emoji} AVAILABLE PROTOCOLS 〕───\n`;
    if (!cmds.length) {
      text += '│ ❯❯ _No commands available in this module_\n';
    } else {
      for (const cmd of cmds) {
        const usage = cmd.usage ? ` ${cmd.usage}` : '';
        text += `│ ❯❯ *${prefix}${cmd.name}*${usage}\n`;
        if (cmd.description) text += `│    └ ℹ️ _${cmd.description}_\n`;
      }
    }
    text +=
      '└───[ READY ]──────────────\n\n' +
      '┌───〔 ⚡ PROTOCOL TIP 〕───\n' +
      `│ ❯ Execute: ${prefix}<command> <query>\n` +
      `│ ❯ Change module: Tap "Select Category"\n` +
      '└──────────────────────────\n\n' +
      '> ⟦ ⚡ DARK QUEEN V2 · CYBER SUITE ⚡ ⟧';
  } else if (style === 'rose') {
    text =
      `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
      `  🌸 ୨୧ ${meta.title} ୨୧ 🌸\n` +
      `  ╰┈➤ ${cmds.length} 𝓂𝒶𝑔𝒾𝒸𝒶𝓁 𝒻𝑒𝒶𝓉𝓊𝓇𝑒𝓈 💕\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
      `╭───┈〔 ୨୧ ${meta.emoji} 𝒸𝑜𝓂𝓂𝒶𝓃𝒹𝓈 ୨୧ 〕┈───╮\n`;
    if (!cmds.length) {
      text += '│ ✿ _no commands found_ 🌸\n';
    } else {
      for (const cmd of cmds) {
        const usage = cmd.usage ? ` ${cmd.usage}` : '';
        text += `│ ✿ *${prefix}${cmd.name}*${usage}\n`;
        if (cmd.description) text += `│    ↳ _${cmd.description}_\n`;
      }
    }
    text +=
      '╰───────────────────────────────╯\n\n' +
      '╭───┈〔 ୨୧ 𝓉𝒾𝓅 ୨୧ 〕┈───╮\n' +
      `│ 🌷 𝒯𝓎𝓅𝑒 𝒶𝓃𝓎 𝒸𝑜𝓂𝓂𝒶𝓃𝒹 𝓉𝑜 𝓊𝓈𝑒 ✨\n` +
      `│ 📂 𝒯𝒶𝓅 "𝒮𝑒𝓁𝑒𝒸𝓉 𝒞𝒶𝓉𝑒𝑔𝑜𝓇𝓎" 𝓉𝑜 𝓈𝓌𝒾𝓉𝒸𝒽 💕\n` +
      '╰─────────────────────────╯\n\n' +
      '> 𓆩 🌸 𝒟𝒶𝓇𝓀 𝒬𝓊𝑒𝑒𝓃 𝒱𝟤 · 𝒫𝒾𝓃𝓀 𝑅𝑜𝓈𝑒 🌸 𓆪';
  } else if (style === 'minimal') {
    text =
      `┌── 👑 ${meta.title} ──┐\n` +
      `  ${cmds.length} commands available\n` +
      `└────────────────────────┘\n\n`;
    for (const cmd of cmds) {
      const usage = cmd.usage ? ` ${cmd.usage}` : '';
      text += `• *${prefix}${cmd.name}*${usage}\n`;
      if (cmd.description) text += `  └ _${cmd.description}_\n`;
    }
    text +=
      `\n💡 Type any command above to run.\n` +
      `> DARK QUEEN V2 • Minimal`;
  } else {
    // Royal Luxury (Default)
    text =
      `╔════════════════════════════╗\n` +
      `  👑 ${meta.emoji} ${meta.title} 👑\n` +
      `  ✨ ${cmds.length} 𝐂𝐎𝐌𝐌𝐀𝐍𝐃𝐒 𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 ✨\n` +
      `╚════════════════════════════╝\n\n` +
      `╭─〔 📜 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 𝐋𝐈𝐒𝐓 〕─•\n`;
    if (!cmds.length) {
      text += '│ ⋄ _No commands in this section yet_\n';
    } else {
      for (let i = 0; i < cmds.length; i++) {
        const isLast = i === cmds.length - 1;
        const cmd = cmds[i];
        const usage = cmd.usage ? ` ${cmd.usage}` : '';
        text += `│ ${isLast ? '└' : '├'}─⋄ *${prefix}${cmd.name}*${usage}\n`;
        if (cmd.description) {
          text += `│ ${isLast ? ' ' : '│'}   └ ℹ️ _${cmd.description}_\n`;
        }
      }
    }
    text +=
      '╰─────────────────────────•\n\n' +
      '╭─〔 💡 𝐇𝐎𝐖 𝐓𝐎 𝐔𝐒𝐄 〕─•\n' +
      `│ 🌸 Type ${prefix}<command> to execute\n` +
      `│ 📂 Tap "Select Category" below to switch\n` +
      '╰─────────────────────────•\n\n' +
      `> 𓆩👑 DARK QUEEN V2 · ${meta.title} 👑𓆪`;
  }

  return { text, meta };
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
  if (str.includes('down') || str.includes('dl') || str.includes('song') || str.includes('video') || str.includes('yt') || str.includes('apk') || str.includes('movie') || str.includes('cinesubz')) return 'download';
  if (str.includes('ai') || str.includes('gpt') || str.includes('smart') || str.includes('claude') || str.includes('llama')) return 'ai';
  if (str.includes('group') || str.includes('gp') || str.includes('tagall')) return 'group';
  if (str.includes('util') || str.includes('tool') || str.includes('setting') || str.includes('alive') || str.includes('ping')) return 'utility';
  if (str.includes('fun') || str.includes('game') || str.includes('joke')) return 'fun';
  if (str.includes('owner') || str.includes('restart') || str.includes('shutdown')) return 'owner';
  return null;
}

/** Relay menu with video/image attachment & native flow buttons */
async function sendMainMenu(sock, jid, { text, footer, buttonText, rows, imageUrl, quoted }) {
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

  let header = { title: '👑 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐', hasMediaAttachment: false };
  if (imageUrl) {
    try {
      const media = await prepareWAMessageMedia(
        { image: { url: imageUrl } },
        { upload: sock.waUploadToServer }
      );
      if (media && media.imageMessage) {
        header = { title: '👑 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐', hasMediaAttachment: true, imageMessage: media.imageMessage };
      }
    } catch (_) {
      header = { title: '👑 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐', hasMediaAttachment: false };
    }
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
  const menuText = buildMenuText(prefix, sessionId, requestedStyle, userName);

  const settings = (() => { try { return getSettings(sessionId) || {}; } catch { return {}; } })();
  const useButtons = settings.buttons !== false;

  if (useButtons) {
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
      const sent = await sendMainMenu(sock, from, {
        text: menuText,
        footer: '𓆩🌸 DARK QUEEN V2 · ROYAL EDITION 🌸𓆪',
        buttonText: '📂 Select Category',
        rows,
        imageUrl: logo,
        quoted: msg,
      });
      if (sent?.key?.id) {
        try { rememberPanel(from, sent.key.id, 'menu'); } catch (_) {}
      }
      return sent;
    } catch (btnErr) {
      // Fall through to regular message
    }
  }

  // Send image caption with text fallback if rate-limited or upload fails
  try {
    const sent = await sock.sendMessage(
      from,
      {
        image: { url: logo },
        caption: menuText,
      },
      { quoted: msg }
    );
    if (sent?.key?.id) {
      try { rememberPanel(from, sent.key.id, 'menu'); } catch (_) {}
    }
    return sent;
  } catch (imgErr) {
    // Graceful fallback to text prevents rate-overlimit crash
    const sent = await sock.sendMessage(
      from,
      { text: menuText },
      { quoted: msg }
    );
    if (sent?.key?.id) {
      try { rememberPanel(from, sent.key.id, 'menu'); } catch (_) {}
    }
    return sent;
  }
}

async function showCategory(sock, msg, from, catKey, sessionId, requestedStyle) {
  const prefix = config.prefix || '.';
  const logo = getLogo(sessionId);
  const resolved = resolveCategoryKey(catKey) || 'ai';
  const { text, meta } = categoryCommandsText(resolved, prefix, sessionId, requestedStyle);

  // Send the category commands card cleanly as image caption
  // Guarantees 100% reliable delivery on all WhatsApp clients & devices
  try {
    await sock.sendMessage(
      from,
      {
        image: { url: logo },
        caption: text,
      },
      { quoted: msg }
    );
  } catch (err) {
    try {
      await sock.sendMessage(from, { text }, { quoted: msg });
    } catch (_) {}
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

  const settings = (() => { try { return getSettings(sessionId) || {}; } catch { return {}; } })();
  if (settings.buttons !== false) {
    try {
      return await sendQuickReplies(sock, from, {
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
    } catch (_) {}
  }
  await sock.sendMessage(from, { text }, { quoted: msg });
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

      // Category filter: e.g. .menu ai or .menu cat dqcat_ai or .menu 1
      if (firstArg === 'cat' && args[1]) {
        const key = resolveCategoryKey(args[1]) || 'ai';
        return await showCategory(sock, msg, from, key, sid, requestedStyle);
      }

      const directCat = resolveCategoryKey(firstArg);
      if (directCat) {
        return await showCategory(sock, msg, from, directCat, sid, requestedStyle);
      }

      // Full menu
      return await showMain(sock, msg, from, sid, requestedStyle);
    } catch (err) {
      const isRateLimit =
        err?.message?.includes('rate-overlimit') ||
        err?.output?.payload?.message?.includes('internal server error') ||
        err?.output?.statusCode === 500;

      if (isRateLimit) {
        console.warn('[Menu] WhatsApp rate-overlimit, falling back to clean text menu');
        try {
          const prefix = config.prefix || '.';
          const menuText = buildMenuText(prefix, sessionId || 'default', null, getUserName(msg));
          return await sock.sendMessage(from, { text: menuText }, { quoted: msg });
        } catch (_) {}
        return;
      }

      console.error('Menu Error:', err?.message || err);
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
