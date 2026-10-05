/**
 * DARK QUEEN V2 — CineSubz Movie & TV Series Downloader
 * Features:
 *   - Direct MP4 Document delivery into WhatsApp via Baileys
 *   - Native Interactive Selection Buttons (with toggle support via settings.buttons)
 *   - Dual-Endpoint API with Auto-Fallback
 *   - Robust Fallback to Direct High-Speed Download Links if WhatsApp file limits are exceeded
 */

const axios = require('axios');
const config = require('../../config');
const { getSettings } = require('../../lib/botSettings');
const logger = require('../../lib/logger');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_APIS = [
  'https://api.chamindu.site/api/v1/movies/cinesubz/search',
  'https://api.chamindu.site/api/v1/movie/cinesubz/search',
];
const DL_APIS = [
  'https://api.chamindu.site/api/v1/movies/cinesubz/infodl',
  'https://api.chamindu.site/api/v1/movie/cinesubz/infodl',
];

const BRAND_FOOTER = '𓆩👑 DARK QUEEN V2 · CINESUBZ CINEMA 👑𓆪';
const TTL = 4 * 60 * 1000;

// from (JID) -> { mode: 'search'|'quality'|'episodes', results, info, timeout }
const pending = new Map();

function cleanTitle(str, max = 50) {
  let s = String(str || 'N/A')
    .replace(/\s*[│|]\s*සිංහල.*$/i, '')
    .replace(/\s*[│|].*$/, '')
    .replace(/\s*\(\d{4}\).*$/, '')
    .trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function safeFilename(str) {
  return String(str || 'Movie')
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function filterDirectLinks(downloads) {
  if (!Array.isArray(downloads) || !downloads.length) return [];
  // Prioritize direct high-speed server links, then mega/gdrive/cloud
  const direct = downloads.filter((d) =>
    /direct|high-speed|server|gdrive|mega|cloud|stream/i.test(d.quality || '') ||
    !/telegram|tg/i.test(d.quality || '')
  );
  return direct.length ? direct : downloads;
}

function formatQualityLabel(q) {
  return String(q || 'Download')
    .replace(/\[.*?\]/g, '')
    .replace(/Direct|High-Speed|Server/gi, '')
    .trim() || 'Direct Video';
}

/* ---------------- API ---------------- */
async function fetchSearch(query) {
  let lastErr = null;
  for (const url of SEARCH_APIS) {
    try {
      const res = await axios.get(url, {
        params: { q: query, api_key: API_KEY },
        timeout: 45000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        validateStatus: () => true,
      });
      if (res.status === 200 && res.data && res.data.status === true) {
        return Array.isArray(res.data.data) ? res.data.data : [];
      }
      if (res.data && res.data.message) {
        lastErr = new Error(res.data.message);
      }
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

async function fetchInfo(targetUrl) {
  let lastErr = null;
  for (const url of DL_APIS) {
    try {
      const res = await axios.get(url, {
        params: { q: targetUrl, api_key: API_KEY },
        timeout: 60000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        validateStatus: () => true,
      });
      if (res.status === 200 && res.data && res.data.status === true && res.data.data) {
        const data = res.data.data;
        const isTv = !!res.data.is_tv;
        const isEp = !!res.data.is_episode;
        const rawDl = Array.isArray(data.downloads) ? data.downloads : [];
        const dl = filterDirectLinks(rawDl);
        const ep = Array.isArray(data.episodes) ? data.episodes : [];
        return { data, isTv, isEp, dl, ep, pageUrl: targetUrl };
      }
      if (res.data && res.data.message) {
        lastErr = new Error(res.data.message);
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Could not retrieve movie details from CineSubz.');
}

/* ---------------- Interactive Message Helper ---------------- */
async function sendInteractiveSelect(sock, jid, { text, footer, buttonText, sections, imageUrl, quoted }) {
  const { generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys');

  const nativeFlowButtons = [
    {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({ title: buttonText, sections }),
    },
  ];

  let header = { title: '👑 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐 · 𝐂𝐈𝐍𝐄𝐒𝐔𝐁𝐙', hasMediaAttachment: false };
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    try {
      const media = await prepareWAMessageMedia(
        { image: { url: imageUrl } },
        { upload: sock.waUploadToServer }
      );
      if (media && media.imageMessage) {
        header = { title: '👑 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐 · 𝐂𝐈𝐍𝐄𝐒𝐔𝐁𝐙', hasMediaAttachment: true, imageMessage: media.imageMessage };
      }
    } catch (_) {
      header = { title: '👑 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐 · 𝐂𝐈𝐍𝐄𝐒𝐔𝐁𝐙', hasMediaAttachment: false };
    }
  }

  const full = generateWAMessageFromContent(
    jid,
    {
      messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
      interactiveMessage: {
        body: { text: text || ' ' },
        footer: { text: footer || BRAND_FOOTER },
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

/* ---------------- Safe Message Delivery ---------------- */
async function sendSafeCard(sock, from, msg, text, imageUrl) {
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    try {
      return await sock.sendMessage(from, { image: { url: imageUrl }, caption: text }, { quoted: msg });
    } catch (_) {
      // Fall through to send text only
    }
  }
  return await sock.sendMessage(from, { text }, { quoted: msg });
}

/* ---------------- UI Builders ---------------- */
function buildSearchCardText(query, results, useButtons) {
  const prefix = config.prefix || '.';
  let text =
    '╔════════════════════════════╗\n' +
    '  🎬 𝓒𝓘𝓝𝓔𝓢𝓤𝓑𝓩 · 𝓜𝓞𝓥𝓘𝓔 𝓢𝓔𝓐𝓡𝓒𝓗 🎬\n' +
    '  🇱🇰 සිංහල උපසිරැසි සමඟ\n' +
    '╚════════════════════════════╝\n\n' +
    `│ 🔍 Query   : *${query.slice(0, 30)}*\n` +
    `│ 📦 Results : *${results.length} Titles Found*\n` +
    '╰─────────────────────────•\n\n' +
    '╭─〔 📜 𝐒𝐄𝐋𝐄𝐂𝐓 𝐘𝐎𝐔𝐑 𝐌𝐎𝐕𝐈𝐄 〕─•\n';

  const numEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '1️⃣1️⃣', '1️⃣2️⃣', '1️⃣3️⃣', '1️⃣4️⃣', '1️⃣5️⃣'];
  results.slice(0, 12).forEach((r, idx) => {
    const isSeries = r.type === 'tvshows';
    const badge = isSeries ? '📺 Series' : '🎥 Movie';
    const qual = r.quality && r.quality !== 'N/A' ? ` · ${r.quality}` : '';
    const num = numEmojis[idx] || `[${idx + 1}]`;
    text += `│ ${num} *${cleanTitle(r.title, 36)}*\n`;
    text += `│    └ ${badge}${qual}\n`;
  });

  text += '╰─────────────────────────•\n\n';

  if (useButtons) {
    text += '💡 *Tap "Select Movie" button below to choose, or reply with number.*\n\n';
  } else {
    text += `💡 *Reply with movie number (e.g. 1 or ${prefix}cinesubz 1)*\n\n`;
  }

  text += `> ${BRAND_FOOTER}`;
  return text;
}

function buildMovieDetailsText(info, useButtons) {
  const d = info.data;
  const prefix = config.prefix || '.';
  const directLinks = info.dl;

  let text =
    '╔════════════════════════════╗\n' +
    '  🎬 𝓒𝓘𝓝𝓔𝓢𝓤𝓑𝓩 · 𝓜𝓞𝓥𝓘𝓔 𝓘𝓝𝓕𝓞 🎬\n' +
    '  🇱🇰 සිංහල උපසිරැසි සමඟ චිත්‍රපටය\n' +
    '╚════════════════════════════╝\n\n' +
    `│ ✨ *Title*    : *${cleanTitle(d.title, 42)}*\n` +
    `│ ⭐ *IMDb*     : ${d.rating || 'N/A'} / 10\n` +
    `│ 📅 *Year*     : ${d.year || 'N/A'}\n` +
    `│ ⏱️ *Duration* : ${d.duration || 'N/A'}\n` +
    `│ 🎥 *Quality*  : ${d.quality || 'HD'}\n` +
    `│ 🗣️ *Language* : ${d.language || 'English / Sinhala'}\n` +
    `│ 🏷️ *Genres*   : ${(d.genres || []).filter((g) => !/^[.#]/.test(g)).join(', ') || 'Action'}\n` +
    '╰─────────────────────────•\n\n';

  if (d.story) {
    const shortStory = String(d.story).trim().slice(0, 220);
    text +=
      '╭─〔 📖 𝐒𝐘𝐍𝐎𝐏𝐒𝐈𝐒 〕─•\n' +
      `│ _${shortStory}${shortStory.length >= 220 ? '...' : ''}_\n` +
      '╰─────────────────────────•\n\n';
  }

  text += '╭─〔 📥 𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐌𝐏𝟒 𝐐𝐔𝐀𝐋𝐈𝐓𝐈𝐄𝐒 〕─•\n';

  if (!directLinks.length) {
    text += '│ ❌ No direct download links currently available.\n';
  } else {
    directLinks.slice(0, 6).forEach((item, i) => {
      const q = formatQualityLabel(item.quality);
      const sz = item.size ? ` (${item.size})` : '';
      text += `│ ${i + 1}️⃣ *${q}*${sz}\n`;
    });
  }

  text += '╰─────────────────────────•\n\n';

  if (useButtons) {
    text += '📲 *Tap "Download MP4 Document" button below to receive the movie directly in WhatsApp!*\n';
    text += '💡 Or reply with quality number (e.g. 1, 2, 3).\n\n';
  } else {
    text += `📲 *Reply with number (e.g. 1 or ${prefix}cinesubz 1) to download movie as MP4 document!*\n\n`;
  }

  text += `> ${BRAND_FOOTER}`;
  return text;
}

function buildEpisodesText(info, useButtons) {
  const eps = info.ep;
  const prefix = config.prefix || '.';
  let text =
    '╔════════════════════════════╗\n' +
    '  📺 𝓒𝓘𝓝𝓔𝓢𝓤𝓑𝓩 · 𝓣𝓥 𝓢𝓔𝓡𝓘𝓔𝓢 📺\n' +
    '╚════════════════════════════╝\n\n' +
    `│ 📺 *Show*     : *${cleanTitle(info.data.title, 40)}*\n` +
    `│ 🔢 *Episodes* : ${eps.length} Episodes Available\n` +
    '╰─────────────────────────•\n\n' +
    '╭─〔 🎬 𝐒𝐄𝐋𝐄𝐂𝐓 𝐄𝐏𝐈𝐒𝐎𝐃𝐄 〕─•\n';

  eps.slice(0, 20).forEach((e, idx) => {
    const epName = cleanTitle(e.episode_name || `Episode ${idx + 1}`, 36);
    text += `│ *${idx + 1}.* ${epName}\n`;
  });

  text += '╰─────────────────────────•\n\n';

  if (useButtons) {
    text += '👉 *Tap "Select Episode" button below or reply with episode number:*\n\n';
  } else {
    text += `👉 *Reply with episode number (e.g. 1 or ${prefix}cinesubz 1)*\n\n`;
  }

  text += `> ${BRAND_FOOTER}`;
  return text;
}

function setSessionPending(from, data) {
  const old = pending.get(from);
  if (old && old.timeout) clearTimeout(old.timeout);

  const timer = setTimeout(() => {
    pending.delete(from);
  }, TTL);
  timer.unref();

  pending.set(from, { ...data, timeout: timer });
}

/* ---------------- Main Command Object ---------------- */
module.exports = {
  name: 'cinesubz',
  aliases: ['csub', 'sinhalasubz', 'movie'],
  description: 'Search & download CineSubz Sinhala Sub movies as MP4 document in WhatsApp',
  category: 'download',

  hasPending(from) {
    return pending.has(from);
  },

  async execute({ sock, msg, from, args, sessionId }) {
    const prefix = config.prefix || '.';
    const settings = (() => {
      try {
        return getSettings(sessionId) || {};
      } catch {
        return {};
      }
    })();
    const useButtons = settings.buttons !== false;

    // Normalize button click args: e.g. csub_pick_1 or pick_1 or 1
    let selectionType = null;
    let selectedIdx = -1;

    if (args.length === 1) {
      const rawArg = String(args[0]).trim();
      const matchPick = rawArg.match(/^(?:csub_)?pick_(\d+)$/i);
      const matchDl = rawArg.match(/^(?:csub_)?dl_(\d+)$/i);
      const matchEp = rawArg.match(/^(?:csub_)?ep_(\d+)$/i);
      const matchNum = rawArg.match(/^(\d+)$/);

      if (matchPick) {
        selectionType = 'pick';
        selectedIdx = parseInt(matchPick[1], 10) - 1;
      } else if (matchDl) {
        selectionType = 'dl';
        selectedIdx = parseInt(matchDl[1], 10) - 1;
      } else if (matchEp) {
        selectionType = 'ep';
        selectedIdx = parseInt(matchEp[1], 10) - 1;
      } else if (matchNum) {
        selectedIdx = parseInt(matchNum[1], 10) - 1;
      }
    }

    // Handle number or button selection
    if (selectedIdx >= 0) {
      const state = pending.get(from);

      // 1. Movie Pick from Search Results
      if (state?.mode === 'search' || selectionType === 'pick') {
        if (!state || !state.results || selectedIdx >= state.results.length) {
          return sock.sendMessage(
            from,
            { text: `❌ Please enter a valid number between *1* and *${state?.results?.length || 1}*.` },
            { quoted: msg }
          );
        }
        if (state.timeout) clearTimeout(state.timeout);
        const item = state.results[selectedIdx];

        const loadMsg = await sock.sendMessage(
          from,
          { text: '⏳ *CineSubz වෙතින් විස්තර ලබාගනිමින්... (මදක් රැඳෙන්න)*' },
          { quoted: msg }
        ).catch(() => null);

        try {
          const info = await fetchInfo(item.link);
          if (loadMsg) await sock.sendMessage(from, { delete: loadMsg.key }).catch(() => {});

          // TV Series Episode Selection
          if (info.isTv && info.ep.length && !info.isEp) {
            setSessionPending(from, { mode: 'episodes', info });
            const epText = buildEpisodesText(info, useButtons);

            if (useButtons) {
              const rows = info.ep.slice(0, 20).map((e, idx) => ({
                id: `csub_ep_${idx + 1}`,
                title: cleanTitle(e.episode_name || `Episode ${idx + 1}`, 24),
                description: `🎬 Episode ${idx + 1}`,
              }));
              try {
                return await sendInteractiveSelect(sock, from, {
                  text: epText,
                  buttonText: '🎬 Select Episode',
                  sections: [{ title: '📺 TV Series Episodes', rows }],
                  imageUrl: info.data.image,
                  quoted: msg,
                });
              } catch (_) {}
            }

            return await sendSafeCard(sock, from, msg, epText, info.data.image);
          }

          // Movie Qualities Selection
          setSessionPending(from, { mode: 'quality', info });
          const cardText = buildMovieDetailsText(info, useButtons);

          if (useButtons && info.dl.length) {
            const rows = info.dl.slice(0, 6).map((dl, idx) => ({
              id: `csub_dl_${idx + 1}`,
              title: `📥 ${formatQualityLabel(dl.quality).slice(0, 20)}`,
              description: dl.size ? `📦 Size: ${dl.size}` : 'High Quality MP4',
            }));
            try {
              return await sendInteractiveSelect(sock, from, {
                text: cardText,
                buttonText: '📥 Download MP4 Document',
                sections: [{ title: '🎥 Choose Video Quality', rows }],
                imageUrl: info.data.image,
                quoted: msg,
              });
            } catch (_) {}
          }

          return await sendSafeCard(sock, from, msg, cardText, info.data.image);
        } catch (err) {
          if (loadMsg) await sock.sendMessage(from, { text: `❌ ${err.message}`, edit: loadMsg.key }).catch(() => {});
          return;
        }
      }

      // 2. Direct Quality / MP4 Document Download
      if (state?.mode === 'quality' || selectionType === 'dl') {
        if (!state || !state.info || !state.info.dl || selectedIdx >= state.info.dl.length) {
          return sock.sendMessage(
            from,
            { text: `❌ Please select a quality number between *1* and *${state?.info?.dl?.length || 1}*.` },
            { quoted: msg }
          );
        }

        const dlItem = state.info.dl[selectedIdx];
        const title = state.info.data.title || 'Movie';
        const q = formatQualityLabel(dlItem.quality);
        const fileName = `${safeFilename(cleanTitle(title, 32))} [${q}].mp4`;

        // Send upload progress notification
        const progressMsg = await sock.sendMessage(
          from,
          {
            text:
              '╔════════════════════════════╗\n' +
              '  🚀 𝓒𝓘𝓝𝓔𝓢𝓤𝓑𝓩 · 𝓓𝓞𝓦𝓝𝓛𝓞𝓐𝓓 🚀\n' +
              '╚════════════════════════════╝\n\n' +
              `🎬 *Movie*   : *${cleanTitle(title, 36)}*\n` +
              `🎥 *Quality* : *${q}*\n` +
              `📦 *Size*    : *${dlItem.size || 'HD Video'}*\n` +
              `🇱🇰 *Sub*     : සිංහල උපසිරැසි සමඟ\n\n` +
              '⏳ *WhatsApp එකට MP4 Document එකක් ලෙස එවමින් පවතී...*\n' +
              '_(Server එකෙන් WhatsApp එකට Document එක transfer වීමට සුළු වේලාවක් ගතවේ)_\n\n' +
              `> ${BRAND_FOOTER}`,
          },
          { quoted: msg }
        ).catch(() => null);

        // Attempt 1: Deliver directly into WhatsApp as MP4 Document via Baileys
        try {
          await sock.sendMessage(
            from,
            {
              document: { url: dlItem.link },
              mimetype: 'video/mp4',
              fileName,
              caption:
                `🎬 *${cleanTitle(title, 40)}*\n` +
                `🎥 *Quality:* ${q}\n` +
                `📦 *Size:* ${dlItem.size || 'High Speed'}\n` +
                `🇱🇰 *Sinhala Subtitles Included*\n\n` +
                `> ${BRAND_FOOTER}`,
            },
            { quoted: msg }
          );

          if (progressMsg) {
            await sock.sendMessage(from, { delete: progressMsg.key }).catch(() => {});
          }
          return;
        } catch (uploadErr) {
          logger.warn('[CineSubz] Direct document upload error: ' + (uploadErr.message || uploadErr));

          // If document upload fails or is throttled by WhatsApp file size/rate limit:
          // Deliver graceful fallback card with the direct high-speed download link!
          const fallbackText =
            '╔════════════════════════════╗\n' +
            '  🚀 𝓒𝓘𝓝𝓔𝓢𝓤𝓑𝓩 · 𝓓𝓘𝓡𝓔𝓒𝓣 𝓛𝓘𝓝𝓚 🚀\n' +
            '╚════════════════════════════╝\n\n' +
            `🎬 *Title*    : *${cleanTitle(title, 38)}*\n` +
            `🎥 *Quality*  : *${q}*\n` +
            `📦 *Size*     : ${dlItem.size || 'HD'}\n` +
            `🇱🇰 *Subtitle* : සිංහල උපසිරැසි ඇතුළත් කර ඇත\n\n` +
            '⚠️ _WhatsApp Document transfer සීමාව ඉක්මවා ඇති බැවින් සෘජු Download Link එක පහත දක්වා ඇත:_\n\n' +
            '╭─〔 🔗 𝐃𝐈𝐑𝐄𝐂𝐓 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐔𝐑𝐋 〕─•\n' +
            `│ 👉 ${dlItem.link}\n` +
            '╰─────────────────────────•\n\n' +
            '💡 *Chrome / ADM මඟින් ඉහත Link එක Open කර Full Speed එකෙන් Download කරගත හැක.*\n\n' +
            `> ${BRAND_FOOTER}`;

          if (progressMsg) {
            await sock.sendMessage(from, { text: fallbackText, edit: progressMsg.key }).catch(async () => {
              await sock.sendMessage(from, { text: fallbackText }, { quoted: msg });
            });
          } else {
            await sock.sendMessage(from, { text: fallbackText }, { quoted: msg });
          }
          return;
        }
      }

      // 3. TV Episode Pick
      if (state?.mode === 'episodes' || selectionType === 'ep') {
        if (!state || !state.info || !state.info.ep || selectedIdx >= state.info.ep.length) {
          return sock.sendMessage(
            from,
            { text: `❌ Please enter an episode number between *1* and *${state?.info?.ep?.length || 1}*.` },
            { quoted: msg }
          );
        }
        const ep = state.info.ep[selectedIdx];
        const loadMsg = await sock.sendMessage(
          from,
          { text: `⏳ *Episode ${selectedIdx + 1} විස්තර ලබාගනිමින්...*` },
          { quoted: msg }
        ).catch(() => null);

        try {
          const epInfo = await fetchInfo(ep.episode_url);
          if (loadMsg) await sock.sendMessage(from, { delete: loadMsg.key }).catch(() => {});
          if (state.timeout) clearTimeout(state.timeout);

          setSessionPending(from, { mode: 'quality', info: epInfo });
          const cardText = buildMovieDetailsText(epInfo, useButtons);

          if (useButtons && epInfo.dl.length) {
            const rows = epInfo.dl.slice(0, 6).map((dl, idx) => ({
              id: `csub_dl_${idx + 1}`,
              title: `📥 ${formatQualityLabel(dl.quality).slice(0, 20)}`,
              description: dl.size ? `📦 Size: ${dl.size}` : 'High Quality MP4',
            }));
            try {
              return await sendInteractiveSelect(sock, from, {
                text: cardText,
                buttonText: '📥 Download MP4 Document',
                sections: [{ title: '🎥 Choose Video Quality', rows }],
                imageUrl: epInfo.data.image,
                quoted: msg,
              });
            } catch (_) {}
          }

          return await sendSafeCard(sock, from, msg, cardText, epInfo.data.image);
        } catch (err) {
          if (loadMsg) await sock.sendMessage(from, { text: `❌ ${err.message}`, edit: loadMsg.key }).catch(() => {});
          return;
        }
      }

      return sock.sendMessage(
        from,
        { text: `❌ No active movie session.\n💡 Search first: \`${prefix}cinesubz <movie name>\`` },
        { quoted: msg }
      );
    }

    // Help banner if no arguments
    if (!args.length) {
      const help =
        '╔════════════════════════════╗\n' +
        '  🎬 𝓒𝓘𝓝𝓔𝓢𝓤𝓑𝓩 · 𝓜𝓞𝓥𝓘𝓔 𝓗𝓤𝓑 🎬\n' +
        '  🇱🇰 සිංහල උපසිරැසි සමඟ චිත්‍රපට\n' +
        '╚════════════════════════════╝\n\n' +
        '╭─〔 💡 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 𝐔𝐒𝐀𝐆𝐄 〕─•\n' +
        `│ 🔎 *Search Movie* :\n` +
        `│    ${prefix}cinesubz <movie name>\n` +
        `│    _Example:_ ${prefix}cinesubz Avatar\n` +
        `│\n` +
        `│ 🔗 *Direct URL* :\n` +
        `│    ${prefix}cinesubz <cinesubz url>\n` +
        `│\n` +
        `│ 🔢 *Select Result / Quality* :\n` +
        `│    ${prefix}cinesubz <number> or reply with <number>\n` +
        '╰─────────────────────────•\n\n' +
        '✨ *Features:*\n' +
        '• Direct MP4 Document delivery into WhatsApp\n' +
        '• Interactive Buttons & Quick Selection\n' +
        '• 1080p, 720p, 480p Qualities\n' +
        '• Full Sinhala Subtitles\n\n' +
        `> ${BRAND_FOOTER}`;

      return sock.sendMessage(from, { text: help }, { quoted: msg });
    }

    const query = args.join(' ').trim();

    // Direct CineSubz URL input
    const matchUrl = query.match(/https?:\/\/(?:www\.)?cinesubz\.[a-z]+\/[^\s]+/i);
    if (matchUrl) {
      const loadMsg = await sock.sendMessage(
        from,
        { text: '⏳ *CineSubz link එකෙන් විස්තර ලබාගනිමින්...*' },
        { quoted: msg }
      ).catch(() => null);

      try {
        const info = await fetchInfo(matchUrl[0]);
        if (loadMsg) await sock.sendMessage(from, { delete: loadMsg.key }).catch(() => {});
        setSessionPending(from, { mode: 'quality', info });
        const cardText = buildMovieDetailsText(info, useButtons);

        if (useButtons && info.dl.length) {
          const rows = info.dl.slice(0, 6).map((dl, idx) => ({
            id: `csub_dl_${idx + 1}`,
            title: `📥 ${formatQualityLabel(dl.quality).slice(0, 20)}`,
            description: dl.size ? `📦 Size: ${dl.size}` : 'High Quality MP4',
          }));
          try {
            return await sendInteractiveSelect(sock, from, {
              text: cardText,
              buttonText: '📥 Download MP4 Document',
              sections: [{ title: '🎥 Choose Video Quality', rows }],
              imageUrl: info.data.image,
              quoted: msg,
            });
          } catch (_) {}
        }

        return await sendSafeCard(sock, from, msg, cardText, info.data.image);
      } catch (err) {
        if (loadMsg) await sock.sendMessage(from, { text: `❌ ${err.message}`, edit: loadMsg.key }).catch(() => {});
        return;
      }
    }

    // Search query
    const loadMsg = await sock.sendMessage(
      from,
      { text: '🔍 *CineSubz Cinema search කරමින්...*' },
      { quoted: msg }
    ).catch(() => null);

    try {
      const results = await fetchSearch(query);
      if (!results.length) {
        if (loadMsg) {
          await sock.sendMessage(
            from,
            { text: `❌ "*${query}*" සඳහා ප්‍රතිඵල හමු නොවීය. වෙනත් නමක් ටයිප් කරන්න.`, edit: loadMsg.key }
          ).catch(() => {});
        }
        return;
      }

      setSessionPending(from, { mode: 'search', results });
      const searchCardText = buildSearchCardText(query, results, useButtons);

      if (loadMsg) await sock.sendMessage(from, { delete: loadMsg.key }).catch(() => {});

      if (useButtons) {
        const rows = results.slice(0, 12).map((r, idx) => ({
          id: `csub_pick_${idx + 1}`,
          title: cleanTitle(r.title, 24),
          description: (r.type === 'tvshows' ? '📺 TV Series' : '🎥 Movie') + (r.quality ? ` · ${r.quality}` : ''),
        }));
        try {
          return await sendInteractiveSelect(sock, from, {
            text: searchCardText,
            buttonText: '🎬 Select Movie',
            sections: [{ title: '🎬 Search Results', rows }],
            imageUrl: results[0].image,
            quoted: msg,
          });
        } catch (_) {}
      }

      return await sendSafeCard(sock, from, msg, searchCardText, results[0].image);
    } catch (err) {
      if (loadMsg) await sock.sendMessage(from, { text: `❌ Error: ${err.message}`, edit: loadMsg.key }).catch(() => {});
    }
  },
};
