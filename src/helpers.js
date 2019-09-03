// imports
import BigNumber from "bignumber.js";

export const BetokenAPI = (betoken, Data) => {
  let self = this;

  self.timer = {
    day: () => Data.countdownDay,
    hour: () => Data.countdownHour,
    minute: () => Data.countdownMin,
    second: () => Data.countdownSec,
    phase: () => Data.cyclePhase,
    phaseStartTime: () => Data.startTimeOfCyclePhase,
    phaseLengths: () => Data.phaseLengths,
    cycle: () => Data.cycleNumber
  };

  self.user = {
    address: () => Data.userAddress,
    sharesBalance: () => Data.sharesBalance,
    investmentBalance: () => Data.investmentBalance,
    kairoBalance: () => Data.kairoBalance,
    tokenBalance: async (betoken, tokenSymbol) => {
      let balance = await betoken.getTokenBalance(Data.assetSymbolToAddress(tokenSymbol), Data.userAddress);
      let decimals = Data.TOKENDATA.find((x) => x.symbol === tokenSymbol).decimals;
      return BigNumber(balance).div(Math.pow(10, decimals));
    },
    monthlyRoi: () => Data.managerROI,
    canRedeemCommission: () => {
      return betoken.hasWeb3 && Data.cyclePhase === 0 && Data.lastCommissionRedemption < Data.cycleNumber;
    },
    expectedCommission: function () {
      if (Data.kairoTotalSupply.gt(0)) {
        if (Data.cyclePhase === 0) {
          // Actual commission that will be redeemed
          return Data.kairoBalance.div(Data.kairoTotalSupply).times(Data.cycleTotalCommission);
        }
        // Expected commission based on previous average ROI
        let totalProfit = Data.totalFunds.minus(Data.totalFunds.div(stats.cycleRoi().div(100).plus(1)));
        totalProfit = BigNumber.max(totalProfit, 0);
        let commission = totalProfit.div(Data.kairoTotalSupply).times(user.portfolioValue()).times(Data.commissionRate);
        let assetFee = Data.totalFunds.div(Data.kairoTotalSupply).times(user.portfolioValue()).times(Data.assetFeeRate);
        return commission.plus(assetFee);
      }
      return BigNumber(0);
    },
    commissionHistory: () => Data.commissionHistory,
    depositWithdrawHistory: () => Data.depositWithdrawHistory,
    investmentList: () => Data.cyclePhase == 1 ? Data.investmentList : [],
    portfolioValue: () => Data.portfolioValue,
    portfolioValueInDai: () => {
      return Data.portfolioValue.times(Data.totalFunds).div(Data.kairoTotalSupply);
    },
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
    avgRoi: () => Data.avgROI,
    cycleRoi: () => {
      switch (Data.cyclePhase) {
        case 0:
          return BigNumber(0);
        case 1:
          return Data.currROI;
      }
    },
    rawRoiData: () => Data.ROIArray,
    sharesPrice: () => Data.sharesPrice,
    kairoPrice: () => Data.kairoPrice,
    kairoTotalSupply: () => Data.kairoTotalSupply
  };

  self.tokens = {
    tokenData: () => Data.TOKENDATA,
    assetSymbolToInfo: (Symbol) => Data.assetSymbolToInfo(Symbol),
    assetSymbolToPtokens: (Symbol) => Data.assetSymbolToPTokens(Symbol),
    getPtokenPrice: (Addr, UnderlyingPrice) => betoken.getPTokenPrice(Addr, UnderlyingPrice), // returns promise
    notStablecoin: (Symbol) => Data.notStablecoin(Symbol),
    isCompoundToken: (Symbol) => Data.isCompoundToken(Symbol),
    isFulcrumToken: (Symbol) => Data.isFulcrumToken(Symbol),
    fulcrumMinStake: (Symbol, IsShort) => Data.fulcrumMinStake(Symbol, IsShort)
  };

  self.refreshActions = {
    investments: () => {
      return Data.loadTokenPrices().then(Data.loadUserData);
    },
    prices: () => {
      return Data.loadTokenPrices();
    },
    stats: () => {
      return Data.loadTokenPrices().then(Data.loadUserData).then(Data.loadStats);
    }
  };

  self.investorActions = {
    // All amounts must be BigNumber, in floating point (no need to multiply by 1e18)
    depositETH: async (amt, onPending, onConfirm, onError) => {
      betoken.depositETH(amt, onPending, onConfirm, onError);
    },
    depositDAI: async (amt, onPending, onConfirm, onError) => {
      betoken.depositDAI(amt, onPending, onConfirm, onError);
    },
    depositToken: async (amt, tokenSymbol, onPending, onConfirm, onError) => {
      let tokenAddr = Data.assetSymbolToInfo(tokenSymbol).address;
      betoken.depositToken(tokenAddr, amt, onPending, onConfirm, onError);
    },
    withdrawETH: async (amt, onPending, onConfirm, onError) => {
      return betoken.withdrawETH(amt, onPending, onConfirm, onError);
    },
    withdrawDAI: async (amt, onPending, onConfirm, onError) => {
      return betoken.withdrawDAI(amt, onPending, onConfirm, onError);
    },
    withdrawToken: async (amt, tokenSymbol, onPending, onConfirm, onError) => {
      let tokenAddr = Data.assetSymbolToInfo(tokenSymbol).address;
      return betoken.withdrawToken(tokenAddr, amt, onPending, onConfirm, onError);
    },
    nextPhase: async () => {
      await betoken.nextPhase();
    }
  };

  self.managerActions = {
    // All amounts must be BigNumber, in floating point (no need to multiply by 1e18)
    newInvestmentWithSymbol: async function (tokenSymbol, stakeInKRO, minPrice, maxPrice, onPending, onConfirm, onError) {
      var tokenAddress = Data.assetSymbolToAddress(tokenSymbol);
      betoken.createInvestment(tokenAddress, stakeInKRO, minPrice, maxPrice, onPending, onConfirm, onError);
    },
    newInvestmentWithAddress: async function (tokenAddress, stakeInKRO, minPrice, maxPrice, onPending, onConfirm, onError) {
      betoken.createInvestment(tokenAddress, stakeInKRO, minPrice, maxPrice, onPending, onConfirm, onError);
    },
    sellInvestment: async function (id, percentage, minPrice, maxPrice, onPending, onConfirm, onError) {
      return betoken.sellAsset(id, percentage, minPrice, maxPrice, onPending, onConfirm, onError);
    },
    newCompoundOrder: async function (orderType, tokenSymbol, stakeInKRO, minPrice, maxPrice, onPending, onConfirm, onError) {
      var tokenAddress = Data.assetSymbolToCTokenAddress(tokenSymbol);
      betoken.createCompoundOrder(orderType, tokenAddress, stakeInKRO, minPrice, maxPrice, onPending, onConfirm, onError);
    },
    sellCompoundOrder: async function (id, minPrice, maxPrice, onPending, onConfirm, onError) {
      return betoken.sellCompoundOrder(id, minPrice, maxPrice, onPending, onConfirm, onError);
    },
    repayCompoundOrder: async function (id, amountInDAI, onPending, onConfirm, onError) {
      return betoken.repayCompoundOrder(id, amountInDAI, onPending, onConfirm, onError);
    },
    redeemCommission: async function (inShares, onPending, onConfirm, onError) {
      return betoken.redeemCommission(inShares, onPending, onConfirm, onError);
    },
    redeemCommissionForCycle: async function (inShares, cycle, onPending, onConfirm, onError) {
      return betoken.redeemCommissionForCycle(inShares, cycle, onPending, onConfirm, onError);
    },
    nextPhase: async () => {
      await betoken.nextPhase();
    },
    registerWithDAI: async (amountInDAI, onPending, onConfirm, onError) => {
      return betoken.registerWithDAI(amountInDAI, onPending, onConfirm, onError);
    },
    registerWithETH: async (amountInETH, onPending, onConfirm, onError) => {
      return betoken.registerWithETH(amountInETH, onPending, onConfirm, onError);
    },
    registerWithToken: async (amountInToken, symbol, onPending, onConfirm, onError) => {
      let tokenAddr = Data.assetSymbolToAddress(symbol);
      return betoken.registerWithToken(tokenAddr, amountInToken, onPending, onConfirm, onError);
    }
  };
}
