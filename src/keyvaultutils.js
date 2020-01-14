const keyvaultSecrets = require('@azure/keyvault-secrets');
const identity = require('@azure/identity');

class KeyVaultUtils {
  static getClient(keyVaultUrl) {
    return new keyvaultSecrets.SecretClient(keyVaultUrl, new identity.DefaultAzureCredential());
  }

  static async getSecret(client, secretName) {
    return client.getSecret(secretName).then(secret => secret.value);
  }
}

module.exports = KeyVaultUtils;
