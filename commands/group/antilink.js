/**
 * DARK QUEEN V2 — AntiLink Protection for WhatsApp Groups
 * Usage:
 *   .antilink on / enable
 *   .antilink off / disable
 *   .antilink status
 */
const { getSettings, updateSettings } = require('../../lib/botSettings');
const antiLinkStore = require('../../lib/antiLinkStore');

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
      const senderClean = senderJid.split('@')[0].split(':')[0];

      const senderPart = meta.participants.find(
        (p) => p.id.split('@')[0].split(':')[0] === senderClean
      );
      if (senderPart?.admin === 'admin' || senderPart?.admin === 'superadmin') {
        isSenderAdmin = true;
      }

      const botNum = (sock.user?.id || '').split('@')[0].split(':')[0];
      const botLid = sock.user?.lid ? sock.user.lid.split('@')[0].split(':')[0] : null;
      const botPart = meta.participants.find((p) => {
        const pClean = p.id.split('@')[0].split(':')[0];
        return pClean === botNum || (botLid && pClean === botLid);
      });
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

    const isGroupActive = antiLinkStore.isGroupEnabled(from) || !!getSettings(sid).antiLink;

    if (sub === 'on' || sub === 'enable' || sub === '1') {
      antiLinkStore.setGroupEnabled(from, true);
      updateSettings(sid, { antiLink: true });
      try { await sock.sendMessage(from, { react: { text: '🛡️', key: msg.key } }); } catch (_) {}

      let text = '🛡️ *AntiLink Protection is now ACTIVE (ON) for this group!* ✅\n\n' +
        '• Any WhatsApp invite links sent by non-admin members will be detected.\n';
      if (isBotAdmin) {
        text += '• 🤖 *Bot Status:* Group Admin ✅ (Links will be automatically deleted immediately)';
      } else {
        text += '• ⚠️ *Notice:* Bot is currently *NOT Admin*. Please make the bot an *Admin* so it can automatically delete link messages!';
      }
      return await sock.sendMessage(from, { text }, { quoted: msg });
    }

    if (sub === 'off' || sub === 'disable' || sub === '0') {
      antiLinkStore.setGroupEnabled(from, false);
      try { await sock.sendMessage(from, { react: { text: '⛔', key: msg.key } }); } catch (_) {}

      return await sock.sendMessage(
        from,
        { text: '🛡️ *AntiLink Protection is now DISABLED (OFF) for this group!* ⛔\nMembers may now send links.' },
        { quoted: msg }
      );
    }

    // Status display
    const statusText =
      '╔════════════════════════════╗\n' +
      '  🛡️ 𝐀𝐍𝐓𝐈-𝐋𝐈𝐍𝐊 𝐏𝐑𝐎𝐓𝐄𝐂𝐓𝐈𝐎𝐍 🛡️\n' +
      '╚════════════════════════════╝\n\n' +
      `│ 📊 Group Status  : ${isGroupActive ? '*ENABLED* ✅' : '*DISABLED* ⛔'}\n` +
      `│ 🤖 Bot Admin     : ${isBotAdmin ? '*Yes (Can Delete)* ✅' : '*No (Promote Bot to Admin)* ⚠️'}\n` +
      `│ 👤 Your Role     : *Group Admin* 👑\n\n` +
      '╭─〔 💡 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 𝐔𝐒𝐀𝐆𝐄 〕─•\n' +
      '│ 🛡️ .antilink on   : Enable link deletion\n' +
      '│ ⛔ .antilink off  : Disable protection\n' +
      '│ ⚙️ .settings      : Toggle via Control Panel\n' +
      '╰─────────────────────────•\n\n' +
      (isBotAdmin
        ? '✅ *Bot is Admin:* Non-admin link messages will be deleted automatically!'
        : '⚠️ *Important:* To delete messages, please make this Bot a Group Admin!') +
      '\n\n> 𓆩🛡️ DARK QUEEN V2 · GROUP SECURITY 🛡️𓆪';

    return await sock.sendMessage(from, { text: statusText }, { quoted: msg });
  },
};
