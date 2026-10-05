/**
 * Persistent Group-specific AntiLink Store
 * Allows AntiLink to be toggled per group as well as globally
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'antilink-groups.json');

let store = {
  groups: {}, // { [normJid]: { enabled: boolean, updatedAt: number } }
};

function ensureDir() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normJid(jid) {
  if (!jid) return '';
  const clean = String(jid).split('@')[0].split(':')[0].trim();
  return clean ? `${clean}@g.us` : '';
}

function load() {
  try {
    ensureDir();
    if (fs.existsSync(FILE)) {
      const content = fs.readFileSync(FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed.groups === 'object') {
        store.groups = parsed.groups;
      }
    }
  } catch (_) {}
  return store;
}

function save() {
  try {
    ensureDir();
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save antilink store:', err.message);
  }
}

function isGroupEnabled(groupJid) {
  load();
  const key = normJid(groupJid);
  if (!key) return false;
  return !!store.groups[key]?.enabled;
}

function setGroupEnabled(groupJid, enabled) {
  load();
  const key = normJid(groupJid);
  if (!key) return;
  store.groups[key] = {
    enabled: !!enabled,
    updatedAt: Date.now(),
  };
  save();
  return store.groups[key];
}

function getGroupStatus(groupJid) {
  load();
  const key = normJid(groupJid);
  return store.groups[key] || { enabled: false };
}

module.exports = {
  isGroupEnabled,
  setGroupEnabled,
  getGroupStatus,
  normJid,
};
