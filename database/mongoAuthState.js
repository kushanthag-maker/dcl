/**
 * MongoDB Auth State for Baileys
 * Compatible with mongodb driver v6
 */

const { MongoClient } = require('mongodb');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

let client = null;
let db = null;
let connecting = null;

const MOCK_DB_FILE = path.join(__dirname, '..', 'data', 'mock-db.json');
let mockData = null;

function loadMockData() {
  if (mockData) return mockData;
  try {
    const dir = path.dirname(MOCK_DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(MOCK_DB_FILE)) {
      mockData = JSON.parse(fs.readFileSync(MOCK_DB_FILE, 'utf8'));
    } else {
      mockData = { sessions: [], ai_coins: [] };
    }
  } catch (e) {
    mockData = { sessions: [], ai_coins: [] };
  }
  return mockData;
}

function saveMockData() {
  try {
    const dir = path.dirname(MOCK_DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MOCK_DB_FILE, JSON.stringify(mockData, null, 2), 'utf8');
  } catch (e) {
    console.error('[MockDB] saveMockData error:', e.message);
  }
}

function matchesQuery(doc, query) {
  if (!query || Object.keys(query).length === 0) return true;
  for (const k of Object.keys(query)) {
    const val = query[k];
    if (val && typeof val === 'object' && val.$gt !== undefined) {
      if ((doc[k] ?? 0) <= val.$gt) return false;
    } else {
      if (doc[k] !== val) return false;
    }
  }
  return true;
}

function applyUpdate(doc, update) {
  if (update.$set) {
    Object.assign(doc, update.$set);
  }
  if (update.$inc) {
    for (const [k, v] of Object.entries(update.$inc)) {
      doc[k] = (doc[k] || 0) + v;
    }
  }
  return doc;
}

function createMockCollection(name) {
  return {
    createIndex: async () => ({}),
    findOne: async (query) => {
      const data = loadMockData();
      const list = data[name] || [];
      const item = list.find((doc) => matchesQuery(doc, query));
      return item ? JSON.parse(JSON.stringify(item)) : null;
    },
    find: (query) => {
      const data = loadMockData();
      const list = (data[name] || []).filter((doc) => matchesQuery(doc, query));
      const cursor = {
        project: () => cursor,
        toArray: async () => JSON.parse(JSON.stringify(list)),
      };
      return cursor;
    },
    updateOne: async (query, update, options = {}) => {
      const data = loadMockData();
      if (!data[name]) data[name] = [];
      const list = data[name];
      const idx = list.findIndex((doc) => matchesQuery(doc, query));
      if (idx >= 0) {
        applyUpdate(list[idx], update);
        saveMockData();
        return { modifiedCount: 1, upsertedCount: 0 };
      }
      if (options.upsert) {
        const newDoc = { ...query };
        if (update.$setOnInsert) Object.assign(newDoc, update.$setOnInsert);
        applyUpdate(newDoc, update);
        list.push(newDoc);
        saveMockData();
        return { modifiedCount: 0, upsertedCount: 1, upsertedId: newDoc._id };
      }
      return { modifiedCount: 0, upsertedCount: 0 };
    },
    findOneAndUpdate: async (query, update, options = {}) => {
      const data = loadMockData();
      if (!data[name]) data[name] = [];
      const list = data[name];
      const idx = list.findIndex((doc) => matchesQuery(doc, query));
      if (idx >= 0) {
        const oldDoc = JSON.parse(JSON.stringify(list[idx]));
        applyUpdate(list[idx], update);
        saveMockData();
        const updated = JSON.parse(JSON.stringify(list[idx]));
        return options.returnDocument === 'after' ? { value: updated, ...updated } : { value: oldDoc, ...oldDoc };
      }
      if (options.upsert) {
        const newDoc = { ...query };
        if (update.$setOnInsert) Object.assign(newDoc, update.$setOnInsert);
        applyUpdate(newDoc, update);
        list.push(newDoc);
        saveMockData();
        const inserted = JSON.parse(JSON.stringify(newDoc));
        return { value: inserted, ...inserted };
      }
      return null;
    },
    deleteOne: async (query) => {
      const data = loadMockData();
      if (!data[name]) return { deletedCount: 0 };
      const idx = data[name].findIndex((doc) => matchesQuery(doc, query));
      if (idx >= 0) {
        data[name].splice(idx, 1);
        saveMockData();
        return { deletedCount: 1 };
      }
      return { deletedCount: 0 };
    },
    deleteMany: async (query) => {
      const data = loadMockData();
      if (!data[name]) return { deletedCount: 0 };
      const before = data[name].length;
      data[name] = data[name].filter((doc) => !matchesQuery(doc, query));
      saveMockData();
      return { deletedCount: before - data[name].length };
    },
    bulkWrite: async (ops) => {
      const col = createMockCollection(name);
      for (const op of ops) {
        if (op.updateOne) {
          await col.updateOne(op.updateOne.filter, op.updateOne.update, { upsert: op.updateOne.upsert });
        } else if (op.deleteOne) {
          await col.deleteOne(op.deleteOne.filter);
        }
      }
      return { ok: 1 };
    },
  };
}

function createMockDb() {
  return {
    collection: (name) => createMockCollection(name),
    db: () => createMockDb(),
    command: async () => ({ ok: 1 }),
  };
}

async function connectMongo(uri) {
  if (!uri || uri.includes('YOUR_MONGODB')) {
    console.warn(chalk.yellow('[MongoDB] MONGODB_URI not provided — using mock fallback store'));
    db = createMockDb();
    return db;
  }

  if (db && client) {
    try {
      await client.db('admin').command({ ping: 1 });
      return db;
    } catch (e) {
      try { await client.close(); } catch (e2) {}
      client = null;
      db = null;
    }
  }

  if (connecting) return connecting;

  connecting = (async function () {
    try {
      client = new MongoClient(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });
      await client.connect();
      db = client.db('dcl_mini_bot');
      console.log(chalk.green('[MongoDB] Connected successfully'));
      connecting = null;
      return db;
    } catch (err) {
      connecting = null;
      client = null;
      console.warn(chalk.yellow('[MongoDB] Connection unavailable (' + err.message + ') — using mock fallback store'));
      db = createMockDb();
      return db;
    }
  })();

  return connecting;
}

async function useMongoAuthState(mongoUri, sessionId) {
  sessionId = sessionId || 'default';
  var database = await connectMongo(mongoUri);
  var collection = database.collection('sessions');

  await collection.createIndex({ sessionId: 1, key: 1 }, { unique: true }).catch(function () {});

  // High-performance in-memory key cache to prevent decryption delays
  var keyCache = new Map();

  var writeData = async function (key, data) {
    keyCache.set(key, data);
    try {
      await collection.updateOne(
        { sessionId: sessionId, key: key },
        {
          $set: {
            sessionId: sessionId,
            key: key,
            data: JSON.stringify(data, BufferJSON.replacer),
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
    } catch (e) {
      console.error('[MongoDB] writeData error:', e.message);
    }
  };

  var readData = async function (key) {
    if (keyCache.has(key)) {
      return keyCache.get(key);
    }
    var doc = await collection.findOne({ sessionId: sessionId, key: key });
    if (!doc || !doc.data) return null;
    try {
      var parsed = JSON.parse(doc.data, BufferJSON.reviver);
      keyCache.set(key, parsed);
      return parsed;
    } catch (e) {
      return null;
    }
  };

  var removeData = async function (key) {
    keyCache.delete(key);
    try {
      await collection.deleteOne({ sessionId: sessionId, key: key });
    } catch (_) {}
  };

  var creds = (await readData('creds')) || initAuthCreds();

  var clearCorruptedKeys = async function (targetId) {
    if (!targetId) return;
    var raw = String(targetId);
    var cleanId = raw.replace(/[^0-9]/g, '');
    var possibleKeys = [
      'session-' + raw,
      'session-' + cleanId,
      'session-' + cleanId + '.1',
      'session-' + raw + '.1',
      'sender-key-' + raw,
      'sender-key-memory-' + raw,
      raw,
    ];

    for (var i = 0; i < possibleKeys.length; i++) {
      keyCache.delete(possibleKeys[i]);
    }

    try {
      await collection.deleteMany({
        sessionId: sessionId,
        key: { $in: possibleKeys },
      });
    } catch (_) {}
  };

  try {
    const { registerSessionCleaner } = require('../lib/signalAutoHeal');
    registerSessionCleaner(clearCorruptedKeys);
  } catch (_) {}

  return {
    state: {
      creds: creds,
      keys: {
        get: async function (type, ids) {
          var data = {};
          var missingIds = [];

          // 1. Fetch from fast in-memory key cache first
          for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var fullKey = type + '-' + id;
            if (keyCache.has(fullKey)) {
              data[id] = keyCache.get(fullKey);
            } else {
              missingIds.push(id);
            }
          }

          if (missingIds.length === 0) {
            return data;
          }

          // 2. Batch query MongoDB with $in for missing keys in ONE fast trip
          var queryKeys = missingIds.map(function (mid) {
            return type + '-' + mid;
          });
          try {
            var docs = await collection
              .find({ sessionId: sessionId, key: { $in: queryKeys } })
              .toArray();

            for (var d = 0; d < docs.length; d++) {
              var doc = docs[d];
              if (doc && doc.data) {
                try {
                  var val = JSON.parse(doc.data, BufferJSON.reviver);
                  var realId = doc.key.slice(type.length + 1);
                  keyCache.set(doc.key, val);
                  data[realId] = val;
                } catch (_) {}
              }
            }
          } catch (e) {
            console.error('[MongoDB] batch keys.get error:', e.message);
          }

          return data;
        },
        set: async function (newData) {
          var operations = [];
          var categories = Object.keys(newData);
          for (var i = 0; i < categories.length; i++) {
            var category = categories[i];
            var ids = Object.keys(newData[category]);
            for (var j = 0; j < ids.length; j++) {
              var id = ids[j];
              var value = newData[category][id];
              var key = category + '-' + id;
              if (value) {
                keyCache.set(key, value);
                operations.push({
                  updateOne: {
                    filter: { sessionId: sessionId, key: key },
                    update: {
                      $set: {
                        sessionId: sessionId,
                        key: key,
                        data: JSON.stringify(value, BufferJSON.replacer),
                        updatedAt: new Date(),
                      },
                    },
                    upsert: true,
                  },
                });
              } else {
                keyCache.delete(key);
                operations.push({
                  deleteOne: {
                    filter: { sessionId: sessionId, key: key },
                  },
                });
              }
            }
          }
          if (operations.length > 0) {
            try {
              await collection.bulkWrite(operations, { ordered: false });
            } catch (e) {
              console.error('[MongoDB] bulkWrite keys.set error:', e.message);
            }
          }
        },
      },
    },
    saveCreds: async function () {
      await writeData('creds', creds);
    },
    clearSession: async function () {
      keyCache.clear();
      await collection.deleteMany({ sessionId: sessionId });
      console.log(chalk.yellow('[MongoDB] Session ' + sessionId + ' cleared'));
    },
  };
}

/**
 * List sessionIds that have saved creds (for auto-restore after restart)
 */
async function listSavedSessions(mongoUri) {
  var database = await connectMongo(mongoUri);
  var collection = database.collection('sessions');
  var docs = await collection.find({ key: 'creds' }).project({ sessionId: 1, data: 1 }).toArray();
  var result = [];
  for (var i = 0; i < docs.length; i++) {
    var doc = docs[i];
    if (!doc.sessionId || !doc.data) continue;
    try {
      var creds = JSON.parse(doc.data, BufferJSON.reviver);
      if (creds && creds.registered) {
        result.push(doc.sessionId);
      }
    } catch (e) {}
  }
  return result;
}

async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log(chalk.yellow('[MongoDB] Connection closed'));
  }
}

module.exports = {
  useMongoAuthState: useMongoAuthState,
  connectMongo: connectMongo,
  closeMongo: closeMongo,
  listSavedSessions: listSavedSessions,
};
