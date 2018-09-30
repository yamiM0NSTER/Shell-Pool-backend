import fs from 'fs';
import async from 'async';
import http from 'http';
import apiInterfaces from './apiInterfaces';
import { Global } from './defines';
import { Logger } from './logger';

const globalAny: Global = <Global>global;

// var fs = require('fs')
// var async = require('async')
// var http = require('http')
// var apiInterfaces = require('./apiInterfaces.js')(config.daemon, config.wallet, config.api)

let api = new apiInterfaces(globalAny.config.config.daemon, globalAny.config.config.wallet, globalAny.config.config.api);
var logSystem = 'charts';
require('./exceptionWriter.js')(logSystem);

Logger.Log('info', logSystem, 'Started');

function startDataCollectors() {
    async.each(Object.keys(globalAny.config.config.charts.pool), function (chartName) {
        var settings = globalAny.config.config.charts.pool[chartName]
        if (settings.enabled) {
            setInterval(function () {
                collectPoolStatWithInterval(chartName, settings)
            }, settings.updateInterval * 1000)
        }
    })

    var settings = globalAny.config.config.charts.user.hashrate
    if (settings.enabled) {
        setInterval(function () {
            collectUsersHashrate('hashrate', settings)
        }, settings.updateInterval * 1000)
    }
}

function getChartDataFromRedis(chartName: string, callback: any) {
    globalAny.redisClient.get(getStatsRedisKey(chartName), function (error: any, data: any) {
        callback(data ? JSON.parse(data) : [])
    })
}

function getUserHashrateChartData(address: string, callback: any) {
    getChartDataFromRedis('hashrate:' + address, callback)
}

function convertPaymentsDataToChart(paymentsData: any) {
    var data = []
    if (paymentsData && paymentsData.length) {
        for (var i = 0; paymentsData[i]; i += 2) {
            data.unshift([+paymentsData[i + 1], paymentsData[i].split(':')[1]])
        }
    }
    return data
}

export function getUserChartsData(address: string, paymentsData: any, callback: any) {
    var stats = {}
    var chartsFuncs: any = {
        hashrate: function (callback: any) {
            getUserHashrateChartData(address, function (data: any) {
                callback(null, data)
            });
        },

        payments: function (callback: any) {
            callback(null, convertPaymentsDataToChart(paymentsData));
        }
    }
    for (var chartName in chartsFuncs) {
        if (!globalAny.config.config.charts.user[chartName].enabled) {
            delete chartsFuncs[chartName];
        }
    }
    async.parallel(chartsFuncs, callback)
}
// unused?
function getUserWorkerChartsData(address: string, paymentsData: any, callback: any) {
    var stats = {};
    var chartsFuncs: any = {
        hashrate: function (callback: any) {
            getUserHashrateChartData(address, function (data: any) {
                callback(null, data);
            })
        }
    }
    for (var chartName in chartsFuncs) {
        if (!globalAny.config.config.charts.user[chartName].enabled) {
            delete chartsFuncs[chartName];
        }
    }
    async.parallel(chartsFuncs, callback)
}

function getStatsRedisKey(chartName: string): string {
    return globalAny.config.config.coin + ':charts:' + chartName;
}

var chartStatFuncs: any = {
    hashrate: getPoolHashrate,
    workers: getPoolWorkers,
    difficulty: getNetworkDifficulty,
    price: getCoinPrice,
    profit: getCoinProfit
}

var statValueHandler = {
    avg: function (set: any, value: any) {
        set[1] = (set[1] * set[2] + value) / (set[2] + 1);
    },
    avgRound: function (set: any, value: any) {
        statValueHandler.avg(set, value);
        set[1] = Math.round(set[1]);
    },
    max: function (set: any, value: any) {
        if (value > set[1])
            set[1] = value;
    }
}

var preSaveFunctions: any = {
    hashrate: statValueHandler.avgRound,
    workers: statValueHandler.max,
    difficulty: statValueHandler.avgRound,
    price: statValueHandler.avg,
    profit: statValueHandler.avg
}

function storeCollectedValues(chartName: string, values: any, settings: any) {
    for (var i in values) {
        storeCollectedValue(chartName + ':' + i, values[i], settings);
    }
}

function storeCollectedValue(chartName: string, value: any, settings: any, callback?: any) {
    var now = Date.now() / 1000 | 0;
    getChartDataFromRedis(chartName, function (sets: any) {
        var lastSet = sets[sets.length - 1] // [time, avgValue, updatesCount]
        if (!lastSet || now - lastSet[0] > settings.stepInterval) {
            lastSet = [now, value, 1]
            sets.push(lastSet)
            while (now - sets[0][0] > settings.maximumPeriod) { // clear old sets
                sets.shift()
            }
        } else {
            preSaveFunctions[chartName]
                ? preSaveFunctions[chartName](lastSet, value)
                : statValueHandler.avgRound(lastSet, value)
            lastSet[2]++
        }
        globalAny.redisClient.set(getStatsRedisKey(chartName), JSON.stringify(sets))
        Logger.Log('info', logSystem, chartName + ' chart collected value ' + value + '. Total sets count ' + sets.length);
    })
}

function collectPoolStatWithInterval(chartName: string, settings: any) {
    async.waterfall([
        chartStatFuncs[chartName],
        function (value: any, callback: any) {
            storeCollectedValue(chartName, value, settings, callback);
        }
    ])
}

function getPoolStats(callback: any) {
    api.pool('/stats', callback);
}

function getPoolHashrate(callback: any) {
    getPoolStats(function (error: any, stats: any) {
        callback(error, stats.pool ? Math.round(stats.pool.hashrate) : null)
    })
}

function getPoolWorkers(callback: any) {
    getPoolStats(function (error: any, stats: any) {
        callback(error, stats.pool ? stats.pool.miners : null)
    });
}

function getNetworkDifficulty(callback: any) {
    getPoolStats(function (error: any, stats: any) {
        callback(error, stats.pool ? stats.network.difficulty : null);
    });
}

function getUsersHashrates(callback: any) {
    var method = '/miners_hashrate?password=' + globalAny.config.config.api.password;
    api.pool(method, function (error: any, data: any) {
        callback(data.minersHashrate);
    });
}

function collectUsersHashrate(chartName: any, settings: any) {
    let redisBaseKey = getStatsRedisKey(chartName) + ':'
    globalAny.redisClient.keys(redisBaseKey + '*', function (keys: any) { // turtlecoin:charts:hashrate:*
        let hashrates: any = {};
        for (let i in keys) {
            hashrates[keys[i].substr(keys[i].length)] = 0
        }
        getUsersHashrates(function (newHashrates: any) {
            for (let address in newHashrates) {
                let AddressParts = address.split('+');
                hashrates[AddressParts[0]] = parseFloat(newHashrates[address]) + (hashrates[AddressParts[0]] || 0);
                hashrates[address] = newHashrates[address];
            }
            storeCollectedValues(chartName, hashrates, settings);
        })
    })
}

function getCoinPrice(callback: Function) {
    api.jsonHttpRequest('api.cryptonator.com', 443, '', function (error: any, response: any) {
        callback(response.error ? response.error : error, response.success ? +response.ticker.price : null)
    }, '/api/ticker/' + globalAny.config.config.symbol.toLowerCase() + '-usd');
}

function getCoinProfit(callback: (e: any, p?: any) => any) {
    getCoinPrice(function (error: any, price: any) {
        if (error) {
            callback(error);
            return;
        }
        getPoolStats(function (error: any, stats: any) {
            if (error) {
                callback(error);
                return;
            }
            callback(null, stats.network.reward * price / stats.network.difficulty / globalAny.config.config.coinUnits);
        })
    })
}

export function getPoolChartsData(callback: any) {
    let chartsNames: any = [];
    let redisKeys = [];
    for (let chartName in globalAny.config.config.charts.pool) {
        if (globalAny.config.config.charts.pool[chartName].enabled) {
            chartsNames.push(chartName);
            redisKeys.push(getStatsRedisKey(chartName));
        }
    }
    if (redisKeys.length) {
        globalAny.redisClient.mget(redisKeys, function (error: any, data: any) {
            let stats: any = {};
            if (data) {
                for (let i in data) {
                    if (data[i]) {
                        stats[chartsNames[i]] = JSON.parse(data[i]);
                    }
                }
            }
            callback(error, stats);
        })
    }
    else {
        callback(null, {})
    }
}

module.exports = {
    startDataCollectors: startDataCollectors,
    getUserChartsData: getUserChartsData,
    //getPoolChartsData: getPoolChartsData,
    getUserWorkerChartsData: getUserWorkerChartsData
}
