// imports
import BigNumber from "bignumber.js";
const Web3 = require('web3');

// constants
export const BETOKEN_PROXY_ADDR = "0xC7CbB403D1722EE3E4ae61f452Dc36d71E8800DE";
export const ETH_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
export const DAI_ADDR = "0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359";
export const KYBER_ADDR = "0x818E6FECD516Ecc3849DAf6845e3EC868087B755";
export const NET_ID = 1; // Mainnet
export const PRECISION = 1e18;

// helpers
export const getDefaultAccount = async () => {
    web3.eth.defaultAccount = (await web3.eth.getAccounts())[0];
};

export const ERC20 = function (_tokenAddr) {
    // add new token contract
    var erc20ABI = require("../abi/ERC20.json");
    return new web3.eth.Contract(erc20ABI, _tokenAddr);
};

export const CompoundOrder = function (_addr) {
    var abi = require("../abi/CompoundOrder.json");
    return new web3.eth.Contract(abi, _addr);
};

export const PositionToken = function (_addr) {
    var abi = require("../abi/PositionToken.json");
    return new web3.eth.Contract(abi, _addr);
};

export const estimateGas = async (func, val, _onError) => {
    return Math.floor((await func.estimateGas({
        from: web3.eth.defaultAccount,
        value: val
    }).catch(_onError)) * 1.2);
};

export const sendTx = async (func, _onTxHash, _onReceipt, _onError) => {
    var gasLimit = await estimateGas(func, 0, _onError);
    if (!isNaN(gasLimit)) {
        return func.send({
            from: web3.eth.defaultAccount,
            gas: gasLimit
        }).on("transactionHash", _onTxHash).on("receipt", _onReceipt).on("error", _onError);
    }
};

export const sendTxWithValue = async (func, val, _onTxHash, _onReceipt, _onError) => {
    var gasLimit = await estimateGas(func, val, _onError);
    if (!isNaN(gasLimit)) {
        return func.send({
            from: web3.eth.defaultAccount,
            gas: gasLimit,
            value: val
        }).on("transactionHash", _onTxHash).on("receipt", _onReceipt).on("error", _onError);
    }
};

export const sendTxWithToken = async (func, token, to, amount, _onTxHash, _onReceipt, _onError) => {
    return sendTx(token.methods.approve(to, 0), () => {
        sendTx(token.methods.approve(to, amount), () => {
            func.send({
                from: web3.eth.defaultAccount,
                gasLimit: "3000000"
            }).on("transactionHash", _onTxHash).on("receipt", _onReceipt).on("error", _onError);
        }, doNothing, _onError);
    }, doNothing, _onError);
};

export const doNothing = () => { }

// Betoken abstraction
/**
* Constructs an abstraction of Betoken contracts
*/
export var Betoken = function () {
    // Instance vars
    var self;
    self = this;
    self.contracts = {
        BetokenProxy: null,
        BetokenFund: null,
        Kairo: null,
        Shares: null,
        Kyber: null
    };

    /*
    Object Initialization
    */
    self.init = async () => {
        // initialize web3
        window.web3 = new Web3("wss://mainnet.infura.io/ws/v3/3057a4979e92452bae6afaabed67a724");

        // Initialize BetokenProxy contract
        var betokenProxyABI = require("../abi/BetokenProxy.json");
        var BetokenProxy = new web3.eth.Contract(betokenProxyABI, BETOKEN_PROXY_ADDR);
        self.contracts.BetokenProxy = BetokenProxy;

        // Fetch address of BetokenFund
        var betokenAddr = await BetokenProxy.methods.betokenFundAddress().call();

        // Initialize BetokenFund contract
        var betokenFundABI = require("../abi/BetokenFund.json");
        var BetokenFund = new web3.eth.Contract(betokenFundABI, betokenAddr);
        self.contracts.BetokenFund = BetokenFund;

        // Initialize KyberNetwork contract
        var kyberABI = require("../abi/KyberNetwork.json");
        var Kyber = new web3.eth.Contract(kyberABI, KYBER_ADDR);
        self.contracts.Kyber = Kyber;

        // Initialize token contracts
        var minimeABI = require("../abi/MiniMeToken.json");
        await Promise.all([
            BetokenFund.methods.controlTokenAddr().call().then(function (_addr) {
                // Initialize Kairo contract
                self.contracts.Kairo = new web3.eth.Contract(minimeABI, _addr);
            }),
            BetokenFund.methods.shareTokenAddr().call().then(function (_addr) {
                // Initialize Shares contract
                self.contracts.Shares = new web3.eth.Contract(minimeABI, _addr);
            })
        ]);
    };

    /*
    Getters
    */

    /**
    * Gets a primitive variable in BetokenFund
    * @param  {String} _varName the name of the primitive variable
    * @return {Promise}          .then((_value)->)
    */
    self.getPrimitiveVar = function (_varName) {
        return self.contracts.BetokenFund.methods[_varName]().call();
    };

    /**
    * Calls a mapping or an array in BetokenFund
    * @param  {String} _name name of the mapping/array
    * @param  {Any} _input       the input
    * @return {Promise}              .then((_value)->)
    */
    self.getMappingOrArrayItem = function (_name, _input) {
        return self.contracts.BetokenFund.methods[_name](_input).call();
    };

    /**
    * Calls a double mapping in BetokenFund
    * @param  {String} _mappingName name of the mapping
    * @param  {Any} _input1      the first input
    * @param  {Any} _input2      the second input
    * @return {Promise}              .then((_value)->)
    */
    self.getDoubleMapping = function (_mappingName, _input1, _input2) {
        return self.contracts.BetokenFund.methods[_mappingName](_input1, _input2).call();
    };

    self.getTokenSymbol = function (_tokenAddr) {
        _tokenAddr = web3.utils.toHex(_tokenAddr);
        if (_tokenAddr === ETH_TOKEN_ADDRESS) {
            return Promise.resolve().then(function () {
                return "ETH";
            });
        }
        return ERC20(_tokenAddr).methods.symbol().call();
    };

    self.getTokenDecimals = function (_tokenAddr) {
        _tokenAddr = web3.utils.toHex(_tokenAddr);
        if (_tokenAddr === ETH_TOKEN_ADDRESS) {
            return Promise.resolve().then(function () {
                return 18;
            });
        }
        return ERC20(_tokenAddr).methods.decimals().call();
    };

    self.getTokenBalance = function (_tokenAddr, _addr) {
        if (_tokenAddr === web3.utils.toChecksumAddress(ETH_TOKEN_ADDRESS)) {
            return web3.eth.getBalance(_addr);
        }
        return ERC20(_tokenAddr).methods.balanceOf(_addr).call();
    };

    self.getTokenPrice = async (_tokenAddr) => {
        try {
            if (web3.utils.toChecksumAddress(_tokenAddr) === DAI_ADDR) {
                return BigNumber(1);
            }
            let decimals = await self.getTokenDecimals(_tokenAddr);
            var price = await self.contracts.Kyber.methods.getExpectedRate(_tokenAddr, DAI_ADDR, BigNumber(10).pow(decimals).toString()).call();
            price = price[0];
            return BigNumber(price).div(PRECISION);
        } catch (e) {
            return BigNumber(0);
        }
    };

    self.getPTokenPrice = async (_tokenAddr, _underlyingPrice) => {
        try {
            let pToken = PositionToken(_tokenAddr);
            let underlyingPerPToken = await pToken.methods.tokenPrice().call();
            let underlying = await pToken.methods.loanTokenAddress().call();
            if (underlying === DAI_ADDR) {
                return BigNumber(underlyingPerPToken).div(PRECISION);
            }
            return BigNumber(underlyingPerPToken).div(PRECISION).times(_underlyingPrice);
        } catch (e) {
            return BigNumber(0);
        }
    };

    self.getPTokenLiquidationPrice = async (_tokenAddr, _underlyingPrice) => {
        try {
            let pToken = PositionToken(_tokenAddr);
            let underlyingPerPToken = await pToken.methods.liquidationPrice().call();
            let underlying = await pToken.methods.loanTokenAddress().call();
            if (underlying === DAI_ADDR) {
                return BigNumber(underlyingPerPToken).div(PRECISION);
            }
            return BigNumber(underlyingPerPToken).div(PRECISION).times(_underlyingPrice);
        } catch (e) {
            return BigNumber(0);
        }
    };

    /**
    * Gets the Kairo balance of an address
    * @param  {String} _address the address whose balance we're getting
    * @return {Promise}          .then((_value)->)
    */
    self.getKairoBalance = function (_address) {
        return self.contracts.Kairo.methods.balanceOf(_address).call();
    };

    self.getKairoBalanceAtCycleStart = async function (_address) {
        let cycleStartBlock = await self.contracts.BetokenFund.methods.managePhaseEndBlock((await self.getPrimitiveVar("cycleNumber")) - 1).call();
        return self.contracts.Kairo.methods.balanceOfAt(_address, cycleStartBlock).call();
    };

    self.getBaseStake = async (_address) => {
        let baseStake = BigNumber(await self.getKairoBalanceAtCycleStart(_address));
        if (baseStake.isZero()) {
            baseStake = BigNumber(await self.getMappingOrArrayItem("baseRiskStakeFallback", _address));
        }
        return baseStake;
    }

    self.getKairoTotalSupply = function () {
        return self.contracts.Kairo.methods.totalSupply().call();
    };

    self.getRiskTaken = async (_address) => {
        return self.getDoubleMapping("riskTakenInCycle", _address, (await self.getPrimitiveVar("cycleNumber")));
    }

    self.getRiskThreshold = async (_address) => {
        let baseStake = await self.getBaseStake(_address);
        let threeDayInSeconds = 3 * 24 * 60 * 60;
        return baseStake.times(threeDayInSeconds);
    }

    /**
    * Gets the Share balance of an address
    * @param  {String} _address the address whose balance we're getting
    * @return {Promise}          .then((_value)->)
    */
    self.getShareBalance = function (_address) {
        return self.contracts.Shares.methods.balanceOf(_address).call();
    };

    self.getShareTotalSupply = function () {
        return self.contracts.Shares.methods.totalSupply().call();
    };

    /**
    * Gets the array of investments
    * @return {Promise} .then((investments) ->)
    */
    self.getInvestments = function (_userAddress) {
        var array = [];
        return self.getMappingOrArrayItem("investmentsCount", _userAddress).then((_count) => {
            var getAllItems, getItem;
            var count = +_count;
            if (count === 0) {
                return [];
            }
            array = new Array(count);
            getItem = (id) => {
                return self.getDoubleMapping("userInvestments", _userAddress, id).then((_item) => {
                    return new Promise((fullfill, reject) => {
                        if (typeof _item !== null) {
                            array[id] = _item;
                            fullfill();
                        } else {
                            reject();
                        }
                    });
                });
            };
            getAllItems = () => {
                var results = [];
                for (var i = 0; i < count; i++) {
                    results.push(getItem(i));
                }
                return results;
            };
            return Promise.all(getAllItems());
        }).then(function () {
            return array;
        });
    };

    self.getCompoundOrders = function (_userAddress) {
        var array = [];
        return self.getMappingOrArrayItem("compoundOrdersCount", _userAddress).then((_count) => {
            var count = +_count;
            if (count === 0) {
                return [];
            }
            array = new Array(count);
            const getItem = (id) => {
                return self.getDoubleMapping("userCompoundOrders", _userAddress, id).then((_item) => {
                    return new Promise((fullfill, reject) => {
                        if (typeof _item !== null) {
                            array[id] = _item;
                            fullfill();
                        } else {
                            reject();
                        }
                    });
                });
            };
            const getAllItems = () => {
                var results = [];
                for (var i = 0; i < count; i++) {
                    results.push(getItem(i));
                }
                return results;
            };
            return Promise.all(getAllItems());
        }).then(function () {
            return array;
        });
    }

    /*
    Phase handler
    */
    /**
    * Ends the current phase
    * @return {Promise} .then(()->)
    */
    self.nextPhase = async function (_onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();

        var func = self.contracts.BetokenFund.methods.nextPhase();
        return sendTx(func, _onTxHash, _onReceipt, _onError);
    };


    /*
    Invest & Withdraw phase functions
    */

    /**
    * Allows user to deposit into the fund using ETH
    * @param  {BigNumber} _tokenAmount the deposit token amount
    * @return {Promise}               .then(()->)
    */
    self.depositETH = async function (_tokenAmount, _onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();
        var amount = BigNumber(_tokenAmount).times(PRECISION).integerValue().toFixed();

        var func = self.contracts.BetokenFund.methods.depositEther();
        return sendTxWithValue(func, amount, _onTxHash, _onReceipt, _onError);
    };

    /**
    * Allows user to deposit into the fund using DAI
    * @param  {BigNumber} _tokenAmount the deposit token amount
    * @return {Promise}               .then(()->)
    */
    self.depositDAI = async function (_tokenAmount, _onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();
        var token = ERC20(DAI_ADDR);
        var amount = BigNumber(_tokenAmount).times(PRECISION).integerValue().toFixed();

        var func = self.contracts.BetokenFund.methods.depositDAI(amount);
        return sendTxWithToken(func, token, self.contracts.BetokenFund.options.address, amount, _onTxHash, _onReceipt, _onError);
    };

    /**
    * Allows user to deposit into the fund
    * @param  {String} _tokenAddr the token address
    * @param  {BigNumber} _tokenAmount the deposit token amount
    * @return {Promise}               .then(()->)
    */
    self.depositToken = async function (_tokenAddr, _tokenAmount, _onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();
        var token = ERC20(_tokenAddr);
        var amount = BigNumber(_tokenAmount).times(BigNumber(10).pow(await self.getTokenDecimals(_tokenAddr))).integerValue().toFixed();

        var func = self.contracts.BetokenFund.methods.depositToken(_tokenAddr, amount);
        return sendTxWithToken(func, token, self.contracts.BetokenFund.options.address, amount, _onTxHash, _onReceipt, _onError);
    };

    /**
    * Allows user to withdraw from fund balance into ETH
    * @param  {BigNumber} _amountInDAI the withdrawal amount in DAI
    * @return {Promise}               .then(()->)
    */
    self.withdrawETH = async function (_amountInDAI, _onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();
        var amount = BigNumber(_amountInDAI).times(PRECISION).integerValue().toFixed();

        var func = self.contracts.BetokenFund.methods.withdrawEther(amount);
        return sendTx(func, _onTxHash, _onReceipt, _onError);
    };

    /**
    * Allows user to withdraw from fund balance into DAI
    * @param  {BigNumber} _amountInDAI the withdrawal amount in DAI
    * @return {Promise}               .then(()->)
    */
    self.withdrawDAI = async function (_amountInDAI, _onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();
        var amount = BigNumber(_amountInDAI).times(PRECISION).integerValue().toFixed();

        var func = self.contracts.BetokenFund.methods.withdrawDAI(amount);
        return sendTx(func, _onTxHash, _onReceipt, _onError);
    };

    /**
    * Allows user to withdraw from fund balance
    * @param  {String} _tokenAddr the token address
    * @param  {BigNumber} _amountInDAI the withdrawal amount in DAI
    * @return {Promise}               .then(()->)
    */
    self.withdrawToken = async function (_tokenAddr, _amountInDAI, _onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();
        var amount = BigNumber(_amountInDAI).times(PRECISION).integerValue().toFixed();

        var func = self.contracts.BetokenFund.methods.withdrawToken(_tokenAddr, amount);
        return sendTx(func, _onTxHash, _onReceipt, _onError);
    };

    /*
    Manage functions
    */

    /**
    * Creates an investment
    * @param  {String} _tokenAddress the token address
    * @param  {BigNumber} _stakeInKRO the investment amount
    * @param  {BigNumber} _minPrice the min acceptable token price
    * @param  {BigNumber} _maxPrice the max acceptable token price
    * @return {Promise}               .then(()->)
    */
    self.createInvestment = async function (_tokenAddress, _stakeInKRO, _minPrice, _maxPrice, _onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();
        var stake = _stakeInKRO.times(PRECISION).integerValue().toFixed();
        var minPrice = _minPrice.times(PRECISION).integerValue().toFixed();
        var maxPrice = _maxPrice.times(PRECISION).integerValue().toFixed();

        var func = self.contracts.BetokenFund.methods.createInvestment(_tokenAddress, stake, minPrice, maxPrice);
        return sendTx(func, _onTxHash, _onReceipt, _onError);
    };

    /**
    * Sells an investment (maybe only part of it)
    * @param  {Number} _proposalId the investment's ID
    * @param  {BigNumber} _percentage the percentage of tokens to sell
    * @param  {BigNumber} _minPrice the min acceptable token price
    * @param  {BigNumber} _maxPrice the max acceptable token price
    * @return {Promise}               .then(()->)
    */
    self.sellAsset = async function (_proposalId, _percentage, _minPrice, _maxPrice, _onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();
        var sellTokenAmount = BigNumber((await self.getDoubleMapping("userInvestments", web3.eth.defaultAccount, _proposalId)).tokenAmount).times(_percentage).integerValue().toFixed();
        var minPrice = _minPrice.times(PRECISION).integerValue().toFixed();
        var maxPrice = _maxPrice.times(PRECISION).integerValue().toFixed();

        var func = self.contracts.BetokenFund.methods.sellInvestmentAsset(_proposalId, sellTokenAmount, minPrice, maxPrice);
        return sendTx(func, _onTxHash, _onReceipt, _onError);
    };

    /**
    * Creates an Compound order
    * @param  {Bool} _orderType True for shorting, false for longing
    * @param  {String} _tokenAddress the compound token address (not underlying)
    * @param  {BigNumber} _stakeInKRO the investment amount
    * @param  {BigNumber} _minPrice the min acceptable token price
    * @param  {BigNumber} _maxPrice the max acceptable token price
    * @return {Promise}               .then(()->)
    */
    self.createCompoundOrder = async function (_orderType, _tokenAddress, _stakeInKRO, _minPrice, _maxPrice, _onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();
        var stake = _stakeInKRO.times(PRECISION).integerValue().toFixed();
        var minPrice = _minPrice.times(PRECISION).integerValue().toFixed();
        var maxPrice = _maxPrice.times(PRECISION).integerValue().toFixed();

        var func = self.contracts.BetokenFund.methods.createCompoundOrder(_orderType, _tokenAddress, stake, minPrice, maxPrice);
        return sendTx(func, _onTxHash, _onReceipt, _onError);
    };

    /**
    * Sells a Compound order
    * @param  {Number} _proposalId the order's ID
    * @param  {BigNumber} _minPrice the min acceptable token price
    * @param  {BigNumber} _maxPrice the max acceptable token price
    * @return {Promise}               .then(()->)
    */
    self.sellCompoundOrder = async function (_proposalId, _minPrice, _maxPrice, _onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();
        var minPrice = _minPrice.times(PRECISION).integerValue().toFixed();
        var maxPrice = _maxPrice.times(PRECISION).integerValue().toFixed();

        var func = self.contracts.BetokenFund.methods.sellCompoundOrder(_proposalId, minPrice, maxPrice);
        return sendTx(func, _onTxHash, _onReceipt, _onError);
    };

    /**
    * Repays debt for a Compound order
    * @param  {Number} _proposalId the order's ID
    * @param  {BigNumber} _amountInDAI the amount to repay, in DAI
    * @return {Promise}               .then(()->)
    */
    self.repayCompoundOrder = async function (_proposalId, _amountInDAI, _onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();
        var repayAmount = _amountInDAI.times(PRECISION).integerValue().toFixed();

        var func = self.contracts.BetokenFund.methods.repayCompoundOrder(_proposalId, repayAmount);
        return sendTx(func, _onTxHash, _onReceipt, _onError);
    }

    /*
    Redeem Commission functions
    */
    self.redeemCommission = async function (_inShares, _onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();

        var func = self.contracts.BetokenFund.methods.redeemCommission(_inShares);
        return sendTx(func, _onTxHash, _onReceipt, _onError);
    };

    self.redeemCommissionForCycle = async function (_inShares, _cycle, _onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();

        var func = self.contracts.BetokenFund.methods.redeemCommissionForCycle(_inShares, _cycle);
        return sendTx(func, _onTxHash, _onReceipt, _onError);
    };

    /*
    Manager Registration functions
    */
    self.registerWithDAI = async function (_amountInDAI, _onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();
        var token = ERC20(DAI_ADDR);
        var amount = BigNumber(_amountInDAI).times(PRECISION).integerValue().toFixed();

        var func = self.contracts.BetokenFund.methods.registerWithDAI(amount);
        return sendTxWithToken(func, token, self.contracts.BetokenFund.options.address, amount, _onTxHash, _onReceipt, _onError);
    }

    self.registerWithETH = async function (_amountInETH, _onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();
        var amount = BigNumber(_amountInETH).times(PRECISION).integerValue().toFixed();

        var func = self.contracts.BetokenFund.methods.registerWithETH();
        return sendTxWithValue(func, amount, _onTxHash, _onReceipt, _onError);
    }

    self.registerWithToken = async function (_tokenAddr, _amountInTokens, _onTxHash, _onReceipt, _onError) {
        await getDefaultAccount();
        var token = ERC20(_tokenAddr);
        var amount = BigNumber(_amountInTokens).times(BigNumber(10).pow(await self.getTokenDecimals(_tokenAddr))).integerValue().toFixed();

        var func = self.contracts.BetokenFund.methods.registerWithToken(_tokenAddr, amount);
        return sendTxWithToken(func, token, self.contracts.BetokenFund.options.address, amount, _onTxHash, _onReceipt, _onError);
    }

    return self;
};