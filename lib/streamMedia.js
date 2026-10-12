/**
 * High-Performance Streaming Media & Large File Engine (2GB+ Support)
 * Zero external dependencies. Uses pure Node.js fs, stream, and crypto modules.
 * Prevents V8 Out-Of-Memory (OOM) errors by streaming in 64KB-512KB chunks.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { Transform, Readable } = require('stream');

/**
 * Pure Node.js streaming HTTP/HTTPS GET with automatic redirect following
 */
function getHttpStream(url, options = {}) {
  return new Promise((resolve, reject) => {
    let redirectCount = 0;
    const maxRedirects = options.maxRedirects || 5;

    function doRequest(currentUrl) {
      const parsed = new URL(currentUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.get(
        currentUrl,
        {
          headers: {
            'User-Agent':
              options.userAgent ||
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            ...(options.headers || {}),
          },
          timeout: options.timeout || 30000,
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            redirectCount++;
            if (redirectCount > maxRedirects) {
              return reject(new Error('[Stream Engine] Too many HTTP redirects'));
            }
            const nextUrl = new URL(res.headers.location, currentUrl).toString();
            return doRequest(nextUrl);
          }
          if (res.statusCode >= 400) {
            return reject(new Error(`[Stream Engine] HTTP ${res.statusCode}: ${res.statusMessage}`));
          }
          const contentLength = parseInt(res.headers['content-length'], 10) || 0;
          const contentType = res.headers['content-type']?.split(';')[0]?.trim();
          resolve({
            stream: res,
            contentLength,
            contentType,
            headers: res.headers,
            url: currentUrl,
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('[Stream Engine] Connection timed out'));
      });
    }

    doRequest(url);
  });
}

// MIME type dictionary
const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.webm': 'video/webm',
  '.flv': 'video/x-flv',
  '.ts': 'video/mp2t',
  '.m4v': 'video/x-m4v',
  '.3gp': 'video/3gpp',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.iso': 'application/iso9660-image',
  '.apk': 'application/vnd.android.package-archive',
  '.exe': 'application/x-msdownload',
  '.dmg': 'application/x-apple-diskimage',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

function getMimeType(filePath, fallback = 'application/octet-stream') {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || fallback;
}

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

class StreamProgressTracker extends Transform {
  constructor(options = {}) {
    super();
    this.totalBytes = options.totalBytes || 0;
    this.uploadedBytes = 0;
    this.startTime = Date.now();
    this.lastEmitTime = Date.now();
    this.onProgress = options.onProgress || null;
    this.emitInterval = options.emitInterval || 800;
  }

  _transform(chunk, encoding, callback) {
    this.uploadedBytes += chunk.length;
    const now = Date.now();

    if (this.onProgress && (now - this.lastEmitTime >= this.emitInterval || this.uploadedBytes === this.totalBytes)) {
      const elapsedMs = Math.max(now - this.startTime, 1);
      const speedBytesPerSec = (this.uploadedBytes / elapsedMs) * 1000;
      const percent = this.totalBytes > 0 ? (this.uploadedBytes / this.totalBytes) * 100 : 0;
      const remainingBytes = Math.max(this.totalBytes - this.uploadedBytes, 0);
      const etaSeconds = speedBytesPerSec > 0 ? remainingBytes / speedBytesPerSec : 0;

      this.onProgress({
        uploadedBytes: this.uploadedBytes,
        totalBytes: this.totalBytes,
        percent: parseFloat(percent.toFixed(1)),
        speedMBs: parseFloat((speedBytesPerSec / (1024 * 1024)).toFixed(2)),
        uploadedFormatted: formatBytes(this.uploadedBytes),
        totalFormatted: formatBytes(this.totalBytes),
        etaFormatted: formatTime(etaSeconds * 1000),
        elapsedFormatted: formatTime(elapsedMs)
      });

      this.lastEmitTime = now;
    }

    this.push(chunk);
    callback();
  }
}

class StreamEngine {
  static createStreamPayload(source, options = {}) {
    let readStream;
    let totalSize = options.fileSize || 0;
    let fileName = options.fileName || 'file.bin';
    let mimetype = options.mimetype || null;

    if (typeof source === 'string') {
      const resolvedPath = path.resolve(source);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`[Stream Engine] File not found at path: ${resolvedPath}`);
      }

      const stat = fs.statSync(resolvedPath);
      totalSize = stat.size;
      fileName = options.fileName || path.basename(resolvedPath);
      mimetype = mimetype || getMimeType(resolvedPath);

      readStream = fs.createReadStream(resolvedPath, {
        highWaterMark: options.highWaterMark || 64 * 1024
      });
    } else if (source instanceof Readable) {
      readStream = source;
      mimetype = mimetype || 'application/octet-stream';
    } else {
      throw new Error('[Stream Engine] Invalid source. Expected file path string or Node.js Readable stream.');
    }

    let streamToSend = readStream;
    if (typeof options.onProgress === 'function') {
      const tracker = new StreamProgressTracker({
        totalBytes: totalSize,
        onProgress: options.onProgress,
        emitInterval: options.progressInterval || 800
      });
      streamToSend = readStream.pipe(tracker);
    }

    const asDocument = options.asDocument !== false;

    const payload = asDocument
      ? {
          document: streamToSend,
          mimetype: mimetype,
          fileName: fileName,
          fileLength: totalSize,
          caption: options.caption || '',
          contextInfo: options.contextInfo || undefined
        }
      : {
          video: streamToSend,
          mimetype: mimetype,
          caption: options.caption || '',
          contextInfo: options.contextInfo || undefined
        };

    return {
      payload,
      meta: {
        fileName,
        fileSize: totalSize,
        fileSizeFormatted: formatBytes(totalSize),
        mimetype,
        isStream: true
      }
    };
  }

  static async sendLargeFile(sock, jid, source, options = {}) {
    let resolvedSource = source;
    const computedOptions = { ...options };

    if (typeof source === 'string' && /^https?:\/\//i.test(source)) {
      const httpInfo = await getHttpStream(source, options);
      resolvedSource = httpInfo.stream;
      if (!computedOptions.fileSize && httpInfo.contentLength) {
        computedOptions.fileSize = httpInfo.contentLength;
      }
      if (!computedOptions.mimetype && httpInfo.contentType) {
        computedOptions.mimetype = httpInfo.contentType;
      }
      if (!computedOptions.fileName) {
        try {
          const pathname = new URL(httpInfo.url).pathname;
          const base = path.basename(pathname);
          if (base && base.length > 2) computedOptions.fileName = decodeURIComponent(base);
        } catch (_) {}
      }
    }

    const { payload, meta } = StreamEngine.createStreamPayload(resolvedSource, computedOptions);
    const sendOptions = {
      quoted: options.quoted,
      timestamp: new Date()
    };

    const startTime = Date.now();
    const result = await sock.sendMessage(jid, payload, sendOptions);
    const durationMs = Date.now() - startTime;

    return {
      messageId: result?.key?.id,
      meta,
      durationMs,
      durationFormatted: formatTime(durationMs),
      result
    };
  }
}

module.exports = {
  StreamEngine,
  TobiStreamEngine: StreamEngine, // Backward compatibility alias
  StreamProgressTracker,
  getMimeType,
  formatBytes,
  formatTime,
  getHttpStream,
};
