require('dotenv').config();

const config = {
  botName: process.env.BOT_NAME || 'DCL MINI',
  prefix: process.env.PREFIX || '.',
  ownerNumber: (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, ''),
  sessionId: process.env.SESSION_ID || 'dcl-mini-main',
  mongoUri: process.env.MONGODB_URI || '',
  port: process.env.DYNO
    ? parseInt(process.env.PORT || '5000', 10)
    : (process.env.PORT && process.env.PORT !== '8080' ? parseInt(process.env.PORT, 10) : 3000),
  host: '0.0.0.0',
  timezone: process.env.TZ || 'Asia/Colombo',

  // Feature toggles
  autoRead: false,
  autoTyping: false,
  autoRecord: false,
  autoStatus: false,

  // Rate limit (messages per minute per user)
  rateLimit: 20,
};

if (!config.mongoUri || config.mongoUri.includes('YOUR_MONGODB')) {
  console.warn('\x1b[33m[WARNING] MONGODB_URI is not set properly in .env\x1b[0m');
}

module.exports = config;
