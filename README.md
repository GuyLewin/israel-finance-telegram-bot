# israel-finance-telegram-bot
Telegram bot that scrapes and sends notifications about bank and credit card charges. This tool uses [Israeli Banks Scrapers](https://github.com/eshaham/israeli-bank-scrapers) project as the source of fetching account data.
![israel-finance-telegram-bot example](/screenshots/1.png?raw=true "israel-finance-telegram-bot example")

## Configuration Prequisites
There are some values that have to be configured in all installation methods. Follow these parts before starting the installation itself.

### Accounts Configuration
This bot expects a JSON array of services to scrape. The array differs between Azure KeyVault installations and self-hosted ones.

#### Azure KeyVault Installations
The array passed as `ServiceJson` should be formatted as:
```json
[{"companyId":"hapoalim","credentialsIdentifier":"hapoalim1","niceName":"בנק הפועלים"},{"companyId":"amex","credentialsIdentifier":"amex1","niceName":"אמריקן אקספרס"},{"companyId":"isracard","credentialsIdentifier":"isracard1","niceName":"ישראכרט"}]
```
Each object in the array has:
* `companyId` - the scraper identifier. Take a look at the [israeli-bank-scrapers definitions code](https://github.com/eshaham/israeli-bank-scrapers/blob/master/src/definitions.js) to see the options (the keys of the `SCRAPERS` object).
* `credentialsIdentifier` - the name of the secret within KeyVault. I chose the companyId + a rolling index, but just make sure the value here matches the name you choose for KeyVault.
* `niceName` - the name you'd like to see in notifications.

In addition, each service should have a corresponding secret within Azure KeyVault. It's name should be the value you put in `credentialsIdentifier`. The secret value should be a JSON containing the login fields specified in the [israeli-bank-scrapers definitions code](https://github.com/eshaham/israeli-bank-scrapers/blob/master/src/definitions.js). For example, a secret value for `Bank Hapoalim` would look like:
```json
{"userCode":"te1337","password":"testtest"}
```

#### Self-hosted (Docker or Native) Installations
The array passed as `ServiceJson` should be formatted as:
```json
[{"companyId":"hapoalim","credentials":{"userCode":"te1337","password":"testtest"},"niceName":"בנק הפועלים"},{"companyId":"amex","credentials":{"id":"000000000","card6Digits":123456,"password":"testtest"},"niceName":"אמריקן אקספרס"},{"companyId":"isracard","credentials":{"id":"000000000","card6Digits":123456,"password":"testtest"},"niceName":"ישראכרט"}]
```
Each object in the array has:
* `companyId` - the scraper identifier. Take a look at the [israeli-bank-scrapers definitions code](https://github.com/eshaham/israeli-bank-scrapers/blob/master/src/definitions.js) to see the options (the keys of the `SCRAPERS` object).
* `credentials` - JSON containing the login fields specified in the [israeli-bank-scrapers definitions code](https://github.com/eshaham/israeli-bank-scrapers/blob/master/src/definitions.js).
* `niceName` - the name you'd like to see in notifications.

### Telegram API Key
This script uses Telegram as the framework for notifying users for new transactions and interacting with the user in general.
The script has to have an API key in order to authenticate as a Telegram bot.
Follow [this guide](https://docs.influxdata.com/kapacitor/v1.5/event_handlers/telegram/#create-a-telegram-bot) to create a new Telegram bot (the name and username of the bot don't matter). The generated API key will be used as `TelegramToken` environment variable.

### Telegram Chat ID
The bot only interacts with one Telegram user - your account. Therefore you must configure the chatId of the chat between your bot and your personal account. To do so, follow [this guide](https://docs.influxdata.com/kapacitor/v1.5/event_handlers/telegram/#get-your-telegram-chat-id) to get the chat id.
Once you got it, use this value as `TelegramChatId` environment variable.

## Installation
There are 3 deployment modes to choose from.

### Azure Cloud (Azure KeyVault) Installation
If you have a Microsoft Azure cloud subscription, this could be the easiest option for you. All the credentials and tokens are stored within a secret vault and the bot is running on Azure Container Instance.

#### Prerequisites
* [Create a new Azure KeyVault](https://docs.microsoft.com/en-us/azure/key-vault/quick-create-portal#create-a-vault) in your subscription, save the KeyVault name and URL aside. 
* Add the credentials for all services as KeyVault secrets, according to [Azure KeyVault Installations](#azure-keyVault-installations).
* Add a secret called `TelegramToken` (with the value from [Telegram Token](#telegram-token)) and another one called `TelegramChatId` (with the value from [Telegram Chat ID](#telegram-chat-id)).
* Install [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli?view=azure-cli-latest) on your computer. 
* Run `az login` to login to your Azure subscription.

#### Installation
Run the following script on your computer. Be sure to change `KEYVAULT_NAME` to the name of the previously created KeyVault, `KEYVAULT_URL` to its URL, and `SERVICES_JSON` according to [Azure KeyVault Installations](#azure-keyVault-installations).
```bash
KEYVAULT_NAME=israelFinanceKeyVault
KEYVAULT_URL='https://israelFinanceKeyVault.vault.azure.net/'
SERVICES_JSON='[{"companyId":"hapoalim","credentialsIdentifier":"hapoalim1","niceName":"בנק הפועלים"},{"companyId":"amex","credentialsIdentifier":"amex1","niceName":"אמריקן אקספרס"},{"companyId":"isracard","credentialsIdentifier":"isracard1","niceName":"ישראכרט"}]'
RESOURCE_GROUP=myResourceGroup
ACI_PERS_STORAGE_ACCOUNT_NAME=mystorageaccount$RANDOM
ACI_PERS_LOCATION=eastus
ACI_PERS_SHARE_NAME=acishare

# Get ID of resource group
rgID=$(az group show --name $RESOURCE_GROUP --query id --output tsv)

# Create the storage account with the parameters
az storage account create \
    --resource-group $RESOURCE_GROUP \
    --name $ACI_PERS_STORAGE_ACCOUNT_NAME \
    --location $ACI_PERS_LOCATION \
    --sku Standard_LRS

# Create the file share
az storage share create \
  --name $ACI_PERS_SHARE_NAME \
  --account-name $ACI_PERS_STORAGE_ACCOUNT_NAME

STORAGE_KEY=$(az storage account keys list --resource-group $RESOURCE_GROUP --account-name $ACI_PERS_STORAGE_ACCOUNT_NAME --query "[0].value" --output tsv)

az container create \
  --resource-group $RESOURCE_GROUP \
  --name israel-finance-telegram-bot \
  --image "guylewin/israel-finance-telegram-bot:latest" \
  --assign-identity --scope $rgID \
  --location westeurope \
  --environment-variables 'KeyVaultUrl'="$KEYVAULT_URL" 'ServicesJson'="$SERVICES_JSON" 'HandledTransactionsDbPath'='/persistent/handledTransactions.json' 'FlaggedTransactionsDbPath'='/persistent/flaggedTransactions.json' \
  --azure-file-volume-account-name $ACI_PERS_STORAGE_ACCOUNT_NAME \
  --azure-file-volume-account-key $STORAGE_KEY \
  --azure-file-volume-share-name $ACI_PERS_SHARE_NAME \
  --azure-file-volume-mount-path /persistent

spID=$(az container show --resource-group $RESOURCE_GROUP --name israel-finance-telegram-bot --query identity.principalId --out tsv)

az keyvault set-policy \
  --name $KEYVAULT_NAME \
  --resource-group $RESOURCE_GROUP \
  --object-id $spID \
  --secret-permissions get
```

#### Testing and Monitoring
Browse to the newly created Azure Container Instance via Azure Portal to see it running. If something went wrong - the container should output errors through the log.

### Docker Installation
If you don't have an Azure Cloud subscription - this is the recommended method. This system is pushed to Docker Hub and can be used without installing NodeJS or configuring the host machine.
Once you have `ServicesJson`, `TelegramToken` and `TelegramChatId` ready (from the previous steps) - simply run this command and replace the environment variables with the ones you created:
```bash
docker run --env ServicesJson='[{"companyId":"hapoalim","credentialsIdentifier":"hapoalim1","niceName":"בנק הפועלים"},{"companyId":"amex","credentialsIdentifier":"amex1","niceName":"אמריקן אקספרס"},{"companyId":"isracard","credentialsIdentifier":"isracard1","niceName":"ישראכרט"}]' --env TelegramToken='123' --env TelegramChatId=123 guylewin/israel-finance-telegram-bot
```

### Native Installation
Least recommended method, but it's still here if you prefer not installing Docker.

#### Prequisites
* Node.js (>= 8) installed on your machine. Go [here!](https://nodejs.org/en/download/) to download and install the latest Node.js for your operating system.
* It is also recommended you install [pm2](https://www.npmjs.com/package/pm2) globally, the process manager used by this bot. `npm install pm2 -g`.

#### Installation
Once Node.js and pm2 are installed, run the following command to fetch the code:

```bash
git clone https://github.com/GuyLewin/israel-finance-telegram-bot
cd israel-finance-telegram-bot
```

Next you will need to install dependencies by running
```bash
npm install
```

#### Running the Code
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
