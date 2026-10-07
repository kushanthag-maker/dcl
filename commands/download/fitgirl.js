/**
 * DARK QUEEN V2 — FitGirl PC Game Repacks Downloader
 * Features:
 *   - Search FitGirl Repacks database
 *   - Game Overview with Repack Size, Original Size, Genres, Poster
 *   - RAR Parts Selection (e.g. Part 1, Part 2...) with high-speed direct resolver
 *   - Direct Magnet link for full 1-click torrent download
 *   - Document delivery into WhatsApp if supported, with graceful high-speed direct link fallback
 *   - Native Interactive Selection Buttons (with toggle support via settings.buttons)
 *   - 100% Number Reply Support (reply 1, 2, 3...) in both Button and Non-Button modes
 */

const axios = require('axios');
const config = require('../../config');
const { getSettings } = require('../../lib/botSettings');
const logger = require('../../lib/logger');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/v1/games/fitgirl/search';
const INFO_API = 'https://api.chamindu.site/api/games/fitgirl/infodl';
const INFO_API_FALLBACK = 'https://api.chamindu.site/api/v1/games/fitgirl/infodl';
const DL_API = 'https://api.chamindu.site/api/v1/games/fitgirl/download';

const BRAND_FOOTER = '𓆩👑 DARK QUEEN V2 · FITGIRL REPACKS 👑𓆪';
const TTL = 5 * 60 * 1000;

// from (JID) -> { mode: 'search'|'overview'|'parts', results, info, parts, page, timeout }
const pending = new Map();

function cleanTitle(str, max = 50) {
  let s = String(str || 'N/A')
    .replace(/\s*[–-]\s*v[\d.]+.*/i, '')
    .replace(/\s*\(\d{4}\).*/, '')
    .trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function safeFilename(str) {
  return String(str || 'Game')
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, '_')
    .trim();
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

/* ---------------- API Functions ---------------- */

async function searchGames(query) {
  const res = await axios.get(SEARCH_API, {
    params: { q: query, api_key: API_KEY },
    timeout: 45000,
    headers: {
      'X-API-Key': API_KEY,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Accept: 'application/json',
    },
    validateStatus: () => true,
  });

  if (res.status === 200 && res.data && res.data.status === true) {
    return Array.isArray(res.data.data) ? res.data.data : [];
  }
  if (res.data && res.data.message) {
    throw new Error(res.data.message);
  }
  return [];
}

async function fetchGameInfo(gameUrl) {
  let lastErr = null;
  for (const url of [INFO_API_FALLBACK, INFO_API]) {
    try {
      const res = await axios.get(url, {
        params: { q: gameUrl, api_key: API_KEY },
        timeout: 60000,
        headers: {
          'X-API-Key': API_KEY,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          Accept: 'application/json',
        },
        validateStatus: () => true,
      });

      if (res.status === 200 && res.data && res.data.status === true && res.data.data) {
        return res.data.data;
      }
      if (res.data && res.data.message) {
        lastErr = new Error(res.data.message);
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Could not retrieve game details from FitGirl.');
}

async function resolveDownload(partUrl) {
  const res = await axios.get(DL_API, {
    params: { q: partUrl, api_key: API_KEY },
    timeout: 60000,
    headers: {
      'X-API-Key': API_KEY,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Accept: 'application/json',
    },
    validateStatus: () => true,
  });

  if (res.status === 200 && res.data && res.data.status === true) {
    return res.data;
  }
  if (res.data && res.data.message) {
    throw new Error(res.data.message);
  }
  throw new Error('Could not resolve direct download link.');
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

  let header = { title: '🎮 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐 · 𝐅𝐈𝐓𝐆𝐈𝐑𝐋', hasMediaAttachment: false };
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    try {
      const media = await prepareWAMessageMedia(
        { image: { url: imageUrl } },
        { upload: sock.waUploadToServer }
      );
      if (media && media.imageMessage) {
        header = { title: '🎮 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐 · 𝐅𝐈𝐓𝐆𝐈𝐑𝐋', hasMediaAttachment: true, imageMessage: media.imageMessage };
      }
    } catch (_) {
      header = { title: '🎮 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐 · 𝐅𝐈𝐓𝐆𝐈𝐑𝐋', hasMediaAttachment: false };
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

async function sendSafeCard(sock, from, msg, text, imageUrl) {
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    try {
      return await sock.sendMessage(from, { image: { url: imageUrl }, caption: text }, { quoted: msg });
    } catch (_) {}
  }
  return await sock.sendMessage(from, { text }, { quoted: msg });
}

/* ---------------- Card Builders ---------------- */

function buildSearchCard(query, results, useButtons) {
  let text =
    '╔════════════════════════════╗\n' +
    '  🎮 𝓕𝓘𝓣𝓖𝓘𝓡𝓛 · 𝓖𝓐𝓜𝓔 𝓢𝓔𝓐𝓡𝓒𝓗 🎮\n' +
    '  🔥 𝐏𝐂 𝐆𝐀𝐌𝐄 𝐑𝐄𝐏𝐀𝐂𝐊𝐒 𝐃𝐀𝐓𝐀𝐁𝐀𝐒𝐄 🔥\n' +
    '╚════════════════════════════╝\n\n' +
    `│ 🔍 Query   : *${query}*\n` +
    `│ 📦 Results : *${results.length} Repacks Found*\n` +
    '╰─────────────────────────•\n\n' +
    '╭─〔 📜 𝐒𝐄𝐋𝐄𝐂𝐓 𝐘𝐎𝐔𝐑 𝐆𝐀𝐌𝐄 〕─•\n';

  const limit = Math.min(results.length, 12);
  for (let i = 0; i < limit; i++) {
    const r = results[i];
    const numEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '1️⃣1️⃣', '1️⃣2️⃣'][i] || `${i + 1}.`;
    text += `│ ${numEmoji} *${cleanTitle(r.title, 34)}*\n`;
    if (r.date) text += `│    └ 📅 ${r.date}\n`;
  }

  text +=
    '╰─────────────────────────•\n\n';

  if (useButtons) {
    text += '💡 *Tap "Select Game" button below to choose, or reply with number.*\n\n';
  } else {
    text += '💡 *Reply with game number (e.g. 1 or 2) to view parts & downloads.*\n\n';
  }

  text += `> ${BRAND_FOOTER}`;
  return text;
}

function organizeDownloads(downloads) {
  const dls = Array.isArray(downloads) ? downloads : [];
  let magnet = null;
  let torrent = null;
  const parts = [];

  for (const d of dls) {
    const name = String(d.name || d.title || '');
    const url = String(d.link || d.url || '');
    const hoster = String(d.hoster || '');

    if (url.startsWith('magnet:')) {
      if (!magnet) magnet = { name: 'Direct Magnet Download', url };
    } else if (/torrent/i.test(name) || /\.torrent$/i.test(url) || hoster === '1337x' || hoster === 'RuTor') {
      if (!torrent) torrent = { name: name || 'Torrent File', url };
    } else if (/part\d+/i.test(name) || /part\d+/i.test(url) || /\.rar/i.test(name) || /\.rar/i.test(url)) {
      // Extract part number if any
      const matchPart = name.match(/part(\d+)/i) || url.match(/part(\d+)/i);
      const partNum = matchPart ? parseInt(matchPart[1], 10) : parts.length + 1;
      const isResolvable = /filekeeper|1fichier/i.test(hoster) || /filekeeper\.net|1fichier\.com/i.test(url);
      parts.push({
        name,
        url,
        hoster: hoster || (url.includes('filekeeper') ? 'FileKeeper' : 'Direct Host'),
        partNum,
        isResolvable,
      });
    }
  }

  // Deduplicate and prioritize resolvable parts (e.g. FileKeeper)
  const uniquePartsMap = new Map();
  for (const p of parts) {
    const key = p.partNum;
    if (!uniquePartsMap.has(key) || (!uniquePartsMap.get(key).isResolvable && p.isResolvable)) {
      uniquePartsMap.set(key, p);
    }
  }

  const sortedParts = Array.from(uniquePartsMap.values()).sort((a, b) => a.partNum - b.partNum);
  return { magnet, torrent, parts: sortedParts };
}

function buildGameOverviewCard(info, organized, useButtons) {
  const { magnet, torrent, parts } = organized;
  let text =
    '╔════════════════════════════╗\n' +
    '  🎮 𝓕𝓘𝓣𝓖𝓘𝓡𝓛 · 𝓖𝓐𝓜𝓔 𝓘𝓝𝓕𝓞 🎮\n' +
    '╚════════════════════════════╝\n\n' +
    `🎮 *Game*        : *${cleanTitle(info.title, 36)}*\n` +
    `📦 *Repack Size* : *${info.repack_size || 'N/A'}*\n` +
    `💾 *Original*    : ${info.original_size || 'N/A'}\n` +
    `🏷️ *Genres*      : ${info.genres || 'Action / PC Game'}\n` +
    `🧩 *Total Parts* : *${parts.length > 0 ? parts.length + ' RAR Parts (~500MB each)' : 'Direct Download'}*\n\n` +
    '╭─〔 📥 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐎𝐏𝐓𝐈𝐎𝐍𝐒 〕─•\n';

  if (magnet) {
    text += '│ 🧲 *Option M* : Direct Magnet (Torrent Client)\n';
  }
  if (parts.length > 0) {
    const previewCount = Math.min(parts.length, 10);
    text += `│ 🧩 *Parts List (1 - ${parts.length})* :\n`;
    for (let i = 0; i < previewCount; i++) {
      const p = parts[i];
      text += `│   └ *Part ${p.partNum}* (${p.hoster})\n`;
    }
    if (parts.length > previewCount) {
      text += `│   └ _...and ${parts.length - previewCount} more parts available_\n`;
    }
  }
  text += '╰─────────────────────────•\n\n';

  if (useButtons) {
    text +=
      '💡 *Tap "Select Part / Magnet" button below to download*\n' +
      '🔢 *Or reply with Part number (e.g. 1 for Part 1, 2 for Part 2)*\n' +
      '🧲 *Or reply "m" or "magnet" for full Torrent Magnet Link*\n\n';
  } else {
    text +=
      '💡 *Reply with Part number (e.g. 1 for Part 1, 2 for Part 2) to download as RAR document!*\n' +
      '🧲 *Or reply "m" or "magnet" to get the full Torrent Magnet Link.*\n\n';
  }

  text += `> ${BRAND_FOOTER}`;
  return text;
}

/* ---------------- Main Command Object ---------------- */

module.exports = {
  name: 'fitgirl',
  aliases: ['fit', 'repack', 'pcgame', 'pcgames', 'fitgirlrepack'],
  description: 'Search & download FitGirl PC game repacks & RAR parts in WhatsApp',
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

    // Normalize button click args: e.g. fg_pick_1 or fg_part_1 or fg_mag or number
    let selectionType = null;
    let selectedIdx = -1;

    if (args.length === 1) {
      const rawArg = String(args[0]).trim();
      const matchPick = rawArg.match(/^(?:fg_)?pick_(\d+)$/i);
      const matchPart = rawArg.match(/^(?:fg_)?part_(\d+)$/i);
      const matchMag = /^(?:fg_)?mag(?:net)?$/i.test(rawArg);
      const matchNum = rawArg.match(/^(\d+)$/);

      if (matchPick) {
        selectionType = 'pick';
        selectedIdx = parseInt(matchPick[1], 10) - 1;
      } else if (matchPart) {
        selectionType = 'part';
        selectedIdx = parseInt(matchPart[1], 10); // Part number 1-based
      } else if (matchMag) {
        selectionType = 'magnet';
      } else if (matchNum) {
        selectedIdx = parseInt(matchNum[1], 10);
      }
    }

    // Magnet shortcut
    if (String(args[0] || '').toLowerCase() === 'magnet' || String(args[0] || '').toLowerCase() === 'mag' || String(args[0] || '').toLowerCase() === 'm') {
      selectionType = 'magnet';
    }

    // Handle number or button selection
    if (selectionType || selectedIdx >= 0) {
      const state = pending.get(from);

      // 1. Game Selection from Search Results
      if (state?.mode === 'search' || selectionType === 'pick') {
        const pickIndex = selectionType === 'pick' ? selectedIdx : selectedIdx - 1;
        if (!state || !state.results || pickIndex < 0 || pickIndex >= state.results.length) {
          return sock.sendMessage(
            from,
            { text: `❌ Please enter a valid number between *1* and *${state?.results?.length || 1}*.` },
            { quoted: msg }
          );
        }

        const game = state.results[pickIndex];
        const loadMsg = await sock.sendMessage(
          from,
          { text: '⏳ *FitGirl වෙතින් Game Repack විස්තර සහ Parts ලබාගනිමින්...*' },
          { quoted: msg }
        ).catch(() => null);

        try {
          const info = await fetchGameInfo(game.link);
          const organized = organizeDownloads(info.downloads);

          setSessionPending(from, { mode: 'overview', info, organized });
          if (loadMsg) await sock.sendMessage(from, { delete: loadMsg.key }).catch(() => {});

          const overviewText = buildGameOverviewCard(info, organized, useButtons);

          if (useButtons) {
            const rows = [];
            if (organized.magnet) {
              rows.push({
                id: 'fg_mag',
                title: '🧲 Torrent Magnet Link',
                description: 'Instant 1-Click Torrent Download',
              });
            }

            const maxRows = Math.min(organized.parts.length, 19);
            for (let i = 0; i < maxRows; i++) {
              const p = organized.parts[i];
              rows.push({
                id: `fg_part_${p.partNum}`,
                title: `🧩 Part ${p.partNum} (${p.hoster})`,
                description: `Download Part ${p.partNum} (~500MB RAR)`,
              });
            }

            try {
              return await sendInteractiveSelect(sock, from, {
                text: overviewText,
                buttonText: '🎮 Select Part / Magnet',
                sections: [{ title: '📥 Game Parts & Magnet', rows }],
                imageUrl: info.image,
                quoted: msg,
              });
            } catch (_) {}
          }

          return await sendSafeCard(sock, from, msg, overviewText, info.image);
        } catch (err) {
          if (loadMsg) {
            await sock.sendMessage(from, { text: `❌ Error: ${err.message}`, edit: loadMsg.key }).catch(() => {});
          }
          return;
        }
      }

      // 2. Magnet Link Request
      if (selectionType === 'magnet') {
        if (!state || !state.organized || !state.organized.magnet) {
          return sock.sendMessage(
            from,
            { text: '❌ No active game session or Magnet link found for this repack.\n💡 Search first: `.fitgirl <game name>`' },
            { quoted: msg }
          );
        }

        const mag = state.organized.magnet;
        const title = cleanTitle(state.info?.title || 'Game', 40);
        const magnetText =
          '╔════════════════════════════╗\n' +
          '  🧲 𝓕𝓘𝓣𝓖𝓘𝓡𝓛 · 𝓜𝓐𝓖𝓝𝓔𝓣 𝓛𝓘𝓝𝓚 🧲\n' +
          '╚════════════════════════════╝\n\n' +
          `🎮 *Game* : *${title}*\n` +
          `📦 *Repack Size* : ${state.info?.repack_size || 'N/A'}\n\n` +
          '╭─〔 🧲 𝐂𝐎𝐏𝐘𝐀𝐁𝐋𝐄 𝐌𝐀𝐆𝐍𝐄𝐓 𝐔𝐑𝐈 〕─•\n' +
          `\`\`\`${mag.url}\`\`\`\n` +
          '╰─────────────────────────•\n\n' +
          '💡 *Tap above to copy and open in uTorrent / BitTorrent / Flud!*\n\n' +
          `> ${BRAND_FOOTER}`;

        return await sock.sendMessage(from, { text: magnetText }, { quoted: msg });
      }

      // 3. RAR Part Selection (Part 1, Part 2...)
      if (state?.mode === 'overview' || selectionType === 'part') {
        const partNum = selectedIdx; // 1-based part number
        if (!state || !state.organized || !state.organized.parts || !state.organized.parts.length) {
          return sock.sendMessage(
            from,
            { text: `❌ No active game parts session.\n💡 Search first: \`${prefix}fitgirl <game name>\`` },
            { quoted: msg }
          );
        }

        const partItem = state.organized.parts.find((p) => p.partNum === partNum) || state.organized.parts[partNum - 1];
        if (!partItem) {
          return sock.sendMessage(
            from,
            { text: `❌ Invalid Part number. Available parts: *1* to *${state.organized.parts.length}*.` },
            { quoted: msg }
          );
        }

        const gameTitle = cleanTitle(state.info?.title || 'PC Game', 36);
        const fileName = `${safeFilename(gameTitle)}_Part${String(partItem.partNum).padStart(3, '0')}.rar`;

        const progressMsg = await sock.sendMessage(
          from,
          {
            text:
              '╔════════════════════════════╗\n' +
              '  🚀 𝓕𝓘𝓣𝓖𝓘𝓡𝓛 · 𝓟𝓐𝓡𝓣 𝓓𝓞𝓦𝓝𝓛𝓞𝓐𝓓 🚀\n' +
              '╚════════════════════════════╝\n\n' +
              `🎮 *Game* : *${gameTitle}*\n` +
              `🧩 *Part* : *Part ${partItem.partNum}*\n` +
              `📁 *File* : \`${fileName}\`\n\n` +
              '⏳ *Direct High-Speed Link එක ලබාගනිමින් WhatsApp එකට Document එකක් ලෙස එවමින් පවතී...*\n\n' +
              `> ${BRAND_FOOTER}`,
          },
          { quoted: msg }
        ).catch(() => null);

        let directDownloadUrl = partItem.url;
        let resolvedSize = '500.0 MB';
        let resolvedFileName = fileName;

        // Try to resolve via direct download API if FileKeeper or 1Fichier
        if (partItem.isResolvable) {
          try {
            const dlData = await resolveDownload(partItem.url);
            if (dlData.download_link || dlData.direct_link) {
              directDownloadUrl = dlData.direct_link || dlData.download_link;
            }
            if (dlData.size) resolvedSize = dlData.size;
            if (dlData.filename) resolvedFileName = dlData.filename;
          } catch (resErr) {
            logger.warn('[FitGirl] Resolve API fallback to direct link: ' + resErr.message);
          }
        }

        // Attempt 1: Deliver directly into WhatsApp as Document via Baileys
        try {
          await sock.sendMessage(
            from,
            {
              document: { url: directDownloadUrl },
              mimetype: 'application/x-rar-compressed',
              fileName: resolvedFileName,
              caption:
                `🎮 *${gameTitle}*\n` +
                `🧩 *Part ${partItem.partNum}* (${resolvedSize})\n` +
                `📁 \`${resolvedFileName}\`\n\n` +
                `> ${BRAND_FOOTER}`,
            },
            { quoted: msg }
          );

          if (progressMsg) {
            await sock.sendMessage(from, { delete: progressMsg.key }).catch(() => {});
          }
          return;
        } catch (docErr) {
          logger.warn('[FitGirl] Document upload error: ' + (docErr.message || docErr));

          // If document upload fails or exceeds WhatsApp limit: Deliver graceful high-speed direct link card
          const dlCard =
            '╔════════════════════════════╗\n' +
            '  🚀 𝓕𝓘𝓣𝓖𝓘𝓡𝓛 · 𝓓𝓘𝓡𝓔𝓒𝓣 𝓛𝓘𝓝𝓚 🚀\n' +
            '╚════════════════════════════╝\n\n' +
            `🎮 *Game* : *${gameTitle}*\n` +
            `🧩 *Part* : *Part ${partItem.partNum}*\n` +
            `📁 *File* : \`${resolvedFileName}\`\n` +
            `📊 *Size* : *${resolvedSize}*\n\n` +
            '╭─〔 🔗 𝐃𝐈𝐑𝐄𝐂𝐓 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐔𝐑𝐋 〕─•\n' +
            `│ 👉 ${directDownloadUrl}\n` +
            '╰─────────────────────────•\n\n' +
            '💡 *Chrome / ADM / IDM මඟින් Maximum Speed එකෙන් Download කරගත හැක.*\n\n' +
            `> ${BRAND_FOOTER}`;

          if (progressMsg) {
            await sock.sendMessage(from, { text: dlCard, edit: progressMsg.key }).catch(async () => {
              await sock.sendMessage(from, { text: dlCard }, { quoted: msg });
            });
          } else {
            await sock.sendMessage(from, { text: dlCard }, { quoted: msg });
          }
          return;
        }
      }

      return sock.sendMessage(
        from,
        { text: `❌ No active game session.\n💡 Search first: \`${prefix}fitgirl <game name>\`` },
        { quoted: msg }
      );
    }

    // Help banner if no arguments
    if (!args.length) {
      const help =
        '╔════════════════════════════╗\n' +
        '  🎮 𝓕𝓘𝓣𝓖𝓘𝓡𝓛 · 𝓟𝓒 𝓖𝓐𝓜𝓔 𝓗𝓤𝓑 🎮\n' +
        '  🔥 𝐅𝐈𝐓𝐆𝐈𝐑𝐋 𝐑𝐄𝐏𝐀𝐂𝐊𝐒 𝐃𝐀𝐓𝐀𝐁𝐀𝐒𝐄 🔥\n' +
        '╚════════════════════════════╝\n\n' +
        '╭─〔 💡 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 𝐔𝐒𝐀𝐆𝐄 〕─•\n' +
        `│ 🔎 *Search Game* :\n` +
        `│    ${prefix}fitgirl <game name>\n` +
        `│    _Example:_ ${prefix}fitgirl GTA\n` +
        `│    _Example:_ ${prefix}fitgirl Cyberpunk\n` +
        `│\n` +
        `│ 🔢 *Select Game & Parts* :\n` +
        `│    Reply with game number (e.g. 1, 2)\n` +
        `│    Reply with part number (e.g. 1, 2... for RAR parts)\n` +
        `│    Reply "m" or "magnet" for full Torrent\n` +
        '╰─────────────────────────•\n\n' +
        '✨ *Features:*\n' +
        '• Direct RAR Parts download (~500MB each)\n' +
        '• High-Speed Direct Server Resolver\n' +
        '• 1-Click Torrent Magnet Link support\n' +
        '• WhatsApp Document Delivery Support\n\n' +
        `> ${BRAND_FOOTER}`;

      return sock.sendMessage(from, { text: help }, { quoted: msg });
    }

    const query = args.join(' ').trim();

    // Direct game url input
    const matchUrl = query.match(/https?:\/\/(?:www\.)?fitgirl-repacks\.[a-z]+\/[^\s]+/i);
    if (matchUrl) {
      const loadMsg = await sock.sendMessage(
        from,
        { text: '⏳ *FitGirl link එකෙන් විස්තර ලබාගනිමින්...*' },
        { quoted: msg }
      ).catch(() => null);

      try {
        const info = await fetchGameInfo(matchUrl[0]);
        const organized = organizeDownloads(info.downloads);
        setSessionPending(from, { mode: 'overview', info, organized });

        if (loadMsg) await sock.sendMessage(from, { delete: loadMsg.key }).catch(() => {});
        const overviewText = buildGameOverviewCard(info, organized, useButtons);

        if (useButtons) {
          const rows = [];
          if (organized.magnet) {
            rows.push({
              id: 'fg_mag',
              title: '🧲 Torrent Magnet Link',
              description: 'Instant 1-Click Torrent Download',
            });
          }
          const maxRows = Math.min(organized.parts.length, 19);
          for (let i = 0; i < maxRows; i++) {
            const p = organized.parts[i];
            rows.push({
              id: `fg_part_${p.partNum}`,
              title: `🧩 Part ${p.partNum} (${p.hoster})`,
              description: `Download Part ${p.partNum} (~500MB RAR)`,
            });
          }
          try {
            return await sendInteractiveSelect(sock, from, {
              text: overviewText,
              buttonText: '🎮 Select Part / Magnet',
              sections: [{ title: '📥 Game Parts & Magnet', rows }],
              imageUrl: info.image,
              quoted: msg,
            });
          } catch (_) {}
        }

        return await sendSafeCard(sock, from, msg, overviewText, info.image);
      } catch (err) {
        if (loadMsg) await sock.sendMessage(from, { text: `❌ ${err.message}`, edit: loadMsg.key }).catch(() => {});
        return;
      }
    }

    // Search query
    const loadMsg = await sock.sendMessage(
      from,
      { text: '🔍 *FitGirl Repacks search කරමින්...*' },
      { quoted: msg }
    ).catch(() => null);

    try {
      const results = await searchGames(query);
      if (!results.length) {
        if (loadMsg) {
          await sock.sendMessage(
            from,
            { text: `❌ "*${query}*" සඳහා Games හමු නොවීය. වෙනත් Game නමක් ටයිප් කරන්න.`, edit: loadMsg.key }
          ).catch(() => {});
        }
        return;
      }

      setSessionPending(from, { mode: 'search', results });
      const searchCardText = buildSearchCard(query, results, useButtons);

      if (loadMsg) await sock.sendMessage(from, { delete: loadMsg.key }).catch(() => {});

      if (useButtons) {
        const rows = results.slice(0, 12).map((r, idx) => ({
          id: `fg_pick_${idx + 1}`,
          title: cleanTitle(r.title, 24),
          description: r.date ? `📅 ${r.date} · Repack` : '🎮 PC Game Repack',
        }));
        try {
          return await sendInteractiveSelect(sock, from, {
            text: searchCardText,
            buttonText: '🎮 Select Game',
            sections: [{ title: '🎮 FitGirl Search Results', rows }],
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
