# israel-finance-telegram-bot
Telegram bot that scrapes and sends notifications about bank and credit card charges. This tool uses [Israeli Banks Scrapers](https://github.com/eshaham/israeli-bank-scrapers) project as the source of fetching account data.
![israel-finance-telegram-bot example](/screenshots/1.png?raw=true "israel-finance-telegram-bot example")

## Getting started

### Prerequisites 
In order to start using this tool, you will need to have Node.js (>= 8) installed on your machine.  
Go [here!](https://nodejs.org/en/download/) to download and install the latest Node.js for your operating system.
It is also recommended you install [pm2](https://www.npmjs.com/package/pm2) globally, the process manager used by this bot.
To do so:
```bash
npm install pm2 -g
```

### Installation
Once Node.js and pm2 are installed, run the following command to fetch the code:

```bash
git clone https://github.com/GuyLewin/israel-finance-telegram-bot
cd israel-finance-telegram-bot
```

Next you will need to install dependencies by running
```bash
npm install
```

### Configuration
This tool relies on having the account data for scraping the finnancial accounts. As you can read from the code, it's not sent anywhere. The credentials themselves are saved on your operating system's secure keychain.
In order to create a configuration file, create a copy of `config.js.template` from the root directory named `config.js`.

#### Accounts Configuration
First - modify the accounts according to the template. Notice that the credentials aren't written there, since they're configured separately in the secure operation system keychain.
To learn what possible `companyId` you can use (what scrapers you can configure) - you can look at the [israeli-bank-scrapers definitions code](https://github.com/eshaham/israeli-bank-scrapers/blob/master/src/definitions.js).
The field called `credentialsIdentifier` in each service is being used as the account identifier in the OS keychain, as you may have more than one bank / credit card account - this is the method used to distinguish between them.

After configuring `config.js` with the right accounts, run the setup utility to save the credentials into the keychain:
```bash
npm run setup
```
Run the above snippet once for every account you want to configure.

#### Telegram API Key
This script uses Telegram as the framework for notifying users for new transactions and interacting with the user in general.
The script has to have an API key in order to authenticate as a Telegram bot.
Follow [this guide](https://docs.influxdata.com/kapacitor/v1.5/event_handlers/telegram/#create-a-telegram-bot) to create a new Telegram bot (the name and username of the bot don't matter), and copy the generated API key to `CONFIG.TELEGRAM_TOKEN` in `config.js`.

#### Telegram Chat ID
The bot only interacts with one Telegram user - your account. Therefore you must configure the chatId of the chat between your bot and your personal account. To do so, follow [this guide](https://docs.influxdata.com/kapacitor/v1.5/event_handlers/telegram/#get-your-telegram-chat-id) to get the chat id.
Once you got it, replace `CONFIG.TELEGRAM_CHAT_ID` in `config.js` to that value.

## Running the Code
If pm2 is installed gloablly, you can use it's global command line tool:
```bash
pm2 start israel-finance-telegram-bot.js
```
If not, use the pm2 binary installed within the package dependencies (less recommended):
```bash
./node_modules/.bin/pm2 start israel-finance-telegram-bot.js
```

The status (and log) of the bot can be seen using
```bash
pm2 log israel-finance-telegram-bot
```
or if pm2 isn't installed globally:
```bash
./node_modules/.bin/pm2 log israel-finance-telegram-bot
```
The bot should initially send notifications for all transactions since the beginning of last month (or the start date configured in `config.js`).
Afterwards, it will only send notifications for new transactions.

The script is running as a daemon with pm2. [Read their quick-start](http://pm2.keymetrics.io/docs/usage/quick-start/) to learn how to use control it.

## Bot Interactiveness
Currently the bot supports only supports one interactive command - "לא".

### לא command
You may reply to a message the bot sent you (you have to use the Telegram 'reply' feature and include the original message, by long pressing the message and choosing 'Reply'), and write the text "לא".
The bot will then insert the transaction details into a JSON file called `transactionsToGoThrough.json`.
This feature was written to help retroactively-verify transactions you're not sure about. 

Feel free to open Pull Requests with more features / contact me if you have feature ideas.
