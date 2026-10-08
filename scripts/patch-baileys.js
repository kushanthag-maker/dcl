const fs = require('fs');
const path = require('path');

function patchFile(relPath, transforms) {
  const fullPath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) return;
  let content = fs.readFileSync(fullPath, 'utf8');
  let changed = false;
  for (const { from, to } of transforms) {
    if (content.includes(from)) {
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

  console.log('[patch-baileys] Baileys Node 22/24 compatibility patch complete.');
} catch (e) {
  console.warn('[patch-baileys] Warning:', e.message);
}
