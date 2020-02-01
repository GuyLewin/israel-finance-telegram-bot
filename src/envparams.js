const consts = require('./consts');
const { Utils } = require('./utils');

class EnvParams {
  constructor() {
    this.keyVaultUrl = process.env[consts.KEY_VAULT_URL_ENV_NAME];
    this.telegramToken = process.env[consts.TELEGRAM_TOKEN_ENV_NAME];
    this.telegramChatId = process.env[consts.TELEGRAM_CHAT_ID_ENV_NAME];
    const servicesJsonStr = process.env[consts.SERVICES_JSON_ENV_NAME];

    if (!this.keyVaultUrl && (!this.telegramToken || !this.telegramChatId)) {
      throw new Error('Telegram token and chat ID must be configured when not using Azure KeyVault');
    }

    if (!servicesJsonStr) {
      throw new Error('Services JSON must be configured');
    }

    this.servicesJson = JSON.parse(process.env[consts.SERVICES_JSON_ENV_NAME]);

    if (!this.keyVaultUrl) {
      this.servicesJson.forEach((service) => {
        if (!service.credentials) {
          throw new Error('All services must have credentials configured within JSON if Azure KeyVault isn\'t in use');
        }
      });
    }

    this.handledTransactionsDbPath = process.env[consts.HANDLED_TRANSACTIONS_DB_PATH_ENV_NAME] || 'handledTransactions.json';
    this.flaggedTransactionsDbPath = process.env[consts.FLAGGED_TRANSACTIONS_DB_PATH_ENV_NAME] || 'flaggedTransactions.json';
    const intervalSecondsStr = process.env[consts.INTERVAL_SECONDS_ENV_NAME];
    this.intervalSeconds = intervalSecondsStr ? parseInt(intervalSecondsStr, 10) : 3600;
    const monthsToScanBackStr = process.env[consts.MONTHS_TO_SCAN_BACK_ENV_NAME];
    this.monthsToScanBack = intervalSecondsStr ? parseInt(monthsToScanBackStr, 10) : 1;
    this.isVerbose = Utils.parseJsonEnvWithDefault(consts.IS_VERBOSE_ENV_NAME, false);
  }

  static printUsage() {
    const usageStr = (
      'This program supports the following environment parameters:\n' +
      'Required:\n' +
      `${consts.SERVICES_JSON_ENV_NAME} - a JSON array describing services to scrape. If not using Azure KeyVault - it must contain credentials\n` +
      `${consts.TELEGRAM_TOKEN_ENV_NAME} - Telegram token - required only if not using Azure KeyVault \n` +
      `${consts.TELEGRAM_CHAT_ID_ENV_NAME} - Telegram chat ID - required only if not using Azure KeyVault \n` +
      '\n' +
      'Optional:\n' +
      `${consts.KEY_VAULT_URL_ENV_NAME} - URL to an Azure KeyVault instance to pull secrets from. If not specified - Azure KeyVault will not be in use\n` +
      `${consts.IS_VERBOSE_ENV_NAME} - is this system and the scraper running in verbose mode. Default: false\n` +
      `${consts.MONTHS_TO_SCAN_BACK_ENV_NAME} - how many months should the scraper scan back. Default: 1\n` +
      `${consts.INTERVAL_SECONDS_ENV_NAME} - time between this system's periodic runs. Default: 3600 (1 hour)\n` +
      `${consts.HANDLED_TRANSACTIONS_DB_PATH_ENV_NAME} - path to save what transactions were already sent (so they won't be sent twice). Default: handledTransactions.json\n` +
      `${consts.FLAGGED_TRANSACTIONS_DB_PATH_ENV_NAME} - path to save what transactions were flagged by the user (on Telegram) to go over later. Default: flaggedTransactions.json\n`
    );

    console.log(usageStr);
  }
}

module.exports.EnvParams = EnvParams;
