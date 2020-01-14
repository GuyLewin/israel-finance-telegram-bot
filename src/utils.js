const keyvaultSecrets = require('@azure/keyvault-secrets');
const identity = require('@azure/identity');

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
    return new keyvaultSecrets.SecretClient(keyVaultUrl, new identity.DefaultAzureCredential());
  }

  static getKeyVaultSecret(keyVaultClient, secretName) {
    return keyVaultClient.getSecret(secretName);
  }
}

module.exports = Utils;
