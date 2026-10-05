/**
 * DARK QUEEN V2 — CineSubz Movie & TV Series Downloader
 * Ultra-Aesthetic UI & Clean Direct Download Links
 * Usage:
 *   .cinesubz <movie name>
 *   .cinesubz <cinesubz url>
 *   .cinesubz <number> (pick movie / pick direct link)
 */

const axios = require('axios');
const config = require('../../config');

const API_KEY = 'chama_api_4e25afe0832134994a30b44dd0e9d6d8';
const SEARCH_API = 'https://api.chamindu.site/api/v1/movies/cinesubz/search';
const DL_API = 'https://api.chamindu.site/api/v1/movies/cinesubz/infodl';
const BRAND_FOOTER = '𓆩👑 DARK QUEEN V2 · CINESUBZ CINEMA 👑𓆪';
const TTL = 3 * 60 * 1000;

const pending = new Map(); // from -> state { mode, results, info }

function cleanTitle(str, max = 50) {
  let s = String(str || 'N/A')
    .replace(/\s*[│|]\s*සිංහල.*$/i, '')
    .replace(/\s*[│|].*$/, '')
    .replace(/\s*\(\d{4}\).*$/, '')
    .trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function filterDirectLinks(downloads) {
  if (!Array.isArray(downloads) || !downloads.length) return [];
  // Prioritize direct high-speed server links, then mega/gdrive, then others
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
  const res = await axios.get(SEARCH_API, {
    params: { q: query, api_key: API_KEY },
    timeout: 30000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data || res.data.status !== true) {
    throw new Error((res.data && res.data.message) || `Search error (HTTP ${res.status})`);
  }
  return Array.isArray(res.data.data) ? res.data.data : [];
}

async function fetchInfo(url) {
  const res = await axios.get(DL_API, {
    params: { q: url, api_key: API_KEY },
    timeout: 45000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data || res.data.status !== true || !res.data.data) {
    throw new Error((res.data && res.data.message) || `Info error (HTTP ${res.status})`);
  }
  const data = res.data.data;
  const isTv = !!res.data.is_tv;
  const isEp = !!res.data.is_episode;
  const rawDl = Array.isArray(data.downloads) ? data.downloads : [];
  const dl = filterDirectLinks(rawDl);
  const ep = Array.isArray(data.episodes) ? data.episodes : [];
  return { data, isTv, isEp, dl, ep, pageUrl: url };
}

/* ---------------- UI Builders ---------------- */
function buildSearchCard(query, results) {
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

  text +=
    '╰─────────────────────────•\n\n' +
    `💡 *To view details & direct links:*\n` +
    `Reply with movie number (e.g. *${prefix}cinesubz 1* or just *1*)\n\n` +
    `> ${BRAND_FOOTER}`;

  return text;
}

function buildMovieDetailsCard(info) {
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

  text += '╭─〔 ⬇️ 𝐃𝐈𝐑𝐄𝐂𝐓 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐋𝐈𝐍𝐊𝐒 〕─•\n';

  if (!directLinks.length) {
    text += '│ ❌ No direct download links currently available.\n';
  } else {
    directLinks.slice(0, 6).forEach((item, i) => {
      const q = formatQualityLabel(item.quality);
      const sz = item.size ? ` (${item.size})` : '';
      text += `│ ${i + 1}️⃣ *${q}*${sz}\n`;
      text += `│    🔗 ${item.link}\n`;
      if (i < Math.min(directLinks.length, 6) - 1) text += '│\n';
    });
  }

  text +=
    '╰─────────────────────────•\n\n' +
    `🚀 *Instant Download:* Tap any link above to download at full speed!\n` +
    `📲 Or reply with number (e.g. *${prefix}cinesubz 1*) for direct download card.\n\n` +
    `> ${BRAND_FOOTER}`;

  return text;
}

function buildDirectLinkCard(title, dlItem) {
  const q = formatQualityLabel(dlItem.quality);
  return (
    '╔════════════════════════════╗\n' +
    '  🚀 𝓒𝓘𝓝𝓔𝓢𝓤𝓑𝓩 · 𝓓𝓘𝓡𝓔𝓒𝓣 𝓛𝓘𝓝𝓚 🚀\n' +
    '╚════════════════════════════╝\n\n' +
    `│ 🎬 *Title*    : *${cleanTitle(title, 40)}*\n` +
    `│ 🎥 *Quality*  : *${q}*\n` +
    `│ 📦 *Size*     : ${dlItem.size || 'High Quality'}\n` +
    `│ 🇱🇰 *Subtitle* : සිංහල උපසිරැසි ඇතුළත් කර ඇත\n` +
    '╰─────────────────────────•\n\n' +
    '╭─〔 🔗 𝐃𝐈𝐑𝐄𝐂𝐓 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐔𝐑𝐋 〕─•\n' +
    `│\n` +
    `│ 👉 ${dlItem.link}\n` +
    `│\n` +
    '╰─────────────────────────•\n\n' +
    '💡 *Download Tips:*\n' +
    '• Tap the link above in Chrome, Opera, or ADM/IDM to download.\n' +
    '• High-speed resume supported! No ads, no wait time.\n\n' +
    `> ${BRAND_FOOTER}`
  );
}

function buildEpisodesCard(info) {
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

  eps.slice(0, 25).forEach((e, idx) => {
    const epName = cleanTitle(e.episode_name || `Episode ${idx + 1}`, 36);
    text += `│ *${idx + 1}.* ${epName}\n`;
  });

  text +=
    '╰─────────────────────────•\n\n' +
    `👉 Reply with episode number (e.g. *${prefix}cinesubz 1*) for direct download links!\n\n` +
    `> ${BRAND_FOOTER}`;

  return text;
}

module.exports = {
  name: 'cinesubz',
  aliases: ['csub', 'sinhalasubz', 'movie'],
  description: 'Search & get direct download links for CineSubz Sinhala Sub movies',
  category: 'download',

  async execute({ sock, msg, from, args }) {
    const prefix = config.prefix || '.';

    // Number selection handler (e.g. .cinesubz 1 or 1)
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const idx = parseInt(args[0], 10) - 1;
      const state = pending.get(from);

      // Search results pick
      if (state?.mode === 'search') {
        if (idx < 0 || idx >= state.results.length) {
          return sock.sendMessage(
            from,
            { text: `❌ Please enter a number between *1* and *${state.results.length}*.` },
            { quoted: msg }
          );
        }
        if (state.timeout) clearTimeout(state.timeout);
        const item = state.results[idx];

        const loadMsg = await sock.sendMessage(from, { text: '⏳ *Loading CineSubz details...*' }, { quoted: msg }).catch(() => null);
        try {
          const info = await fetchInfo(item.link);
          if (loadMsg) await sock.sendMessage(from, { delete: loadMsg.key }).catch(() => {});

          if (info.isTv && info.ep.length && !info.isEp) {
            pending.set(from, { mode: 'episodes', info, timeout: setTimeout(() => pending.delete(from), TTL) });
            const epText = buildEpisodesCard(info);
            if (info.data.image && /^https?:\/\//i.test(info.data.image)) {
              return await sock.sendMessage(from, { image: { url: info.data.image }, caption: epText }, { quoted: msg });
            }
            return await sock.sendMessage(from, { text: epText }, { quoted: msg });
          }

          pending.set(from, { mode: 'quality', info, timeout: setTimeout(() => pending.delete(from), TTL) });
          const cardText = buildMovieDetailsCard(info);
          if (info.data.image && /^https?:\/\//i.test(info.data.image)) {
            return await sock.sendMessage(from, { image: { url: info.data.image }, caption: cardText }, { quoted: msg });
          }
          return await sock.sendMessage(from, { text: cardText }, { quoted: msg });
        } catch (err) {
          if (loadMsg) await sock.sendMessage(from, { text: `❌ ${err.message}`, edit: loadMsg.key }).catch(() => {});
          return;
        }
      }

      // Quality / Direct link selection pick
      if (state?.mode === 'quality') {
        if (idx < 0 || idx >= state.info.dl.length) {
          return sock.sendMessage(
            from,
            { text: `❌ Please enter a link number between *1* and *${state.info.dl.length}*.` },
            { quoted: msg }
          );
        }
        if (state.timeout) clearTimeout(state.timeout);
        const dlItem = state.info.dl[idx];
        const linkCard = buildDirectLinkCard(state.info.data.title, dlItem);

        if (state.info.data.image && /^https?:\/\//i.test(state.info.data.image)) {
          return await sock.sendMessage(from, { image: { url: state.info.data.image }, caption: linkCard }, { quoted: msg });
        }
        return await sock.sendMessage(from, { text: linkCard }, { quoted: msg });
      }

      // TV series episode pick
      if (state?.mode === 'episodes') {
        if (idx < 0 || idx >= state.info.ep.length) {
          return sock.sendMessage(
            from,
            { text: `❌ Please enter an episode number between *1* and *${state.info.ep.length}*.` },
            { quoted: msg }
          );
        }
        const ep = state.info.ep[idx];
        const loadMsg = await sock.sendMessage(from, { text: `⏳ *Loading Episode ${idx + 1} links...*` }, { quoted: msg }).catch(() => null);
        try {
          const epInfo = await fetchInfo(ep.episode_url);
          if (loadMsg) await sock.sendMessage(from, { delete: loadMsg.key }).catch(() => {});
          if (state.timeout) clearTimeout(state.timeout);

          pending.set(from, { mode: 'quality', info: epInfo, timeout: setTimeout(() => pending.delete(from), TTL) });
          const cardText = buildMovieDetailsCard(epInfo);
          if (epInfo.data.image && /^https?:\/\//i.test(epInfo.data.image)) {
            return await sock.sendMessage(from, { image: { url: epInfo.data.image }, caption: cardText }, { quoted: msg });
          }
          return await sock.sendMessage(from, { text: cardText }, { quoted: msg });
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
        `│ 🔢 *Select Result / Link* :\n` +
        `│    ${prefix}cinesubz <number>\n` +
        '╰─────────────────────────•\n\n' +
        '✨ *Features:*\n' +
        '• Fast Direct High-Speed Download Links\n' +
        '• 1080p, 720p, 480p Qualities\n' +
        '• Full Sinhala Subtitles\n' +
        '• Clean UI without spam\n\n' +
        `> ${BRAND_FOOTER}`;

      return sock.sendMessage(from, { text: help }, { quoted: msg });
    }

    const query = args.join(' ').trim();

    // Direct CineSubz URL input
    const matchUrl = query.match(/https?:\/\/(?:www\.)?cinesubz\.[a-z]+\/[^\s]+/i);
    if (matchUrl) {
      const loadMsg = await sock.sendMessage(from, { text: '⏳ *Loading movie details from link...*' }, { quoted: msg }).catch(() => null);
      try {
        const info = await fetchInfo(matchUrl[0]);
        if (loadMsg) await sock.sendMessage(from, { delete: loadMsg.key }).catch(() => {});
        pending.set(from, { mode: 'quality', info, timeout: setTimeout(() => pending.delete(from), TTL) });
        const cardText = buildMovieDetailsCard(info);
        if (info.data.image && /^https?:\/\//i.test(info.data.image)) {
          return await sock.sendMessage(from, { image: { url: info.data.image }, caption: cardText }, { quoted: msg });
        }
        return await sock.sendMessage(from, { text: cardText }, { quoted: msg });
      } catch (err) {
        if (loadMsg) await sock.sendMessage(from, { text: `❌ ${err.message}`, edit: loadMsg.key }).catch(() => {});
        return;
      }
    }

    // Search query
    const loadMsg = await sock.sendMessage(from, { text: '🔍 *Searching CineSubz Cinema...*' }, { quoted: msg }).catch(() => null);
    try {
      const results = await fetchSearch(query);
      if (!results.length) {
        if (loadMsg) await sock.sendMessage(from, { text: `❌ No results found for "*${query}*"`, edit: loadMsg.key }).catch(() => {});
        return;
      }

      pending.set(from, { mode: 'search', results, timeout: setTimeout(() => pending.delete(from), TTL) });
      const searchCard = buildSearchCard(query, results);

      if (loadMsg) await sock.sendMessage(from, { delete: loadMsg.key }).catch(() => {});

      if (results[0].image && /^https?:\/\//i.test(results[0].image)) {
        await sock.sendMessage(from, { image: { url: results[0].image }, caption: searchCard }, { quoted: msg })
          .catch(() => sock.sendMessage(from, { text: searchCard }, { quoted: msg }));
      } else {
        await sock.sendMessage(from, { text: searchCard }, { quoted: msg });
      }
    } catch (err) {
      if (loadMsg) await sock.sendMessage(from, { text: `❌ Error: ${err.message}`, edit: loadMsg.key }).catch(() => {});
    }
  },
};
