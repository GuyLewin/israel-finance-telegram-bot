const { Telegram } = require('./telegram');
const israeliBankScrapers = require('israeli-bank-scrapers');
const { JsonDB } = require('node-json-db');
const moment = require('moment');
const { Utils } = require('./utils');
const { KeyVaultUtils } = require('./keyvaultutils');
const consts = require('./consts');
const { EnvParams } = require('./envparams');

class IsraelFinanceTelegramBot {
  constructor(keyVaultClient, telegramToken, telegramChatId, envParams) {
    this.keyVaultClient = keyVaultClient;
    this.envParams = envParams;
    this.handledTransactionsDb = new JsonDB(envParams.handledTransactionsDbPath, true, false);
    this.flaggedTransactionsDb = new JsonDB(envParams.flaggedTransactionsDbPath, true, true);
    this.telegram = new Telegram(this.flaggedTransactionsDb, telegramToken, telegramChatId);
    this.setPeriodicRun();
  }

  setPeriodicRun() {
    setInterval(this.run.bind(this), this.envParams.intervalSeconds * 1000);
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
        if (!(this.flaggedTransactionsDb.exists(`/${telegramMessageId}`))) {
          this.telegram.registerReplyListener(telegramMessageId, transaction);
        }
        this.existingTransactionsFound += 1;
        if (this.envParams.isVerbose) {
          console.log(`Found existing transaction: ${handledTransactionsDbPath}`);
        }
        return;
      }
      this.newTransactionsFound += 1;
      if (this.envParams.isVerbose) {
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
      // Allow defining credentials within services JSON (without Azure KeyVault)
      return service.credentials;
    }

    if (!this.keyVaultClient) {
      throw new Error('no KeyVault configured, no credentials in service JSON');
    }

    return KeyVaultUtils.getSecret(this.keyVaultClient, service.credentialsIdentifier)
      .then(credentialsJson => JSON.parse(credentialsJson));
  }

  async handleService(service) {
    if (this.envParams.isVerbose) {
      console.log(`Starting to scrape service: ${JSON.stringify(service)}`);
    }
    const credentials = await this.getCredentialsForService(service);
    if (credentials === null) {
      console.error(`"npm run setup" must be ran before running bot (failed on service ${service.niceName}`);
      process.exit();
    }
    const options = Object.assign({ companyId: service.companyId }, {
      verbose: this.envParams.isVerbose,
      startDate: moment()
        .startOf('month')
        .subtract(this.envParams.monthsToScanBack, 'month'),
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
      const services = this.envParams.servicesJson;
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
  let envParams;
  try {
    envParams = new EnvParams();
  } catch (e) {
    console.log('Got error while parsing environment variables');
    // Don't print the stack trace in this case
    console.error(e);
    EnvParams.printUsage();
    process.exit(1);
  }

  let keyVaultClient;
  let telegramToken;
  let telegramChatId;
  if (envParams.keyVaultUrl) {
    keyVaultClient = KeyVaultUtils.getClient(envParams.keyVaultUrl);
    telegramToken = await KeyVaultUtils.getSecret(
      keyVaultClient,
      consts.TELEGRAM_TOKEN_SECRET_NAME,
    );
    telegramChatId = await KeyVaultUtils.getSecret(
      keyVaultClient,
      consts.TELEGRAM_CHAT_ID_SECRET_NAME,
    );
  } else {
    ({ telegramToken, telegramChatId } = envParams);
  }
  try {
    const iftb = new IsraelFinanceTelegramBot(
      keyVaultClient,
      telegramToken,
      telegramChatId,
      envParams,
    );
    iftb.run();
  } catch (e) {
    console.log(`Error in main(): ${e}`);
  }
}

main();
