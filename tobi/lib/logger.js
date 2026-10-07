/**
 * Tobi - High-Performance Zero-Dependency Logger
 * Pure Node.js ANSI color console formatter.
 * No external packages (pino/chalk/winston) required!
 */

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m'
};

class TobiLogger {
  constructor(options = {}) {
    this.name = options.name || 'Tobi';
    this.level = options.level || 'info'; // 'debug' | 'info' | 'warn' | 'error' | 'silent'
    this.levels = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
  }

  _timestamp() {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
  }

  _format(levelLabel, color, ...args) {
    if (this.levels[this.level] > this.levels[levelLabel]) return;
    const time = `${COLORS.gray}[${this._timestamp()}]${COLORS.reset}`;
    const badge = `${color}${COLORS.bright}[${this.name}:${levelLabel.toUpperCase()}]${COLORS.reset}`;
    console.log(time, badge, ...args);
  }

  debug(...args) {
    this._format('debug', COLORS.gray, ...args);
  }

  info(...args) {
    this._format('info', COLORS.cyan, ...args);
  }

  success(...args) {
    this._format('info', COLORS.green, ...args);
  }

  warn(...args) {
    this._format('warn', COLORS.yellow, ...args);
  }

  error(...args) {
    this._format('error', COLORS.red, ...args);
  }

  banner(text) {
    console.log(`\n${COLORS.bright}${COLORS.cyan}======================================================${COLORS.reset}`);
    console.log(`${COLORS.bright}${COLORS.magenta}  🚀 ${this.name.toUpperCase()} ENGINE - BAILEYS WRAPPER${COLORS.reset}`);
    console.log(`${COLORS.dim}  ${text || 'High Performance | Zero-Dependencies | Stream-Safe'}${COLORS.reset}`);
    console.log(`${COLORS.bright}${COLORS.cyan}======================================================${COLORS.reset}\n`);
  }

  /**
   * Provides a minimal Baileys-compatible logger dummy to satisfy Baileys internal calls
   * without requiring pino.
   */
  toBaileysLogger() {
    return {
      level: this.level,
      trace: (...args) => this.debug(...args),
      debug: (...args) => this.debug(...args),
      info: (...args) => this.level === 'debug' ? this.info(...args) : null,
      warn: (...args) => this.warn(...args),
      error: (...args) => this.error(...args),
      fatal: (...args) => this.error(...args),
      child: () => this.toBaileysLogger()
    };
  }
}

module.exports = { TobiLogger, COLORS };
