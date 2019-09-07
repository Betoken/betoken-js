const Betoken = require('./src/betoken-obj');
const BetokenDataController = require('./src/data-controller');
const BetokenAPI = require('./src/helpers');
const Web3 = require('web3');

module.exports = async (web3Provider, accountPrivateKey) => {
  // initialize Betoken object
  let web3Instance = new Web3(web3Provider);
  const account = web3Instance.eth.accounts.privateKeyToAccount(accountPrivateKey);
  web3Instance.eth.accounts.wallet.add(account);
  web3Instance.eth.defaultAccount = account.address;
  let betoken = new Betoken(web3Instance);
  await betoken.init();

  // initialize BetokenDataController object
  let dataController = new BetokenDataController(betoken);
  await dataController.loadAllData();

  // initialize BetokenAPI object
  let api = new BetokenAPI(betoken, dataController);

  return api;
}