/**
 * DARK QUEEN V2 — .settings
 * Bot Configuration Panel:
 *   - Bot Work Mode: Public, Private (Owner only), Inbox Only (DMs only)
 *   - Feature Toggles: AntiLink, Buttons, AntiDelete, StatusSeen
 *
 * Interaction methods:
 *   1. Interactive Single-Select Buttons / Quick Replies
 *   2. Number reply to panel message (reply 1 - 7)
 *   3. Direct commands: .settings public, .settings private, .settings inbox, .mode public, etc.
 */
const { getSettings, updateSettings } = require('../../lib/botSettings');
const { sendSelectList, sendQuickReplies } = require('../../lib/sendButtons');
const { rememberPanel } = require('../../lib/settingsPanelStore');

const DEFAULT_LOGO = 'https://files.catbox.moe/yjyx4x.webp';

const MODES = [
  { key: 'public', label: 'Public Mode (All Users)', icon: '🌐', num: '5️⃣', desc: 'Commands work for everyone (groups & inbox)' },
  { key: 'private', label: 'Private Mode (Owner Only)', icon: '🔒', num: '6️⃣', desc: 'Only the bot owner can use commands' },
  { key: 'inbox', label: 'Inbox Only Mode (PM Only)', icon: '📥', num: '7️⃣', desc: 'Commands work in DMs, disabled in groups' },
];

const FEATURES = [
  { key: 'statusSeen', label: 'Status Auto-Seen', icon: '👁️', num: '1️⃣', desc: 'Auto view WhatsApp statuses' },
  { key: 'antiDelete', label: 'Anti Delete', icon: '🛡️', num: '2️⃣', desc: 'Resend deleted messages in PM' },
  { key: 'antiLink', label: 'Anti Link (Groups)', icon: '🔗', num: '3️⃣', desc: 'Delete group link spam' },
  { key: 'buttons', label: 'Interactive Buttons', icon: '🔘', num: '4️⃣', desc: 'WhatsApp native flow buttons' },
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

function stateLabel(on) { return on ? '*ON* ✅' : '*OFF* ⛔'; }
function modeBadge(current, target) { return current === target ? '✅ *[ACTIVE]*' : '▫️'; }

function renderPanel(settings) {
  const currentMode = settings.workMode || 'public';
  let modeName = '🌐 PUBLIC MODE (All Users)';
  if (currentMode === 'private') modeName = '🔒 PRIVATE MODE (Owner Only)';
  if (currentMode === 'inbox') modeName = '📥 INBOX ONLY MODE (DMs Only)';

  let text =
    '╔════════════════════════════╗\n' +
    '  ⚙️ 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐒𝐄𝐓𝐓𝐈𝐍𝐆𝐒 ⚙️\n' +
    '╚════════════════════════════╝\n\n' +
    '╭─〔 🌐 𝐁𝐎𝐓 𝐖𝐎𝐑𝐊 𝐌𝐎𝐃𝐄 〕─•\n' +
    `│ Current : *${modeName}*\n│\n` +
    `│ 5️⃣ 🌐 *Public Mode*     ${modeBadge(currentMode, 'public')}\n` +
    '│    └ ℹ️ _Commands work for everyone everywhere_\n' +
    `│ 6️⃣ 🔒 *Private Mode*    ${modeBadge(currentMode, 'private')}\n` +
    '│    └ ℹ️ _Only the bot owner can use commands_\n' +
    `│ 7️⃣ 📥 *Inbox Only Mode* ${modeBadge(currentMode, 'inbox')}\n` +
    '│    └ ℹ️ _Commands only work in private chat (DM)_\n' +
    '╰─────────────────────────•\n\n' +
    '╭─〔 🎛️ 𝐅𝐄𝐀𝐓𝐔𝐑𝐄 𝐓𝐎𝐆𝐆𝐋𝐄𝐒 〕─•\n';

  for (let i = 0; i < FEATURES.length; i++) {
    const f = FEATURES[i];
    const isLast = i === FEATURES.length - 1;
    const val = !!settings[f.key];
    text += `│ ${isLast ? '└' : '├'}─⋄ ${f.num} ${f.icon} *${f.label}* : ${stateLabel(val)}\n`;
    text += `│ ${isLast ? ' ' : '│'}   └ ℹ️ _${f.desc}_\n`;
  }

  text +=
    '╰─────────────────────────•\n\n' +
    '╭─〔 💡 𝐇𝐎𝐖 𝐓𝐎 𝐂𝐇𝐀𝐍𝐆𝐄 〕─•\n' +
    '│ 🔘 Tap "⚙️ Configure Bot" button below\n' +
    '│ 🔢 Or reply with option number:\n' +
    '│    *1* - Status Seen    *5* - Public Mode\n' +
    '│    *2* - Anti Delete    *6* - Private Mode\n' +
    '│    *3* - Anti Link      *7* - Inbox Mode\n' +
    '│    *4* - Buttons\n' +
    '│ 💬 Or type:\n' +
    '│    .settings public / .mode public\n' +
    '│    .settings private / .mode private\n' +
    '│    .settings inbox / .mode inbox\n' +
    '╰─────────────────────────•\n\n' +
    '> 𓆩⚙️ DARK QUEEN V2 · CONTROL PANEL ⚙️𓆪';
  return text;
}

function modeMessage(mode) {
  if (mode === 'private') {
    return '🔒 *Bot Work Mode changed to PRIVATE MODE!* 🛡️\nOnly the bot owner can use commands now.';
  }
  if (mode === 'inbox') {
    return '📥 *Bot Work Mode changed to INBOX ONLY MODE!* 📨\nCommands now work only in private chat (DM), and are disabled in groups.';
  }
  return '🌐 *Bot Work Mode changed to PUBLIC MODE!* ✅\nEveryone can now use bot commands in groups and inbox.';
}

module.exports = {
  name: 'settings',
  aliases: ['setting', 'config', 'panel', 'set', 'mode', 'workmode'],
  description: 'Bot configuration panel — Public/Private/Inbox mode, AntiLink, Buttons, AntiDelete, StatusSeen',
  category: 'utility',

  async execute({ sock, msg, from, args, isOwner, sessionId, commandName }) {
    const sid = sessionId || 'default';
    const firstArg = String(args[0] || '').toLowerCase().trim();
    const secondArg = String(args[1] || '').toLowerCase().trim();

    // Direct mode command execution: .mode private / .mode public / .mode inbox
    if ((commandName === 'mode' || commandName === 'workmode') && firstArg) {
      if (!isOwner) {
        return sock.sendMessage(from, { text: '👑 Only the bot owner can change bot work mode.' }, { quoted: msg });
      }
      let targetMode = firstArg;
      if (['pub', 'public', 'all'].includes(targetMode)) targetMode = 'public';
      else if (['priv', 'private', 'owner'].includes(targetMode)) targetMode = 'private';
      else if (['inbox', 'dm', 'pm', 'inbox_only'].includes(targetMode)) targetMode = 'inbox';
      else {
        return sock.sendMessage(
          from,
          { text: '❌ Invalid mode.\nAvailable: `.mode public`, `.mode private`, `.mode inbox`' },
          { quoted: msg }
        );
      }
      updateSettings(sid, { workMode: targetMode });
      try { await sock.sendMessage(from, { react: { text: targetMode === 'private' ? '🔒' : targetMode === 'inbox' ? '📥' : '🌐', key: msg.key } }); } catch (_) {}
      return await sock.sendMessage(from, { text: modeMessage(targetMode) }, { quoted: msg });
    }

    // Process arguments or button clicks
    if (firstArg) {
      if (!isOwner) {
        return sock.sendMessage(from, { text: '👑 Only the bot owner can change settings.' }, { quoted: msg });
      }

      // 1) Mode direct words: .settings public, .settings private, .settings inbox
      if (['public', 'pub'].includes(firstArg)) {
        updateSettings(sid, { workMode: 'public' });
        try { await sock.sendMessage(from, { react: { text: '🌐', key: msg.key } }); } catch (_) {}
        return await sock.sendMessage(from, { text: modeMessage('public') }, { quoted: msg });
      }
      if (['private', 'priv'].includes(firstArg)) {
        updateSettings(sid, { workMode: 'private' });
        try { await sock.sendMessage(from, { react: { text: '🔒', key: msg.key } }); } catch (_) {}
        return await sock.sendMessage(from, { text: modeMessage('private') }, { quoted: msg });
      }
      if (['inbox', 'dm', 'pm', 'inbox_only'].includes(firstArg)) {
        updateSettings(sid, { workMode: 'inbox' });
        try { await sock.sendMessage(from, { react: { text: '📥', key: msg.key } }); } catch (_) {}
        return await sock.sendMessage(from, { text: modeMessage('inbox') }, { quoted: msg });
      }

      // 2) .settings mode <public|private|inbox>
      if (firstArg === 'mode' && secondArg) {
        let m = secondArg;
        if (['pub', 'public'].includes(m)) m = 'public';
        else if (['priv', 'private'].includes(m)) m = 'private';
        else if (['inbox', 'dm', 'pm', 'inbox_only'].includes(m)) m = 'inbox';
        else {
          return sock.sendMessage(
            from,
            { text: '❌ Invalid mode.\nOptions: `public`, `private`, `inbox`' },
            { quoted: msg }
          );
        }
        updateSettings(sid, { workMode: m });
        try { await sock.sendMessage(from, { react: { text: m === 'private' ? '🔒' : m === 'inbox' ? '📥' : '🌐', key: msg.key } }); } catch (_) {}
        return await sock.sendMessage(from, { text: modeMessage(m) }, { quoted: msg });
      }

      // 3) Mode Button click: dqset_mode_public, dqset_mode_private, dqset_mode_inbox
      if (firstArg.startsWith('dqset_mode_')) {
        const targetMode = firstArg.replace('dqset_mode_', '');
        if (['public', 'private', 'inbox'].includes(targetMode)) {
          updateSettings(sid, { workMode: targetMode });
          try { await sock.sendMessage(from, { react: { text: targetMode === 'private' ? '🔒' : targetMode === 'inbox' ? '📥' : '🌐', key: msg.key } }); } catch (_) {}
          return await sock.sendMessage(from, { text: modeMessage(targetMode) }, { quoted: msg });
        }
      }

      // 4) Toggle by number: 1 - 7 (.settings 1, .settings 5, etc.)
      if (/^[1-7]$/.test(firstArg)) {
        const num = parseInt(firstArg, 10);
        if (num >= 1 && num <= 4) {
          const feat = FEATURES[num - 1];
          const current = !!getSettings(sid)[feat.key];
          const nextVal = secondArg === 'on' ? true : secondArg === 'off' ? false : !current;
          updateSettings(sid, { [feat.key]: nextVal });
          try { await sock.sendMessage(from, { react: { text: nextVal ? '✅' : '⛔', key: msg.key } }); } catch (_) {}
          return await sock.sendMessage(
            from,
            { text: `✅ *${feat.label}* is now ${nextVal ? '*ON* ✅' : '*OFF* ⛔'}` },
            { quoted: msg }
          );
        } else if (num === 5) {
          updateSettings(sid, { workMode: 'public' });
          try { await sock.sendMessage(from, { react: { text: '🌐', key: msg.key } }); } catch (_) {}
          return await sock.sendMessage(from, { text: modeMessage('public') }, { quoted: msg });
        } else if (num === 6) {
          updateSettings(sid, { workMode: 'private' });
          try { await sock.sendMessage(from, { react: { text: '🔒', key: msg.key } }); } catch (_) {}
          return await sock.sendMessage(from, { text: modeMessage('private') }, { quoted: msg });
        } else if (num === 7) {
          updateSettings(sid, { workMode: 'inbox' });
          try { await sock.sendMessage(from, { react: { text: '📥', key: msg.key } }); } catch (_) {}
          return await sock.sendMessage(from, { text: modeMessage('inbox') }, { quoted: msg });
        }
      }

      // 5) Number reply handler from event: .settings num <1-7>
      if (firstArg === 'num' && args[1]) {
        const num = parseInt(String(args[1]), 10);
        if (num >= 1 && num <= 4) {
          const feat = FEATURES[num - 1];
          const current = !!getSettings(sid)[feat.key];
          updateSettings(sid, { [feat.key]: !current });
          try { await sock.sendMessage(from, { react: { text: !current ? '✅' : '⛔', key: msg.key } }); } catch (_) {}
          return await sock.sendMessage(
            from,
            { text: `✅ *${feat.label}* is now ${!current ? '*ON* ✅' : '*OFF* ⛔'}` },
            { quoted: msg }
          );
        } else if (num === 5) {
          updateSettings(sid, { workMode: 'public' });
          try { await sock.sendMessage(from, { react: { text: '🌐', key: msg.key } }); } catch (_) {}
          return await sock.sendMessage(from, { text: modeMessage('public') }, { quoted: msg });
        } else if (num === 6) {
          updateSettings(sid, { workMode: 'private' });
          try { await sock.sendMessage(from, { react: { text: '🔒', key: msg.key } }); } catch (_) {}
          return await sock.sendMessage(from, { text: modeMessage('private') }, { quoted: msg });
        } else if (num === 7) {
          updateSettings(sid, { workMode: 'inbox' });
          try { await sock.sendMessage(from, { react: { text: '📥', key: msg.key } }); } catch (_) {}
          return await sock.sendMessage(from, { text: modeMessage('inbox') }, { quoted: msg });
        }
      }

      // 6) Toggle by button id: dqset_toggle_<key>
      if (firstArg.startsWith('dqset_toggle_')) {
        const key = firstArg.replace('dqset_toggle_', '');
        const feat = FEATURES.find((f) => f.key === key);
        if (feat) {
          const current = !!getSettings(sid)[key];
          updateSettings(sid, { [key]: !current });
          try { await sock.sendMessage(from, { react: { text: !current ? '✅' : '⛔', key: msg.key } }); } catch (_) {}
          return await sock.sendMessage(
            from,
            { text: `✅ *${feat.label}* is now ${!current ? '*ON* ✅' : '*OFF* ⛔'}` },
            { quoted: msg }
          );
        }
      }

      // 7) Direct feature name: .settings antilink on / off, .settings buttons on / off
      const keyMap = {
        antilink: 'antiLink',
        anti_link: 'antiLink',
        link: 'antiLink',
        button: 'buttons',
        buttons: 'buttons',
        btn: 'buttons',
        status: 'statusSeen',
        statusseen: 'statusSeen',
        antidelete: 'antiDelete',
        antidel: 'antiDelete',
      };
      if (keyMap[firstArg]) {
        const targetKey = keyMap[firstArg];
        const current = !!getSettings(sid)[targetKey];
        const nextVal = secondArg === 'on' ? true : secondArg === 'off' ? false : !current;
        updateSettings(sid, { [targetKey]: nextVal });
        const featObj = FEATURES.find((f) => f.key === targetKey);
        try { await sock.sendMessage(from, { react: { text: nextVal ? '✅' : '⛔', key: msg.key } }); } catch (_) {}
        return await sock.sendMessage(
          from,
          { text: `✅ *${featObj ? featObj.label : targetKey}* is now ${nextVal ? '*ON* ✅' : '*OFF* ⛔'}` },
          { quoted: msg }
        );
      }
    }

    // Render panel
    const settings = getSettings(sid);
    const logo = getLogo(sid);

    try { await sock.sendMessage(from, { react: { text: '⚙️', key: msg.key } }); } catch (_) {}

    // Check if buttons are enabled
    const useButtons = settings.buttons !== false;

    if (useButtons) {
      const currentMode = settings.workMode || 'public';

      // Rows for single select list
      const rows = [
        {
          id: 'dqset_mode_public',
          header: '🌐 Work Mode',
          title: '🌐 Public Mode',
          description: currentMode === 'public' ? '✅ Currently Active (Everyone)' : 'Enable for everyone',
        },
        {
          id: 'dqset_mode_private',
          header: '🔒 Work Mode',
          title: '🔒 Private Mode',
          description: currentMode === 'private' ? '✅ Currently Active (Owner Only)' : 'Owner only access',
        },
        {
          id: 'dqset_mode_inbox',
          header: '📥 Work Mode',
          title: '📥 Inbox Only Mode',
          description: currentMode === 'inbox' ? '✅ Currently Active (PMs only)' : 'Commands only work in DMs',
        },
        {
          id: 'dqset_toggle_antiLink',
          header: '🎛️ Feature Toggle',
          title: '🔗 Anti Link',
          description: settings.antiLink ? 'Status: ON ✅ (Tap to turn OFF)' : 'Status: OFF ⛔ (Tap to turn ON)',
        },
        {
          id: 'dqset_toggle_buttons',
          header: '🎛️ Feature Toggle',
          title: '🔘 Buttons',
          description: settings.buttons !== false ? 'Status: ON ✅ (Tap to turn OFF)' : 'Status: OFF ⛔ (Tap to turn ON)',
        },
        {
          id: 'dqset_toggle_statusSeen',
          header: '🎛️ Feature Toggle',
          title: '👁️ Status Seen',
          description: settings.statusSeen ? 'Status: ON ✅ (Tap to turn OFF)' : 'Status: OFF ⛔ (Tap to turn ON)',
        },
        {
          id: 'dqset_toggle_antiDelete',
          header: '🎛️ Feature Toggle',
          title: '🛡️ Anti Delete',
          description: settings.antiDelete ? 'Status: ON ✅ (Tap to turn OFF)' : 'Status: OFF ⛔ (Tap to turn ON)',
        },
      ];

      try {
        const sent = await sendSelectList(sock, from, {
          text: renderPanel(settings),
          footer: 'DARK QUEEN OFC · V2',
          title: 'Dark Queen Settings',
          buttonText: '⚙️ Configure Bot',
          rows,
          imageUrl: logo,
          quoted: msg,
        });
        if (sent?.key?.id) {
          try { rememberPanel(from, sent.key.id); } catch (_) {}
        }
        return;
      } catch (listErr) {
        // Fallback to quick replies if selectList fails
        try {
          const quickButtons = [
            { id: 'dqset_mode_public', text: '🌐 Public Mode' },
            { id: 'dqset_mode_private', text: '🔒 Private Mode' },
            { id: 'dqset_mode_inbox', text: '📥 Inbox Only' },
          ];
          const sent = await sendQuickReplies(sock, from, {
            text: renderPanel(settings),
            footer: 'DARK QUEEN OFC · V2',
            imageUrl: logo,
            buttons: quickButtons,
            quoted: msg,
          });
          if (sent?.key?.id) {
            try { rememberPanel(from, sent.key.id); } catch (_) {}
          }
          return;
        } catch (_) {}
      }
    }

    // Fallback: send clean image message without buttons
    const sent = await sock.sendMessage(
      from,
      {
        image: { url: logo },
        caption: renderPanel(settings),
      },
      { quoted: msg }
    );
    if (sent?.key?.id) {
      try { rememberPanel(from, sent.key.id); } catch (_) {}
    }
  },
};
