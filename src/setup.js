import keytar from 'keytar';
import inquirer from 'inquirer';
import { SCRAPERS } from 'israeli-bank-scrapers';
import CONFIG from '../config';
import { SCRAPER_PASSWORD_FIELD_NAME, KEYTAR_SERVICE_NAME } from './consts';

function validateNonEmpty(field, input) {
  if (input) {
    return true;
  }
  return `${field} must be non empty`;
}

function verifyServiceExists(service) {
  if (Object.keys(SCRAPERS).indexOf(service.companyId) === -1) {
    console.error(`Service ${service.companyId} (${service.niceName}) configured wrong`);
    return false;
  }
  return true;
}

function setKeytarCredentials(service, credentialsResult) {
  keytar.setPassword(
    KEYTAR_SERVICE_NAME,
    service.credentialsIdentifier,
    JSON.stringify(credentialsResult),
  );
}

export default async function () {
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
  const { loginFields } = SCRAPERS[serviceResult.service.companyId];
  const questions = loginFields.map((field) => {
    return {
      type: field === SCRAPER_PASSWORD_FIELD_NAME ? SCRAPER_PASSWORD_FIELD_NAME : 'input',
      name: field,
      message: `Enter value for ${field}:`,
      validate: input => validateNonEmpty(field, input),
    };
  });

  const credentialsResult = await inquirer.prompt(questions);
  setKeytarCredentials(serviceResult.service, credentialsResult);
}
