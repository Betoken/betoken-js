// imports
const BigNumber = require('bignumber.js');

module.exports = function (betoken, Data) {
  let self = this;

  self.timer = {
    timeTillPhaseEnd: () => Data.timeTillPhaseEnd(),
    phase: () => Data.cyclePhase,
    phaseStartTime: () => Data.startTimeOfCyclePhase,
    phaseLengths: () => Data.phaseLengths,
    cycle: () => Data.cycleNumber
  };

  self.user = {
    address: () => Data.userAddress,
    sharesBalance: () => Data.sharesBalance,
    sharesBalanceInDai: () => Data.investmentBalance,
    kairoBalance: () => Data.kairoBalance,
    tokenBalance: async (tokenSymbol) => {
      let balance = await betoken.getTokenBalance(Data.assetSymbolToAddress(tokenSymbol), Data.userAddress);
      let decimals = Data.TOKENDATA.find((x) => x.symbol === tokenSymbol).decimals;
      return BigNumber(balance).div(Math.pow(10, decimals));
    },
    monthlyRoi: () => Data.managerROI,
    investmentList: () => Data.cyclePhase == 1 ? Data.investmentList : [],
    portfolioValue: () => Data.portfolioValue,
    riskTakenPercentage: () => Data.riskTakenPercentage,
  };

  self.stats = {
    cycleLength: () => {
      if (Data.phaseLengths.length > 0) {
        return BigNumber(Data.phaseLengths.reduce(function (t, n) {
          return t + n;
        })).div(24 * 60 * 60).toDigits(3);
      }
    },
    totalFunds: () => Data.totalFunds,
    sharesPrice: () => Data.sharesPrice,
    kairoPrice: () => Data.kairoPrice,
    kairoTotalSupply: () => Data.kairoTotalSupply,
    sharesTotalSupply: () => Data.sharesTotalSupply
  };

  self.tokens = {
    tokenData: () => Data.TOKENDATA,
    assetSymbolToInfo: (symbol) => Data.assetSymbolToInfo(symbol),
    assetSymbolToPTokens: (symbol) => Data.assetSymbolToPTokens(symbol),
    assetSymbolToCTokenAddress: (symbol) => Data.assetSymbolToCTokenAddress(symbol),
    assetAddressToSymbol: (addr) => Data.assetAddressToSymbol(addr),
    assetPTokenAddressToInfo: (addr) => Data.assetPTokenAddressToInfo(addr),
    assetCTokenAddressToSymbol: (addr) => Data.assetCTokenAddressToSymbol(addr),
    getPTokenPrice: (addr, underlyingPrice) => betoken.getPTokenPrice(addr, underlyingPrice), // returns promise
    notStablecoin: (symbol) => Data.notStablecoin(symbol),
    isCompoundToken: (symbol) => Data.isCompoundToken(symbol),
    isFulcrumToken: (symbol) => Data.isFulcrumToken(symbol),
    fulcrumMinStake: (symbol, isShort) => Data.fulcrumMinStake(symbol, isShort)
  };

  self.refreshActions = {
    investments: () => {
      return Data.loadTokenPrices().then(Data.loadUserData);
    },
    prices: () => {
      return Data.loadTokenPrices();
    },
    all: () => {
      return Data.loadAllData();
    }
  };

  self.investorActions = {
    // All amounts must be BigNumber, in floating point (no need to multiply by 1e18)
    depositETH: (amt, onPending, onConfirm, onError) => {
      return betoken.depositETH(amt, onPending, onConfirm, onError);
    },
    depositDAI: (amt, onPending, onConfirm, onError) => {
      return betoken.depositDAI(amt, onPending, onConfirm, onError);
    },
    depositToken: (amt, tokenSymbol, onPending, onConfirm, onError) => {
      let tokenAddr = Data.assetSymbolToInfo(tokenSymbol).address;
      return betoken.depositToken(tokenAddr, amt, onPending, onConfirm, onError);
    },
    withdrawETH: (amt, onPending, onConfirm, onError) => {
      return betoken.withdrawETH(amt, onPending, onConfirm, onError);
    },
    withdrawDAI: (amt, onPending, onConfirm, onError) => {
      return betoken.withdrawDAI(amt, onPending, onConfirm, onError);
    },
    withdrawToken: (amt, tokenSymbol, onPending, onConfirm, onError) => {
      let tokenAddr = Data.assetSymbolToInfo(tokenSymbol).address;
      return betoken.withdrawToken(tokenAddr, amt, onPending, onConfirm, onError);
    },
    nextPhase: () => {
      return betoken.nextPhase();
    }
  };

  self.managerActions = {
    // All amounts must be BigNumber, in floating point (no need to multiply by 1e18)
    newInvestmentWithSymbol: function (tokenSymbol, stakeInKRO, minPrice, maxPrice, onPending, onConfirm, onError) {
      var tokenAddress = Data.assetSymbolToAddress(tokenSymbol);
      return betoken.createInvestment(tokenAddress, stakeInKRO, minPrice, maxPrice, onPending, onConfirm, onError);
    },
    newInvestmentWithAddress: function (tokenAddress, stakeInKRO, minPrice, maxPrice, onPending, onConfirm, onError) {
      return betoken.createInvestment(tokenAddress, stakeInKRO, minPrice, maxPrice, onPending, onConfirm, onError);
    },
    sellInvestment: function (id, percentage, minPrice, maxPrice, onPending, onConfirm, onError) {
      return betoken.sellAsset(id, percentage, minPrice, maxPrice, onPending, onConfirm, onError);
    },
    newCompoundOrder: function (orderType, tokenSymbol, stakeInKRO, minPrice, maxPrice, onPending, onConfirm, onError) {
      var tokenAddress = Data.assetSymbolToCTokenAddress(tokenSymbol);
      return betoken.createCompoundOrder(orderType, tokenAddress, stakeInKRO, minPrice, maxPrice, onPending, onConfirm, onError);
    },
    sellCompoundOrder: function (id, minPrice, maxPrice, onPending, onConfirm, onError) {
      return betoken.sellCompoundOrder(id, minPrice, maxPrice, onPending, onConfirm, onError);
    },
    repayCompoundOrder: function (id, amountInDAI, onPending, onConfirm, onError) {
      return betoken.repayCompoundOrder(id, amountInDAI, onPending, onConfirm, onError);
    },
    redeemCommission: function (inShares, onPending, onConfirm, onError) {
      return betoken.redeemCommission(inShares, onPending, onConfirm, onError);
    },
    redeemCommissionForCycle: function (inShares, cycle, onPending, onConfirm, onError) {
      return betoken.redeemCommissionForCycle(inShares, cycle, onPending, onConfirm, onError);
    },
    nextPhase: () => {
      return betoken.nextPhase();
    },
    registerWithDAI: (amountInDAI, onPending, onConfirm, onError) => {
      return betoken.registerWithDAI(amountInDAI, onPending, onConfirm, onError);
    },
    registerWithETH: (amountInETH, onPending, onConfirm, onError) => {
      return betoken.registerWithETH(amountInETH, onPending, onConfirm, onError);
    },
    registerWithToken: (amountInToken, symbol, onPending, onConfirm, onError) => {
      let tokenAddr = Data.assetSymbolToAddress(symbol);
      return betoken.registerWithToken(tokenAddr, amountInToken, onPending, onConfirm, onError);
    }
  };

  return this;
}