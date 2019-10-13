// imports
const BigNumber = require('bignumber.js');
const https = require('https');
const util = require('util');
const isUndefined = util.isUndefined;

// constants
const PRECISION = 1e18;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const CTOKENS = require('../json_data/compound_tokens.json'); // Compound cTokens
const STABLECOINS = require('../json_data/stablecoins.json'); // Stablecoins (managers can't invest)
const PTOKENS = require('../json_data/fulcrum_tokens.json'); // Fulcrum pTokens
const UNSAFE_COL_RATIO_MULTIPLIER = 1.1;
const COL_RATIO_MODIFIER = 4 / 3;

module.exports = function (betoken) {
  let self = this;

  // instance variables
  // user info
  self.userAddress = ZERO_ADDR;
  self.kairoBalance = BigNumber(0);
  self.sharesBalance = BigNumber(0);
  self.investmentBalance = BigNumber(0);
  self.investmentList = [];
  self.lastCommissionRedemption = 0;
  self.managerROI = BigNumber(0);
  self.portfolioValue = BigNumber(0);
  self.riskTakenPercentage = BigNumber(0);
  self.commissionBalance = BigNumber(0);

  // fund metadata
  self.kairoTotalSupply = BigNumber(0);
  self.sharesTotalSupply = BigNumber(0);
  self.totalFunds = BigNumber(0);

  // fund stats
  self.cycleTotalCommission = BigNumber(0);
  self.sharesPrice = BigNumber(0);
  self.kairoPrice = BigNumber(0);

  // cycle timekeeping
  self.cycleNumber = 0;
  self.cyclePhase = 0;
  self.phaseLengths = [3 * 24 * 60 * 60, 27 * 24 * 60 * 60];
  self.startTimeOfCyclePhase = 0;
  
  // token data
  self.TOKEN_DATA = [];

  // helpers
  self.assetSymbolToPrice = function (_symbol) {
    return self.TOKEN_DATA.find((x) => x.symbol === _symbol).price;
  };

  self.assetSymbolToAddress = function (_symbol) {
    return self.TOKEN_DATA.find((x) => x.symbol === _symbol).address;
  };

  self.assetAddressToSymbol = function (_addr) {
    return self.TOKEN_DATA.find((x) => x.address === _addr).symbol;
  };

  self.assetSymbolToCTokenAddress = (_symbol) => {
    return CTOKENS.find((x) => x.symbol === _symbol).address;
  };

  self.assetSymbolToPTokens = (_symbol) => {
    return PTOKENS.find((x) => x.symbol === _symbol).pTokens;
  };

  self.assetSymbolToInfo = (_symbol) => self.TOKEN_DATA.find((x) => x.symbol === _symbol);

  self.assetCTokenAddressToSymbol = (_addr) => {
    return CTOKENS.find((x) => x.address === _addr).symbol;
  };

  self.assetPTokenAddressToSymbol = (_addr) => {
    return PTOKENS.find((x) => !isUndefined(x.pTokens.find((y) => y.address === _addr))).symbol;
  };

  self.assetPTokenAddressToInfo = (_addr) => {
    return PTOKENS.find((x) => !isUndefined(x.pTokens.find((y) => y.address === _addr))).pTokens.find((y) => y.address === _addr);
  };

  self.notStablecoin = (_symbol) => {
    return !STABLECOINS.includes(_symbol);
  };

  self.isCompoundToken = (_symbol) => {
    const result = CTOKENS.find((x) => x.symbol === _symbol);
    return !isUndefined(result);
  };

  self.isFulcrumToken = (_symbol) => {
    const result = PTOKENS.find((x) => x.symbol === _symbol);
    return !isUndefined(result);
  };

  self.isFulcrumTokenAddress = (_tokenAddress) => {
    const result = PTOKENS.find((x) => !isUndefined(x.pTokens.find((y) => y.address === _tokenAddress)));
    return !isUndefined(result);
  };

  self.fulcrumMinStake = (_symbol, _isShort) => {
    let underlyingPrice;
    if (_isShort) {
      // underlying is token
      underlyingPrice = self.assetSymbolToPrice(_symbol);
    } else {
      // underlying is DAI
      underlyingPrice = BigNumber(1);
    }
    const MIN_AMOUNT = BigNumber(0.001);
    return MIN_AMOUNT.times(underlyingPrice).div(totalFunds).times(kairoTotalSupply);
  };

  self.httpsGet = async (apiStr) => {
    const data = await (new Promise((resolve, reject) => {
      https.get(apiStr, (res) => {
        var rawData = "";
        res.on("data", (chunk) => {
          rawData += chunk;
        });
        res.on("end", () => {
          var parsedData = JSON.parse(rawData);
          resolve(parsedData);
        });
      }).on("error", reject);
    }));
    return data;
  };

  self.timeTillPhaseEnd = () => {
    const now = Math.floor(new Date().getTime() / 1000);
    const target = self.startTimeOfCyclePhase + self.phaseLengths[self.cyclePhase];
    const distance = target - now;
    return distance;
  }

  // data loaders
  self.loadTokenMetadata = () => {
    // fetch token data from Kyber API
    let rawData = require('./json_data/kyber_tokens.json').data;
    let tokenData = rawData.map((x) => {
      return {
        name: x.name,
        symbol: x.symbol,
        address: betoken.web3.utils.toChecksumAddress(x.address),
        decimals: x.decimals,
        price: BigNumber(0),
        dailyPriceChange: BigNumber(0)
      }
    });

    self.TOKEN_DATA = tokenData;
  }

  self.loadFundData = async () => {
    return Promise.all([
      self.cycleNumber = +((await betoken.getPrimitiveVar("cycleNumber"))),
      self.cyclePhase = +((await betoken.getPrimitiveVar("cyclePhase"))),
      self.startTimeOfCyclePhase = +((await betoken.getPrimitiveVar("startTimeOfCyclePhase"))),
      self.sharesTotalSupply = BigNumber((await betoken.getShareTotalSupply())).div(PRECISION),
      self.totalFunds = BigNumber((await betoken.getPrimitiveVar("totalFundsInDAI"))).div(PRECISION),
      self.kairoTotalSupply = BigNumber((await betoken.getKairoTotalSupply())).div(PRECISION)
    ]);
  };

  self.loadUserData = async () => {
    // Get user address
    const userAddr = betoken.web3.eth.defaultAccount;
    self.userAddress = userAddr;

    // Get shares balance
    self.sharesBalance = BigNumber((await betoken.getShareBalance(userAddr))).div(PRECISION);
    if (!self.sharesTotalSupply.isZero()) {
      self.investmentBalance = self.sharesBalance.div(self.sharesTotalSupply).times(self.totalFunds);
    }

    // Get user's Kairo balance
    self.kairoBalance = BigNumber((await betoken.getKairoBalance(userAddr))).div(PRECISION);

    // Get last commission redemption cycle number
    self.lastCommissionRedemption = +((await betoken.getMappingOrArrayItem("lastCommissionRedemption", userAddr)));

    // Get user's risk profile
    let risk = BigNumber(await betoken.getRiskTaken(userAddr));

    // Get user's commission balance
    let commissionObj = await betoken.getCommissionBalance(userAddr);
    self.commissionBalance = BigNumber(commissionObj._commission).div(PRECISION);

    var stake = BigNumber(0);
    var totalKROChange = BigNumber(0);

    // Get list of user's investments
    var investments = await betoken.getInvestments(userAddr);
    if (investments.length > 0) {
      const handleProposal = async (id) => {
        let inv = investments[id];
        let symbol = "";
        if (self.isFulcrumTokenAddress(inv.tokenAddress)) {
          symbol = self.assetPTokenAddressToSymbol(inv.tokenAddress);

          inv.type = "fulcrum";
          inv.id = id;
          inv.tokenSymbol = symbol;
          inv.stake = BigNumber(inv.stake).div(PRECISION);
          inv.buyPrice = BigNumber(inv.buyPrice).div(PRECISION);
          inv.sellPrice = inv.isSold ? BigNumber(inv.sellPrice).div(PRECISION) : await betoken.getPTokenPrice(inv.tokenAddress, assetSymbolToPrice(symbol));
          inv.ROI = BigNumber(inv.sellPrice).minus(inv.buyPrice).div(inv.buyPrice).times(100);
          inv.kroChange = BigNumber(inv.ROI).times(inv.stake).div(100);
          inv.currValue = BigNumber(inv.kroChange).plus(inv.stake);
          inv.buyTime = new Date(+inv.buyTime * 1e3);

          let info = self.assetPTokenAddressToInfo(inv.tokenAddress);
          inv.leverage = info.leverage;
          inv.orderType = info.type;

          inv.liquidationPrice = await betoken.getPTokenLiquidationPrice(inv.tokenAddress, self.assetSymbolToPrice(symbol));
          inv.safety = inv.liquidationPrice.minus(inv.sellPrice).div(inv.sellPrice).abs().gt(UNSAFE_COL_RATIO_MULTIPLIER - 1);


          if (!inv.isSold && +inv.cycleNumber === cycleNumber) {
            // add stake
            var currentStakeValue = inv.sellPrice
              .minus(inv.buyPrice).div(inv.buyPrice).times(inv.stake).plus(inv.stake);
            stake = stake.plus(currentStakeValue);

            // add risk
            let now = Date.now();
            let investmentAgeInSeconds = now / 1e3 - inv.buyTime.getTime() / 1e3;
            risk = risk.plus(inv.stake.times(PRECISION).times(investmentAgeInSeconds).integerValue());
          }
        } else {
          symbol = self.assetAddressToSymbol(inv.tokenAddress);

          inv.type = "basic";
          inv.id = id;
          inv.tokenSymbol = symbol;
          inv.stake = BigNumber(inv.stake).div(PRECISION);
          inv.buyPrice = BigNumber(inv.buyPrice).div(PRECISION);
          inv.sellPrice = inv.isSold ? BigNumber(inv.sellPrice).div(PRECISION) : self.assetSymbolToPrice(symbol);
          inv.ROI = BigNumber(inv.sellPrice).minus(inv.buyPrice).div(inv.buyPrice).times(100);
          inv.kroChange = BigNumber(inv.ROI).times(inv.stake).div(100);
          inv.currValue = BigNumber(inv.kroChange).plus(inv.stake);
          inv.buyTime = new Date(+inv.buyTime * 1e3);

          if (!inv.isSold && +inv.cycleNumber === cycleNumber) {
            // add stake
            var currentStakeValue = inv.sellPrice
              .minus(inv.buyPrice).div(inv.buyPrice).times(inv.stake).plus(inv.stake);
            stake = stake.plus(currentStakeValue);

            // add risk
            let now = Date.now();
            let investmentAgeInSeconds = now / 1e3 - inv.buyTime.getTime() / 1e3;
            risk = risk.plus(inv.stake.times(PRECISION).times(investmentAgeInSeconds).integerValue());
          }
        }
        investments[id] = inv;
      };
      const handleAllProposals = () => {
        var results = [];
        for (var i = 0; i < investments.length; i++) {
          results.push(handleProposal(i));
        }
        return results;
      };
      await Promise.all(handleAllProposals());
      investments = investments.filter((x) => +x.cycleNumber == self.cycleNumber);

      totalKROChange = totalKROChange.plus(investments.map((x) => BigNumber(x.kroChange)).reduce((x, y) => x.plus(y), BigNumber(0)));
    }

    // get list of Compound orders
    var compoundOrderAddrs = await betoken.getCompoundOrders(userAddr);
    var compoundOrders = new Array(compoundOrderAddrs.length);
    if (compoundOrderAddrs.length > 0) {
      const properties = ["stake", "cycleNumber", "collateralAmountInDAI", "compoundTokenAddr", "isSold", "orderType", "buyTime", "getCurrentCollateralRatioInDAI", "getCurrentCollateralInDAI", "getCurrentBorrowInDAI", "getCurrentCashInDAI", "getCurrentProfitInDAI", "getCurrentLiquidityInDAI", "getMarketCollateralFactor"];
      const handleProposal = async (id) => {
        const order = await betoken.CompoundOrder(compoundOrderAddrs[id]);
        let orderData = { "id": id };
        compoundOrders[id] = orderData;
        let promises = [];
        for (let prop of properties) {
          promises.push(order.methods[prop]().call().then((x) => orderData[prop] = x));
        }
        return await Promise.all(promises);
      };
      const handleAllProposals = () => {
        var results = [];
        for (var i = 0; i < compoundOrderAddrs.length; i++) {
          results.push(handleProposal(i));
        }
        return results;
      };
      await Promise.all(handleAllProposals());

      // reformat compound order objects
      compoundOrders = compoundOrders.filter((x) => +x.cycleNumber == self.cycleNumber); // only care about investments in current cycle
      for (let o of compoundOrders) {
        o.stake = BigNumber(o.stake).div(PRECISION);
        o.cycleNumber = +o.cycleNumber;
        o.collateralAmountInDAI = BigNumber(o.collateralAmountInDAI).div(PRECISION);
        o.buyTime = new Date(+o.buyTime * 1e3);

        o.collateralRatio = BigNumber(o.getCurrentCollateralRatioInDAI).div(PRECISION);
        o.currProfit = BigNumber(o.getCurrentProfitInDAI._amount).times(o.getCurrentProfitInDAI._isNegative ? -1 : 1).div(PRECISION);
        o.currCollateral = BigNumber(o.getCurrentCollateralInDAI).div(PRECISION);
        o.currBorrow = BigNumber(o.getCurrentBorrowInDAI).div(PRECISION);
        o.currCash = BigNumber(o.getCurrentCashInDAI).div(PRECISION);
        o.minCollateralRatio = BigNumber(PRECISION).div(o.getMarketCollateralFactor);
        o.currLiquidity = BigNumber(o.getCurrentLiquidityInDAI._amount).times(o.getCurrentLiquidityInDAI._isNegative ? -1 : 1).div(PRECISION);

        o.ROI = o.currProfit.div(o.collateralAmountInDAI).times(100);
        o.kroChange = o.ROI.times(o.stake).div(100);
        o.tokenSymbol = assetCTokenAddressToSymbol(o.compoundTokenAddr);
        o.currValue = o.stake.plus(o.kroChange);
        o.safety = o.collateralRatio.gt(o.minCollateralRatio.times(UNSAFE_COL_RATIO_MULTIPLIER));
        o.leverage = o.orderType ? o.minCollateralRatio.times(COL_RATIO_MODIFIER).pow(-1).dp(4).toNumber() : BigNumber(1).plus(o.minCollateralRatio.times(COL_RATIO_MODIFIER).pow(-1)).dp(4).toNumber();
        o.type = "compound";

        if (!o.isSold) {
          // add stake
          var currentStakeValue = o.stake.times(o.ROI.div(100).plus(1));
          stake = stake.plus(currentStakeValue);

          // add risk
          let now = Date.now();
          let investmentAgeInSeconds = now / 1e3 - o.buyTime.getTime() / 1e3;
          risk = risk.plus(o.stake.times(PRECISION).times(investmentAgeInSeconds).integerValue());
        }

        delete o.getCurrentCollateralRatioInDAI;
        delete o.getCurrentProfitInDAI;
        delete o.getCurrentCollateralInDAI;
        delete o.getCurrentBorrowInDAI;
        delete o.getCurrentCashInDAI;
        delete o.getMarketCollateralFactor;
      }

      totalKROChange = totalKROChange.plus(compoundOrders.map((x) => BigNumber(x.kroChange)).reduce((x, y) => x.plus(y), BigNumber(0)));
    }

    self.investmentList = investments.concat(compoundOrders);
    self.portfolioValue = stake.plus(self.kairoBalance);
    var cycleStartKRO = BigNumber(await betoken.getBaseStake(userAddr)).div(PRECISION);
    self.managerROI = cycleStartKRO.gt(0) ? totalKROChange.div(cycleStartKRO).times(100) : BigNumber(0);

    self.riskTakenPercentage = BigNumber(risk).div(await betoken.getRiskThreshold(userAddr));
    if (self.riskTakenPercentage.isNaN()) {
      self.riskTakenPercentage = BigNumber(0);
    }
    self.riskTakenPercentage = BigNumber.min(self.riskTakenPercentage, 1); // Meaningless after exceeding 1
  };

  self.loadTokenPrices = async () => {
    let apiStr = "https://api.kyber.network/market";
    let rawData = await self.httpsGet(apiStr);
    if (!rawData.error) {
      self.TOKEN_DATA = self.TOKEN_DATA.map((x) => {
        if (x.symbol !== 'ETH') {
          let tokenData = rawData.data.find((y) => y.base_symbol === x.symbol);
          let daiData = rawData.data.find((y) => y.base_symbol === 'DAI');
          if (tokenData.current_bid == 0) {
            tokenData.current_bid = tokenData.current_ask;
          } else if (tokenData.current_ask == 0) {
            tokenData.current_ask = tokenData.current_bid;
          }
          if (daiData.current_bid == 0) {
            daiData.current_bid = daiData.current_ask;
          } else if (daiData.current_ask == 0) {
            daiData.current_ask = daiData.current_bid;
          }

          let tokenPriceInETH = (tokenData.current_bid + tokenData.current_ask) / 2;
          let daiPriceInETH = (daiData.current_bid + daiData.current_ask) / 2;
          x.price = BigNumber(tokenPriceInETH).div(daiPriceInETH);

          x.dailyVolume = BigNumber(tokenData.usd_24h_volume);
        } else {
          let daiData = rawData.data.find((y) => y.base_symbol === 'DAI');
          if (daiData.current_bid == 0) {
            daiData.current_bid = daiData.current_ask;
          } else if (daiData.current_ask == 0) {
            daiData.current_ask = daiData.current_bid;
          }

          let daiPriceInETH = (daiData.current_bid + daiData.current_ask) / 2;
          x.price = BigNumber(1).div(daiPriceInETH);

          x.dailyVolume = BigNumber(rawData.data.reduce((accumulator, curr) => accumulator + curr.usd_24h_volume, 0));
        }

        return x;
      });
    }

    apiStr = "https://api.kyber.network/change24h";
    rawData = await self.httpsGet(apiStr);
    self.TOKEN_DATA = self.TOKEN_DATA.map((x) => {
      x.dailyPriceChange = BigNumber(rawData[`ETH_${x.symbol}`].change_usd_24h);
      return x;
    });
  };

  self.loadStats = async () => {
    if (!self.sharesTotalSupply.isZero() && self.userAddress !== ZERO_ADDR) {
      self.investmentBalance = self.sharesBalance.div(self.sharesTotalSupply).times(self.totalFunds);
    }

    if (!self.sharesTotalSupply.isZero()) {
      self.sharesPrice = BigNumber(1).div(self.sharesTotalSupply).times(self.totalFunds);
    } else {
      self.sharesPrice = BigNumber(1);
    }

    if (!self.kairoTotalSupply.isZero()) {
      var price = self.totalFunds.div(self.kairoTotalSupply);
      self.kairoPrice = BigNumber.max(price, BigNumber(2.5));
    } else {
      self.kairoPrice = BigNumber(2.5);
    }

    self.cycleTotalCommission = BigNumber((await betoken.getMappingOrArrayItem("totalCommissionOfCycle", self.cycleNumber))).div(PRECISION);
  };

  self.loadAllData = async function () {
    return self.loadTokenMetadata().then(() => self.loadDynamicData());
  };

  self.loadDynamicData = async () => {
    return self.loadFundData().then(() => {
      return self.loadTokenPrices();
    }).then(() => Promise.all(
      [
        self.loadUserData(),
        self.loadStats(),
      ]
    ));
  };

  return this;
}