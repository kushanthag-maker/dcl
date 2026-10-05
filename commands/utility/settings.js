/**
 * DARK QUEEN V2 — .settings
 * Toggle features via:
 *   1. Interactive Quick Reply Buttons
 *   2. Number reply to the panel message (reply 1, 2, 3, 4)
 *   3. Text arguments (e.g. .settings antilink on, .settings buttons off)
 */
const { getSettings, updateSettings } = require('../../lib/botSettings');
const { sendQuickReplies } = require('../../lib/sendButtons');
const { rememberPanel } = require('../../lib/settingsPanelStore');

const DEFAULT_LOGO = 'https://files.catbox.moe/yjyx4x.webp';

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

function box(on) { return on ? '☑' : '☐'; }
function stateLabel(on) { return on ? '*ON* ✅' : '*OFF* ⛔'; }

function renderPanel(settings) {
  let text =
    '╔════════════════════════════╗\n' +
    '  ⚙️ 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐒𝐄𝐓𝐓𝐈𝐍𝐆𝐒 ⚙️\n' +
    '╚════════════════════════════╝\n\n' +
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
    '╭─〔 💡 𝐇𝐎𝐖 𝐓𝐎 𝐓𝐎𝐆𝐆𝐋𝐄 〕─•\n' +
    '│ 🔘 Tap a button below\n' +
    '│ 🔢 Or reply with option number (1, 2, 3, 4)\n' +
    '│ 💬 Or type: .settings <feature> <on/off>\n' +
    '│    e.g. .settings antilink on\n' +
    '│    e.g. .settings buttons off\n' +
    '╰─────────────────────────•\n\n' +
    '> 𓆩⚙️ DARK QUEEN V2 · CONTROL PANEL ⚙️𓆪';
  return text;
}

module.exports = {
  name: 'settings',
  aliases: ['setting', 'config', 'panel', 'set'],
  description: 'Bot configuration panel — AntiLink, Buttons, AntiDelete, StatusSeen',
  category: 'utility',

  async execute({ sock, msg, from, args, isOwner, sessionId }) {
    const sid = sessionId || 'default';
    const firstArg = String(args[0] || '').toLowerCase().trim();
    const secondArg = String(args[1] || '').toLowerCase().trim();

    // Check if user specified text arguments: e.g. .settings antilink on or .settings 3
    if (firstArg) {
      if (!isOwner) {
        return sock.sendMessage(from, { text: '👑 Only the bot owner can change settings.' }, { quoted: msg });
      }

      // 1) Toggle by number: .settings 1 / .settings 2 / .settings 3 / .settings 4
      if (/^[1-4]$/.test(firstArg)) {
        const idx = parseInt(firstArg, 10) - 1;
        const feat = FEATURES[idx];
        if (feat) {
          const current = !!getSettings(sid)[feat.key];
          const nextVal = secondArg === 'on' ? true : secondArg === 'off' ? false : !current;
          updateSettings(sid, { [feat.key]: nextVal });
          try { await sock.sendMessage(from, { react: { text: nextVal ? '✅' : '⛔', key: msg.key } }); } catch (_) {}
          return await sock.sendMessage(
            from,
            { text: `✅ *${feat.label}* is now ${nextVal ? '*ON* ✅' : '*OFF* ⛔'}` },
            { quoted: msg }
          );
        }
      }

      // 2) Number reply handler from event: .settings num 3
      if (firstArg === 'num' && args[1]) {
        const idx = parseInt(String(args[1]), 10) - 1;
        const feat = FEATURES[idx];
        if (feat) {
          const current = !!getSettings(sid)[feat.key];
          updateSettings(sid, { [feat.key]: !current });
          try { await sock.sendMessage(from, { react: { text: !current ? '✅' : '⛔', key: msg.key } }); } catch (_) {}
        }
      }

      // 3) Toggle by button id: dqset_toggle_<key>
      if (firstArg.startsWith('dqset_toggle_')) {
        const key = firstArg.replace('dqset_toggle_', '');
        const feat = FEATURES.find((f) => f.key === key);
        if (feat) {
          const current = !!getSettings(sid)[key];
          updateSettings(sid, { [key]: !current });
          try { await sock.sendMessage(from, { react: { text: !current ? '✅' : '⛔', key: msg.key } }); } catch (_) {}
        }
      }

      // 4) Direct feature name: .settings antilink on / off, .settings buttons on / off
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
      const buttons = [
        {
          id: 'dqset_toggle_antiLink',
          text: (settings.antiLink ? '🔗 AntiLink: OFF ⛔' : '🔗 AntiLink: ON ✅'),
        },
        {
          id: 'dqset_toggle_buttons',
          text: (settings.buttons !== false ? '🔘 Buttons: OFF ⛔' : '🔘 Buttons: ON ✅'),
        },
        {
          id: 'dqset_toggle_statusSeen',
          text: (settings.statusSeen ? '👁️ Status: OFF ⛔' : '👁️ Status: ON ✅'),
        },
      ];

      try {
        const sent = await sendQuickReplies(sock, from, {
          text: renderPanel(settings),
          footer: 'DARK QUEEN OFC · V2',
          imageUrl: logo,
          buttons,
          quoted: msg,
        });
        try { rememberPanel(from, sent.key.id); } catch (_) {}
        return;
      } catch (btnErr) {
        console.warn('Settings button send fallback:', btnErr.message);
      }
    }

    // Fallback: send clean image message without buttons
    await sock.sendMessage(
      from,
      {
        image: { url: logo },
        caption: renderPanel(settings),
      },
      { quoted: msg }
    );
  },
};
