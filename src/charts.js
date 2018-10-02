"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const async_1 = __importDefault(require("async"));
const apiInterfaces_1 = __importDefault(require("./apiInterfaces"));
const globalstate_1 = require("./globalstate");
let Logger = globalstate_1.GlobalState.Logger;
let config = globalstate_1.GlobalState.config.config;
let redisClient = globalstate_1.GlobalState.redisClient;
// var fs = require('fs')
// var async = require('async')
// var http = require('http')
// var apiInterfaces = require('./apiInterfaces.js')(config.daemon, config.wallet, config.api)
let api = new apiInterfaces_1.default(config.daemon, config.wallet, config.api);
var logSystem = 'charts';
require('./exceptionWriter.js')(logSystem);
Logger.Log('info', logSystem, 'Started');
function startDataCollectors() {
    async_1.default.each(Object.keys(config.charts.pool), function (chartName) {
        var settings = config.charts.pool[chartName];
        if (settings.enabled) {
            setInterval(function () {
                collectPoolStatWithInterval(chartName, settings);
            }, settings.updateInterval * 1000);
        }
    });
    var settings = config.charts.user.hashrate;
    if (settings.enabled) {
        setInterval(function () {
            collectUsersHashrate('hashrate', settings);
        }, settings.updateInterval * 1000);
    }
}
function getChartDataFromRedis(chartName, callback) {
    redisClient.get(getStatsRedisKey(chartName), function (error, data) {
        callback(data ? JSON.parse(data) : []);
    });
}
function getUserHashrateChartData(address, callback) {
    getChartDataFromRedis('hashrate:' + address, callback);
}
function convertPaymentsDataToChart(paymentsData) {
    var data = [];
    if (paymentsData && paymentsData.length) {
        for (var i = 0; paymentsData[i]; i += 2) {
            data.unshift([+paymentsData[i + 1], paymentsData[i].split(':')[1]]);
        }
    }
    return data;
}
function getUserChartsData(address, paymentsData, callback) {
    var stats = {};
    var chartsFuncs = {
        hashrate: function (callback) {
            getUserHashrateChartData(address, function (data) {
                callback(null, data);
            });
        },
        payments: function (callback) {
            callback(null, convertPaymentsDataToChart(paymentsData));
        }
    };
    for (var chartName in chartsFuncs) {
        if (!config.charts.user[chartName].enabled) {
            delete chartsFuncs[chartName];
        }
    }
    async_1.default.parallel(chartsFuncs, callback);
}
exports.getUserChartsData = getUserChartsData;
// unused?
function getUserWorkerChartsData(address, paymentsData, callback) {
    var stats = {};
    var chartsFuncs = {
        hashrate: function (callback) {
            getUserHashrateChartData(address, function (data) {
                callback(null, data);
            });
        }
    };
    for (var chartName in chartsFuncs) {
        if (!config.charts.user[chartName].enabled) {
            delete chartsFuncs[chartName];
        }
    }
    async_1.default.parallel(chartsFuncs, callback);
}
function getStatsRedisKey(chartName) {
    return config.coin + ':charts:' + chartName;
}
var chartStatFuncs = {
    hashrate: getPoolHashrate,
    workers: getPoolWorkers,
    difficulty: getNetworkDifficulty,
    price: getCoinPrice,
    profit: getCoinProfit
};
var statValueHandler = {
    avg: function (set, value) {
        set[1] = (set[1] * set[2] + value) / (set[2] + 1);
    },
    avgRound: function (set, value) {
        statValueHandler.avg(set, value);
        set[1] = Math.round(set[1]);
    },
    max: function (set, value) {
        if (value > set[1])
            set[1] = value;
    }
};
var preSaveFunctions = {
    hashrate: statValueHandler.avgRound,
    workers: statValueHandler.max,
    difficulty: statValueHandler.avgRound,
    price: statValueHandler.avg,
    profit: statValueHandler.avg
};
function storeCollectedValues(chartName, values, settings) {
    for (var i in values) {
        storeCollectedValue(chartName + ':' + i, values[i], settings);
    }
}
function storeCollectedValue(chartName, value, settings, callback) {
    var now = Date.now() / 1000 | 0;
    getChartDataFromRedis(chartName, function (sets) {
        var lastSet = sets[sets.length - 1]; // [time, avgValue, updatesCount]
        if (!lastSet || now - lastSet[0] > settings.stepInterval) {
            lastSet = [now, value, 1];
            sets.push(lastSet);
            while (now - sets[0][0] > settings.maximumPeriod) { // clear old sets
                sets.shift();
            }
        }
        else {
            preSaveFunctions[chartName]
                ? preSaveFunctions[chartName](lastSet, value)
                : statValueHandler.avgRound(lastSet, value);
            lastSet[2]++;
        }
        redisClient.set(getStatsRedisKey(chartName), JSON.stringify(sets));
        Logger.Log('info', logSystem, chartName + ' chart collected value ' + value + '. Total sets count ' + sets.length);
    });
}
function collectPoolStatWithInterval(chartName, settings) {
    async_1.default.waterfall([
        chartStatFuncs[chartName],
        function (value, callback) {
            storeCollectedValue(chartName, value, settings, callback);
        }
    ]);
}
function getPoolStats(callback) {
    api.pool('/stats', callback);
}
function getPoolHashrate(callback) {
    getPoolStats(function (error, stats) {
        callback(error, stats.pool ? Math.round(stats.pool.hashrate) : null);
    });
}
function getPoolWorkers(callback) {
    getPoolStats(function (error, stats) {
        callback(error, stats.pool ? stats.pool.miners : null);
    });
}
function getNetworkDifficulty(callback) {
    getPoolStats(function (error, stats) {
        callback(error, stats.pool ? stats.network.difficulty : null);
    });
}
function getUsersHashrates(callback) {
    var method = '/miners_hashrate?password=' + config.api.password;
    api.pool(method, function (error, data) {
        callback(data.minersHashrate);
    });
}
function collectUsersHashrate(chartName, settings) {
    let redisBaseKey = getStatsRedisKey(chartName) + ':';
    redisClient.keys(redisBaseKey + '*', function (keys) {
        let hashrates = {};
        for (let i in keys) {
            hashrates[keys[i].substr(keys[i].length)] = 0;
        }
        getUsersHashrates(function (newHashrates) {
            for (let address in newHashrates) {
                let AddressParts = address.split('+');
                hashrates[AddressParts[0]] = parseFloat(newHashrates[address]) + (hashrates[AddressParts[0]] || 0);
                hashrates[address] = newHashrates[address];
            }
            storeCollectedValues(chartName, hashrates, settings);
        });
    });
}
function getCoinPrice(callback) {
    api.jsonHttpRequest('api.cryptonator.com', 443, '', function (error, response) {
        callback(response.error ? response.error : error, response.success ? +response.ticker.price : null);
    }, '/api/ticker/' + config.symbol.toLowerCase() + '-usd');
}
function getCoinProfit(callback) {
    getCoinPrice(function (error, price) {
        if (error) {
            callback(error);
            return;
        }
        getPoolStats(function (error, stats) {
            if (error) {
                callback(error);
                return;
            }
            callback(null, stats.network.reward * price / stats.network.difficulty / config.coinUnits);
        });
    });
}
function getPoolChartsData(callback) {
    let chartsNames = [];
    let redisKeys = [];
    for (let chartName in config.charts.pool) {
        if (config.charts.pool[chartName].enabled) {
            chartsNames.push(chartName);
            redisKeys.push(getStatsRedisKey(chartName));
        }
    }
    if (redisKeys.length) {
        redisClient.mget(redisKeys, function (error, data) {
            let stats = {};
            if (data) {
                for (let i in data) {
                    if (data[i]) {
                        stats[chartsNames[i]] = JSON.parse(data[i]);
                    }
                }
            }
            callback(error, stats);
        });
    }
    else {
        callback(null, {});
    }
}
exports.getPoolChartsData = getPoolChartsData;
module.exports = {
    startDataCollectors: startDataCollectors,
    getUserChartsData: getUserChartsData,
    getPoolChartsData: getPoolChartsData,
    getUserWorkerChartsData: getUserWorkerChartsData
};
//# sourceMappingURL=charts.js.map