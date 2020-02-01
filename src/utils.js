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

  static parseJsonEnvWithDefault(envName, defaultValue) {
    return process.env[envName] ? JSON.parse(process.env[envName]) : defaultValue;
  }
}

module.exports.Utils = Utils;
