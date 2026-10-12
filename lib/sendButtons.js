/**
 * Interactive Button & List Menu Engine for DARK QUEEN V2
 * Native-flow buttons via WhatsApp v6+ viewOnceMessage protocol
 * Zero wrapper dependencies — pure @whiskeysockets/baileys
 * Fully compliant with Android, iOS, and Web WhatsApp clients.
 */

const {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
} = require('@whiskeysockets/baileys');

class InteractiveBuilder {
  /**
   * Build a Quick Reply native flow button
   */
  static quickReply(displayText, id) {
    return {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: String(displayText),
        id: String(id || displayText),
      }),
    };
  }

  /**
   * Build a Click-to-Action URL button
   */
  static urlButton(displayText, url) {
    return {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: String(displayText),
        url: String(url),
        merchant_url: String(url),
      }),
    };
  }

  /**
   * Build a Click-to-Call Phone button
   */
  static callButton(displayText, phoneNumber) {
    return {
      name: 'cta_call',
      buttonParamsJson: JSON.stringify({
        display_text: String(displayText),
        phone_number: String(phoneNumber),
      }),
    };
  }

  /**
   * Build a Click-to-Copy voucher/text button
   */
  static copyButton(displayText, copyCode) {
    return {
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({
        display_text: String(displayText),
        copy_code: String(copyCode),
      }),
    };
  }

  /**
   * Build a Single-Select List Menu button
   */
  static listMenu(buttonTitle, sections) {
    const formattedSections = (sections || []).map((sec, secIdx) => ({
      title: sec.title || `Section ${secIdx + 1}`,
      highlight_label: sec.highlight_label || undefined,
      rows: (sec.rows || []).map((row, rowIdx) => ({
        header: row.header || '',
        title: String(row.title || `Option ${rowIdx + 1}`).slice(0, 24),
        description: String(row.description || '').slice(0, 72),
        id: String(row.id || `row_${secIdx}_${rowIdx}`),
      })),
    }));

    return {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({
        title: String(buttonTitle || 'Select an option'),
        sections: formattedSections,
      }),
    };
  }

  /**
   * Normalize an array of button definitions
   */
  static normalizeButtons(rawButtons = []) {
    return (rawButtons || []).map((btn) => {
      if (btn.name && btn.buttonParamsJson) return btn;

      if (btn.type === 'url' || btn.url) {
        return InteractiveBuilder.urlButton(btn.title || btn.text || btn.display_text, btn.url);
      }
      if (btn.type === 'call' || btn.phone || btn.phone_number) {
        return InteractiveBuilder.callButton(btn.title || btn.text || btn.display_text, btn.phone || btn.phone_number);
      }
      if (btn.type === 'copy' || btn.copy_code || btn.code) {
        return InteractiveBuilder.copyButton(btn.title || btn.text || btn.display_text, btn.copy_code || btn.code);
      }
      if (btn.type === 'list' || btn.sections) {
        return InteractiveBuilder.listMenu(btn.title || btn.buttonTitle || 'Options', btn.sections);
      }

      return InteractiveBuilder.quickReply(btn.title || btn.text || btn.display_text || 'Button', btn.id || btn.value);
    });
  }

  /**
   * Construct proto.Message.InteractiveMessage payload
   */
  static createPayload(options = {}) {
    const {
      body = '',
      footer = '',
      headerTitle = '',
      headerSubtitle = '',
      headerMedia = null,
      buttons = [],
      contextInfo = {},
    } = options;

    const normalizedButtons = InteractiveBuilder.normalizeButtons(buttons);

    const headerProto = {
      title: headerTitle || '',
      subtitle: headerSubtitle || '',
      hasMediaAttachment: Boolean(headerMedia),
      ...(headerMedia ? headerMedia : {}),
    };

    const nativeFlowMessage = {
      buttons: normalizedButtons,
      messageParamsJson: '',
    };

    const interactiveMessage = {
      body: { text: typeof body === 'string' ? body : String(body || ' ') },
      footer: footer ? { text: String(footer) } : undefined,
      header: (headerTitle || headerMedia) ? headerProto : undefined,
      nativeFlowMessage: nativeFlowMessage,
      contextInfo: {
        mentionedJid: contextInfo.mentionedJid || [],
        forwardingScore: contextInfo.forwardingScore || 0,
        isForwarded: Boolean(contextInfo.isForwarded),
        ...contextInfo,
      },
    };

    return interactiveMessage;
  }

  /**
   * Dispatches an interactive message via sock.relayMessage wrapped in viewOnceMessage
   */
  static async send(sock, jid, options = {}) {
    let headerMedia = options.headerMedia || null;
    if (!headerMedia && options.imageUrl && typeof sock.waUploadToServer === 'function') {
      try {
        const media = await prepareWAMessageMedia(
          { image: { url: options.imageUrl } },
          { upload: sock.waUploadToServer }
        );
        if (media && media.imageMessage) {
          headerMedia = { imageMessage: media.imageMessage };
        }
      } catch (_) {}
    }

    const interactiveMessage = InteractiveBuilder.createPayload({
      ...options,
      headerMedia,
    });

    const messageContent = {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: interactiveMessage,
        },
      },
    };

    const userJid = sock.user ? sock.user.id : undefined;
    const msg = generateWAMessageFromContent(jid, messageContent, {
      quoted: options.quoted,
      userJid: userJid,
    });

    await sock.relayMessage(jid, msg.message, {
      messageId: msg.key.id,
    });

    return {
      messageId: msg.key.id,
      key: msg.key,
      message: msg.message,
    };
  }
}

/**
 * Single-select list menu button
 */
async function sendSelectList(sock, jid, {
  text = ' ',
  footer = '👑 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐',
  title = 'Select',
  buttonText = 'Open Menu',
  rows = [],
  sections = null,
  quoted,
  imageUrl,
} = {}) {
  const formattedSections = sections || [
    {
      title: title || 'Options',
      rows: rows.map((r, idx) => ({
        header: r.header || '',
        title: String(r.title || `Option ${idx + 1}`).slice(0, 24),
        description: String(r.description || '').slice(0, 72),
        id: String(r.id || `opt_${idx}`),
      })),
    },
  ];

  const listBtn = InteractiveBuilder.listMenu(buttonText, formattedSections);

  return await InteractiveBuilder.send(sock, jid, {
    body: text || ' ',
    footer: footer,
    headerTitle: String(title || '👑 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐').slice(0, 30),
    imageUrl: imageUrl,
    buttons: [listBtn],
    quoted: quoted,
  });
}

/**
 * Quick reply buttons
 */
async function sendQuickReplies(sock, jid, {
  text = ' ',
  footer = '👑 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐',
  title = '',
  buttons = [],
  quoted,
  imageUrl,
} = {}) {
  const nativeButtons = (buttons || []).slice(0, 5).map((b) => {
    if (b.type === 'url' || b.url) {
      return InteractiveBuilder.urlButton(b.text || b.display_text || b.title || 'Link', b.url);
    }
    if (b.type === 'call' || b.phone || b.phone_number) {
      return InteractiveBuilder.callButton(b.text || b.display_text || b.title || 'Call', b.phone || b.phone_number);
    }
    if (b.type === 'copy' || b.copy_code || b.code) {
      return InteractiveBuilder.copyButton(b.text || b.display_text || b.title || 'Copy', b.copy_code || b.code);
    }
    return InteractiveBuilder.quickReply(b.text || b.display_text || b.title || 'Button', b.id || b.value);
  });

  return await InteractiveBuilder.send(sock, jid, {
    body: text || ' ',
    footer: footer,
    headerTitle: title || '',
    imageUrl: imageUrl,
    buttons: nativeButtons,
    quoted: quoted,
  });
}

/**
 * URL Action buttons
 */
async function sendUrlButtons(sock, jid, {
  text = ' ',
  footer = '👑 𝐃𝐀𝐑𝐊 𝐐𝐔𝐄𝐄𝐍 𝐕𝟐',
  title = '',
  buttons = [],
  quoted,
  imageUrl,
} = {}) {
  const urlButtons = (buttons || []).slice(0, 5).map((b) =>
    InteractiveBuilder.urlButton(b.text || b.display_text || b.title || 'Visit', b.url)
  );

  return await InteractiveBuilder.send(sock, jid, {
    body: text || ' ',
    footer: footer,
    headerTitle: title || '',
    imageUrl: imageUrl,
    buttons: urlButtons,
    quoted: quoted,
  });
}

/**
 * Unified sendInteractiveSelect compatible with cinesubz, moviebox, fitgirl, ssub
 */
async function sendInteractiveSelect(sock, jid, {
  text,
  footer,
  buttonText,
  sections,
  rows,
  title,
  imageUrl,
  quoted,
} = {}) {
  return await sendSelectList(sock, jid, {
    text,
    footer,
    buttonText,
    sections,
    rows,
    title,
    imageUrl,
    quoted,
  });
}

module.exports = {
  sendSelectList,
  sendQuickReplies,
  sendUrlButtons,
  sendInteractiveSelect,
  InteractiveBuilder,
  TobiInteractive: InteractiveBuilder, // Backward compatibility alias
};
