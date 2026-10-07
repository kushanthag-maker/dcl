/**
 * On bot connection:
 * 1) Auto-follow WhatsApp channels (once per bot number)
 * 2) Send connect message to linked user inbox
 */

const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('../config');

const CHANNELS = [
  '120363429200355815@newsletter',
  '120363422427445018@newsletter',
  '120363421504969391@newsletter',
];

const STORE_FILE = path.join(__dirname, '..', 'data', 'channel-follows.json');
const BOT_NAME = '𝕯𝕬𝕽𝕶 𝕼𝖀𝕰𝕰𝕹 𝕸𝕴𝕹𝕴';
const LOGO = 'https://files.catbox.moe/bp9p86.png';

function ensureStore() {
  const dir = path.dirname(STORE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ bots: {} }, null, 2));
  }
}

function loadStore() {
  try {
    ensureStore();
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch (_) {
    return { bots: {} };
  }
}

function saveStore(data) {
  try {
    ensureStore();
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[onConnect] save store:', e.message);
  }
}

function botKey(sock) {
  try {
    const raw = sock?.user?.id || '';
    return String(raw).split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
  } catch (_) {
    return 'unknown';
  }
}

function userJid(sock) {
  if (sock?.user?.id) {
    return jidNormalizedUser(sock.user.id);
  }
  const num = botKey(sock);
  return num && num !== 'unknown' ? num + '@s.whatsapp.net' : null;
}

async function followChannelsOnce(sock, sessionId) {
  const key = botKey(sock);
  const store = loadStore();
  if (!store.bots[key]) store.bots[key] = { followed: [], lastConnect: null };

  const already = new Set(store.bots[key].followed || []);

  for (const jid of CHANNELS) {
    if (already.has(jid)) {
      console.log(`[onConnect] [${sessionId}] already following ${jid}`);
      continue;
    }
    try {
      await new Promise((r) => setTimeout(r, 1500));
      if (typeof sock.newsletterFollow === 'function') {
        await sock.newsletterFollow(jid);
      } else {
        // Baileys fallback query
        await sock.query({
          tag: 'iq',
          attrs: {
            to: jid,
            type: 'set',
            xmlns: 'newsletter',
          },
          content: [
            {
              tag: 'live_updates',
              attrs: {},
              content: undefined,
            },
          ],
        }).catch(async () => {
          await sock.query({
            tag: 'iq',
            attrs: {
              id: sock.generateMessageTag ? sock.generateMessageTag() : String(Date.now()),
              type: 'set',
              xmlns: 'newsletter',
              to: jid,
            },
            content: [{ tag: 'follow', attrs: {} }],
          });
        });
      }
      already.add(jid);
      store.bots[key].followed = Array.from(already);
      saveStore(store);
      console.log(`[onConnect] [${sessionId}] followed ${jid}`);
    } catch (e) {
      console.error(`[onConnect] [${sessionId}] follow fail ${jid}:`, e.message);
    }
  }
}

function greeting() {
  const h = moment().tz(config.timezone || 'Asia/Colombo').hour();
  if (h >= 5 && h < 12) return '🌞 GOOD MORNING';
  if (h >= 12 && h < 17) return '🌞 GOOD AFTERNOON';
  if (h >= 17 && h < 21) return '🌆 GOOD EVENING';
  return '🌙 GOOD NIGHT';
}

function buildConnectCaption(phone, sessionId) {
  const now = moment().tz(config.timezone || 'Asia/Colombo').format('YYYY-MM-DD  HH:mm');
  return `
*╭─┉❰ 🌸 𝐁𝐎𝐓 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃 🌸 ❱┉─┉──•*
*│ 🌺 𝐇𝙴𝙻𝙻𝙾 : ${phone}*
*╰┉────────────┉─•*

*❰🌟 𝐆ʀᴇᴇᴛɪɴɢ : ${greeting()} ❱*

*╭──┉❰ 👑 𝐒𝐘𝐒𝐓𝐄𝐌 𝐒𝐓𝐀𝐓𝐔𝐒 ❱┉──•*
*│◊│* ✦ 🤖 \`ʙᴏᴛ\` : ${BOT_NAME}
*│◊│* ✦ 📶 \`ꜱᴛᴀᴛᴜꜱ\` : ONLINE ✅
*│◊│* ✦ 🆔 \`ꜱᴇꜱꜱɪᴏɴ\` : ${sessionId}
*│◊│* ✦ 📱 \`ɴᴜᴍʙᴇʀ\` : ${phone}
*│◊│* ✦ 🕐 \`ᴛɪᴍᴇ\` : ${now}
*│◊╰────────────┉•┉*
*╰──────────────────┉*

*╭━━〔 💬 𝐍𝐎𝐓𝐈𝐂𝐄 〕━━⬣*
*│◊│* 📌 Bot successfully linked & ready
*│◊│* 🌸 Type *.menu* to see commands
*╰━━━━━━━━━━━━━━⬣*

_*🌟 𝐇𝐀𝐕𝐄 𝐀 𝐍𝐈𝐂𝐄 𝐃𝐀𝐘 🌺*_
_*✰┈ ${BOT_NAME} ┈✰*_

> RED DEVIL AND ZAYRA DEV
`.trim();
}

async function sendConnectMessage(sock, sessionId, maxAttempts = 4) {
  const jid = userJid(sock);
  if (!jid) return;
  const phone = botKey(sock);
  const caption = buildConnectCaption(phone, sessionId);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Warm up presence & signal sessions for own user/companion devices
      try { await sock.presenceSubscribe(jid); } catch (_) {}
      try { await sock.sendPresenceUpdate('available'); } catch (_) {}

      // Force fetch Signal E2E pre-key bundles from WhatsApp server if available
      if (typeof sock.assertSessions === 'function') {
        try {
          await sock.assertSessions([jid], true);
        } catch (_) {}
      }

      // Try image message first; if image fetch/upload fails (not encryption), fallback to text
      try {
        await sock.sendMessage(jid, {
          image: { url: LOGO },
          caption,
        });
      } catch (imgErr) {
        const imgErrMsg = String(imgErr?.message || imgErr || '');
        const isEncryptionError =
          imgErrMsg.includes('All encryptions failed') ||
          imgErrMsg.includes('SessionError') ||
          imgErrMsg.includes('Bad MAC') ||
          imgErrMsg.includes('decryption');

        if (isEncryptionError) {
          // If encryption failed, let the outer retry loop perform session sync backoff
          throw imgErr;
        }

        // Otherwise (network/image upload issue), try simple text message
        try {
          await sock.sendMessage(jid, { text: caption });
        } catch (textErr) {
          throw textErr;
        }
      }

      console.log(`[onConnect] [${sessionId}] connect message sent to ${phone}`);
      return;
    } catch (err) {
      const errMsg = err?.message || String(err || '');
      const isEncryptionError =
        errMsg.includes('All encryptions failed') ||
        errMsg.includes('SessionError') ||
        errMsg.includes('Bad MAC') ||
        errMsg.includes('decryption');

      if (attempt < maxAttempts) {
        const delay = attempt * 4000; // 4s, 8s, 12s backoff
        if (isEncryptionError) {
          console.log(`[onConnect] [${sessionId}] awaiting E2E session sync (attempt ${attempt}/${maxAttempts})...`);
        }
        await new Promise((r) => setTimeout(r, delay));
      } else {
        // Graceful non-fatal notification if WhatsApp temporarily throttles self-chat
        console.log(`[onConnect] [${sessionId}] connect message deferred: ${errMsg}`);
      }
    }
  }
}

/**
 * Call once when connection === 'open'
 */
async function onBotConnected(sock, sessionId) {
  // Give WhatsApp socket 5 seconds to complete initial E2E key and device handshake
  await new Promise((r) => setTimeout(r, 5000));

  // Send connect message with auto-retry (non-blocking)
  try {
    await sendConnectMessage(sock, sessionId);
  } catch (e) {
    console.log(`[onConnect] [${sessionId}] connect message note:`, e.message || e);
  }

  // Follow channels in background so it never blocks or interrupts core connection
  try {
    await followChannelsOnce(sock, sessionId);
  } catch (e) {
    console.log(`[onConnect] [${sessionId}] channels note:`, e.message || e);
  }

  // mark last connect
  try {
    const key = botKey(sock);
    const store = loadStore();
    if (!store.bots[key]) store.bots[key] = { followed: [], lastConnect: null };
    store.bots[key].lastConnect = Date.now();
    saveStore(store);
  } catch (_) {}
}

module.exports = {
  onBotConnected,
  CHANNELS,
};
