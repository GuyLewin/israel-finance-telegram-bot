import { createScraper } from 'israeli-bank-scrapers';
import JsonDB from 'node-json-db';
import CONFIG from '../config';
import Telegram from './telegram';
import Utils from './utils';

class IsraelFinanceTelegramBot {
  constructor() {
    this.handledTransactionsDb = new JsonDB('handledTransactions', true, false);
    this.transactionsToGoThroughDb = new JsonDB('transactionsToGoThrough', true, true);
    this.telegram = new Telegram(this.transactionsToGoThroughDb);
    setInterval(this.run, CONFIG.SCRAPE_SECONDS_INTERVAL * 1000);
  }

  static getMessageFromTransaction(transaction, cardNumber, serviceNiceName) {
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

  messageSent(telegramMessageId, handledTransactionsDbPath) {
    this.handledTransactionsDb.push(
      handledTransactionsDbPath,
      { sent: true, telegramMessageId },
      false,
    );
  }

  handleAccount(account, service) {
    account.txns.sort(Utils.transactionCompare);
    account.txns.forEach((transaction) => {
      // Read https://github.com/GuyLewin/israel-finance-telegram-bot/issues/1 - transaction.identifier isn't unique
      // This is as unique as we can get
      const identifier = `${transaction.date}-${transaction.chargedAmount}-${transaction.identifier}`;
      const handledTransactionsDbPath = `/${service.companyId}/${identifier}`;
      if (this.handledTransactionsDb.exists(handledTransactionsDbPath)) {
        const telegramMessageId = this.handledTransactionsDb.getData(`${handledTransactionsDbPath}/telegramMessageId`);
        if (!(this.transactionsToGoThroughDb.exists(`/${telegramMessageId}`))) {
          this.telegram.registerReplyListener(telegramMessageId, transaction);
        }
        console.log(`${handledTransactionsDbPath} already exists`);
        return;
      }
      const message = IsraelFinanceTelegramBot.getMessageFromTransaction(
        transaction,
        account.accountNumber,
        service.niceName,
      );
      this.telegram.sendMessage(
        message,
        telegramMessageId => this.messageSent(telegramMessageId, handledTransactionsDbPath),
        transaction,
      );
    });
  }

  async run() {
    try {
      await Promise.all(CONFIG.SERVICES.map(async (service) => {
        const options = Object.assign({ companyId: service.companyId }, CONFIG.ADDITIONAL_OPTIONS);
        const scraper = createScraper(options);
        const scrapeResult = await scraper.scrape(service.credentials);

        if (scrapeResult.success) {
          scrapeResult.accounts.forEach(account => this.handleAccount(account, service));
        } else {
          console.error(`scraping failed for the following reason: ${scrapeResult.errorType}`);
        }
      }));
    } catch (e) {
      console.log('Got an error. Will try running again next interval. Error details:');
      console.error(e, e.stack);
    }
  }
}

const iftb = new IsraelFinanceTelegramBot();
iftb.run();
