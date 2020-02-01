process.env.NTBA_FIX_319 = 1;
const TelegramBot = require('node-telegram-bot-api');

const replyListeners = {};

class Telegram {
  constructor(flaggedTransactionsDb, telegramToken, telegramChatId) {
    this.bot = new TelegramBot(telegramToken, { polling: true });
    this.telegramChatId = telegramChatId;
    this.flaggedTransactionsDb = flaggedTransactionsDb;
  }

  handleReply(transaction, message) {
    if (message.text !== 'לא') {
      this.bot.sendMessage(this.telegramChatId, 'חובה לציין פקודה. כרגע רק "לא" נתמך', {
        reply_to_message_id: message.message_id,
      });
      return;
    }
    this.flaggedTransactionsDb.push(`/${message.message_id}`, transaction, true);

    this.bot.removeReplyListener(replyListeners[message.reply_to_message.message_id]);
    // We still want it to be set so no reply handler will be setup again in this runtime
    replyListeners[message.reply_to_message.message_id] = null;

    this.bot.sendMessage(this.telegramChatId, 'העסקה התווספה לרשימת העסקאות עליהן תוכל לעבור בעתיד');
  }

  registerReplyListener(messageId, transaction) {
    if (messageId in replyListeners) {
      // Already exists
      return;
    }

    const replyListenerId = this.bot.onReplyToMessage(
      this.telegramChatId,
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
    this.bot.sendMessage(this.telegramChatId, message)
      .then(this.handleSentMessage.bind(this, messageSentCallback, transaction));
  }
}
module.exports.Telegram = Telegram;
