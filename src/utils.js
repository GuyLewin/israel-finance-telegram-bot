export default class {
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
}
