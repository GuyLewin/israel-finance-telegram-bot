process.env.NTBA_FIX_319 = 1;
const TelegramBot = require('node-telegram-bot-api');
import CONFIG from '../config';

const replyListeners = {};

export default class {
  constructor(transactionsToGoThroughDb) {
    this.bot = new TelegramBot(CONFIG.TELEGRAM_TOKEN, { polling: true });
    this.transactionsToGoThroughDb = transactionsToGoThroughDb;
  }

  handleReply(transaction, message) {
    if (message.text !== 'לא') {
      this.bot.sendMessage(CONFIG.TELEGRAM_CHAT_ID, 'חובה לציין פקודה. כרגע רק "לא" נתמך', {
        reply_to_message_id: message.message_id,
      });
      return;
    }
    this.transactionsToGoThroughDb.push(`/${message.message_id}`, transaction, true);

    this.bot.removeReplyListener(replyListeners[message.reply_to_message.message_id]);
    // We still want it to be set so no reply handler will be setup again in this runtime
    replyListeners[message.reply_to_message.message_id] = null;

    this.bot.sendMessage(CONFIG.TELEGRAM_CHAT_ID, 'העסקה התווספה לרשימת העסקאות עליהן תוכל לעבור בעתיד');
  }

  registerReplyListener(messageId, transaction) {
    if (messageId in replyListeners) {
      // Already exists
      return;
    }

    const replyListenerId = this.bot.onReplyToMessage(
      CONFIG.TELEGRAM_CHAT_ID,
      messageId,
      this.handleReply.bind(this, transaction),
    );
    replyListeners[messageId] = replyListenerId;
  }

  handleSentMessage(messageSentCallback, transaction, result) {
    this.registerReplyListener(result.message_id, transaction);
    messageSentCallback(result.message_id);
  }

  sendMessage(message, messageSentCallback, transaction) {
    this.bot.sendMessage(CONFIG.TELEGRAM_CHAT_ID, message)
      .then(this.handleSentMessage.bind(this, messageSentCallback, transaction));
  }
}
