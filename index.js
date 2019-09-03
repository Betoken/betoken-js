import { Betoken } from './src/betoken-obj';
import { BetokenDataController } from './src/data-controller';
import { BetokenAPI } from './src/helpers';

export const getBetokenAPI = async (web3Provider) => {
  // initialize Betoken object
  let betoken = new Betoken();
  await betoken.init(web3Provider);

  // initialize BetokenDataController object
  let dataController = new BetokenDataController(betoken);
  await dataController.loadAllData();

  // initialize BetokenAPI object
  let api = new BetokenAPI(betoken, dataController);

  return api;
}