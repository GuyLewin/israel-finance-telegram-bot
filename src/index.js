import { createScraper } from 'israeli-bank-scrapers';
import JsonDB from 'node-json-db';
import TelegramBot from 'node-telegram-bot-api';

const CONFIG = require('../config.js');

const bot = new TelegramBot(CONFIG.TELEGRAM_TOKEN, { polling: true });

const handledTransactionsDb = new JsonDB('handledTransactions', true, false);
const transactionsToGoThroughDb = new JsonDB('transactionsToGoThrough', true, true);
const replyListeners = {};

function handleReply(message, transaction) {
  if (message.text !== 'לא') {
    bot.sendMessage(CONFIG.TELEGRAM_CHAT_ID, 'חובה לציין פקודה. כרגע רק "לא" נתמך', {
      reply_to_message_id: message.message_id,
    });
    return;
  }
  transactionsToGoThroughDb.push(`/${message.message_id}`, transaction, true);

  bot.removeReplyListener(replyListeners[message.reply_to_message.message_id]);
  // We still want it to be set so no reply handler will be setup again in this runtime
  replyListeners[message.reply_to_message.message_id] = null;

  // send back the matched "whatever" to the chat
  bot.sendMessage(CONFIG.TELEGRAM_CHAT_ID, 'העסקה התווספה לרשימת העסקאות עליהן תוכל לעבור בעתיד');
}

function getMessageFromTransaction(transaction, cardNumber, serviceNiceName) {
  let transactionName = 'זיכוי';
  let amount = transaction.chargedAmount;
  if (amount < 0) {
    transactionName = 'חיוב';
    amount *= -1;
  }
  const dateStr = new Date(transaction.date).toLocaleDateString('he-IL');
  let currency = transaction.originalCurrency;
  switch (currency) {
    case 'ILS':
      currency = '₪';
      break;
    case 'USD':
      currency = '$';
      break;
    default:
      break;
  }
  let status = `בסטטוס ${transaction.status} `;
  if (transaction.status === 'completed') {
    status = '';
  }
  let type = `(מסוג ${transaction.type}) `;
  if (transaction.type === 'normal') {
    type = '';
  }
  return `${serviceNiceName}: ${transactionName} - ${transaction.description} על סך ${amount}${currency} בתאריך ${dateStr} ${status}${type}בחשבון ${cardNumber}`;
}

function transactionCompare(a, b) {
  const dateA = new Date(a.date);
  const dateB = new Date(b.date);

  let comparison = 0;
  if (dateA > dateB) {
    comparison = 1;
  } else if (dateA < dateB) {
    comparison = -1;
  }
  return comparison;
}

function registerReplyListener(messageId, transaction) {
  const replyListenerId = bot.onReplyToMessage(
    CONFIG.TELEGRAM_CHAT_ID,
    messageId,
    message => handleReply(message, transaction),
  );
  replyListeners[messageId] = replyListenerId;
}

function handleSentMessage(result, handledTransactionsDbPath, transaction) {
  handledTransactionsDb.push(
    handledTransactionsDbPath,
    { sent: true, telegramMessageId: result.message_id },
    false,
  );
  registerReplyListener(result.message_id, transaction);
}

function handleAccount(account, service) {
  account.txns.sort(transactionCompare);
  account.txns.forEach((transaction) => {
    const handledTransactionsDbPath = `/${service.companyId}/${transaction.identifier}`;
    if (handledTransactionsDb.exists(handledTransactionsDbPath)) {
      const telegramMessageId = handledTransactionsDb.getData(`${handledTransactionsDbPath}/telegramMessageId`);
      if (!(telegramMessageId in replyListeners) && !(transactionsToGoThroughDb.exists(`/${telegramMessageId}`))) {
        registerReplyListener(telegramMessageId, transaction);
      }
      console.log(`${handledTransactionsDbPath} already exists`);
      return;
    }
    const message = getMessageFromTransaction(transaction, account.accountNumber, service.niceName);
    bot.sendMessage(CONFIG.TELEGRAM_CHAT_ID, message)
      .then(result => handleSentMessage(result, handledTransactionsDbPath, transaction));
  });
}

async function main() {
  try {
    await Promise.all(CONFIG.SERVICES.map(async (service) => {
      const options = Object.assign({ companyId: service.companyId }, CONFIG.ADDITIONAL_OPTIONS);
      const scraper = createScraper(options);
      const scrapeResult = await scraper.scrape(service.credentials);

      if (scrapeResult.success) {
        scrapeResult.accounts.forEach(account => handleAccount(account, service));
      } else {
        console.error(`scraping failed for the following reason: ${scrapeResult.errorType}`);
      }
    }));
  } catch (e) {
    console.log('Got an error. Will try running again next interval. Error details:');
    console.error(e, e.stack);
  }
}

setInterval(main, CONFIG.SCRAPE_SECONDS_INTERVAL * 1000);
main();
