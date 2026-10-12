const fs = require('fs');
const path = require('path');

function patchFile(relPath, transforms) {
  const fullPath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) return;
  let content = fs.readFileSync(fullPath, 'utf8');
  let changed = false;
  for (const { from, to } of transforms) {
    if (content.includes(from) && !content.includes(to)) {
      content = content.replace(from, to);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(fullPath, content);
    console.log('[patch-baileys] Patched', relPath);
  }
}

try {
  // 1. Fix WAMessageStubType TDZ circular dependency in Node 22+
  const pmPath = path.join(__dirname, '..', 'node_modules/@whiskeysockets/baileys/lib/Utils/process-message.js');
  if (fs.existsSync(pmPath)) {
    let pmContent = fs.readFileSync(pmPath, 'utf8');
    // Replace Types_1.proto.WebMessageInfo or Types_1.WAMessageStubType with WAProto_1.proto.WebMessageInfo.StubType
    pmContent = pmContent.replace(/Types_1\.proto\.WebMessageInfo\.StubType\./g, 'WAProto_1.proto.WebMessageInfo.StubType.');
    pmContent = pmContent.replace(/Types_1\.WAMessageStubType\./g, 'WAProto_1.proto.WebMessageInfo.StubType.');
    // For ESM build if present
    if (!pmContent.includes('WAProto_1')) {
      pmContent = pmContent.replace(/WAMessageStubType\./g, 'proto.WebMessageInfo.StubType.');
    }
    fs.writeFileSync(pmPath, pmContent);
    console.log('[patch-baileys] Fully patched process-message.js');
  }

  // 2. Fix Browsers TDZ circular dependency in Node 22+
  patchFile('node_modules/@whiskeysockets/baileys/lib/Defaults/index.js', [
    {
      from: "import { Browsers } from '../Utils/index.js';",
      to: "import { Browsers } from '../Utils/generics.js';"
    },
    {
      from: "browser: Browsers.ubuntu('Chrome'),",
      to: "browser: ['Ubuntu', 'Chrome', '22.04.4'],"
    }
  ]);

  // 3. Patch socket.js to prevent unhandled rejection 1006 and safe cleanup on close
  patchFile('node_modules/@whiskeysockets/baileys/lib/Socket/socket.js', [
    {
      from: "onErr = err => {\n                    reject(err || new boom_1.Boom('Connection Closed', { statusCode: Types_1.DisconnectReason.connectionClosed }));\n                };",
      to: "onErr = err => {\n                    var errorObj = (err instanceof Error) ? err : new boom_1.Boom('Connection Closed (' + (err || 'abnormal') + ')', { statusCode: typeof err === 'number' ? err : Types_1.DisconnectReason.connectionClosed });\n                    reject(errorObj);\n                };"
    },
    {
      from: "ws.removeAllListeners('error');\n        ws.removeAllListeners('open');",
      to: "ws.removeAllListeners('error');\n        ws.on('error', () => {});\n        ws.removeAllListeners('open');"
    }
  ]);

  // 4. Patch WebSocketClient to prevent unhandled error emission when socket aborts
  patchFile('node_modules/@whiskeysockets/baileys/lib/Socket/Client/websocket.js', [
    {
      from: "        this.socket.setMaxListeners(0);",
      to: "        try {\n            this.socket.setMaxListeners(0);\n            this.socket.on('error', () => {});\n        } catch (_) {}"
    },
    {
      from: "(_b = this.socket) === null || _b === void 0 ? void 0 : _b.on(event, (...args) => this.emit(event, ...args));",
      to: "(_b = this.socket) === null || _b === void 0 ? void 0 : _b.on(event, (...args) => {\n                if (event === 'error' && this.listenerCount('error') === 0) return;\n                this.emit(event, ...args);\n            });"
    },
    {
      from: "this.socket.close();\n        this.socket = null;",
      to: "try {\n            this.socket.on('error', () => {});\n            this.socket.close();\n        } catch (_) {}\n        this.socket = null;"
    }
  ]);

  // 5. Patch libsignal session_cipher to remove raw console.error log spam on MessageCounterError/Bad MAC
  function walkAndPatchSessionCiphers(dir) {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkAndPatchSessionCiphers(full);
        } else if (entry.name === 'session_cipher.js') {
          let content = fs.readFileSync(full, 'utf8');
          let modified = false;
          if (content.includes('console.error("Session error:" + e, e.stack);')) {
            content = content.replace(
              /console\.error\("Failed to decrypt message with any known session\.\.\."\);[\s\S]*?for \(const e of errs\) \{[\s\S]*?console\.error\("Session error:" \+ e, e\.stack\);[\s\S]*?\}/g,
              '// Suppressed console.error noise: errors handled gracefully by Baileys retry & auto-heal'
            );
            modified = true;
          }
          if (modified) {
            fs.writeFileSync(full, content);
            console.log('[patch-baileys] Patched session_cipher at', full);
          }
        }
      }
    } catch (_) {}
  }
  walkAndPatchSessionCiphers(path.join(__dirname, '..', 'node_modules'));

  console.log('[patch-baileys] Baileys Node 22/24 compatibility patch complete.');
} catch (e) {
  console.warn('[patch-baileys] Warning:', e.message);
}
