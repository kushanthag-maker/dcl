/**
 * DARK QUEEN V2 — FitGirl PC Game Repacks Downloader
 * Features:
 *   - Search FitGirl Repacks database (.fitgirl <game name>)
 *   - Dedicated All-Packs Auto Streaming command (.fgall <game name> / .fitgirlall / .fgpacks)
 *   - Direct WhatsApp RAR Document delivery (.rar file sent right into chat)
 *   - Real-time Progress Bar & Percentage edited in place on the same message
 *   - Sequential ~500MB Pack delivery: sends Part 1, Part 2, Part 3... directly into WhatsApp
 *   - High-Speed Direct Resolver with automatic CDN proxy and safe direct link fallback
 *   - Stop queue support: reply "stop" or "cancel" anytime to pause the stream
 *   - 100% crash-proof: stream directly to disk, RAM-safe, handles connection drops gracefully
 *   - Single pack document download: reply with part number (e.g. 1, 2) to get that RAR pack document
 *   - 1-Click Torrent Magnet Link support (reply "m" or "magnet")
 *   - Native Interactive Selection Buttons + automatic fallback for buttons:false
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
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

// Sessions: from (JID) -> { mode: 'search'|'overview', results, info, organized, timeout }
const pending = new Map();

// Active streaming queues: from (JID) -> { stopped: boolean }
const activeQueues = new Map();

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

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function renderProgressBar(pct, length = 10) {
  const filled = Math.min(length, Math.max(0, Math.round((pct / 100) * length)));
  return '■'.repeat(filled) + '□'.repeat(length - filled);
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

/**
 * Fast 8s resolver for FileKeeper & direct CDN links.
 * Returns null if resolution fails, never throws.
 */
async function resolveDownload(partUrl) {
  try {
    const res = await axios.get(DL_API, {
      params: { q: partUrl, api_key: API_KEY },
      timeout: 8000,
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
  } catch (_) {}
  return null;
}

/**
 * Streams download to local file on disk (RAM safe, prevents OOM).
 * Calls onProgress(received, total, pct) throttled.
 */
function downloadToFile(url, filePath, onProgress) {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    const maxRedirects = 8;

    const executeGet = (currentUrl) => {
      if (redirects > maxRedirects) {
        return reject(new Error('Too many redirects'));
      }
      const client = currentUrl.startsWith('https') ? https : http;
      const parsed = new URL(currentUrl);

      const req = client.get(
        currentUrl,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            Accept: '*/*',
            'Accept-Encoding': 'identity',
            Referer: parsed.origin,
          },
          timeout: 600000,
        },
        (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            res.resume();
            redirects++;
            const nextUrl = res.headers.location.startsWith('http')
              ? res.headers.location
              : new URL(res.headers.location, currentUrl).href;
            return executeGet(nextUrl);
          }

          if (res.statusCode !== 200 && res.statusCode !== 206) {
            res.resume();
            return reject(new Error(`Server returned HTTP ${res.statusCode}`));
          }

          let total = parseInt(res.headers['content-length'] || '0', 10);
          if (res.headers['content-range']) {
            const match = res.headers['content-range'].match(/\/(\d+)$/);
            if (match) total = parseInt(match[1], 10);
          }

          let received = 0;
          let lastReport = Date.now();

          const writeStream = fs.createWriteStream(filePath);

          res.on('data', (chunk) => {
            received += chunk.length;
            const now = Date.now();
            if (onProgress && (now - lastReport >= 2500 || (total > 0 && received >= total))) {
              lastReport = now;
              const pct = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
              onProgress(received, total, pct);
            }
          });

          res.pipe(writeStream);

          writeStream.on('finish', () => {
            writeStream.close(() => resolve({ bytes: received, total }));
          });

          writeStream.on('error', (err) => {
            try { fs.unlinkSync(filePath); } catch (_) {}
            reject(err);
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        try { fs.unlinkSync(filePath); } catch (_) {}
        reject(new Error('Download timeout'));
      });

      req.on('error', (err) => {
        try { fs.unlinkSync(filePath); } catch (_) {}
        reject(err);
      });
    };

    executeGet(url);
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

/* ---------------- Organization and Card Builders ---------------- */

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

  text += '╰─────────────────────────•\n\n';

  if (useButtons) {
    text += '💡 *Tap "Select Game" button below to choose, or reply with number.*\n\n';
  } else {
    text += '💡 *Reply with game number (e.g. 1 or 2) to view parts & downloads.*\n\n';
  }

  text += `> ${BRAND_FOOTER}`;
  return text;
}

function buildGameOverviewCard(info, organized, useButtons) {
  const { magnet, parts } = organized;
  let text =
    '╔════════════════════════════╗\n' +
    '  🎮 𝓕𝓘𝓣𝓖𝓘𝓡𝓛 · 𝓖𝓐𝓜𝓔 𝓘𝓝𝓕𝓞 🎮\n' +
    '╚════════════════════════════╝\n\n' +
    `🎮 *Game*        : *${cleanTitle(info.title, 36)}*\n` +
    `📦 *Repack Size* : *${info.repack_size || 'N/A'}*\n` +
    `💾 *Original*    : ${info.original_size || 'N/A'}\n` +
    `🏷️ *Genres*      : ${info.genres || 'Action / PC Game'}\n` +
    `🧩 *Total Packs* : *${parts.length > 0 ? parts.length + ' RAR Packs (~500MB each)' : 'Direct Download'}*\n\n` +
    '╭─〔 📥 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐎𝐏𝐓𝐈𝐎𝐍𝐒 〕─•\n';

  if (parts.length > 0) {
    text += `│ 📦 *Option ALL* : Send All Packs (${parts.length} Packs as WhatsApp Documents)\n`;
  }
  if (magnet) {
    text += '│ 🧲 *Option M*   : Direct 1-Click Torrent Magnet\n';
  }
  if (parts.length > 0) {
    const previewCount = Math.min(parts.length, 10);
    text += `│ 🧩 *Packs List (1 - ${parts.length})* :\n`;
    for (let i = 0; i < previewCount; i++) {
      const p = parts[i];
      text += `│   └ *Part ${p.partNum}* (${p.hoster})\n`;
    }
    if (parts.length > previewCount) {
      text += `│   └ _...and ${parts.length - previewCount} more packs available_\n`;
    }
  }
  text += '╰─────────────────────────•\n\n';

  if (useButtons) {
    text +=
      '💡 *Tap "Select Option" button below to start download*\n' +
      '📦 *Or reply "all" to send ALL 500MB packs as WhatsApp Documents*\n' +
      '🔢 *Or reply with Pack number (e.g. 1 for Part 1, 2 for Part 2)*\n' +
      '🧲 *Or reply "m" or "magnet" for full Torrent Magnet Link*\n\n';
  } else {
    text +=
      '💡 *Reply "all" to send ALL 500MB packs as WhatsApp Documents (auto queue)*\n' +
      '🔢 *Or reply with Pack number (e.g. 1 for Part 1, 2 for Part 2)*\n' +
      '🧲 *Or reply "m" or "magnet" to get the full Torrent Magnet Link.*\n\n';
  }

  text += `> ${BRAND_FOOTER}`;
  return text;
}

/* ---------------- WhatsApp Document Delivery & Progress Editor ---------------- */

/**
 * Downloads a ~500MB Pack to disk while editing the SAME progress message dynamically,
 * then delivers the RAR file directly into WhatsApp as a Document!
 */
async function sendPackAsDocument(sock, from, msg, partItem, gameTitle, totalParts) {
  const fileName = `${safeFilename(gameTitle)}_Part${String(partItem.partNum).padStart(3, '0')}.rar`;
  let directDownloadUrl = partItem.url;
  let resolvedSize = '500.0 MB';
  let resolvedFileName = fileName;

  // 1. Resolve High-Speed Link
  if (partItem.isResolvable) {
    const dlData = await resolveDownload(partItem.url);
    if (dlData) {
      if (dlData.direct_link || dlData.download_link) {
        directDownloadUrl = dlData.direct_link || dlData.download_link;
      }
      if (dlData.size) resolvedSize = dlData.size;
      if (dlData.filename) resolvedFileName = dlData.filename;
    }
  }

  // 2. Initial Progress Message
  const progressMsg = await sock.sendMessage(
    from,
    {
      text:
        '╔════════════════════════════╗\n' +
        '  📦 𝓕𝓘𝓣𝓖𝓘𝓡𝓛 · 𝓟𝓐𝓒𝓚 𝓓𝓞𝓦𝓝𝓛𝓞𝓐𝓓 📦\n' +
        '╚════════════════════════════╝\n\n' +
        `🎮 *Game* : *${gameTitle}*\n` +
        `🧩 *Pack* : *Part ${partItem.partNum}* of *${totalParts}*\n` +
        `📁 *File* : \`${resolvedFileName}\`\n` +
        `📊 *Size* : *${resolvedSize}*\n\n` +
        '⏳ *Server එකෙන් Pack එක බාගත වෙමින් පවතී...*\n' +
        '□□□□□□□□□□ 0%\n\n' +
        `> ${BRAND_FOOTER}`,
    },
    { quoted: msg }
  ).catch(() => null);

  const tmpPath = path.join(os.tmpdir(), `fg_${Date.now()}_${safeFilename(resolvedFileName)}`);

  try {
    // 3. Dynamic Progress Callback editing the same message
    const onProgress = async (received, total, pct) => {
      if (!progressMsg?.key) return;
      const bar = renderProgressBar(pct, 10);
      const progressText =
        '╔════════════════════════════╗\n' +
        '  📦 𝓕𝓘𝓣𝓖𝓘𝓡𝓛 · 𝓟𝓐𝓒𝓚 𝓓𝓞𝓦𝓝𝓛𝓞𝓐𝓓 📦\n' +
        '╚════════════════════════════╝\n\n' +
        `🎮 *Game* : *${gameTitle}*\n` +
        `🧩 *Pack* : *Part ${partItem.partNum}* of *${totalParts}*\n` +
        `📁 *File* : \`${resolvedFileName}\`\n` +
        `📊 *Size* : *${formatBytes(received)}* / *${total > 0 ? formatBytes(total) : resolvedSize}*\n\n` +
        `⬇️ *Server එකෙන් බාගත වෙමින්... [ ${pct}% ]*\n` +
        `${bar} ${pct}%\n\n` +
        `> ${BRAND_FOOTER}`;

      await sock.sendMessage(from, { text: progressText, edit: progressMsg.key }).catch(() => {});
    };

    // 4. Stream to disk
    const dlRes = await downloadToFile(directDownloadUrl, tmpPath, onProgress);

    // 5. Update progress message to "Uploading to WhatsApp"
    if (progressMsg?.key) {
      const uploadText =
        '╔════════════════════════════╗\n' +
        '  📦 𝓕𝓘𝓣𝓖𝓘𝓡𝓛 · 𝓟𝓐𝓒𝓚 𝓓𝓞𝓦𝓝𝓛𝓞𝓐𝓓 📦\n' +
        '╚════════════════════════════╝\n\n' +
        `🎮 *Game* : *${gameTitle}*\n` +
        `🧩 *Pack* : *Part ${partItem.partNum}* of *${totalParts}*\n` +
        `📁 *File* : \`${resolvedFileName}\`\n` +
        `📊 *Size* : *${formatBytes(dlRes.bytes)}*\n\n` +
        '📤 *WhatsApp එකට Document එකක් ලෙස Upload වෙමින් පවතී...*\n' +
        '■■■■■■■■■■ 100%\n' +
        '⏳ කරුණාකර රැඳී සිටින්න...\n\n' +
        `> ${BRAND_FOOTER}`;

      await sock.sendMessage(from, { text: uploadText, edit: progressMsg.key }).catch(() => {});
    }

    // 6. Deliver Document directly into WhatsApp!
    await sock.sendMessage(
      from,
      {
        document: { url: tmpPath },
        mimetype: 'application/x-rar-compressed',
        fileName: resolvedFileName,
        caption:
          '╔════════════════════════════╗\n' +
          `  🚀 𝓕𝓘𝓣𝓖𝓘𝓡𝓛 · 𝓟𝓐𝓒𝓚 [${partItem.partNum} / ${totalParts}] 🚀\n` +
          '╚════════════════════════════╝\n\n' +
          `🎮 *Game* : *${gameTitle}*\n` +
          `🧩 *Pack* : *Part ${partItem.partNum}* of *${totalParts}*\n` +
          `📁 *File* : \`${resolvedFileName}\`\n` +
          `📊 *Size* : *${formatBytes(dlRes.bytes)}*\n` +
          `🌐 *Host* : *${partItem.hoster}*\n\n` +
          '💡 *සියලුම Parts Download කර Part 1 Extract කර Install කරන්න.*\n\n' +
          `> ${BRAND_FOOTER}`,
      },
      { quoted: msg }
    );

    // 7. Delete progress message once delivered
    if (progressMsg?.key) {
      await sock.sendMessage(from, { delete: progressMsg.key }).catch(() => {});
    }
  } catch (err) {
    logger.warn('[FitGirl] Document stream/upload fallback: ' + err.message);

    // Fallback card with direct high-speed link in case source host restricts direct streaming
    const fallbackText =
      '╔════════════════════════════╗\n' +
      '  🚀 𝓕𝓘𝓣𝓖𝓘𝓡𝓛 · 𝓓𝓘𝓡𝓔𝓒𝓣 𝓛𝓘𝓝𝓚 🚀\n' +
      '╚════════════════════════════╝\n\n' +
      `🎮 *Game* : *${gameTitle}*\n` +
      `🧩 *Pack* : *Part ${partItem.partNum}* of *${totalParts}*\n` +
      `📁 *File* : \`${resolvedFileName}\`\n` +
      `📊 *Size* : *${resolvedSize}*\n` +
      `🌐 *Host* : *${partItem.hoster}*\n\n` +
      '⚠️ _Host එක හෝ WhatsApp Document සීමාව නිසා සෘජු Direct High-Speed Download Link එක පහත දක්වා ඇත:_\n\n' +
      '╭─〔 🔗 𝐃𝐈𝐑𝐄𝐂𝐓 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐔𝐑𝐋 〕─•\n' +
      `│ 👉 ${directDownloadUrl}\n` +
      '╰─────────────────────────•\n\n' +
      '💡 *Chrome / ADM / IDM මඟින් Maximum Speed එකෙන් Download කරගත හැක.*\n\n' +
      `> ${BRAND_FOOTER}`;

    if (progressMsg?.key) {
      await sock.sendMessage(from, { text: fallbackText, edit: progressMsg.key }).catch(async () => {
        await sock.sendMessage(from, { text: fallbackText }, { quoted: msg });
      });
    } else {
      await sock.sendMessage(from, { text: fallbackText }, { quoted: msg });
    }
  } finally {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {}
  }
}

/* ---------------- Sequential All-Packs Document Streaming Runner ---------------- */

async function streamAllPacks(sock, from, msg, info, organized) {
  const parts = organized.parts;
  const gameTitle = cleanTitle(info?.title || 'PC Game', 36);

  if (!parts || !parts.length) {
    if (organized.magnet) {
      return sock.sendMessage(
        from,
        {
          text:
            `ℹ️ *${gameTitle}* සඳහා RAR Parts හමු නොවීය.\n` +
            `සම්පූර්ණ Game එක සඳහා Direct Magnet Link එක:\n\n` +
            `\`\`\`${organized.magnet.url}\`\`\``,
        },
        { quoted: msg }
      );
    }
    return sock.sendMessage(
      from,
      { text: `❌ මෙම Game එක සඳහා බාගත හැකි Packs හමු නොවීය.` },
      { quoted: msg }
    );
  }

  // Cancel any existing active queue for this user
  if (activeQueues.has(from)) {
    activeQueues.get(from).stopped = true;
  }
  const queueCtrl = { stopped: false };
  activeQueues.set(from, queueCtrl);

  // Send Initial Queue Start Announcement
  const startCard =
    '╔════════════════════════════╗\n' +
    '  📦 𝓕𝓘𝓣𝓖𝓘𝓡𝓛 · 𝓐𝓛𝓛 𝓟𝓐𝓒𝓚𝓢 𝓠𝓤𝓔𝓤𝓔 📦\n' +
    '╚════════════════════════════╝\n\n' +
    `🎮 *Game*        : *${gameTitle}*\n` +
    `🧩 *Total Packs* : *${parts.length} RAR Packs (~500MB each)*\n` +
    `📦 *Repack Size* : *${info?.repack_size || 'N/A'}*\n\n` +
    '⏳ *සියලුම Packs (~500MB) WhatsApp Documents ලෙස එකින් එක එවනු ලැබේ...*\n' +
    '📊 *එක් එක් Pack එකේ Progress එක Live Update වනු ඇත.*\n' +
    '🛑 *නැවැත්වීමට අවශ්‍ය නම් "stop" ලෙස reply කරන්න.*\n\n' +
    `> ${BRAND_FOOTER}`;

  try {
    await sock.sendMessage(from, { text: startCard }, { quoted: msg });
  } catch (_) {}

  let sentCount = 0;
  for (let i = 0; i < parts.length; i++) {
    if (queueCtrl.stopped) {
      break;
    }

    const partItem = parts[i];
    await sendPackAsDocument(sock, from, msg, partItem, gameTitle, parts.length);
    sentCount++;

    const isLast = (i === parts.length - 1);
    if (!isLast && !queueCtrl.stopped) {
      // 1.5s delay between packs
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  activeQueues.delete(from);

  if (queueCtrl.stopped) {
    try {
      await sock.sendMessage(from, {
        text: `🛑 *Game packs queue එක නතර කරන ලදී.* (Packs ${sentCount} ක් එවන ලදී).`,
      });
    } catch (_) {}
    return;
  }

  // Final Delivery Summary & Extraction Instructions
  const completeGuide =
    '╔════════════════════════════╗\n' +
    '  🎉 𝐀𝐋𝐋 𝐏𝐀𝐂𝐊𝐒 𝐒𝐄𝐍𝐓 𝐒𝐔𝐂𝐂𝐄𝐒𝐒𝐅𝐔𝐋𝐋𝐘 🎉\n' +
    '╚════════════════════════════╝\n\n' +
    `🎮 *Game*   : *${gameTitle}*\n` +
    `📦 *Status* : *සියලුම ${parts.length} RAR Packs (~500MB each) WhatsApp Document ලෙස සාර්ථකව එවා අවසන්!*\n\n` +
    '╭─〔 💡 𝐇𝐎𝐖 𝐓𝐎 𝐈𝐍𝐒𝐓𝐀𝐋𝐋 〕─•\n' +
    '│ 1️⃣ සියලුම Parts (.rar files) එකම Folder එකකට Download කරගන්න.\n' +
    '│ 2️⃣ *Part 1 (.part001.rar / .part01.rar)* මත Right Click කර *Extract Here* (WinRAR / 7-Zip) කරන්න.\n' +
    '│ 3️⃣ සියලුම කොටස් ස්වයංක්‍රීයව එකතු වී සම්පූර්ණ Game Setup Folder එක සෑදේ.\n' +
    '│ 4️⃣ *setup.exe* Run කර Game එක Install කරගෙන Play කරන්න! 🎮\n' +
    '╰─────────────────────────•\n\n' +
    `> ${BRAND_FOOTER}`;

  try {
    await sock.sendMessage(from, { text: completeGuide });
  } catch (_) {}
}

/* ---------------- Main Command Object ---------------- */

module.exports = {
  name: 'fitgirl',
  aliases: ['fit', 'repack', 'pcgame', 'pcgames', 'fitgirlrepack', 'fgall', 'fitgirlall', 'fgpacks', 'gamepacks'],
  description: 'Search & download FitGirl PC game repacks & ~500MB RAR pack documents in WhatsApp',
  category: 'download',

  hasPending(from) {
    return pending.has(from);
  },

  hasActiveQueue(from) {
    return activeQueues.has(from) && !activeQueues.get(from).stopped;
  },

  stopQueue(from) {
    const q = activeQueues.get(from);
    if (q) {
      q.stopped = true;
      activeQueues.delete(from);
      return true;
    }
    return false;
  },

  // Exported for testing
  downloadToFile,
  renderProgressBar,
  formatBytes,

  async execute({ sock, msg, from, args, sessionId, commandName }) {
    const prefix = config.prefix || '.';
    const settings = (() => {
      try {
        return getSettings(sessionId) || {};
      } catch {
        return {};
      }
    })();
    const useButtons = settings.buttons !== false;

    // Check if Stop requested
    if (args.length === 1 && ['stop', 'cancel'].includes(String(args[0]).toLowerCase().trim())) {
      const stopped = this.stopQueue(from);
      return sock.sendMessage(
        from,
        { text: stopped ? '🛑 *Game packs queue එක නතර කරන ලදී.*' : 'ℹ️ සක්‍රීය Packs queue එකක් නොමැත.' },
        { quoted: msg }
      );
    }

    // Check if dedicated all-packs command called (e.g. .fgall, .fitgirlall, .fgpacks)
    const isDirectAllCmd = ['fgall', 'fitgirlall', 'fgpacks', 'gamepacks'].includes(String(commandName || '').toLowerCase());
    if (isDirectAllCmd) {
      if (args.length > 0) {
        const query = args.join(' ').trim();
        const loadMsg = await sock.sendMessage(
          from,
          { text: `🔍 *FitGirl වෙතින් "${query}" සොයා All Packs පිළියෙල කරමින්...*` },
          { quoted: msg }
        ).catch(() => null);

        try {
          const results = await searchGames(query);
          if (!results.length) {
            if (loadMsg) {
              await sock.sendMessage(
                from,
                { text: `❌ "*${query}*" සඳහා Games හමු නොවීය. කරුණාකර නිවැරදි Game නම ටයිප් කරන්න.`, edit: loadMsg.key }
              ).catch(() => {});
            }
            return;
          }

          const chosenGame = results[0];
          const info = await fetchGameInfo(chosenGame.link);
          const organized = organizeDownloads(info.downloads);

          setSessionPending(from, { mode: 'overview', info, organized });
          if (loadMsg) await sock.sendMessage(from, { delete: loadMsg.key }).catch(() => {});

          return await streamAllPacks(sock, from, msg, info, organized);
        } catch (err) {
          if (loadMsg) {
            await sock.sendMessage(from, { text: `❌ Error: ${err.message}`, edit: loadMsg.key }).catch(() => {});
          }
          return;
        }
      } else {
        const state = pending.get(from);
        if (state && state.info && state.organized) {
          return await streamAllPacks(sock, from, msg, state.info, state.organized);
        }
        return sock.sendMessage(
          from,
          {
            text:
              `╔════════════════════════════╗\n` +
              `  📦 𝓕𝓘𝓣𝓖𝓘𝓡𝓛 · 𝓐𝓛𝓛 𝓟𝓐𝓒𝓚𝓢 📦\n` +
              `╚════════════════════════════╝\n\n` +
              `💡 *Usage:* \`${prefix}fgall <game name>\`\n` +
              `_Example:_ \`${prefix}fgall GTA\`\n` +
              `_Example:_ \`${prefix}fgall Cyberpunk\`\n\n` +
              `> ${BRAND_FOOTER}`,
          },
          { quoted: msg }
        );
      }
    }

    // Parse button click or reply selection
    let selectionType = null;
    let selectedIdx = -1;

    if (args.length === 1) {
      const rawArg = String(args[0]).trim();
      const matchPick = rawArg.match(/^(?:fg_)?pick_(\d+)$/i);
      const matchPart = rawArg.match(/^(?:fg_)?part_(\d+)$/i);
      const matchMag = /^(?:fg_)?mag(?:net)?$/i.test(rawArg);
      const matchAll = /^(?:fg_)?all(?:_stream|_parts|\d+)?$/i.test(rawArg) || /^(?:packs?|parts?|all\s*packs?|send\s*all)$/i.test(rawArg);
      const matchStop = /^(?:fg_)?(?:stop|cancel)$/i.test(rawArg);
      const matchNum = rawArg.match(/^(\d+)$/);

      if (matchStop) {
        selectionType = 'stop';
      } else if (matchAll) {
        selectionType = 'all';
      } else if (matchPick) {
        selectionType = 'pick';
        selectedIdx = parseInt(matchPick[1], 10) - 1;
      } else if (matchPart) {
        selectionType = 'part';
        selectedIdx = parseInt(matchPart[1], 10);
      } else if (matchMag) {
        selectionType = 'magnet';
      } else if (matchNum) {
        selectedIdx = parseInt(matchNum[1], 10);
      }
    }

    // Shortcuts
    const firstLower = String(args[0] || '').toLowerCase().trim();
    if (['stop', 'cancel'].includes(firstLower)) selectionType = 'stop';
    if (['magnet', 'mag', 'm'].includes(firstLower)) selectionType = 'magnet';
    if (['all', 'packs', 'parts', 'pack', 'all packs', 'send all', 'all parts'].includes(firstLower)) selectionType = 'all';

    // Handle Selection
    if (selectionType || selectedIdx >= 0) {
      const state = pending.get(from);

      // Stop Queue
      if (selectionType === 'stop') {
        const stopped = this.stopQueue(from);
        return sock.sendMessage(
          from,
          { text: stopped ? '🛑 *Game packs queue එක නතර කරන ලදී.*' : 'ℹ️ සක්‍රීය Packs queue එකක් නොමැත.' },
          { quoted: msg }
        );
      }

      // 1. Pick Game from Search Results
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
          { text: '⏳ *FitGirl වෙතින් Game Repack විස්තර සහ ~500MB Packs ලබාගනිමින්...*' },
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
            if (organized.parts && organized.parts.length > 0) {
              rows.push({
                id: 'fg_all',
                title: `📦 Send All Packs (${organized.parts.length} Documents)`,
                description: 'Auto queue: sends each pack as WhatsApp document with live progress',
              });
            }
            if (organized.magnet) {
              rows.push({
                id: 'fg_mag',
                title: '🧲 Torrent Magnet Link',
                description: 'Instant 1-Click Torrent Download',
              });
            }

            const maxRows = Math.min(organized.parts.length, 18);
            for (let i = 0; i < maxRows; i++) {
              const p = organized.parts[i];
              rows.push({
                id: `fg_part_${p.partNum}`,
                title: `🧩 Part ${p.partNum} (${p.hoster})`,
                description: `Download Part ${p.partNum} (~500MB RAR Document)`,
              });
            }

            try {
              return await sendInteractiveSelect(sock, from, {
                text: overviewText,
                buttonText: '🎮 Select Option / Packs',
                sections: [{ title: '📥 Game Downloads & Packs', rows }],
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

      // 2. Send All 500MB Packs Sequentially
      if (selectionType === 'all') {
        if (!state || !state.organized || !state.organized.parts || !state.organized.parts.length) {
          return sock.sendMessage(
            from,
            { text: `❌ No active game parts session.\n💡 Search first: \`${prefix}fitgirl <game name>\` or \`${prefix}fgall <game name>\`` },
            { quoted: msg }
          );
        }

        return await streamAllPacks(sock, from, msg, state.info, state.organized);
      }

      // 3. Magnet Link Request
      if (selectionType === 'magnet') {
        if (!state || !state.organized || !state.organized.magnet) {
          return sock.sendMessage(
            from,
            { text: `❌ No active game session or Magnet link found for this repack.\n💡 Search first: \`${prefix}fitgirl <game name>\`` },
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

      // 4. Single Pack Selection as Document with Live Progress!
      if (state?.mode === 'overview' || selectionType === 'part') {
        const partNum = selectedIdx;
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
        return await sendPackAsDocument(sock, from, msg, partItem, gameTitle, state.organized.parts.length);
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
        `│\n` +
        `│ 📦 *Send All ~500MB Pack Documents* :\n` +
        `│    ${prefix}fgall <game name>\n` +
        `│    _Example:_ ${prefix}fgall GTA\n` +
        `│\n` +
        `│ 🔢 *Select Game & Packs* :\n` +
        `│    Reply with game number (e.g. 1, 2)\n` +
        `│    Reply "all" to send ALL packs as WhatsApp Documents\n` +
        `│    Reply with pack number (e.g. 1, 2 for RAR pack document)\n` +
        `│    Reply "m" or "magnet" for full Torrent\n` +
        '╰─────────────────────────•\n\n' +
        '✨ *Features:*\n' +
        '• Full Game split into ~500MB RAR packs\n' +
        '• Direct WhatsApp RAR Document delivery\n' +
        '• Live In-Place Progress Bar Editing\n' +
        '• Sequential auto delivery (Pack 1 -> Pack 2 -> Pack 3...)\n' +
        '• 1-Click Torrent Magnet Link support\n\n' +
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
          if (organized.parts && organized.parts.length > 0) {
            rows.push({
              id: 'fg_all',
              title: `📦 Send All Packs (${organized.parts.length} Documents)`,
              description: 'Auto queue: sends each pack as WhatsApp document with live progress',
            });
          }
          if (organized.magnet) {
            rows.push({
              id: 'fg_mag',
              title: '🧲 Torrent Magnet Link',
              description: 'Instant 1-Click Torrent Download',
            });
          }
          const maxRows = Math.min(organized.parts.length, 18);
          for (let i = 0; i < maxRows; i++) {
            const p = organized.parts[i];
            rows.push({
              id: `fg_part_${p.partNum}`,
              title: `🧩 Part ${p.partNum} (${p.hoster})`,
              description: `Download Part ${p.partNum} (~500MB RAR Document)`,
            });
          }
          try {
            return await sendInteractiveSelect(sock, from, {
              text: overviewText,
              buttonText: '🎮 Select Option / Packs',
              sections: [{ title: '📥 Game Downloads & Packs', rows }],
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
