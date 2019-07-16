// imports
import { getDefaultAccount, DAI_ADDR, CompoundOrder } from './betoken-obj';
import BigNumber from "bignumber.js";
import https from "https";
import { isUndefined } from 'util';

// constants
const PRECISION = 1e18;
const DEPLOYED_BLOCK = 8064049;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const CTOKENS = require('../json_data/compound_tokens.json'); // Compound cTokens
const STABLECOINS = require('../json_data/stablecoins.json'); // Stablecoins (managers can't invest)
const PTOKENS = require('../json_data/fulcrum_tokens.json'); // Fulcrum pTokens
const UNSAFE_COL_RATIO_MULTIPLIER = 1.1;
const COL_RATIO_MODIFIER = 4 / 3;

// instance variables
// user info
export var userAddress = ZERO_ADDR;
export var kairoBalance = BigNumber(0);
export var sharesBalance = BigNumber(0);
export var investmentBalance = BigNumber(0);
export var investmentList = [];
export var lastCommissionRedemption = 0;
export var managerROI = BigNumber(0);
export var commissionHistory = [];
export var depositWithdrawHistory = [];
export var portfolioValue = BigNumber(0);
export var riskTakenPercentage = BigNumber(0);

// fund metadata
export var kairoTotalSupply = BigNumber(0);
export var sharesTotalSupply = BigNumber(0);
export var totalFunds = BigNumber(0);
export var commissionRate = BigNumber(0);
export var assetFeeRate = BigNumber(0);

// fund stats
export var cycleTotalCommission = BigNumber(0);
export var sharesPrice = BigNumber(0);
export var kairoPrice = BigNumber(0);

// cycle timekeeping
export var cycleNumber = 0;
export var cyclePhase = 0;
export var phaseLengths = [];
export var startTimeOfCyclePhase = 0;
export var countdownDay = 0;
export var countdownHour = 0;
export var countdownMin = 0;
export var countdownSec = 0;

// token data
export var TOKEN_DATA = [];

// helpers
const assetSymbolToPrice = function (_symbol) {
    return TOKEN_DATA.find((x) => x.symbol === _symbol).price;
};

const assetAddressToSymbol = function (_addr) {
    return TOKEN_DATA.find((x) => x.address === _addr).symbol;
};

export const assetSymbolToCTokenAddress = (_symbol) => {
    return CTOKENS.find((x) => x.symbol === _symbol).address;
};

export const assetSymbolToPTokens = (_symbol) => {
    return PTOKENS.find((x) => x.symbol === _symbol).pTokens;
};

export const assetSymbolToInfo = (_symbol) => TOKEN_DATA.find((x) => x.symbol === _symbol);

export const assetCTokenAddressToSymbol = (_addr) => {
    return CTOKENS.find((x) => x.address === _addr).symbol;
};

export const assetPTokenAddressToSymbol = (_addr) => {
    return PTOKENS.find((x) => !isUndefined(x.pTokens.find((y) => y.address === _addr))).symbol;
};

export const assetPTokenAddressToInfo = (_addr) => {
    return PTOKENS.find((x) => !isUndefined(x.pTokens.find((y) => y.address === _addr))).pTokens.find((y) => y.address === _addr);
};

export const notStablecoin = (_symbol) => {
    return !STABLECOINS.includes(_symbol);
};

export const isCompoundToken = (_symbol) => {
    const result = CTOKENS.find((x) => x.symbol === _symbol);
    return !isUndefined(result);
};

export const isFulcrumToken = (_symbol) => {
    const result = PTOKENS.find((x) => x.symbol === _symbol);
    return !isUndefined(result);
};

export const isFulcrumTokenAddress = (_tokenAddress) => {
    const result = PTOKENS.find((x) => !isUndefined(x.pTokens.find((y) => y.address === _tokenAddress)));
    return !isUndefined(result);
};

export const fulcrumMinStake = (_symbol, _isShort) => {
    let underlyingPrice;
    if (_isShort) {
        // underlying is token
        underlyingPrice = assetSymbolToPrice(_symbol);
    } else {
        // underlying is DAI
        underlyingPrice = BigNumber(1);
    }
    const MIN_AMOUNT = BigNumber(0.001);
    return MIN_AMOUNT.times(underlyingPrice).div(totalFunds).times(kairoTotalSupply);
};

export const httpsGet = async (apiStr) => {
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

const clock = () => {
    const timeKeeper = setInterval(() => {
        var days, distance, hours, minutes, now, seconds, target;
        now = Math.floor(new Date().getTime() / 1000);
        target = startTimeOfCyclePhase + phaseLengths[cyclePhase];
        distance = target - now;
        if (distance > 0) {
            days = Math.floor(distance / (60 * 60 * 24));
            hours = Math.floor((distance % (60 * 60 * 24)) / (60 * 60));
            minutes = Math.floor((distance % (60 * 60)) / 60);
            seconds = Math.floor(distance % 60);
            countdownDay = days;
            countdownHour = hours;
            countdownMin = minutes;
            countdownSec = seconds;
        } else {
            clearInterval(timeKeeper);
        }
    }, 1000);
};

// data loaders
export const loadMetadata = async () => {
    return Promise.all([
        // get params
        phaseLengths = ((await betoken.getPrimitiveVar("getPhaseLengths"))).map(x => +x),
        commissionRate = BigNumber((await betoken.getPrimitiveVar("COMMISSION_RATE"))).div(PRECISION),
        assetFeeRate = BigNumber((await betoken.getPrimitiveVar("ASSET_FEE_RATE"))).div(PRECISION),
        loadTokenMetadata()
    ]);
};

export const loadTokenMetadata = async () => {
    // fetch token data from Kyber API
    let rawData = require('../json_data/kyber_tokens.json').data;
    let tokenData = rawData.map((x) => {
        return {
            name: x.name,
            symbol: x.symbol,
            address: web3.utils.toChecksumAddress(x.address),
            decimals: x.decimals,
            price: BigNumber(0),
            dailyPriceChange: BigNumber(0),
            weeklyPriceChange: BigNumber(0),
            monthlyPriceChange: BigNumber(0)
        }
    });

    TOKEN_DATA = tokenData;
}

export const loadFundData = async () => {
    return Promise.all([
        cycleNumber = +((await betoken.getPrimitiveVar("cycleNumber"))),
        cyclePhase = +((await betoken.getPrimitiveVar("cyclePhase"))),
        startTimeOfCyclePhase = +((await betoken.getPrimitiveVar("startTimeOfCyclePhase"))),
        sharesTotalSupply = BigNumber((await betoken.getShareTotalSupply())).div(PRECISION),
        totalFunds = BigNumber((await betoken.getPrimitiveVar("totalFundsInDAI"))).div(PRECISION),
        kairoTotalSupply = BigNumber((await betoken.getKairoTotalSupply())).div(PRECISION)
    ]).then(() => {
        if (countdownDay == 0 && countdownHour == 0 && countdownMin == 0 && countdownSec == 0) {
            clock();
        }
    });
};

export const loadUserData = async () => {
    // Get user address
    await getDefaultAccount();
    const userAddr = web3.eth.defaultAccount;
    if (typeof userAddr !== "undefined") {
        userAddress = userAddr;

        // Get shares balance
        sharesBalance = BigNumber((await betoken.getShareBalance(userAddr))).div(PRECISION);
        if (!sharesTotalSupply.isZero()) {
            investmentBalance = sharesBalance.div(sharesTotalSupply).times(totalFunds);
        }

        // Get user's Kairo balance
        kairoBalance = BigNumber((await betoken.getKairoBalance(userAddr))).div(PRECISION);

        // Get last commission redemption cycle number
        lastCommissionRedemption = +((await betoken.getMappingOrArrayItem("lastCommissionRedemption", userAddr)));

        // Get user's risk profile
        let risk = BigNumber(await betoken.getRiskTaken(userAddr));

        var stake = BigNumber(0);
        var totalKROChange = BigNumber(0);

        // Get list of user's investments
        var investments = await betoken.getInvestments(userAddr);
        if (investments.length > 0) {
            const handleProposal = async (id) => {
                let inv = investments[id];
                let symbol = "";
                if (isFulcrumTokenAddress(inv.tokenAddress)) {
                    symbol = assetPTokenAddressToSymbol(inv.tokenAddress);

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

                    let info = assetPTokenAddressToInfo(inv.tokenAddress);
                    inv.leverage = info.leverage;
                    inv.orderType = info.type;

                    inv.liquidationPrice = await betoken.getPTokenLiquidationPrice(inv.tokenAddress, assetSymbolToPrice(symbol));
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
                    symbol = assetAddressToSymbol(inv.tokenAddress);

                    inv.type = "basic";
                    inv.id = id;
                    inv.tokenSymbol = symbol;
                    inv.stake = BigNumber(inv.stake).div(PRECISION);
                    inv.buyPrice = BigNumber(inv.buyPrice).div(PRECISION);
                    inv.sellPrice = inv.isSold ? BigNumber(inv.sellPrice).div(PRECISION) : assetSymbolToPrice(symbol);
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
            investments = investments.filter((x) => +x.cycleNumber == cycleNumber);

            totalKROChange = totalKROChange.plus(investments.map((x) => BigNumber(x.kroChange)).reduce((x, y) => x.plus(y), BigNumber(0)));
        }

        // get list of Compound orders
        var compoundOrderAddrs = await betoken.getCompoundOrders(userAddr);
        var compoundOrders = new Array(compoundOrderAddrs.length);
        if (compoundOrderAddrs.length > 0) {
            const properties = ["stake", "cycleNumber", "collateralAmountInDAI", "compoundTokenAddr", "isSold", "orderType", "buyTime", "getCurrentCollateralRatioInDAI", "getCurrentCollateralInDAI", "getCurrentBorrowInDAI", "getCurrentCashInDAI", "getCurrentProfitInDAI", "getCurrentLiquidityInDAI", "getMarketCollateralFactor"];
            const handleProposal = async (id) => {
                const order = await CompoundOrder(compoundOrderAddrs[id]);
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
            compoundOrders = compoundOrders.filter((x) => +x.cycleNumber == cycleNumber); // only care about investments in current cycle
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

        investmentList = investments.concat(compoundOrders);
        portfolioValue = stake.plus(kairoBalance);
        var cycleStartKRO = BigNumber(await betoken.getBaseStake(userAddr)).div(PRECISION);
        managerROI = cycleStartKRO.gt(0) ? totalKROChange.div(cycleStartKRO).times(100) : BigNumber(0);

        riskTakenPercentage = BigNumber(risk).div(await betoken.getRiskThreshold(userAddr));
        if (riskTakenPercentage.isNaN()) {
            riskTakenPercentage = BigNumber(0);
        }
        riskTakenPercentage = BigNumber.min(riskTakenPercentage, 1); // Meaningless after exceeding 1   
    }
};

export const loadTxHistory = async () => {
    if (userAddress != ZERO_ADDR) {
        // Get commission history
        let events = (await betoken.contracts.BetokenFund.getPastEvents("CommissionPaid", {
            fromBlock: DEPLOYED_BLOCK,
            filter: {
                _sender: userAddress
            }
        }));
        let commissionHistoryArray = [];
        for (let event of events) {
            let entry = {
                cycle: +event.returnValues._cycleNumber,
                amount: BigNumber(event.returnValues._commission).div(10 ** 18),
                timestamp: new Date((await web3.eth.getBlock(event.blockNumber)).timestamp * 1e3).toLocaleString(),
                txHash: event.transactionHash
            };
            commissionHistoryArray.push(entry);
        }
        commissionHistoryArray.sort((a, b) => b.cycle - a.cycle);
        commissionHistory = commissionHistoryArray;

        // Get Deposit & Withdraw history
        let depositWithdrawHistoryArray = [];
        const getDepositWithdrawHistory = async function (_type) {
            var data, entry, event, events, j, len;
            events = (await betoken.contracts.BetokenFund.getPastEvents(_type, {
                fromBlock: DEPLOYED_BLOCK,
                filter: {
                    _sender: userAddress
                }
            }));
            for (j = 0, len = events.length; j < len; j++) {
                event = events[j];
                data = event.returnValues;
                let daiAmount = data._daiAmount;
                if (daiAmount > 0) {
                    let symbol = assetAddressToSymbol(data._tokenAddress);
                    entry = {
                        type: _type,
                        timestamp: +data._timestamp,
                        token: symbol,
                        amount: BigNumber(data._tokenAmount).div(10 ** TOKEN_DATA.find((x) => x.symbol === symbol).decimals),
                        daiAmount: BigNumber(daiAmount).div(10 ** 18),
                        txHash: event.transactionHash
                    };
                    depositWithdrawHistoryArray.push(entry);
                }
            }
        };
        await Promise.all([getDepositWithdrawHistory("Deposit"), getDepositWithdrawHistory("Withdraw")]);
        // sort the history, latest entries come first
        depositWithdrawHistoryArray.sort((a, b) => b.timestamp - a.timestamp);
        // convert timestamps to date strings
        for (var entry of depositWithdrawHistoryArray) {
            entry.timestamp = new Date(entry.timestamp * 1e3).toLocaleString();
        }
        depositWithdrawHistory = depositWithdrawHistoryArray;
    }
};

export const loadTokenPrices = async () => {
    let apiStr = "https://api.kyber.network/market";
    let rawData = await httpsGet(apiStr);
    if (!rawData.error) {
        TOKEN_DATA = TOKEN_DATA.map((x) => {
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
    rawData = await httpsGet(apiStr);
    TOKEN_DATA = TOKEN_DATA.map((x) => {
        x.dailyPriceChange = BigNumber(rawData[`ETH_${x.symbol}`].change_usd_24h);
        return x;
    });

    loadPriceChanges(7).then((changes) => {
        TOKEN_DATA = TOKEN_DATA.map((x, i) => {
            x.weeklyPriceChange = changes[i];
            return x;
        });
    });
    loadPriceChanges(30).then((changes) => {
        TOKEN_DATA = TOKEN_DATA.map((x, i) => {
            x.monthlyPriceChange = changes[i];
            return x;
        });
    });
};

const loadPriceChanges = async (_daysInPast) => {
    var i = 0;
    var result = [];
    while (i < TOKEN_DATA.length) {
        var tokens = [];
        while (i < TOKEN_DATA.length && tokens.join().length + TOKEN_DATA[i].symbol.length + 1 <= 30) {
            tokens.push(TOKEN_DATA[i].symbol);
            i++;
        }

        const apiStr = `https://min-api.cryptocompare.com/data/pricehistorical?fsym=DAI&tsyms=${tokens.join()}&ts=${Math.floor(Date.now() / 1000 - 86400 * _daysInPast)}`;
        const data = await httpsGet(apiStr);

        for (var t in tokens) {
            const _token = tokens[t];
            const pastPrice = BigNumber(1).div(data.DAI[_token]);
            result.push(assetSymbolToPrice(_token).minus(pastPrice).div(pastPrice).times(100));
        }
    }
    return result;
}

export const loadStats = async () => {
    if (!sharesTotalSupply.isZero() && userAddress !== ZERO_ADDR) {
        investmentBalance = sharesBalance.div(sharesTotalSupply).times(totalFunds);
    }

    if (!sharesTotalSupply.isZero()) {
        sharesPrice = BigNumber(1).div(sharesTotalSupply).times(totalFunds);
    } else {
        sharesPrice = BigNumber(1);
    }

    if (!kairoTotalSupply.isZero()) {
        var price = totalFunds.div(kairoTotalSupply);
        kairoPrice = BigNumber.max(price, BigNumber(2.5));
    } else {
        kairoPrice = BigNumber(2.5);
    }

    cycleTotalCommission = BigNumber((await betoken.getMappingOrArrayItem("totalCommissionOfCycle", cycleNumber))).div(PRECISION);
};

export const loadAllData = async function () {
    return loadMetadata().then(() => loadDynamicData());
};

export const loadDynamicData = async () => {
    return loadFundData().then(() => {
        return loadTokenPrices();
    }).then(() => Promise.all(
        [
            loadUserData().then(() => {
                return loadTxHistory();
            }),
            loadStats(),
        ]
    ));
};