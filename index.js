import { Betoken } from './src/betoken-obj';
import { BetokenDataController } from './src/data-controller';
import { BetokenAPI } from './src/helpers';
import Web3 from 'web3';

export const getBetokenAPI = async (web3Provider, accountPrivateKey) => {
  // initialize Betoken object
  let betoken = new Betoken();
  let web3Instance = new Web3(web3Provider);
  const account = web3Instance.eth.accounts.privateKeyToAccount(accountPrivateKey);
  web3Instance.eth.accounts.wallet.add(account);
  web3Instance.eth.defaultAccount = account.address;
  await betoken.init(web3Instance);

  // initialize BetokenDataController object
  let dataController = new BetokenDataController(betoken);
  await dataController.loadAllData();

  // initialize BetokenAPI object
  let api = new BetokenAPI(betoken, dataController);

  return api;
}