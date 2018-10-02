import fs from 'fs';
import async from 'async';
import cfg from './configReader';
import apiInterfaces from './apiInterfaces';
//import { Logger } from './logger';
import { GlobalState } from './globalstate';
let Logger = GlobalState.Logger;
let config = GlobalState.config.config;
let redisClient = GlobalState.redisClient;
//var fs = require('fs')
//var async = require('async')
//var apiInterfaces = require('./apiInterfaces.js')(config.daemon, config.wallet, config.api)

// TODO: better usage than global
//import { Global } from './defines';

//const globalAny: Global = <Global>global;

let api = new apiInterfaces(config.daemon, config.wallet, config.api);

var logSystem = 'payments'
require('./exceptionWriter.js')(logSystem)

Logger.Log('info', logSystem, 'Started')

function runInterval() {
    async.waterfall([
        // Get worker keys
        function (callback: any) {
            redisClient.keys(config.coin + ':workers:*', function (error: any, result: any) {
                if (error) {
                    Logger.Log('error', logSystem, 'Error trying to get worker balances from redis %j', [error])
                    callback(true)
                    return
                }
                callback(null, result)
            })
        },

        // Get worker balances
        function (keys: any, callback: any) {
            var redisCommands = keys.map(function (k: any) {
                return ['hmget', k, 'balance', 'minPayoutLevel']
            })
            redisClient.multi(redisCommands).exec(function (error: any, replies: any) {
                if (error) {
                    Logger.Log('error', logSystem, 'Error with getting balances from redis %j', [error]);
                    callback(true);
                    return;
                }
                let balances: { [key:number]: number } = {};
                let minPayoutLevel: { [key:number]: number } = {};
                for (var i = 0; i < replies.length; i++) {
                    let parts = keys[i].split(':');
                    let workerId = parts[parts.length - 1];
                    let data = replies[i];
                    balances[workerId] = parseInt(data[0]) || 0;
                    minPayoutLevel[workerId] = parseFloat(data[1]) || config.payments.minPayment;
                    Logger.Log('info', logSystem, 'Using payout level %d for worker %s (default: %d)', [minPayoutLevel[workerId], workerId, config.payments.minPayment]);
                }
                callback(null, balances, minPayoutLevel);
            })
        },

        // Filter workers under balance threshold for payment
        function (balances: { [key: string]: number }, minPayoutLevel: any, callback: any) {
            let payments: { [key: string]: number } = {}

            for (let worker in balances) {
                let balance = balances[worker]
                if (balance >= minPayoutLevel[worker]) {
                    let remainder = balance % config.payments.denomination;
                    let payout = balance - remainder;
                    if (payout < 0)
                        continue;
                    payments[worker] = payout;
                }
            }

            if (Object.keys(payments).length === 0) {
                Logger.Log('info', logSystem, 'No workers\' balances reached the minimum payment threshold')
                callback(true)
                return
            }

            var transferCommands: any[] = [];
            var addresses = 0
            var commandAmount = 0
            var commandIndex = 0

            for (let worker in payments) {
                let amount = payments[worker];
                if (config.payments.maxTransactionAmount && amount + commandAmount > config.payments.maxTransactionAmount)
                    amount = config.payments.maxTransactionAmount - commandAmount;
                

                if (!transferCommands[commandIndex]) {
                    transferCommands[commandIndex] = {
                        redis: [],
                        amount: 0,
                        rpc: {
                            transfers: [],
                            fee: config.payments.transferFee,
                        }
                    }
                }

                transferCommands[commandIndex].rpc.transfers.push({ amount: amount, address: worker });
                transferCommands[commandIndex].redis.push(['hincrby', config.coin + ':workers:' + worker, 'balance', -amount]);
                transferCommands[commandIndex].redis.push(['hincrby', config.coin + ':workers:' + worker, 'paid', amount]);
                transferCommands[commandIndex].amount += amount;

                addresses++;
                commandAmount += amount;
                if (addresses >= config.payments.maxAddresses
                    || (config.payments.maxTransactionAmount && commandAmount >= config.payments.maxTransactionAmount)) {
                    commandIndex++;
                    addresses = 0;
                    commandAmount = 0;
                }
            }

            var timeOffset = 0;

            async.filter(transferCommands, function (transferCmd, cback) {
                api.rpcWallet('sendTransaction', transferCmd.rpc, function (error: any, result: any) {
                    if (error) {
                        Logger.Log('error', logSystem, 'Error with sendTransaction RPC request to wallet daemon %j', [error]);
                        Logger.Log('error', logSystem, 'Payments failed to send to %j', transferCmd.rpc.transfers);
                        cback(false);
                        return;
                    }

                    let now = (timeOffset++) + Date.now() / 1000 | 0;
                    let txHash = result.transactionHash;

                    transferCmd.redis.push(['zadd', config.coin + ':payments:all', now, [
                        txHash,
                        transferCmd.amount,
                        transferCmd.rpc.fee,
                        Object.keys(transferCmd.rpc.transfers).length
                    ].join(':')])

                    for (var i = 0; i < transferCmd.rpc.transfers.length; i++) {
                        var destination = transferCmd.rpc.transfers[i]
                        transferCmd.redis.push(['zadd', config.coin + ':payments:' + destination.address, now, [
                            txHash,
                            destination.amount,
                            transferCmd.rpc.fee,
                        ].join(':')])
                    }

                    Logger.Log('info', logSystem, 'Payments sent via wallet daemon %j', [result])
                    redisClient.multi(transferCmd.redis).exec(function (error: any, replies: any) {
                        if (error) {
                            Logger.Log('error', logSystem, 'Super critical error! Payments sent yet failing to update balance in redis, double payouts likely to happen %j', [error]);
                            Logger.Log('error', logSystem, 'Double payments likely to be sent to %j', transferCmd.rpc.transfers);
                            cback(false);
                            return;
                        }
                        cback(true);
                    })
                })
            }, function (succeeded: any) {
                var failedAmount = transferCommands.length - succeeded.length;
                Logger.Log('info', logSystem, 'Payments splintered and %d successfully sent, %d failed', [succeeded.length, failedAmount]);
                callback(null);
            })
        }

    ], function (error, result) {
        setTimeout(runInterval, config.payments.interval * 1000)
    })
}

runInterval()
