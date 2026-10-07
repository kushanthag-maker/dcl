/**
 * Tobi - Interactive Message Engine (Baileys v6+ Proto Format)
 * Fully compliant with WhatsApp NativeFlow & InteractiveMessage specifications.
 * Supports: Quick Reply Buttons, CTA URL, CTA Call, CTA Copy, and Single Select Lists.
 */

const { proto, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

class TobiInteractive {
  /**
   * Helper: Build a Quick Reply native flow button
   */
  static quickReply(displayText, id) {
    return {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: String(displayText),
        id: String(id || displayText)
      })
    };
  }

  /**
   * Helper: Build a Click-to-Action URL button
   */
  static urlButton(displayText, url) {
    return {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: String(displayText),
        url: String(url),
        merchant_url: String(url)
      })
    };
  }

  /**
   * Helper: Build a Click-to-Call Phone button
   */
  static callButton(displayText, phoneNumber) {
    return {
      name: 'cta_call',
      buttonParamsJson: JSON.stringify({
        display_text: String(displayText),
        phone_number: String(phoneNumber)
      })
    };
  }

  /**
   * Helper: Build a Click-to-Copy voucher/text button
   */
  static copyButton(displayText, copyCode) {
    return {
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({
        display_text: String(displayText),
        copy_code: String(copyCode)
      })
    };
  }

  /**
   * Helper: Build a Single-Select List Menu button
   * @param {string} buttonTitle - Title on the list selector button
   * @param {Array<{title: string, highlight_label?: string, rows: Array<{id: string, title: string, description?: string, header?: string}>}>} sections
   */
  static listMenu(buttonTitle, sections) {
    const formattedSections = sections.map((sec, secIdx) => ({
      title: sec.title || `Section ${secIdx + 1}`,
      highlight_label: sec.highlight_label || undefined,
      rows: (sec.rows || []).map((row, rowIdx) => ({
        header: row.header || '',
        title: row.title || `Option ${rowIdx + 1}`,
        description: row.description || '',
        id: row.id || `row_${secIdx}_${rowIdx}`
      }))
    }));

    return {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({
        title: String(buttonTitle || 'Select an option'),
        sections: formattedSections
      })
    };
  }

  /**
   * Normalize an array of button definitions (either raw native objects or simplified shortcuts)
   */
  static normalizeButtons(rawButtons = []) {
    return rawButtons.map((btn) => {
      // If already has name & buttonParamsJson, keep it
      if (btn.name && btn.buttonParamsJson) return btn;

      // Type-based shortcuts
      if (btn.type === 'url' || btn.url) {
        return TobiInteractive.urlButton(btn.title || btn.text || btn.display_text, btn.url);
      }
      if (btn.type === 'call' || btn.phone || btn.phone_number) {
        return TobiInteractive.callButton(btn.title || btn.text || btn.display_text, btn.phone || btn.phone_number);
      }
      if (btn.type === 'copy' || btn.copy_code || btn.code) {
        return TobiInteractive.copyButton(btn.title || btn.text || btn.display_text, btn.copy_code || btn.code);
      }
      if (btn.type === 'list' || btn.sections) {
        return TobiInteractive.listMenu(btn.title || btn.buttonTitle || 'Options', btn.sections);
      }

      // Default to quick_reply
      return TobiInteractive.quickReply(btn.title || btn.text || btn.display_text || 'Button', btn.id || btn.value);
    });
  }

  /**
   * Construct the proto.Message.InteractiveMessage payload according to Baileys v6+
   */
  static createPayload(options = {}) {
    const {
      body = '',
      footer = '',
      headerTitle = '',
      headerSubtitle = '',
      headerMedia = null,
      buttons = [],
      contextInfo = {}
    } = options;

    const normalizedButtons = TobiInteractive.normalizeButtons(buttons);

    // Build header proto
    const headerProto = {
      title: headerTitle || '',
      subtitle: headerSubtitle || '',
      hasMediaAttachment: Boolean(headerMedia),
      ...(headerMedia ? headerMedia : {})
    };

    // Build native flow message
    const nativeFlowMessage = {
      buttons: normalizedButtons,
      messageParamsJson: ''
    };

    const interactiveMessage = {
      body: { text: typeof body === 'string' ? body : String(body) },
      footer: footer ? { text: String(footer) } : undefined,
      header: (headerTitle || headerMedia) ? headerProto : undefined,
      nativeFlowMessage: nativeFlowMessage,
      contextInfo: {
        mentionedJid: contextInfo.mentionedJid || [],
        forwardingScore: contextInfo.forwardingScore || 0,
        isForwarded: Boolean(contextInfo.isForwarded),
        ...contextInfo
      }
    };

    return interactiveMessage;
  }

  /**
   * Dispatches an interactive message via sock.relayMessage wrapped in viewOnceMessage
   */
  static async send(sock, jid, options = {}) {
    const interactiveMessage = TobiInteractive.createPayload(options);

    const messageContent = {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },
          interactiveMessage: interactiveMessage
        }
      }
    };

    const userJid = sock.user ? sock.user.id : undefined;
    const msg = generateWAMessageFromContent(jid, messageContent, {
      quoted: options.quoted,
      userJid: userJid
    });

    await sock.relayMessage(jid, msg.message, {
      messageId: msg.key.id
    });

    return {
      messageId: msg.key.id,
      key: msg.key,
      message: msg.message
    };
  }
}

module.exports = { TobiInteractive };
