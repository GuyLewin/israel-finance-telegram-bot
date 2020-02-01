const Telegram = require('./telegram');
const israeliBankScrapers = require('israeli-bank-scrapers');
const nodeJsonDb = require('node-json-db');
const moment = require('moment');
const Utils = require('./utils');
const KeyVaultUtils = require('./keyvaultutils');
const consts = require('./consts');

const HANDLED_TRANSACTIONS = process.env[consts.HANDLED_TRANSACTIONS_DB_PATH_ENV_NAME] || 'handledTransactions';
const TRANSACTIONS_TO_GO_THROUGH = process.env[consts.TRANSACTIONS_TO_GO_THROUGH_DB_PATH_ENV_NAME] || 'transactionsToGoThrough';
const INTERVAL_SECONDS_STR = process.env[consts.INTERVAL_SECONDS_ENV_NAME];
// Default - once an hour
const INTERVAL_SECONDS = INTERVAL_SECONDS_STR ? parseInt(INTERVAL_SECONDS_STR, 10) : 3600;
// Default - not verbose
const IS_VERBOSE = Utils.parseJsonEnvWithDefault(consts.IS_VERBOSE_ENV_NAME, false);
const KEY_VAULT_URL = process.env[consts.KEY_VAULT_URL_ENV_NAME];

class IsraelFinanceTelegramBot {
  constructor(keyVaultClient, telegramToken, telegramChatId) {
    this.handledTransactionsDb = new nodeJsonDb.JsonDB(HANDLED_TRANSACTIONS, true, false);
    this.transactionsToGoThroughDb = new nodeJsonDb.JsonDB(TRANSACTIONS_TO_GO_THROUGH, true, true);
    this.keyVaultClient = keyVaultClient;
    this.telegram = new Telegram(this.transactionsToGoThroughDb, telegramToken, telegramChatId);
    setInterval(this.run.bind(this), INTERVAL_SECONDS * 1000);
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
        if (IS_VERBOSE) {
          console.log(`Found existing transaction: ${handledTransactionsDbPath}`);
        }
        return;
      }
      this.newTransactionsFound += 1;
      if (IS_VERBOSE) {
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

    if (!this.keyVaultClient) {
      throw new Error('no KeyVault configured, no credentials in service JSON');
    }

    return KeyVaultUtils.getSecret(this.keyVaultClient, service.credentialsIdentifier)
      .then(credentialsJson => JSON.parse(credentialsJson));
  }

  async handleService(service) {
    if (IS_VERBOSE) {
      console.log(`Starting to scrape service: ${JSON.stringify(service)}`);
    }
    const credentials = await this.getCredentialsForService(service);
    if (credentials === null) {
      console.error(`"npm run setup" must be ran before running bot (failed on service ${service.niceName}`);
      process.exit();
    }
    const options = Object.assign({ companyId: service.companyId }, {
      verbose: IS_VERBOSE,
      startDate: moment()
        .startOf('month')
        .subtract(parseInt(process.env[consts.MONTHS_TO_SCAN_BACK_ENV_NAME], 10), 'month'),
    });
    const scraper = israeliBankScrapers.createScraper(options);
    const scrapeResult = await scraper.scrape(credentials);

    if (scrapeResult.success) {
      scrapeResult.accounts.forEach(this.handleAccount.bind(this, service));
    } else {
      console.error(`scraping failed for the following reason: ${scrapeResult.errorType}`);
    }
  }

  async run() {
    try {
      this.startRunStatistics();
      const services = JSON.parse(process.env[consts.SERVICES_JSON_ENV_NAME]);
      // eslint-disable-next-line no-restricted-syntax
      for (const service of services) {
        // Block each request separately
        await this.handleService(service);
      }
    } catch (e) {
      console.log('Got an error. Will try running again next interval. Error details:');
      console.error(e, e.stack);
    } finally {
      this.endRunStatistics();
    }
  }
}

async function main() {
  let keyVaultClient;
  let telegramToken;
  let telegramChatId;
  if (KEY_VAULT_URL) {
    keyVaultClient = KeyVaultUtils.getClient(KEY_VAULT_URL);
    telegramToken = await KeyVaultUtils.getSecret(
      keyVaultClient,
      consts.TELEGRAM_TOKEN_SECRET_NAME,
    );
    telegramChatId = await KeyVaultUtils.getSecret(
      keyVaultClient,
      consts.TELEGRAM_CHAT_ID_SECRET_NAME,
    );
  } else {
    telegramToken = process.env[consts.TELEGRAM_TOKEN_ENV_NAME];
    telegramChatId = process.env[consts.TELEGRAM_CHAT_ID_ENV_NAME];
  }
  try {
    const iftb = new IsraelFinanceTelegramBot(keyVaultClient, telegramToken, telegramChatId);
    iftb.run();
  } catch (e) {
    console.log(`Error in main(): ${e}`);
  }
}

main();
