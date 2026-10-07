/**
 * TypeScript Type Definitions for Tobi Baileys Wrapper
 */

import { EventEmitter } from 'events';
import { Readable } from 'stream';
import type { WASocket, proto } from '@whiskeysockets/baileys';

export interface TobiConfig {
  sessionDir?: string;
  phoneNumber?: string;
  authType?: 'pairing' | 'qr' | 'auto';
  prefixes?: string[];
  allowPrefixless?: boolean;
  owners?: string[];
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  autoReconnect?: boolean;
  socketOptions?: Record<string, any>;
}

export interface StreamProgress {
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
  speedMBs: number;
  uploadedFormatted: string;
  totalFormatted: string;
  etaFormatted: string;
  elapsedFormatted: string;
}

export interface InteractiveButton {
  name?: string;
  buttonParamsJson?: string;
  type?: 'reply' | 'url' | 'call' | 'copy' | 'list';
  title?: string;
  text?: string;
  display_text?: string;
  id?: string;
  value?: string;
  url?: string;
  phone?: string;
  phone_number?: string;
  code?: string;
  copy_code?: string;
  sections?: ListSection[];
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
  header?: string;
}

export interface ListSection {
  title: string;
  highlight_label?: string;
  rows: ListRow[];
}

export interface SendButtonsOptions {
  body: string;
  footer?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  buttons: InteractiveButton[];
  quoted?: any;
}

export interface SendListOptions {
  body: string;
  footer?: string;
  title?: string;
  buttonText?: string;
  sections: ListSection[];
  quoted?: any;
}

export interface SendFileOptions {
  fileName?: string;
  caption?: string;
  mimetype?: string;
  highWaterMark?: number;
  asDocument?: boolean;
  onProgress?: (progress: StreamProgress) => void;
  quoted?: any;
}

export interface SerializedMessage {
  raw: any;
  key: any;
  id: string;
  from: string;
  sender: string;
  isGroup: boolean;
  isStatus: boolean;
  fromMe: boolean;
  isOwner: boolean;
  pushName: string;
  timestamp: number;
  body: string;
  prefix: string | null;
  command: string;
  args: string[];
  text: string;
  quoted: any;
  reply: (content: string | any, options?: any) => Promise<any>;
  react: (emoji: string) => Promise<any>;
  sendButtons: (options: SendButtonsOptions) => Promise<any>;
  sendList: (options: SendListOptions) => Promise<any>;
  sendFile: (source: string | Readable, options?: SendFileOptions) => Promise<any>;
}

export interface CommandContext {
  args: string[];
  text: string;
  command: string;
  prefix: string | null;
  tobi: Tobi;
  sock: WASocket;
}

export interface CommandOptions {
  desc?: string;
  category?: string;
  aliases?: string[];
  ownerOnly?: boolean;
  groupOnly?: boolean;
  privateOnly?: boolean;
}

export class Tobi extends EventEmitter {
  constructor(config?: TobiConfig);
  sock: WASocket | null;
  isConnected: boolean;
  prefixes: string[];
  allowPrefixless: boolean;

  isOwner(jid: string): boolean;
  command(name: string | string[], handler: (m: SerializedMessage, ctx: CommandContext) => Promise<any> | any, options?: CommandOptions): this;
  use(fn: (m: SerializedMessage, next: () => void) => Promise<any> | any): this;
  onMessage(handler: (m: SerializedMessage) => Promise<any> | any): this;
  launch(): Promise<this>;

  sendText(jid: string, text: string, options?: any): Promise<any>;
  sendButtons(jid: string, options: SendButtonsOptions): Promise<any>;
  sendList(jid: string, options: SendListOptions): Promise<any>;
  sendFile(jid: string, fileSource: string | Readable, options?: SendFileOptions): Promise<any>;
}

export class TobiInteractive {
  static quickReply(displayText: string, id?: string): any;
  static urlButton(displayText: string, url: string): any;
  static callButton(displayText: string, phoneNumber: string): any;
  static copyButton(displayText: string, copyCode: string): any;
  static listMenu(buttonTitle: string, sections: ListSection[]): any;
  static createPayload(options: SendButtonsOptions): any;
  static send(sock: WASocket, jid: string, options: SendButtonsOptions): Promise<any>;
}

export class TobiStreamEngine {
  static createStreamPayload(source: string | Readable, options?: SendFileOptions): any;
  static sendLargeFile(sock: WASocket, jid: string, source: string | Readable, options?: SendFileOptions): Promise<any>;
}
