"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const url_1 = __importDefault(require("url"));
const zlib_1 = __importDefault(require("zlib"));
const async_1 = __importDefault(require("async"));
const apiInterfaces_1 = __importDefault(require("./apiInterfaces"));
const charts = __importStar(require("./charts"));
const globalstate_1 = require("./globalstate");
let Logger = globalstate_1.GlobalState.Logger;
let config = globalstate_1.GlobalState.config.config;
let redisClient = globalstate_1.GlobalState.redisClient;
let api = new apiInterfaces_1.default(config.daemon, config.wallet);
// var fs = require('fs')
// var http = require('http')
// var url = require('url')
// var zlib = require('zlib')
// var async = require('async')
// var apiInterfaces = require('./apiInterfaces.js')(config.daemon, config.wallet)
// var charts = require('./charts.js')
var authSid = Math.round(Math.random() * 10000000000) + '' + Math.round(Math.random() * 10000000000);
var logSystem = 'api';
require('./exceptionWriter.js')(logSystem);
var redisCommands = [
    ['zremrangebyscore', config.coin + ':hashrate', '-inf', ''],
    ['zrange', config.coin + ':hashrate', 0, -1],
    ['hgetall', config.coin + ':stats'],
    ['zrange', config.coin + ':blocks:candidates', 0, -1, 'WITHSCORES'],
    ['zrevrange', config.coin + ':blocks:matured', 0, config.api.blocks - 1, 'WITHSCORES'],
    ['hgetall', config.coin + ':shares:roundCurrent'],
    ['hgetall', config.coin + ':stats'],
    ['zcard', config.coin + ':blocks:matured'],
    ['zrevrange', config.coin + ':payments:all', 0, config.api.payments - 1, 'WITHSCORES'],
    ['zcard', config.coin + ':payments:all'],
    ['keys', config.coin + ':payments:*']
];
var currentStats = '';
var currentStatsCompressed = '';
var minerStats = {};
var minersHashrate = {};
var liveConnections = {};
var addressConnections = {};
function collectStats() {
    let startTime = Date.now();
    let redisFinished;
    let daemonFinished;
    var windowTime = (((Date.now() / 1000) - config.api.hashrateWindow) | 0).toString();
    redisCommands[0][3] = '(' + windowTime;
    async_1.default.parallel({
        pool: function (callback) {
            redisClient.multi(redisCommands).exec(function (error, replies) {
                redisFinished = Date.now();
                var dateNowSeconds = Date.now() / 1000 | 0;
                if (error) {
                    Logger.Log('error', logSystem, 'Error getting redis data %j', [error]);
                    callback(true);
                    return;
                }
                var data = {
                    stats: replies[2],
                    blocks: replies[3].concat(replies[4]),
                    totalBlocks: parseInt(replies[7]) + (replies[3].length / 2),
                    payments: replies[8],
                    totalPayments: parseInt(replies[9]),
                    totalMinersPaid: replies[10].length - 1
                };
                var hashrates = replies[1];
                minerStats = {};
                minersHashrate = {};
                for (var i = 0; i < hashrates.length; i++) {
                    var hashParts = hashrates[i].split(':');
                    minersHashrate[hashParts[1]] = (minersHashrate[hashParts[1]] || 0) + parseInt(hashParts[0]);
                }
                var totalShares = 0;
                for (var miner in minersHashrate) {
                    var shares = minersHashrate[miner];
                    // Do not count the hashrates of individual workers. Instead
                    // only use the shares where miner == wallet address.
                    if (miner.indexOf('+') != -1) {
                        totalShares += shares;
                    }
                    minersHashrate[miner] = Math.round(shares / config.api.hashrateWindow);
                    var minerParts = miner.split('+');
                    minerStats[minerParts[0]] = (minersHashrate[miner] || 0) + (parseInt(minerStats[minerParts[0]]) || 0);
                }
                for (var miner in minerStats) {
                    minerStats[miner] = getReadableHashRateString(minerStats[miner]);
                }
                data.miners = Object.keys(minerStats).length;
                data.hashrate = Math.round(totalShares / config.api.hashrateWindow);
                data.roundHashes = 0;
                if (replies[5]) {
                    for (var miner in replies[5]) {
                        if (config.poolServer.slushMining.enabled) {
                            data.roundHashes += parseInt(replies[5][miner]) / Math.pow(Math.E, ((data.lastBlockFound - dateNowSeconds) / config.poolServer.slushMining.weight)); // TODO: Abstract: If something different than lastBlockfound is used for scoreTime, this needs change.
                        }
                        else {
                            data.roundHashes += parseInt(replies[5][miner]);
                        }
                    }
                }
                if (replies[6]) {
                    data.lastBlockFound = replies[6].lastBlockFound;
                }
                callback(null, data);
            });
        },
        network: function (callback) {
            api.rpcDaemon('getlastblockheader', {}, function (error, reply) {
                daemonFinished = Date.now();
                if (error) {
                    Logger.Log('error', logSystem, 'Error getting daemon data %j', [error]);
                    callback(true);
                    return;
                }
                var blockHeader = reply.block_header;
                callback(null, {
                    difficulty: blockHeader.difficulty,
                    height: blockHeader.height,
                    timestamp: blockHeader.timestamp,
                    reward: blockHeader.reward,
                    hash: blockHeader.hash
                });
            });
        },
        config: function (callback) {
            callback(null, {
                ports: getPublicPorts(config.poolServer.ports),
                hashrateWindow: config.api.hashrateWindow,
                fee: config.blockUnlocker.poolFee,
                coin: config.coin,
                coinUnits: config.coinUnits,
                coinDifficultyTarget: config.coinDifficultyTarget,
                symbol: config.symbol,
                depth: config.blockUnlocker.depth,
                donation: config.donations,
                version: config.version,
                minPaymentThreshold: config.payments.minPayment,
                denominationUnit: config.payments.denomination,
                blockTime: config.coinDifficultyTarget,
                slushMiningEnabled: config.poolServer.slushMining.enabled,
                weight: config.poolServer.slushMining.weight
            });
        },
        charts: charts.getPoolChartsData
    }, function (error, results) {
        Logger.Log('info', logSystem, 'Stat collection finished: %d ms redis, %d ms daemon', [redisFinished - startTime, daemonFinished - startTime]);
        if (error) {
            Logger.Log('error', logSystem, 'Error collecting all stats');
        }
        else {
            currentStats = JSON.stringify(results);
            zlib_1.default.deflateRaw(currentStats, function (error, result) {
                currentStatsCompressed = result;
                broadcastLiveStats();
            });
        }
        setTimeout(collectStats, config.api.updateInterval * 1000);
    });
}
function getPublicPorts(ports) {
    return ports.filter(function (port) {
        return !port.hidden;
    });
}
function getReadableHashRateString(hashrate) {
    var i = 0;
    var byteUnits = [' H', ' KH', ' MH', ' GH', ' TH', ' PH'];
    while (hashrate > 1000) {
        hashrate = hashrate / 1000;
        i++;
    }
    return hashrate.toFixed(2) + byteUnits[i];
}
function broadcastLiveStats() {
    Logger.Log('info', logSystem, 'Broadcasting to %d visitors and %d address lookups', [Object.keys(liveConnections).length, Object.keys(addressConnections).length]);
    for (var uid in liveConnections) {
        var res = liveConnections[uid];
        res.end(currentStatsCompressed);
    }
    var redisCommands = [];
    for (var address in addressConnections) {
        redisCommands.push(['hgetall', config.coin + ':workers:' + address]);
        redisCommands.push(['zrevrange', config.coin + ':payments:' + address, 0, config.api.payments - 1, 'WITHSCORES']);
    }
    redisClient.multi(redisCommands).exec(function (error, replies) {
        var addresses = Object.keys(addressConnections);
        for (var i = 0; i < addresses.length; i++) {
            var offset = i * 2;
            var address = addresses[i];
            var stats = replies[offset];
            var res = addressConnections[address];
            if (!stats) {
                res.end(JSON.stringify({ error: 'not found' }));
                return;
            }
            stats.hashrate = minerStats[address];
            res.end(JSON.stringify({ stats: stats, payments: replies[offset + 1] }));
        }
    });
}
function handleMinerStats(urlParts, response) {
    response.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Connection': 'keep-alive'
    });
    response.write('\n');
    var address = urlParts.query.address;
    if (urlParts.query.longpoll === 'true') {
        redisClient.exists(config.coin + ':workers:' + address, function (error, result) {
            if (!result) {
                response.end(JSON.stringify({ error: 'not found' }));
                return;
            }
            addressConnections[address] = response;
            response.on('finish', function () {
                delete addressConnections[address];
            });
        });
    }
    else {
        redisClient.multi([
            ['hgetall', config.coin + ':workers:' + address],
            ['zrevrange', config.coin + ':payments:' + address, 0, config.api.payments - 1, 'WITHSCORES'],
            ['keys', config.coin + ':charts:hashrate:' + address + '*']
        ]).exec(function (error, replies) {
            if (error || !replies[0]) {
                response.end(JSON.stringify({ error: 'not found' }));
                return;
            }
            let stats = replies[0];
            // console.log(replies);
            stats.hashrate = minerStats[address];
            // Grab the worker names.
            let workers = [];
            for (var i = 0; i < replies[2].length; i++) {
                var key = replies[2][i];
                var nameOffset = key.indexOf('+');
                if (nameOffset != -1) {
                    workers.push(key.substr(nameOffset + 1));
                }
            }
            charts.getUserChartsData(address, replies[1], function (error, chartsData) {
                response.end(JSON.stringify({
                    stats: stats,
                    payments: replies[1],
                    charts: chartsData,
                    workers: workers
                }));
            });
        });
    }
}
function handleWorkerStats(urlParts, response) {
    response.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Connection': 'keep-alive'
    });
    response.write('\n');
    var address = urlParts.query.address;
    charts.getUserChartsData(address, [], function (error, chartsData) {
        response.end(JSON.stringify({ charts: chartsData }));
    });
}
function handleSetMinerPayoutLevel(urlParts, response) {
    response.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Connection': 'keep-alive'
    });
    response.write('\n');
    let address = urlParts.query.address;
    let level = urlParts.query.level;
    // Check the minimal required parameters for this handle.
    if (address == undefined || level == undefined) {
        response.end(JSON.stringify({ 'status': 'parameters are incomplete' }));
        return;
    }
    // Do not allow wildcards in the queries.
    if (address.indexOf('*') != -1) {
        response.end(JSON.stringify({ 'status': 'Please remove the wildcard from your input' }));
        return;
    }
    level = parseFloat(level);
    if (isNaN(level)) {
        response.end(JSON.stringify({ 'status': 'Your desired payment level doesn\'t look like a digit' }));
        return;
    }
    if (level < config.payments.minPayment / config.coinUnits) {
        response.end(JSON.stringify({ 'status': 'Please choose a value above ' + config.payments.minPayment / config.coinUnits }));
        return;
    }
    var payout_level = level * config.coinUnits;
    redisClient.hset(`${config.coin}:workers:${address}`, 'minPayoutLevel', payout_level.toString(), function (error, value) {
        if (error) {
            response.end(JSON.stringify({ 'status': 'woops something failed' }));
            return;
        }
        Logger.Log('info', logSystem, 'Updated payout level for address ' + address + ' level: ' + payout_level);
        response.end(JSON.stringify({ 'status': 'done' }));
    });
}
function handleGetMinerPayoutLevel(urlParts, response) {
    response.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Connection': 'keep-alive'
    });
    response.write('\n');
    var address = urlParts.query.address;
    // Check the minimal required parameters for this handle.
    if (address == undefined) {
        response.end(JSON.stringify({ 'status': 'parameters are incomplete' }));
        return;
    }
    redisClient.hget(`${config.coin}:workers:${address}`, 'minPayoutLevel', function (error, value) {
        if (error) {
            response.end(JSON.stringify({ 'status': 'woops something failed' }));
            return;
        }
        var payout_level = value / config.coinUnits;
        response.end(JSON.stringify({ 'status': 'done', 'level': payout_level }));
    });
}
function handleGetPayments(urlParts, response) {
    let paymentKey = ':payments:all';
    if (urlParts.query.address)
        paymentKey = ':payments:' + urlParts.query.address;
    redisClient.zrevrangebyscore(config.coin + paymentKey, '(' + urlParts.query.time, '-inf', 'WITHSCORES', 'LIMIT', 0, config.api.payments, function (err, result) {
        var reply;
        if (err) {
            reply = JSON.stringify({ error: 'query failed' });
        }
        else {
            reply = JSON.stringify(result);
        }
        response.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json',
            'Content-Length': reply.length
        });
        response.end(reply);
    });
}
function handleGetBlocks(urlParts, response) {
    redisClient.zrevrangebyscore(config.coin + ':blocks:matured', '(' + urlParts.query.height, '-inf', 'WITHSCORES', 'LIMIT', 0, config.api.blocks, function (err, result) {
        var reply;
        if (err) {
            reply = JSON.stringify({ error: 'query failed' });
        }
        else {
            reply = JSON.stringify(result);
        }
        response.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json',
            'Content-Length': reply.length
        });
        response.end(reply);
    });
}
function handleGetMinersHashrate(response) {
    var reply = JSON.stringify({
        minersHashrate: minersHashrate
    });
    response.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'Content-Length': reply.length
    });
    response.end(reply);
}
function parseCookies(request) {
    var list = {}, rc = request.headers.cookie;
    rc && rc.split(';').forEach(function (cookie) {
        var parts = cookie.split('=');
        list[parts.shift().trim()] = unescape(parts.join('='));
    });
    return list;
}
function authorize(request, response) {
    if (request.connection.remoteAddress == '127.0.0.1')
        return true;
    response.setHeader('Access-Control-Allow-Origin', '*');
    var cookies = parseCookies(request);
    if (cookies.sid && cookies.sid == authSid) {
        return true;
    }
    var sentPass = url_1.default.parse(request.url, true).query.password;
    if (sentPass !== config.api.password) {
        response.statusCode = 401;
        response.end('invalid password');
        return;
    }
    Logger.Log('warn', logSystem, 'Admin authorized');
    response.statusCode = 200;
    var cookieExpire = new Date(Date.now() + 60 * 60 * 24 * 1000);
    response.setHeader('Set-Cookie', 'sid=' + authSid + '; path=/; expires=' + cookieExpire.toUTCString());
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Content-Type', 'application/json');
    return true;
}
function handleAdminStats(response) {
    async_1.default.waterfall([
        // Get worker keys & unlocked blocks
        function (callback) {
            redisClient.multi([
                ['keys', config.coin + ':workers:*'],
                ['zrange', config.coin + ':blocks:matured', 0, -1]
            ]).exec(function (error, replies) {
                if (error) {
                    Logger.Log('error', logSystem, 'Error trying to get admin data from redis %j', [error]);
                    callback(true);
                    return;
                }
                callback(null, replies[0], replies[1]);
            });
        },
        // Get worker balances
        function (workerKeys, blocks, callback) {
            var redisCommands = workerKeys.map(function (k) {
                return ['hmget', k, 'balance', 'paid'];
            });
            redisClient.multi(redisCommands).exec(function (error, replies) {
                if (error) {
                    Logger.Log('error', logSystem, 'Error with getting balances from redis %j', [error]);
                    callback(true);
                    return;
                }
                callback(null, replies, blocks);
            });
        },
        function (workerData, blocks, callback) {
            var stats = {
                totalOwed: 0,
                totalPaid: 0,
                totalRevenue: 0,
                totalDiff: 0,
                totalShares: 0,
                blocksOrphaned: 0,
                blocksUnlocked: 0,
                totalWorkers: 0
            };
            for (var i = 0; i < workerData.length; i++) {
                stats.totalOwed += parseInt(workerData[i][0]) || 0;
                stats.totalPaid += parseInt(workerData[i][1]) || 0;
                stats.totalWorkers++;
            }
            for (var i = 0; i < blocks.length; i++) {
                var block = blocks[i].split(':');
                if (block[5]) {
                    stats.blocksUnlocked++;
                    stats.totalDiff += parseInt(block[2]);
                    stats.totalShares += parseInt(block[3]);
                    stats.totalRevenue += parseInt(block[5]);
                }
                else {
                    stats.blocksOrphaned++;
                }
            }
            callback(null, stats);
        }
    ], function (error, stats) {
        if (error) {
            response.end(JSON.stringify({ error: 'error collecting stats' }));
            return;
        }
        response.end(JSON.stringify(stats));
    });
}
function handleAdminUsers(response) {
    async_1.default.waterfall([
        // get workers Redis keys
        function (callback) {
            redisClient.keys(config.coin + ':workers:*', callback);
        },
        // get workers data
        function (workerKeys, callback) {
            var redisCommands = workerKeys.map(function (k) {
                return ['hmget', k, 'balance', 'paid', 'lastShare', 'hashes'];
            });
            redisClient.multi(redisCommands).exec(function (error, redisData) {
                var workersData = {};
                var addressLength = config.poolServer.poolAddress.length;
                for (var i in redisData) {
                    var address = workerKeys[i].substr(-addressLength);
                    var data = redisData[i];
                    workersData[address] = {
                        pending: data[0],
                        paid: data[1],
                        lastShare: data[2],
                        hashes: data[3],
                        hashrate: minersHashrate[address] ? minersHashrate[address] : 0
                    };
                }
                callback(null, workersData);
            });
        }
    ], function (error, workersData) {
        if (error) {
            response.end(JSON.stringify({ error: 'error collecting users stats' }));
            return;
        }
        response.end(JSON.stringify(workersData));
    });
}
function handleAdminMonitoring(response) {
    response.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json'
    });
    async_1.default.parallel({
        monitoring: getMonitoringData,
        logs: getLogFiles
    }, function (error, result) {
        response.end(JSON.stringify(result));
    });
}
function handleAdminLog(urlParts, response) {
    var file = urlParts.query.file;
    var filePath = config.logging.files.directory + '/' + file;
    if (!file.match(/^\w+\.log$/))
        response.end('wrong log file');
    response.writeHead(200, {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache',
        'Content-Length': fs_1.default.statSync(filePath).size
    });
    fs_1.default.createReadStream(filePath).pipe(response);
}
function startRpcMonitoring(rpc, module, method, interval) {
    setInterval(function () {
        rpc(method, {}, function (error, response) {
            var stat = {
                lastCheck: Date.now() / 1000 | 0,
                lastStatus: error ? 'fail' : 'ok',
                lastResponse: JSON.stringify(error || response)
            };
            if (error) {
                stat.lastFail = stat.lastCheck;
                stat.lastFailResponse = stat.lastResponse;
            }
            var key = getMonitoringDataKey(module);
            var redisCommands = [];
            for (var property in stat) {
                redisCommands.push(['hset', key, property, stat[property]]);
            }
            redisClient.multi(redisCommands).exec();
        });
    }, interval * 1000);
}
function getMonitoringDataKey(module) {
    return config.coin + ':status:' + module;
}
function initMonitoring() {
    var modulesRpc = {
        daemon: api.rpcDaemon,
        wallet: api.rpcWallet
    };
    for (var module in config.monitoring) {
        var settings = config.monitoring[module];
        if (settings.checkInterval)
            startRpcMonitoring(modulesRpc[module], module, settings.rpcMethod, settings.checkInterval);
    }
}
function getMonitoringData(callback) {
    var modules = Object.keys(config.monitoring);
    var redisCommands = [];
    for (var i in modules) {
        redisCommands.push(['hgetall', getMonitoringDataKey(modules[i])]);
    }
    redisClient.multi(redisCommands).exec(function (error, results) {
        var stats = {};
        for (var i in modules) {
            if (results[i])
                stats[modules[i]] = results[i];
        }
        callback(error, stats);
    });
}
function getLogFiles(callback) {
    var dir = config.logging.files.directory;
    fs_1.default.readdir(dir, function (error, files) {
        var logs = {};
        for (var i in files) {
            var file = files[i];
            var stats = fs_1.default.statSync(dir + '/' + file);
            logs[file] = {
                size: stats.size,
                changed: Date.parse(stats.mtime.toString()) / 1000 | 0
            };
        }
        callback(error, logs);
    });
}
var server = http_1.default.createServer(function (request, response) {
    if (request.method.toUpperCase() === 'OPTIONS') {
        response.writeHead(204, 'No Content', {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'access-control-allow-headers': 'content-type, accept',
            'access-control-max-age': 10,
            'content-length': 0
        });
        return (response.end());
    }
    let urlParts = url_1.default.parse(request.url, true);
    switch (urlParts.pathname) {
        case '/stats':
            let deflate = request.headers['accept-encoding'] && request.headers['accept-encoding'].indexOf('deflate') != -1;
            let reply = deflate ? currentStatsCompressed : currentStats;
            response.writeHead(200, {
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/json',
                'Content-Encoding': deflate ? 'deflate' : '',
                'Content-Length': reply.length
            });
            response.end(reply);
            break;
        case '/live_stats':
            response.writeHead(200, {
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/json',
                'Content-Encoding': 'deflate',
                'Connection': 'keep-alive'
            });
            let uid = Math.random().toString();
            liveConnections[uid] = response;
            response.on('finish', function () {
                delete liveConnections[uid];
            });
            break;
        case '/stats_address':
            handleMinerStats(urlParts, response);
            break;
        case '/get_payments':
            handleGetPayments(urlParts, response);
            break;
        case '/get_blocks':
            handleGetBlocks(urlParts, response);
            break;
        case '/admin_stats':
            if (!authorize(request, response)) {
                return;
            }
            handleAdminStats(response);
            break;
        case '/admin_monitoring':
            if (!authorize(request, response)) {
                return;
            }
            handleAdminMonitoring(response);
            break;
        case '/admin_log':
            if (!authorize(request, response)) {
                return;
            }
            handleAdminLog(urlParts, response);
            break;
        case '/admin_users':
            if (!authorize(request, response)) {
                return;
            }
            handleAdminUsers(response);
            break;
        case '/miners_hashrate':
            if (!authorize(request, response))
                return;
            handleGetMinersHashrate(response);
            break;
        case '/stats_worker':
            handleWorkerStats(urlParts, response);
            break;
        case '/get_miner_payout_level':
            handleGetMinerPayoutLevel(urlParts, response);
            break;
        case '/set_miner_payout_level':
            handleSetMinerPayoutLevel(urlParts, response);
            break;
        default:
            response.writeHead(404, {
                'Access-Control-Allow-Origin': '*'
            });
            response.end('Invalid API call');
            break;
    }
});
collectStats();
initMonitoring();
server.listen(config.api.port, function () {
    Logger.Log('info', logSystem, 'API started & listening on port %d', [config.api.port]);
});
//# sourceMappingURL=api.js.map