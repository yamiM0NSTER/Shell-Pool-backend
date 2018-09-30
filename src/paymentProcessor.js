"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const async_1 = __importDefault(require("async"));
const apiInterfaces_1 = __importDefault(require("./apiInterfaces"));
const logger_1 = require("./logger");
const globalAny = global;
let api = new apiInterfaces_1.default(globalAny.config.config.daemon, globalAny.config.config.wallet, globalAny.config.config.api);
var logSystem = 'payments';
require('./exceptionWriter.js')(logSystem);
logger_1.Logger.Log('info', logSystem, 'Started');
function runInterval() {
    async_1.default.waterfall([
        // Get worker keys
        function (callback) {
            globalAny.redisClient.keys(globalAny.config.config.coin + ':workers:*', function (error, result) {
                if (error) {
                    logger_1.Logger.Log('error', logSystem, 'Error trying to get worker balances from redis %j', [error]);
                    callback(true);
                    return;
                }
                callback(null, result);
            });
        },
        // Get worker balances
        function (keys, callback) {
            var redisCommands = keys.map(function (k) {
                return ['hmget', k, 'balance', 'minPayoutLevel'];
            });
            globalAny.redisClient.multi(redisCommands).exec(function (error, replies) {
                if (error) {
                    logger_1.Logger.Log('error', logSystem, 'Error with getting balances from redis %j', [error]);
                    callback(true);
                    return;
                }
                let balances = {};
                let minPayoutLevel = {};
                for (var i = 0; i < replies.length; i++) {
                    let parts = keys[i].split(':');
                    let workerId = parts[parts.length - 1];
                    let data = replies[i];
                    balances[workerId] = parseInt(data[0]) || 0;
                    minPayoutLevel[workerId] = parseFloat(data[1]) || globalAny.config.config.payments.minPayment;
                    logger_1.Logger.Log('info', logSystem, 'Using payout level %d for worker %s (default: %d)', [minPayoutLevel[workerId], workerId, globalAny.config.config.payments.minPayment]);
                }
                callback(null, balances, minPayoutLevel);
            });
        },
        // Filter workers under balance threshold for payment
        function (balances, minPayoutLevel, callback) {
            let payments = {};
            for (let worker in balances) {
                let balance = balances[worker];
                if (balance >= minPayoutLevel[worker]) {
                    let remainder = balance % globalAny.config.config.payments.denomination;
                    let payout = balance - remainder;
                    if (payout < 0)
                        continue;
                    payments[worker] = payout;
                }
            }
            if (Object.keys(payments).length === 0) {
                logger_1.Logger.Log('info', logSystem, 'No workers\' balances reached the minimum payment threshold');
                callback(true);
                return;
            }
            var transferCommands = [];
            var addresses = 0;
            var commandAmount = 0;
            var commandIndex = 0;
            for (let worker in payments) {
                let amount = payments[worker];
                if (globalAny.config.config.payments.maxTransactionAmount && amount + commandAmount > globalAny.config.config.payments.maxTransactionAmount)
                    amount = globalAny.config.config.payments.maxTransactionAmount - commandAmount;
                if (!transferCommands[commandIndex]) {
                    transferCommands[commandIndex] = {
                        redis: [],
                        amount: 0,
                        rpc: {
                            transfers: [],
                            fee: globalAny.config.config.payments.transferFee,
                        }
                    };
                }
                transferCommands[commandIndex].rpc.transfers.push({ amount: amount, address: worker });
                transferCommands[commandIndex].redis.push(['hincrby', globalAny.config.config.coin + ':workers:' + worker, 'balance', -amount]);
                transferCommands[commandIndex].redis.push(['hincrby', globalAny.config.config.coin + ':workers:' + worker, 'paid', amount]);
                transferCommands[commandIndex].amount += amount;
                addresses++;
                commandAmount += amount;
                if (addresses >= globalAny.config.config.payments.maxAddresses
                    || (globalAny.config.config.payments.maxTransactionAmount && commandAmount >= globalAny.config.config.payments.maxTransactionAmount)) {
                    commandIndex++;
                    addresses = 0;
                    commandAmount = 0;
                }
            }
            var timeOffset = 0;
            async_1.default.filter(transferCommands, function (transferCmd, cback) {
                api.rpcWallet('sendTransaction', transferCmd.rpc, function (error, result) {
                    if (error) {
                        logger_1.Logger.Log('error', logSystem, 'Error with sendTransaction RPC request to wallet daemon %j', [error]);
                        logger_1.Logger.Log('error', logSystem, 'Payments failed to send to %j', transferCmd.rpc.transfers);
                        cback(false);
                        return;
                    }
                    let now = (timeOffset++) + Date.now() / 1000 | 0;
                    let txHash = result.transactionHash;
                    transferCmd.redis.push(['zadd', globalAny.config.config.coin + ':payments:all', now, [
                            txHash,
                            transferCmd.amount,
                            transferCmd.rpc.fee,
                            Object.keys(transferCmd.rpc.transfers).length
                        ].join(':')]);
                    for (var i = 0; i < transferCmd.rpc.transfers.length; i++) {
                        var destination = transferCmd.rpc.transfers[i];
                        transferCmd.redis.push(['zadd', globalAny.config.config.coin + ':payments:' + destination.address, now, [
                                txHash,
                                destination.amount,
                                transferCmd.rpc.fee,
                            ].join(':')]);
                    }
                    logger_1.Logger.Log('info', logSystem, 'Payments sent via wallet daemon %j', [result]);
                    globalAny.redisClient.multi(transferCmd.redis).exec(function (error, replies) {
                        if (error) {
                            logger_1.Logger.Log('error', logSystem, 'Super critical error! Payments sent yet failing to update balance in redis, double payouts likely to happen %j', [error]);
                            logger_1.Logger.Log('error', logSystem, 'Double payments likely to be sent to %j', transferCmd.rpc.transfers);
                            cback(false);
                            return;
                        }
                        cback(true);
                    });
                });
            }, function (succeeded) {
                var failedAmount = transferCommands.length - succeeded.length;
                logger_1.Logger.Log('info', logSystem, 'Payments splintered and %d successfully sent, %d failed', [succeeded.length, failedAmount]);
                callback(null);
            });
        }
    ], function (error, result) {
        setTimeout(runInterval, globalAny.config.config.payments.interval * 1000);
    });
}
runInterval();
//# sourceMappingURL=paymentProcessor.js.map