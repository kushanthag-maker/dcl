/**
 * Persistent Group-specific AntiLink Store
 * Allows AntiLink to be toggled per group as well as globally
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'antilink-groups.json');

let store = {
  groups: {}, // { [groupJid]: { enabled: boolean, action: 'delete' | 'warn', updatedAt: number } }
};
let isLoaded = false;

function ensureDir() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  if (isLoaded) return store;
  try {
    ensureDir();
    if (fs.existsSync(FILE)) {
      const content = fs.readFileSync(FILE, 'utf8');
      store = JSON.parse(content);
      if (!store.groups) store.groups = {};
    }
  } catch (_) {
    store = { groups: {} };
  }
  isLoaded = true;
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
  if (!groupJid) return false;
  return !!store.groups[groupJid]?.enabled;
}

function setGroupEnabled(groupJid, enabled) {
  load();
  if (!groupJid) return;
  store.groups[groupJid] = {
    enabled: !!enabled,
    updatedAt: Date.now(),
  };
  save();
  return store.groups[groupJid];
}

function getGroupStatus(groupJid) {
  load();
  return store.groups[groupJid] || { enabled: false };
}

module.exports = {
  isGroupEnabled,
  setGroupEnabled,
  getGroupStatus,
};
