const SecretClient = require('@azure/keyvault-secrets');
const nodeauth = require('@azure/ms-rest-nodeauth');

const options = {
  msiEndpoint: 'http://127.0.0.1:41741/MSI/token/',
};

class Utils {
  static transactionCompare(a, b) {
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

  static getKeyVaultClient(keyVaultUrl) {
    return nodeauth.loginWithAppServiceMSI(options)
      .then(token => new SecretClient(keyVaultUrl, token));
  }

  static getKeyVaultSecret(keyVaultClient, secretName) {
    return keyVaultClient.getSecret(secretName);
  }
}

module.exports = Utils;
