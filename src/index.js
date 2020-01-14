const Telegram = require('./telegram');
const israeliBankScrapers = require('israeli-bank-scrapers');
const JsonDB = require('node-json-db');
const config = require('../config');
const Utils = require('./utils');
const consts = require('./consts');

class IsraelFinanceTelegramBot {
  constructor() {
    this.handledTransactionsDb = new JsonDB('handledTransactions', true, false);
    this.transactionsToGoThroughDb = new JsonDB('transactionsToGoThrough', true, true);
    this.keyVaultClient = Utils.getKeyVaultClient(process.env[consts.KEY_VAULT_URL_ENV_NAME]);
    this.telegram = new Telegram(this.transactionsToGoThroughDb, this.keyVaultClient
      .then(client => Utils.getKeyVaultSecret(client, service.credentialsIdentifier)));
    this.isVerbose = JSON.parse(process.env[consts.IS_VERBOSE_ENV_NAME]);
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

  messageSent(handledTransactionsDbPath, telegramMessageId) {
    this.handledTransactionsDb.push(
      handledTransactionsDbPath,
      { sent: true, telegramMessageId },
      false,
    );
  }

  handleAccount(service, account) {
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
        this.existingTransactionsFound += 1;
        if (this.isVerbose) {
          console.log(`Found existing transaction: ${handledTransactionsDbPath}`);
        }
        return;
      }
      this.newTransactionsFound += 1;
      if (this.isVerbose) {
        console.log(`Found new transaction: ${handledTransactionsDbPath}`);
      }
      const message = IsraelFinanceTelegramBot.getMessageFromTransaction(
        transaction,
        account.accountNumber,
        service.niceName,
      );
      this.telegram.sendMessage(
        message,
        this.messageSent.bind(this, handledTransactionsDbPath),
        transaction,
      );
    });
  }

  startRunStatistics() {
    const curDate = (new Date()).toLocaleString();
    console.log(`Starting periodic run on ${curDate}`);

    this.existingTransactionsFound = 0;
    this.newTransactionsFound = 0;
  }

  endRunStatistics() {
    const curDate = (new Date()).toLocaleString();
    console.log(`Periodic run ended on ${curDate}. ${this.existingTransactionsFound} existing transactions found, ${this.newTransactionsFound} new transactions found`);
  }

  async getCredentialsForService(service) {
    if (service.credentials) {
      // Allow defining credentials within config (without keytar)
      return service.credentials;
    }

    return this.keyVaultClient
      .then(client => Utils.getKeyVaultSecret(client, service.credentialsIdentifier))
      .then(password => JSON.parse(password));
  }

  async run() {
    try {
      this.startRunStatistics();
      await Promise.all(config.SERVICES.map(async (service) => {
        const credentials = await this.getCredentialsForService(service);
        if (credentials === null) {
          console.error(`"npm run setup" must be ran before running bot (failed on service ${service.niceName}`);
          process.exit();
        }
        const options = Object.assign({ companyId: service.companyId }, config.ADDITIONAL_OPTIONS);
        const scraper = israeliBankScrapers.createScraper(options);
        const scrapeResult = await scraper.scrape(credentials);

        if (scrapeResult.success) {
          scrapeResult.accounts.forEach(this.handleAccount.bind(this, service));
        } else {
          console.error(`scraping failed for the following reason: ${scrapeResult.errorType}`);
        }
      }));
    } catch (e) {
      console.log('Got an error. Will try running again next interval. Error details:');
      console.error(e, e.stack);
    } finally {
      this.endRunStatistics();
    }
  }
}

async function toExport() {
  const iftb = new IsraelFinanceTelegramBot();
  iftb.run();
}

module.exports = toExport;
