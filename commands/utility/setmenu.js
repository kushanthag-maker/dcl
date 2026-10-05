/**
 * DARK QUEEN V2 — .setmenu / .theme command
 * Easily change the WhatsApp bot menu style and save it
 */
const { getSettings, updateSettings } = require('../../lib/botSettings');

const STYLES = [
  { id: 'royal', name: '👑 Royal Queen (Default)', desc: 'Regal crown, gold luxury ornament borders' },
  { id: 'cyber', name: '⚡ Cyberpunk Matrix', desc: 'Futuristic terminal, neural brackets, neon modules' },
  { id: 'rose', name: '🌸 Pink Rose Princess', desc: 'Sweet floral kawaii aesthetic, soft ribbons' },
  { id: 'minimal', name: '🖤 Minimal Dark Pro', desc: 'Compact clean modern typography' },
];

module.exports = {
  name: 'setmenu',
  aliases: ['menustyle', 'theme', 'bottheme'],
  description: 'Change the WhatsApp bot menu UI theme',
  category: 'utility',

  async execute({ sock, msg, from, args, sessionId }) {
    const sid = sessionId || 'default';
    const choice = String(args[0] || '').toLowerCase().trim().replace('--', '');

    if (!choice) {
      const current = (getSettings(sid).menuStyle || 'royal').toUpperCase();
      let text =
        `╔════════════════════════════╗\n` +
        `  🎨 𝐁𝐎𝐓 𝐌𝐄𝐍𝐔 𝐓𝐇𝐄𝐌𝐄𝐒 🎨\n` +
        `╚════════════════════════════╝\n\n` +
        `🌟 Current Active Theme: *${current}*\n\n` +
        `Choose your style by typing:\n`;

      for (const s of STYLES) {
        text += `• *.setmenu ${s.id}*\n   _${s.name}_\n   ${s.desc}\n\n`;
      }

      text += `💡 Example: *.setmenu cyber* or *.setmenu royal*\n> DARK QUEEN V2 · THEMES`;
      return sock.sendMessage(from, { text }, { quoted: msg });
    }

    const matched = STYLES.find((s) => s.id === choice);
    if (!matched) {
      return sock.sendMessage(
        from,
        {
          text: `❌ Unknown theme *"${choice}"*.\nAvailable themes:\n• *royal*\n• *cyber*\n• *rose*\n• *minimal*\n\nExample: *.setmenu royal*`,
        },
        { quoted: msg }
      );
    }

    updateSettings(sid, { menuStyle: matched.id });
    try {
      await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });
    } catch (_) {}

    return sock.sendMessage(
      from,
      {
        text:
          `✅ *Menu Theme Updated Successfully!*\n\n` +
          `🎨 Theme: *${matched.name}*\n` +
          `✨ Type *.menu* to experience your new UI!\n\n` +
          `> DARK QUEEN V2`,
      },
      { quoted: msg }
    );
  },
};
