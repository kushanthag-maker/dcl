/**
 * ⚡ TOBI - High-Performance Baileys WhatsApp Wrapper Engine
 * 
 * Key Features:
 * 1. Zero External Dependencies - Relies exclusively on @whiskeysockets/baileys and Node.js built-in modules.
 * 2. Dual Authentication - QR Code and Automatic Phone Pairing Code (sock.requestPairingCode).
 * 3. Interactive Messages - Native WhatsApp Buttons, Call, URL, Copy, and Single-Select Lists (Baileys v6+).
 * 4. 2GB+ File Streaming - Chunked stream pipeline (64KB buffer) with zero RAM bloat and real-time progress.
 * 5. Event-Driven Architecture - Extends Node.js EventEmitter with lightning-fast command registration.
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser
} = require('@whiskeysockets/baileys');

const { TobiLogger, COLORS } = require('./lib/logger');
const { displayQR } = require('./lib/qrTerminal');
const { TobiStreamEngine, getHttpStream } = require('./lib/streamMedia');
const { TobiInteractive } = require('./lib/interactive');
const { serializeMessage } = require('./lib/serializer');

class Tobi extends EventEmitter {
  /**
   * Initialize Tobi Bot Instance
   * @param {Object} config
   * @param {string} [config.sessionDir='./tobi_session'] - Directory to store auth credentials
   * @param {string} [config.phoneNumber] - Phone number for pairing code (e.g. '94712345678')
   * @param {'pairing'|'qr'|'auto'} [config.authType='auto'] - Authentication strategy
   * @param {string[]} [config.prefixes=['.', '/', '!']] - Command prefixes
   * @param {boolean} [config.allowPrefixless=false] - Allow commands without prefix
   * @param {string[]} [config.owners=[]] - Phone numbers or JIDs of bot owners
   * @param {'debug'|'info'|'warn'|'error'|'silent'} [config.logLevel='info'] - Logging verbosity
   * @param {boolean} [config.autoReconnect=true] - Auto-reconnect on connection drop
   * @param {Object} [config.socketOptions={}] - Additional raw Baileys socket options
   */
  constructor(config = {}) {
    super();

    this.config = {
      sessionDir: path.resolve(config.sessionDir || './tobi_session'),
      phoneNumber: config.phoneNumber ? String(config.phoneNumber).replace(/\D/g, '') : null,
      authType: config.authType || (config.phoneNumber ? 'pairing' : 'auto'),
      prefixes: config.prefixes || ['.', '/', '!'],
      allowPrefixless: Boolean(config.allowPrefixless),
      owners: (config.owners || []).map(o => String(o).replace(/\D/g, '')),
      logLevel: config.logLevel || 'info',
      autoReconnect: config.autoReconnect !== false,
      socketOptions: config.socketOptions || {}
    };

    this.prefixes = this.config.prefixes;
    this.allowPrefixless = this.config.allowPrefixless;

    // Zero-dependency ANSI logger
    this.logger = new TobiLogger({ name: 'Tobi', level: this.config.logLevel });

    // Internal state
    this.sock = null;
    this.authState = null;
    this.saveCreds = null;
    this.isConnected = false;
    this.pairingCodeRequested = false;

    // Fast command map
    this.commands = new Map();
    this.commandAliases = new Map();
    this.middlewares = [];

    // Built-in handlers
    this._setupInternalListeners();
  }

  _setupInternalListeners() {
    this.on('error', (err) => {
      this.logger.error('Unhandled internal error:', err?.message || err);
    });
  }

  /**
   * Check if a JID belongs to the bot owner
   */
  isOwner(jid) {
    if (!jid) return false;
    const cleanJid = String(jid).replace(/@.*$/, '').replace(/\D/g, '');
    return this.config.owners.includes(cleanJid);
  }

  /**
   * Format pairing code for display (e.g. 1234-5678)
   */
  _formatPairingCode(code) {
    if (!code) return '';
    const clean = String(code).trim();
    if (clean.length === 8) {
      return `${clean.slice(0, 4)}-${clean.slice(4)}`;
    }
    return clean;
  }

  /**
   * Register a bot command
   * @param {string|string[]} name - Command name or array of names
   * @param {Function} handler - async (m, context) => {}
   * @param {Object} options - { desc, aliases, ownerOnly, groupOnly, privateOnly }
   */
  command(name, handler, options = {}) {
    const primaryName = Array.isArray(name) ? name[0].toLowerCase() : name.toLowerCase();
    const allAliases = Array.isArray(name) ? name.slice(1).map(n => n.toLowerCase()) : [];

    if (options.aliases && Array.isArray(options.aliases)) {
      allAliases.push(...options.aliases.map(a => a.toLowerCase()));
    }

    const commandMeta = {
      name: primaryName,
      aliases: allAliases,
      handler,
      desc: options.desc || 'No description provided',
      category: options.category || 'General',
      ownerOnly: Boolean(options.ownerOnly),
      groupOnly: Boolean(options.groupOnly),
      privateOnly: Boolean(options.privateOnly)
    };

    this.commands.set(primaryName, commandMeta);

    // Map aliases to primary name
    for (const alias of allAliases) {
      this.commandAliases.set(alias, primaryName);
    }

    return this;
  }

  /**
   * Add middleware function
   * @param {Function} fn - async (m, next) => {}
   */
  use(fn) {
    if (typeof fn === 'function') {
      this.middlewares.push(fn);
    }
    return this;
  }

  /**
   * Listen to all incoming messages
   */
  onMessage(handler) {
    this.on('message', handler);
    return this;
  }

  /**
   * Initialize and connect to WhatsApp
   */
  async launch() {
    this.logger.banner('Starting Tobi Baileys Engine...');

    // 1. Session Storage setup (Pure Node.js multi-file auth)
    if (!fs.existsSync(this.config.sessionDir)) {
      fs.mkdirSync(this.config.sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.config.sessionDir);
    this.authState = state;
    this.saveCreds = saveCreds;

    // 2. Fetch latest version
    const { version, isLatest } = await fetchLatestBaileysVersion();
    this.logger.info(`Using Baileys WhatsApp v${version.join('.')}${isLatest ? ' (Latest)' : ''}`);

    // 3. Socket creation
    const sock = makeWASocket({
      version,
      auth: state,
      logger: this.logger.toBaileysLogger(),
      printQRInTerminal: false, // Handled internally via Tobi dual-auth engine
      defaultQueryTimeoutMs: 60000,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      browser: ['Tobi Engine (Linux)', 'Chrome', '124.0.6367.207'],
      ...this.config.socketOptions
    });

    this.sock = sock;

    // 4. Save credentials automatically on update
    sock.ev.on('creds.update', saveCreds);

    // 5. Connection lifecycle handling
    sock.ev.on('connection.update', async (update) => {
      await this._handleConnectionUpdate(update);
    });

    // 6. Incoming messages processing
    sock.ev.on('messages.upsert', async (upsert) => {
      await this._handleMessagesUpsert(upsert);
    });

    return this;
  }

  /**
   * Internal connection state handler (QR & Pairing Code logic)
   */
  async _handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;
    this.emit('connection.update', update);

    // DUAL AUTHENTICATION LOGIC:
    // Case A: Pairing Code requested
    const shouldUsePairing = Boolean(this.config.phoneNumber) &&
      (this.config.authType === 'pairing' || this.config.authType === 'auto');

    if (shouldUsePairing && !this.sock.authState.creds.registered && !this.pairingCodeRequested) {
      this.pairingCodeRequested = true;
      try {
        const cleanPhone = this.config.phoneNumber;
        this.logger.info(`Requesting Pairing Code for phone: ${COLORS.cyan}+${cleanPhone}${COLORS.reset}...`);

        // Small delay to allow socket readiness
        setTimeout(async () => {
          try {
            const rawCode = await this.sock.requestPairingCode(cleanPhone);
            const formatted = this._formatPairingCode(rawCode);

            console.log(`\n${COLORS.bright}${COLORS.bgBlue}   WHATSAPP PAIRING CODE   ${COLORS.reset}`);
            console.log(`${COLORS.bright}${COLORS.green}👉 CODE: ${COLORS.yellow}${formatted}${COLORS.reset}`);
            console.log(`${COLORS.cyan}📱 Phone: +${cleanPhone}${COLORS.reset}`);
            console.log(`${COLORS.gray}Enter this code on your WhatsApp: Settings > Linked Devices > Link with phone number\n${COLORS.reset}`);

            this.emit('pairing_code', {
              code: rawCode,
              formattedCode: formatted,
              phoneNumber: cleanPhone
            });
          } catch (err) {
            this.logger.error('Failed to request pairing code:', err?.message || err);
            this.pairingCodeRequested = false;
          }
        }, 2000);
      } catch (err) {
        this.logger.error('Pairing code setup error:', err?.message || err);
        this.pairingCodeRequested = false;
      }
    }

    // Case B: QR Code generated (if not pairing or phone not provided)
    if (qr && (!shouldUsePairing || this.config.authType === 'qr')) {
      this.logger.info('New QR Code generated:');
      displayQR(qr);
      this.emit('qr', { qr });
    }

    // Connection Opened
    if (connection === 'open') {
      this.isConnected = true;
      const user = this.sock.user;
      this.logger.success(`Connection established! Connected as: ${COLORS.bright}${user?.id || 'Unknown'}${COLORS.reset} (${user?.name || 'Bot'})`);
      this.emit('ready', { user });
    }

    // Connection Closed
    if (connection === 'close') {
      this.isConnected = false;
      this.pairingCodeRequested = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = DisconnectReason[statusCode] || 'Unknown';
      this.logger.warn(`Connection closed. Status: ${statusCode} (${reason})`);
      this.emit('close', { statusCode, reason });

      const shouldReconnect = this.config.autoReconnect && statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        this.logger.info('Attempting automatic reconnection in 4 seconds...');
        setTimeout(() => {
          this.launch().catch((err) => {
            this.logger.error('Reconnection attempt failed:', err?.message || err);
          });
        }, 4000);
      } else if (statusCode === DisconnectReason.loggedOut) {
        this.logger.error('Device was logged out. Please remove the session folder to re-authenticate.');
        this.emit('logged_out');
      }
    }
  }

  /**
   * Internal message dispatcher & serializer
   */
  async _handleMessagesUpsert(upsert) {
    if (!upsert.messages || upsert.type !== 'notify') return;

    for (const rawMsg of upsert.messages) {
      try {
        // Fast serialization
        const m = serializeMessage(this.sock, rawMsg, this);
        if (!m || m.isStatus) continue;

        // Run middlewares
        let proceed = true;
        for (const mw of this.middlewares) {
          await mw(m, () => { proceed = true; });
          if (!proceed) break;
        }
        if (!proceed) continue;

        // Emit general message event
        this.emit('message', m);

        // Command routing
        if (m.command) {
          const targetCmdName = this.commandAliases.get(m.command) || m.command;
          const cmd = this.commands.get(targetCmdName);

          if (cmd) {
            // Permission checks
            if (cmd.ownerOnly && !m.isOwner) {
              await m.reply('⛔ This command is restricted to the bot owner.');
              continue;
            }
            if (cmd.groupOnly && !m.isGroup) {
              await m.reply('👥 This command can only be used in groups.');
              continue;
            }
            if (cmd.privateOnly && m.isGroup) {
              await m.reply('🔒 This command can only be used in private chat.');
              continue;
            }

            // Command execution context
            const context = {
              args: m.args,
              text: m.text,
              command: m.command,
              prefix: m.prefix,
              tobi: this,
              sock: this.sock
            };

            await cmd.handler(m, context);
            this.emit('command', { command: cmd.name, message: m });
          }
        }
      } catch (err) {
        this.logger.error('Error handling message:', err?.message || err);
        this.emit('message_error', { error: err, rawMsg });
      }
    }
  }

  // ==========================================
  // HIGH-PERFORMANCE OUTBOUND METHODS
  // ==========================================

  /**
   * Send a standard text message
   */
  async sendText(jid, text, options = {}) {
    return this.sock.sendMessage(jid, { text: String(text) }, options);
  }

  /**
   * Send Interactive Buttons Message (Baileys v6+ Proto)
   * Supports Quick Reply, CTA URL, CTA Call, CTA Copy
   */
  async sendButtons(jid, options = {}) {
    return TobiInteractive.send(this.sock, jid, options);
  }

  /**
   * Send Single-Select Interactive List Message
   */
  async sendList(jid, options = {}) {
    const listBtn = TobiInteractive.listMenu(options.buttonText || options.title || 'View Options', options.sections || []);
    return TobiInteractive.send(this.sock, jid, {
      body: options.body || options.text,
      footer: options.footer,
      headerTitle: options.headerTitle || options.title,
      buttons: [listBtn],
      quoted: options.quoted
    });
  }

  /**
   * Send 2GB+ File / Movie using Chunked Streaming Pipeline
   * Guaranteed zero V8 buffer bloat (<30MB RAM usage).
   * 
   * @param {string} jid - Target recipient JID
   * @param {string|Readable} fileSource - Local file path or Node.js readable stream
   * @param {Object} options - { fileName, caption, mimetype, onProgress, quoted }
   */
  async sendFile(jid, fileSource, options = {}) {
    this.logger.info(`Initiating streaming upload to: ${jid}...`);
    return TobiStreamEngine.sendLargeFile(this.sock, jid, fileSource, {
      ...options,
      onProgress: (p) => {
        if (options.onProgress) {
          options.onProgress(p);
        } else {
          this.logger.info(`[Tobi Stream] ${p.uploadedFormatted} / ${p.totalFormatted} (${p.percent}%) | Speed: ${p.speedMBs} MB/s | ETA: ${p.etaFormatted}`);
        }
      }
    });
  }
}

module.exports = {
  Tobi,
  TobiInteractive,
  TobiStreamEngine,
  TobiLogger,
  serializeMessage,
  displayQR,
  getHttpStream
};
