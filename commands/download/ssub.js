/**
 * DARK QUEEN V2 — SinhalaSub (Baiscope/Sub.lk) Downloader
 * Features:
 *   - Direct MP4 Document delivery into WhatsApp via Baileys
 *   - Native Interactive Selection Buttons (with toggle support via settings.buttons)
 *   - Instant Loading (no slow blocking HEAD probes)
 *   - Pixeldrain & High-Speed Direct Server Support
 */

const axios = require('axios');
const config = require('../../config');
const { getSettings } = require('../../lib/botSettings');
const logger = require('../../lib/logger');

const API_KEY = 'zan_FLUs8y9T_fcz7cgi12p';
const SEARCH_API = 'https://api.zanta-mini.store/api/sinhalasub/search';
const DL_API = 'https://api.zanta-mini.store/api/sinhalasub/dl';

const BRAND_FOOTER = '𓆩👑 DARK QUEEN V2 · SINHALASUB CINEMA 👑𓆪';
const TTL = 4 * 60 * 1000;

// from (JID) -> { mode: 'search'|'quality', results, details, qualities, timeout }
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

/* ---------------- API ---------------- */
async function searchMovies(query) {
  const res = await axios.get(SEARCH_API, {
    params: { apiKey: API_KEY, text: query },
    timeout: 45000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data || res.data.success === false) {
    throw new Error(res.data?.message || `Search HTTP ${res.status}`);
  }
  const results = Array.isArray(res.data.results)
    ? res.data.results
    : Array.isArray(res.data.result)
      ? res.data.result
      : [];
  return results
    .filter((r) => r && (r.url || r.link))
    .slice(0, 12)
    .map((r, i) => ({
      index: i + 1,
      title: (r.title || r.name || 'Untitled').trim(),
      url: r.url || r.link,
      thumbnail: (r.thumbnail || r.thumb || '').toString().trim() || null,
    }));
}

async function fetchDl(pageUrl) {
  const res = await axios.get(DL_API, {
    params: { apiKey: API_KEY, text: pageUrl },
    timeout: 60000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data || res.data.success === false) {
    throw new Error(res.data?.message || res.data?.error || `DL HTTP ${res.status}`);
  }
  const r = res.data.results || res.data.result || res.data.data || {};
  const links = Array.isArray(r.links) ? r.links : [];
  return {
    title: (r.title || '').trim(),
    rating: r.rating || 'N/A',
    thumbnail: (r.thumbnail || '').toString().trim() || null,
    links,
  };
}

function buildQualityList(links) {
  const pixel = [];
  const other = [];
  for (const l of links || []) {
    const url = l.direct_link || l.url || l.link || '';
    const host = String(l.quality || '');
    const sizeLabel = String(l.size || '');
    if (!url) continue;

    if (/pixeldrain/i.test(url) || /pixeldrain/i.test(host)) {
      pixel.push({
        host: 'Pixeldrain',
        label: sizeLabel || 'HD Video',
        url: url.includes('?download=1') ? url : url + '?download=1',
      });
    } else if (!/telegram/i.test(host) && !/telegram/i.test(url)) {
      other.push({
        host: host || 'Direct Server',
        label: sizeLabel || 'Direct MP4',
        url,
      });
    }
  }

  const chosen = pixel.length ? pixel : other;
  // Unique by label
  const seen = new Set();
  return chosen.filter((x) => {
    if (seen.has(x.label)) return false;
    seen.add(x.label);
    return true;
  });
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

  let header = { title: '👑 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐 · 𝐒𝐈𝐍𝐇𝐀𝐋𝐀𝐒𝐔𝐁', hasMediaAttachment: false };
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    try {
      const media = await prepareWAMessageMedia(
        { image: { url: imageUrl } },
        { upload: sock.waUploadToServer }
      );
      if (media && media.imageMessage) {
        header = { title: '👑 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐 · 𝐒𝐈𝐍𝐇𝐀𝐋𝐀𝐒𝐔𝐁', hasMediaAttachment: true, imageMessage: media.imageMessage };
      }
    } catch (_) {
      header = { title: '👑 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐 · 𝐒𝐈𝐍𝐇𝐀𝐋𝐀𝐒𝐔𝐁', hasMediaAttachment: false };
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
    } catch (_) {}
  }
  return await sock.sendMessage(from, { text }, { quoted: msg });
}

/* ---------------- UI Builders ---------------- */
function buildSearchCardText(query, results, useButtons) {
  const prefix = config.prefix || '.';
  let text =
    '╔════════════════════════════╗\n' +
    '  🎬 𝓢𝓘𝓝𝓗𝓐𝓛𝓐𝓢𝓤𝓑 · 𝓢𝓔𝓐𝓡𝓒𝓗 🎬\n' +
    '  🇱🇰 සිංහල උපසිරැසි සමඟ චිත්‍රපට\n' +
    '╚════════════════════════════╝\n\n' +
    `│ 🔍 Query   : *${query.slice(0, 30)}*\n` +
    `│ 📦 Results : *${results.length} Titles Found*\n` +
    '╰─────────────────────────•\n\n' +
    '╭─〔 📜 𝐒𝐄𝐋𝐄𝐂𝐓 𝐘𝐎𝐔𝐑 𝐌𝐎𝐕𝐈𝐄 〕─•\n';

  const numEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '1️⃣1️⃣', '1️⃣2️⃣'];
  results.slice(0, 12).forEach((r, idx) => {
    const num = numEmojis[idx] || `[${idx + 1}]`;
    text += `│ ${num} *${cleanTitle(r.title, 38)}*\n`;
  });

  text += '╰─────────────────────────•\n\n';

  if (useButtons) {
    text += '💡 *Tap "Select Movie" button below to choose, or reply with number.*\n\n';
  } else {
    text += `💡 *Reply with movie number (e.g. 1 or ${prefix}ssub 1)*\n\n`;
  }

  text += `> ${BRAND_FOOTER}`;
  return text;
}

function buildMovieDetailsText(details, qualities, useButtons) {
  const prefix = config.prefix || '.';

  let text =
    '╔════════════════════════════╗\n' +
    '  🎬 𝓢𝓘𝓝𝓗𝓐𝓛𝓐𝓢𝓤𝓑 · 𝓘𝓝𝓕𝓞 🎬\n' +
    '  🇱🇰 සිංහල උපසිරැසි සමඟ චිත්‍රපටය\n' +
    '╚════════════════════════════╝\n\n' +
    `│ ✨ *Title*    : *${cleanTitle(details.title, 42)}*\n` +
    `│ ⭐ *Rating*   : ${details.rating || 'N/A'}\n` +
    `│ 🇱🇰 *Subtitle* : සිංහල උපසිරැසි ඇතුළත් කර ඇත\n` +
    '╰─────────────────────────•\n\n' +
    '╭─〔 📥 𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐌𝐏𝟒 𝐐𝐔𝐀𝐋𝐈𝐓𝐈𝐄𝐒 〕─•\n';

  if (!qualities.length) {
    text += '│ ❌ No direct download links currently available.\n';
  } else {
    qualities.slice(0, 6).forEach((item, i) => {
      text += `│ ${i + 1}️⃣ *${item.label}* (${item.host})\n`;
    });
  }

  text += '╰─────────────────────────•\n\n';

  if (useButtons) {
    text += '📲 *Tap "Download MP4 Document" button below to receive the movie directly in WhatsApp!*\n';
    text += '💡 Or reply with quality number (e.g. 1, 2, 3).\n\n';
  } else {
    text += `📲 *Reply with number (e.g. 1 or ${prefix}ssub 1) to download movie as MP4 document!*\n\n`;
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
  name: 'ssub',
  aliases: ['sinhalasub', 'sublk', 'sinhalasubzlk'],
  description: 'Search & download SinhalaSub movies as MP4 document in WhatsApp',
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

    // Normalize button click args: e.g. ssub_pick_1 or ssub_dl_1 or 1
    let selectionType = null;
    let selectedIdx = -1;

    if (args.length === 1) {
      const rawArg = String(args[0]).trim();
      const matchPick = rawArg.match(/^(?:ssub_)?pick_(\d+)$/i);
      const matchDl = rawArg.match(/^(?:ssub_)?dl_(\d+)$/i);
      const matchNum = rawArg.match(/^(\d+)$/);

      if (matchPick) {
        selectionType = 'pick';
        selectedIdx = parseInt(matchPick[1], 10) - 1;
      } else if (matchDl) {
        selectionType = 'dl';
        selectedIdx = parseInt(matchDl[1], 10) - 1;
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
          { text: '⏳ *SinhalaSub වෙතින් විස්තර ලබාගනිමින්... (මදක් රැඳෙන්න)*' },
          { quoted: msg }
        ).catch(() => null);

        try {
          const details = await fetchDl(item.url);
          if (loadMsg) await sock.sendMessage(from, { delete: loadMsg.key }).catch(() => {});

          const qualities = buildQualityList(details.links);
          setSessionPending(from, { mode: 'quality', details, qualities });
          const cardText = buildMovieDetailsText(details, qualities, useButtons);

          if (useButtons && qualities.length) {
            const rows = qualities.slice(0, 6).map((q, idx) => ({
              id: `ssub_dl_${idx + 1}`,
              title: `📥 ${q.label.slice(0, 20)}`,
              description: `⚡ High Speed (${q.host})`,
            }));
            try {
              return await sendInteractiveSelect(sock, from, {
                text: cardText,
                buttonText: '📥 Download MP4 Document',
                sections: [{ title: '🎥 Choose Video Quality', rows }],
                imageUrl: details.thumbnail || item.thumbnail,
                quoted: msg,
              });
            } catch (_) {}
          }

          return await sendSafeCard(sock, from, msg, cardText, details.thumbnail || item.thumbnail);
        } catch (err) {
          if (loadMsg) await sock.sendMessage(from, { text: `❌ ${err.message}`, edit: loadMsg.key }).catch(() => {});
          return;
        }
      }

      // 2. Direct Quality / MP4 Document Download
      if (state?.mode === 'quality' || selectionType === 'dl') {
        if (!state || !state.qualities || selectedIdx >= state.qualities.length) {
          return sock.sendMessage(
            from,
            { text: `❌ Please select a quality number between *1* and *${state?.qualities?.length || 1}*.` },
            { quoted: msg }
          );
        }

        const dlItem = state.qualities[selectedIdx];
        const title = state.details?.title || 'SinhalaSub Movie';
        const q = dlItem.label;
        const fileName = `${safeFilename(cleanTitle(title, 32))} [${q}].mp4`;

        // Send upload progress notification
        const progressMsg = await sock.sendMessage(
          from,
          {
            text:
              '╔════════════════════════════╗\n' +
              '  🚀 𝓢𝓘𝓝𝓗𝓐𝓛𝓐𝓢𝓤𝓑 · 𝓓𝓞𝓦𝓝𝓛𝓞𝓐𝓓 🚀\n' +
              '╚════════════════════════════╝\n\n' +
              `🎬 *Movie*   : *${cleanTitle(title, 36)}*\n` +
              `🎥 *Quality* : *${q}*\n` +
              `🇱🇰 *Sub*     : සිංහල උපසිරැසි සමඟ\n\n` +
              '⏳ *WhatsApp එකට MP4 Document එකක් ලෙස එවමින් පවතී...*\n' +
              '_(Server එකෙන් WhatsApp එකට Document එක transfer වීමට සුළු වේලාවක් ගතවේ)_\n\n' +
              `> ${BRAND_FOOTER}`,
          },
          { quoted: msg }
        ).catch(() => null);

        // Deliver directly into WhatsApp as MP4 Document via Baileys
        try {
          await sock.sendMessage(
            from,
            {
              document: { url: dlItem.url },
              mimetype: 'video/mp4',
              fileName,
              caption:
                `🎬 *${cleanTitle(title, 40)}*\n` +
                `🎥 *Quality:* ${q}\n` +
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
          logger.warn('[SinhalaSub] Direct document upload error: ' + (uploadErr.message || uploadErr));

          const fallbackText =
            '╔════════════════════════════╗\n' +
            '  🚀 𝓢𝓘𝓝𝓗𝓐𝓛𝓐𝓢𝓤𝓑 · 𝓓𝓘𝓡𝓔𝓒𝓣 𝓛𝓘𝓝𝓚 🚀\n' +
            '╚════════════════════════════╝\n\n' +
            `🎬 *Title*    : *${cleanTitle(title, 38)}*\n` +
            `🎥 *Quality*  : *${q}*\n` +
            `🇱🇰 *Subtitle* : සිංහල උපසිරැසි ඇතුළත් කර ඇත\n\n` +
            '⚠️ _WhatsApp Document transfer සීමාව ඉක්මවා ඇති බැවින් සෘජු Download Link එක පහත දක්වා ඇත:_\n\n' +
            '╭─〔 🔗 𝐃𝐈𝐑𝐄𝐂𝐓 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐔𝐑𝐋 〕─•\n' +
            `│ 👉 ${dlItem.url}\n` +
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

      return sock.sendMessage(
        from,
        { text: `❌ No active movie session.\n💡 Search first: \`${prefix}ssub <movie name>\`` },
        { quoted: msg }
      );
    }

    // Help banner if no arguments
    if (!args.length) {
      const help =
        '╔════════════════════════════╗\n' +
        '  🎬 𝓢𝓘𝓝𝓗𝓐𝓛𝓐𝓢𝓤𝓑 · 𝓗𝓤𝓑 🎬\n' +
        '  🇱🇰 සිංහල උපසිරැසි සමඟ චිත්‍රපට\n' +
        '╚════════════════════════════╝\n\n' +
        '╭─〔 💡 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 𝐔𝐒𝐀𝐆𝐄 〕─•\n' +
        `│ 🔎 *Search Movie* :\n` +
        `│    ${prefix}ssub <movie name>\n` +
        `│    _Example:_ ${prefix}ssub Avatar\n` +
        `│\n` +
        `│ 🔗 *Direct URL* :\n` +
        `│    ${prefix}ssub <sinhalasub url>\n` +
        `│\n` +
        `│ 🔢 *Select Result / Quality* :\n` +
        `│    ${prefix}ssub <number> or reply with <number>\n` +
        '╰─────────────────────────•\n\n' +
        '✨ *Features:*\n' +
        '• Direct MP4 Document delivery into WhatsApp\n' +
        '• Interactive Buttons & Quick Selection\n' +
        '• Pixeldrain High-Speed Cloud Downloads\n' +
        '• Full Sinhala Subtitles\n\n' +
        `> ${BRAND_FOOTER}`;

      return sock.sendMessage(from, { text: help }, { quoted: msg });
    }

    const query = args.join(' ').trim();

    // Direct URL input
    const matchUrl = query.match(/https?:\/\/(?:www\.)?sinhalasub\.lk\/[^\s]+/i);
    if (matchUrl) {
      const loadMsg = await sock.sendMessage(
        from,
        { text: '⏳ *SinhalaSub link එකෙන් විස්තර ලබාගනිමින්...*' },
        { quoted: msg }
      ).catch(() => null);

      try {
        const details = await fetchDl(matchUrl[0]);
        if (loadMsg) await sock.sendMessage(from, { delete: loadMsg.key }).catch(() => {});
        const qualities = buildQualityList(details.links);
        setSessionPending(from, { mode: 'quality', details, qualities });
        const cardText = buildMovieDetailsText(details, qualities, useButtons);

        if (useButtons && qualities.length) {
          const rows = qualities.slice(0, 6).map((q, idx) => ({
            id: `ssub_dl_${idx + 1}`,
            title: `📥 ${q.label.slice(0, 20)}`,
            description: `⚡ High Speed (${q.host})`,
          }));
          try {
            return await sendInteractiveSelect(sock, from, {
              text: cardText,
              buttonText: '📥 Download MP4 Document',
              sections: [{ title: '🎥 Choose Video Quality', rows }],
              imageUrl: details.thumbnail,
              quoted: msg,
            });
          } catch (_) {}
        }

        return await sendSafeCard(sock, from, msg, cardText, details.thumbnail);
      } catch (err) {
        if (loadMsg) await sock.sendMessage(from, { text: `❌ ${err.message}`, edit: loadMsg.key }).catch(() => {});
        return;
      }
    }

    // Search query
    const loadMsg = await sock.sendMessage(
      from,
      { text: '🔍 *SinhalaSub Cinema search කරමින්...*' },
      { quoted: msg }
    ).catch(() => null);

    try {
      const results = await searchMovies(query);
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
          id: `ssub_pick_${idx + 1}`,
          title: cleanTitle(r.title, 24),
          description: `🇱🇰 Sinhala Subtitle Movie`,
        }));
        try {
          return await sendInteractiveSelect(sock, from, {
            text: searchCardText,
            buttonText: '🎬 Select Movie',
            sections: [{ title: '🎬 Search Results', rows }],
            imageUrl: results[0].thumbnail,
            quoted: msg,
          });
        } catch (_) {}
      }

      return await sendSafeCard(sock, from, msg, searchCardText, results[0].thumbnail);
    } catch (err) {
      if (loadMsg) await sock.sendMessage(from, { text: `❌ Error: ${err.message}`, edit: loadMsg.key }).catch(() => {});
    }
  },
};
