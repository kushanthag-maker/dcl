/**
 * DARK QUEEN V2 — AntiLink Protection for WhatsApp Groups
 * Usage:
 *   .antilink on / enable
 *   .antilink off / disable
 *   .antilink status
 */
const { getSettings, updateSettings } = require('../../lib/botSettings');

module.exports = {
  name: 'antilink',
  aliases: ['anti-link', 'antlink', 'al'],
  description: 'Enable or disable group Anti-Link protection',
  category: 'group',
  groupOnly: true,

  async execute({ sock, msg, from, args, isOwner, sessionId }) {
    const sid = sessionId || 'default';
    const sub = String(args[0] || '').toLowerCase().trim();

    // Group Admin Check
    let isSenderAdmin = isOwner;
    let isBotAdmin = false;

    try {
      const meta = await sock.groupMetadata(from);
      const senderJid = msg.key.participant || from;
      const senderNum = senderJid.split('@')[0].split(':')[0];

      const senderPart = meta.participants.find(
        (p) => p.id.split('@')[0].split(':')[0] === senderNum
      );
      if (senderPart?.admin === 'admin' || senderPart?.admin === 'superadmin') {
        isSenderAdmin = true;
      }

      const botNum = (sock.user?.id || '').split('@')[0].split(':')[0];
      const botPart = meta.participants.find(
        (p) => p.id.split('@')[0].split(':')[0] === botNum
      );
      if (botPart?.admin === 'admin' || botPart?.admin === 'superadmin') {
        isBotAdmin = true;
      }
    } catch (_) {}

    if (!isSenderAdmin) {
      return await sock.sendMessage(
        from,
        { text: '👑 *Access Denied:* Only Group Admins or Bot Owner can configure AntiLink.' },
        { quoted: msg }
      );
    }

    const current = !!getSettings(sid).antiLink;

    if (sub === 'on' || sub === 'enable' || sub === '1') {
      updateSettings(sid, { antiLink: true });
      try { await sock.sendMessage(from, { react: { text: '🛡️', key: msg.key } }); } catch (_) {}

      let text = '🛡️ *AntiLink Protection is now ACTIVE (ON)!* ✅\n\n' +
        'Any WhatsApp invite links sent by non-admin members will be automatically deleted.\n';
      if (!isBotAdmin) {
        text += '\n⚠️ *Attention:* Please make sure the bot is an *Admin* in this group so I have permission to delete link messages!';
      }
      return await sock.sendMessage(from, { text }, { quoted: msg });
    }

    if (sub === 'off' || sub === 'disable' || sub === '0') {
      updateSettings(sid, { antiLink: false });
      try { await sock.sendMessage(from, { react: { text: '⛔', key: msg.key } }); } catch (_) {}

      return await sock.sendMessage(
        from,
        { text: '🛡️ *AntiLink Protection is now DISABLED (OFF)!* ⛔\nMembers may now send links.' },
        { quoted: msg }
      );
    }

    // Toggle if no sub-arg or display status
    const statusText =
      '╔════════════════════════════╗\n' +
      '  🛡️ 𝐀𝐍𝐓𝐈-𝐋𝐈𝐍𝐊 𝐏𝐑𝐎𝐓𝐄𝐂𝐓𝐈𝐎𝐍 🛡️\n' +
      '╚════════════════════════════╝\n\n' +
      `│ 📊 Current Status : ${current ? '*ENABLED* ✅' : '*DISABLED* ⛔'}\n` +
      `│ 🤖 Bot Admin      : ${isBotAdmin ? '*Yes* ✅' : '*No (Promote Bot)* ⚠️'}\n` +
      `│ 👤 Your Role      : *Group Admin* 👑\n\n` +
      '╭─〔 💡 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 𝐔𝐒𝐀𝐆𝐄 〕─•\n' +
      '│ 🛡️ .antilink on   : Enable link deletion\n' +
      '│ ⛔ .antilink off  : Disable protection\n' +
      '│ ⚙️ .settings      : Toggle via Control Panel\n' +
      '╰─────────────────────────•\n\n' +
      '> 𓆩🛡️ DARK QUEEN V2 · GROUP SECURITY 🛡️𓆪';

    return await sock.sendMessage(from, { text: statusText }, { quoted: msg });
  },
};
