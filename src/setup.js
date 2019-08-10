const keytar = require('keytar');
const inquirer = require('inquirer');
const israeliBankScrapers = require('israeli-bank-scrapers');
const CONFIG = require('../config');
const CONSTS = require('./consts');

function validateNonEmpty(field, input) {
  if (input) {
    return true;
  }
  return `${field} must be non empty`;
}

function verifyServiceExists(service) {
  if (Object.keys(israeliBankScrapers.SCRAPERS).indexOf(service.companyId) === -1) {
    console.error(`Service ${service.companyId} (${service.niceName}) configured wrong`);
    return false;
  }
  return true;
}

function setKeytarCredentials(service, credentialsResult) {
  keytar.setPassword(
    CONSTS.KEYTAR_SERVICE_NAME,
    service.credentialsIdentifier,
    JSON.stringify(credentialsResult),
  );
}

async function setup() {
  console.log('Setting up accounts. Credentials will be saved encrypted by your OS credentials storage');

  if (CONFIG.SERVICES.length === 0) {
    console.error('No services found in config.js. Configure some and try again');
    return;
  }

  if (!CONFIG.SERVICES.every(verifyServiceExists)) {
    console.error('Please fix configuration and try again');
    return;
  }

  const serviceResult = await inquirer.prompt([{
    type: 'list',
    name: 'service',
    message: 'Which service would you like to save credentials for?',
    choices: CONFIG.SERVICES.map((service) => {
      return {
        name: service.niceName,
        value: service,
      };
    }),
  }]);
  const { loginFields } = israeliBankScrapers.SCRAPERS[serviceResult.service.companyId];
  const questions = loginFields.map((field) => {
    return {
      type: field === CONSTS.SCRAPER_PASSWORD_FIELD_NAME ? CONSTS.SCRAPER_PASSWORD_FIELD_NAME : 'input',
      name: field,
      message: `Enter value for ${field}:`,
      validate: input => validateNonEmpty(field, input),
    };
  });

  const credentialsResult = await inquirer.prompt(questions);
  setKeytarCredentials(serviceResult.service, credentialsResult);
}

module.exports = setup;
