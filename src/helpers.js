// imports
import BigNumber from "bignumber.js";
const Data = require("./data-controller");;

export const BetokenAPI = (betoken) => {
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
        tokenBalance: async (tokenSymbol) => {
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
            return Data.loadTokenPrices().then(Data.loadRanking).then(Data.loadUserData).then(Data.loadStats);
        }
    };

    self.investorActions = {
        // All amounts must be BigNumber, in floating point (no need to multiply by 1e18)
        depositETH: async (amt, pending, confirm, error) => {
            betoken.depositETH(amt, pending, confirm, error);
        },
        depositDAI: async (amt, pending, confirm, error) => {
            betoken.depositDAI(amt, pending, confirm, error);
        },
        depositToken: async (amt, tokenSymbol, pending, confirm, error) => {
            let tokenAddr = Data.assetSymbolToInfo(tokenSymbol).address;
            betoken.depositToken(tokenAddr, amt, pending, confirm, error);
        },
        withdrawETH: async (amt, pending, confirm, error) => {
            return betoken.withdrawETH(amt, pending, confirm, error);
        },
        withdrawDAI: async (amt, pending, confirm, error) => {
            return betoken.withdrawDAI(amt, pending, confirm, error);
        },
        withdrawToken: async (amt, tokenSymbol, pending, confirm, error) => {
            let tokenAddr = Data.assetSymbolToInfo(tokenSymbol).address;
            return betoken.withdrawToken(tokenAddr, amt, pending, confirm, error);
        },
        nextPhase: async () => {
            await betoken.nextPhase();
        }
    };

    self.managerActions = {
        // All amounts must be BigNumber, in floating point (no need to multiply by 1e18)
        newInvestmentWithSymbol: async function (tokenSymbol, stakeInKRO, minPrice, maxPrice, pending, confirm, error) {
            var tokenAddress = Data.assetSymbolToAddress(tokenSymbol);
            betoken.createInvestment(tokenAddress, stakeInKRO, minPrice, maxPrice, pending, confirm, error);
        },
        newInvestmentWithAddress: async function (tokenAddress, stakeInKRO, minPrice, maxPrice, pending, confirm, error) {
            betoken.createInvestment(tokenAddress, stakeInKRO, minPrice, maxPrice, pending, confirm, error);
        },
        sellInvestment: async function (id, percentage, minPrice, maxPrice, pending, confirm, error) {
            return betoken.sellAsset(id, percentage, minPrice, maxPrice, pending, confirm, error);
        },
        newCompoundOrder: async function (orderType, tokenSymbol, stakeInKRO, minPrice, maxPrice, pending, confirm, error) {
            var tokenAddress = Data.assetSymbolToCTokenAddress(tokenSymbol);
            betoken.createCompoundOrder(orderType, tokenAddress, stakeInKRO, minPrice, maxPrice, pending, confirm, error);
        },
        sellCompoundOrder: async function (id, minPrice, maxPrice, pending, confirm, error) {
            return betoken.sellCompoundOrder(id, minPrice, maxPrice, pending, confirm, error);
        },
        repayCompoundOrder: async function (id, amountInDAI, pending, confirm, error) {
            return betoken.repayCompoundOrder(id, amountInDAI, pending, confirm, error);
        },
        redeemCommission: async function (inShares, pending, confirm, error) {
            return betoken.redeemCommission(inShares, pending, confirm, error);
        },
        redeemCommissionForCycle: async function (inShares, cycle, pending, confirm, error) {
            return betoken.redeemCommissionForCycle(inShares, cycle, pending, confirm, error);
        },
        nextPhase: async () => {
            await betoken.nextPhase();
        },
        registerWithDAI: async (amountInDAI, pending, confirm, error) => {
            return betoken.registerWithDAI(amountInDAI, pending, confirm, error);
        },
        registerWithETH: async (amountInETH, pending, confirm, error) => {
            return betoken.registerWithETH(amountInETH, pending, confirm, error);
        },
        registerWithToken: async (amountInToken, symbol, pending, confirm, error) => {
            let tokenAddr = Data.assetSymbolToAddress(symbol);
            return betoken.registerWithToken(tokenAddr, amountInToken, pending, confirm, error);
        }
    };
}
