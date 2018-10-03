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
//import fs from 'fs';
const net_1 = __importDefault(require("net"));
//var fs = require('fs')
//var net = require('net')
const crypto = __importStar(require("crypto"));
//var crypto = require('crypto')
//var crypto = require('browserify-aes');
var async = require('async');
var bignum = require('bignum');
var multiHashing = require('turtlecoin-multi-hashing');
var cnUtil = require('turtlecoin-cryptonote-util');
// import { Global } from './defines';
// const globalAny: Global = <Global>global;
// let config = globalAny.config.config;
// let redisClient = globalAny.redisClient;
const globalstate_1 = require("./globalstate");
let config = globalstate_1.GlobalState.config.config;
let redisClient = globalstate_1.GlobalState.redisClient;
// Must exactly be 8 hex chars
var noncePattern = new RegExp('^[0-9A-Fa-f]{8}$');
var threadId = '(Thread ' + process.env.forkId + ') ';
var logSystem = 'pool';
require('./exceptionWriter.js')(logSystem);
var shareTrust = require('./shareTrust.js');
const apiInt = __importStar(require("./apiInterfaces"));
let apiInterfaces = new apiInt.default(config.daemon, config.wallet, config.api);
//var apiInterfaces = require('./apiInterfaces.js')(config.daemon, config.wallet, config.api)
var utils = require('./utils.js');
Buffer.prototype.toByteArray = function () { return Array.prototype.slice.call(this, 0); };
var log = function (severity, system, text, data) {
    globalstate_1.GlobalState.Logger.Log(severity, system, threadId + text, data);
    //global.log(severity, system, threadId + text, data)
};
var cryptoNight = multiHashing['cryptonight'];
var cryptoNightLite = multiHashing['cryptonight-lite'];
var diff1 = bignum('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 16);
var instanceId = crypto.randomBytes(4);
var validBlockTemplates = [];
var currentBlockTemplate;
// Vars for slush mining
var scoreTime;
var lastChecked = 0;
var connectedMiners = {};
var bannedIPs = {};
var perIPStats = {};
var banningEnabled = config.poolServer.banning && config.poolServer.banning.enabled;
var addressBase58Prefix = cnUtil.address_decode(new Buffer(config.poolServer.poolAddress));
setInterval(function () {
    let now = Date.now() / 1000 | 0;
    for (var minerId in connectedMiners) {
        let miner = connectedMiners[minerId];
        if (!miner.noRetarget) {
            miner.retarget(now);
        }
    }
}, config.poolServer.varDiff.retargetTime * 1000);
/* Every 30 seconds clear out timed-out miners and old bans */
setInterval(function () {
    var now = Date.now();
    var dateNowSeconds = now / 1000 | 0;
    var timeout = config.poolServer.minerTimeout * 1000;
    for (var minerId in connectedMiners) {
        let miner = connectedMiners[minerId];
        if (now - miner.lastBeat > timeout) {
            log('warn', logSystem, 'Miner timed out and disconnected %s@%s', [miner.login, miner.ip]);
            delete connectedMiners[minerId];
        }
    }
    if (banningEnabled) {
        for (let ip in bannedIPs) {
            var banTime = bannedIPs[ip];
            if (now - banTime > config.poolServer.banning.time * 1000) {
                delete bannedIPs[ip];
                delete perIPStats[ip];
                log('info', logSystem, 'Ban dropped for %s', [ip]);
            }
        }
    }
}, 30000);
process.on('message', function (message) {
    switch (message.type) {
        case 'banIP':
            bannedIPs[message.ip] = Date.now();
            break;
    }
});
function IsBannedIp(ip) {
    if (!banningEnabled || !bannedIPs[ip])
        return false;
    var bannedTime = bannedIPs[ip];
    var bannedTimeAgo = Date.now() - bannedTime;
    var timeLeft = config.poolServer.banning.time * 1000 - bannedTimeAgo;
    if (timeLeft > 0) {
        return true;
    }
    else {
        delete bannedIPs[ip];
        log('info', logSystem, 'Ban dropped for %s', [ip]);
        return false;
    }
}
class BlockTemplate {
    constructor(template) {
        this.blob = template.blocktemplate_blob;
        this.difficulty = template.difficulty;
        this.height = template.height;
        this.reserveOffset = template.reserved_offset;
        this.buffer = new Buffer(this.blob, 'hex');
        instanceId.copy(this.buffer, this.reserveOffset + 4, 0, 3);
        this.extraNonce = 0;
    }
    nextBlob() {
        this.buffer.writeUInt32BE(++this.extraNonce, this.reserveOffset);
        return cnUtil.convert_blob(this.buffer).toString('hex');
    }
}
// function BlockTemplate(template: any) {
//     this.blob = template.blocktemplate_blob
//     this.difficulty = template.difficulty
//     this.height = template.height
//     this.reserveOffset = template.reserved_offset
//     this.buffer = new Buffer(this.blob, 'hex')
//     instanceId.copy(this.buffer, this.reserveOffset + 4, 0, 3)
//     this.extraNonce = 0
// }
// BlockTemplate.prototype = {
//     nextBlob: function () {
//         this.buffer.writeUInt32BE(++this.extraNonce, this.reserveOffset)
//         return cnUtil.convert_blob(this.buffer).toString('hex')
//     }
// }
function getBlockTemplate(callback) {
    apiInterfaces.rpcDaemon('getblocktemplate', { reserve_size: 8, wallet_address: config.poolServer.poolAddress }, callback);
}
function jobRefresh(loop, callback) {
    callback = callback || function () { };
    getBlockTemplate(function (error, result) {
        if (loop) {
            setTimeout(function () {
                jobRefresh(true);
            }, config.poolServer.blockRefreshInterval);
        }
        if (error) {
            log('error', logSystem, 'Error polling getblocktemplate %j', [error]);
            callback(false);
            return;
        }
        if (!currentBlockTemplate || result.height > currentBlockTemplate.height) {
            log('info', logSystem, 'New block to mine at height %d w/ difficulty of %d', [result.height, result.difficulty]);
            processBlockTemplate(result);
        }
        callback(true);
    });
}
function processBlockTemplate(template) {
    if (currentBlockTemplate) {
        validBlockTemplates.push(currentBlockTemplate);
    }
    if (validBlockTemplates.length > 3) {
        validBlockTemplates.shift();
    }
    currentBlockTemplate = new BlockTemplate(template);
    for (var minerId in connectedMiners) {
        let miner = connectedMiners[minerId];
        miner.pushMessage('job', miner.getJob());
    }
}
(function init() {
    jobRefresh(true, function (sucessful) {
        if (!sucessful) {
            log('error', logSystem, 'Could not start pool');
            process.exit();
        }
        startPoolServerTcp(function (successful) {
        });
    });
})();
var VarDiff = (function () {
    var variance = config.poolServer.varDiff.variancePercent / 100 * config.poolServer.varDiff.targetTime;
    return {
        variance: variance,
        bufferSize: config.poolServer.varDiff.retargetTime / config.poolServer.varDiff.targetTime * 4,
        tMin: config.poolServer.varDiff.targetTime - variance,
        tMax: config.poolServer.varDiff.targetTime + variance,
        maxJump: config.poolServer.varDiff.maxJump
    };
})();
class Miner {
    constructor(id, login, workerName, pass, ip, startingDiff, noRetarget, pushMessage) {
        this.id = id;
        this.login = login;
        this.pass = pass;
        this.ip = ip;
        this.pushMessage = pushMessage;
        this.heartbeat();
        this.noRetarget = noRetarget;
        this.difficulty = startingDiff;
        this.workerName = workerName;
        this.validJobs = [];
        // Vardiff related variables
        this.shareTimeRing = utils.ringBuffer(16);
        this.lastShareTime = Date.now() / 1000 | 0;
    }
    retarget(now) {
        var options = config.poolServer.varDiff;
        var sinceLast = now - this.lastShareTime;
        var decreaser = sinceLast > VarDiff.tMax;
        var avg = this.shareTimeRing.avg(decreaser ? sinceLast : null);
        var newDiff;
        var direction;
        if (avg > VarDiff.tMax && this.difficulty > options.minDiff) {
            newDiff = options.targetTime / avg * this.difficulty;
            newDiff = newDiff > options.minDiff ? newDiff : options.minDiff;
            direction = -1;
        }
        else if (avg < VarDiff.tMin && this.difficulty < options.maxDiff) {
            newDiff = options.targetTime / avg * this.difficulty;
            newDiff = newDiff < options.maxDiff ? newDiff : options.maxDiff;
            direction = 1;
        }
        else {
            return;
        }
        if (Math.abs(newDiff - this.difficulty) / this.difficulty * 100 > options.maxJump) {
            var change = options.maxJump / 100 * this.difficulty * direction;
            newDiff = this.difficulty + change;
        }
        this.setNewDiff(newDiff);
        this.shareTimeRing.clear();
        if (decreaser)
            this.lastShareTime = now;
    }
    setNewDiff(newDiff) {
        newDiff = Math.round(newDiff);
        if (this.difficulty === newDiff)
            return;
        log('info', logSystem, 'Retargetting difficulty %d to %d for %s', [this.difficulty, newDiff, this.login]);
        this.pendingDifficulty = newDiff;
        this.pushMessage('job', this.getJob());
    }
    heartbeat() {
        this.lastBeat = Date.now();
    }
    getTargetHex() {
        if (this.pendingDifficulty) {
            this.lastDifficulty = this.difficulty;
            this.difficulty = this.pendingDifficulty;
            this.pendingDifficulty = null;
        }
        var padded = new Buffer(32);
        padded.fill(0);
        var diffBuff = diff1.div(this.difficulty).toBuffer();
        diffBuff.copy(padded, 32 - diffBuff.length);
        var buff = padded.slice(0, 4);
        var buffArray = buff.toByteArray().reverse();
        var buffReversed = new Buffer(buffArray);
        this.target = buffReversed.readUInt32BE(0);
        var hex = buffReversed.toString('hex');
        return hex;
    }
    getJob() {
        if (this.lastBlockHeight === currentBlockTemplate.height && !this.pendingDifficulty) {
            return {
                blob: '',
                job_id: '',
                target: ''
            };
        }
        var blob = currentBlockTemplate.nextBlob();
        this.lastBlockHeight = currentBlockTemplate.height;
        var target = this.getTargetHex();
        var newJob = {
            id: utils.uid(),
            extraNonce: currentBlockTemplate.extraNonce,
            height: currentBlockTemplate.height,
            difficulty: this.difficulty,
            score: this.score,
            diffHex: this.diffHex,
            submissions: []
        };
        this.validJobs.push(newJob);
        if (this.validJobs.length > 4) {
            this.validJobs.shift();
        }
        return {
            blob: blob,
            job_id: newJob.id,
            target: target
        };
    }
    checkBan(validShare) {
        if (!banningEnabled)
            return;
        // Init global per-IP shares stats
        if (!perIPStats[this.ip]) {
            perIPStats[this.ip] = { validShares: 0, invalidShares: 0 };
        }
        var stats = perIPStats[this.ip];
        validShare ? stats.validShares++ : stats.invalidShares++;
        if (stats.validShares + stats.invalidShares >= config.poolServer.banning.checkThreshold) {
            if (stats.invalidShares / (stats.invalidShares + stats.validShares) >= config.poolServer.banning.invalidPercent / 100) {
                log('warn', logSystem, 'Banned %s@%s', [this.login, this.ip]);
                bannedIPs[this.ip] = Date.now();
                delete connectedMiners[this.id];
                // idk if it even works TODO: make it call properly
                process.send({ type: 'banIP', ip: this.ip });
            }
            else {
                stats.invalidShares = 0;
                stats.validShares = 0;
            }
        }
    }
}
function recordShareData(miner, job, shareDiff, blockCandidate, hashHex, shareType, blockTemplate) {
    var dateNow = Date.now();
    var dateNowSeconds = dateNow / 1000 | 0;
    // Weighting older shares lower than newer ones to prevent pool hopping
    if (config.poolServer.slushMining.enabled) {
        if (lastChecked + config.poolServer.slushMining.lastBlockCheckRate <= dateNowSeconds || lastChecked == 0) {
            redisClient.hget(config.coin + ':stats', 'lastBlockFound', function (error, result) {
                if (error) {
                    log('error', logSystem, 'Unable to determine the timestamp of the last block found');
                    return;
                }
                scoreTime = result / 1000 | 0; // scoreTime could potentially be something else than the beginning of the current round, though this would warrant changes in api.js (and potentially the redis db)
                lastChecked = dateNowSeconds;
            });
        }
        job.score = job.difficulty * Math.pow(Math.E, ((scoreTime - dateNowSeconds) / config.poolServer.slushMining.weight)); // Score Calculation
        log('info', logSystem, 'Submitted score ' + job.score + ' with difficulty ' + job.difficulty + ' and the time ' + scoreTime);
    }
    else {
        job.score = job.difficulty;
    }
    var redisCommands = [
        ['hincrby', config.coin + ':shares:roundCurrent', miner.login, job.score],
        ['zadd', config.coin + ':hashrate', dateNowSeconds, [job.difficulty, miner.login + '+' + miner.workerName, dateNow].join(':')],
        ['hincrby', config.coin + ':workers:' + miner.login, 'hashes', job.difficulty],
        ['hset', config.coin + ':workers:' + miner.login, 'lastShare', dateNowSeconds]
    ];
    if (blockCandidate) {
        redisCommands.push(['hset', config.coin + ':stats', 'lastBlockFound', Date.now()]);
        redisCommands.push(['rename', config.coin + ':shares:roundCurrent', config.coin + ':shares:round' + job.height]);
        redisCommands.push(['hgetall', config.coin + ':shares:round' + job.height]);
    }
    redisClient.multi(redisCommands).exec(function (err, replies) {
        if (err) {
            log('error', logSystem, 'Failed to insert share data into redis %j \n %j', [err, redisCommands]);
            return;
        }
        if (blockCandidate) {
            var workerShares = replies[replies.length - 1];
            var totalShares = Object.keys(workerShares).reduce(function (p, c) {
                return p + parseInt(workerShares[c]);
            }, 0);
            redisClient.zadd(config.coin + ':blocks:candidates', job.height, [
                hashHex,
                Date.now() / 1000 | 0,
                blockTemplate.difficulty,
                totalShares
            ].join(':'), function (err, result) {
                if (err) {
                    log('error', logSystem, 'Failed inserting block candidate %s \n %j', [hashHex, err]);
                }
            });
        }
    });
    log('info', logSystem, 'Accepted %s share at difficulty %d/%d from %s@%s', [shareType, job.difficulty, shareDiff, miner.login, miner.ip]);
}
function processShare(miner, job, blockTemplate, nonce, resultHash) {
    var template = new Buffer(blockTemplate.buffer.length);
    blockTemplate.buffer.copy(template);
    template.writeUInt32BE(job.extraNonce, blockTemplate.reserveOffset);
    var shareBuffer = cnUtil.construct_block_blob(template, new Buffer(nonce, 'hex'));
    var convertedBlob;
    var hash;
    var shareType;
    if (shareTrust.enabled && shareTrust.checkTrust(miner.ip, miner.login, job.difficulty)) {
        hash = new Buffer(resultHash, 'hex');
        shareType = 'trusted';
    }
    else {
        convertedBlob = cnUtil.convert_blob(shareBuffer);
        if (shareBuffer[0] >= 4)
            hash = cryptoNightLite(convertedBlob, 1);
        else
            hash = cryptoNight(convertedBlob);
        shareType = 'valid';
    }
    if (hash.toString('hex') !== resultHash) {
        log('warn', logSystem, 'Bad hash from miner %s@%s', [miner.login, miner.ip]);
        if (shareTrust.enabled)
            shareTrust.setTrust(miner.ip, miner.login, false);
        return false;
    }
    var hashArray = hash.toByteArray().reverse();
    var hashNum = bignum.fromBuffer(new Buffer(hashArray));
    var hashDiff = diff1.div(hashNum);
    if (hashDiff.ge(blockTemplate.difficulty)) {
        apiInterfaces.rpcDaemon('submitblock', [shareBuffer.toString('hex')], function (error, result) {
            if (error) {
                log('error', logSystem, 'Error submitting block at height %d from %s@%s, share type: "%s" - %j', [job.height, miner.login, miner.ip, shareType, error]);
                recordShareData(miner, job, hashDiff.toString(), false, null, shareType);
            }
            else {
                var blockFastHash = cnUtil.get_block_id(shareBuffer).toString('hex');
                log('info', logSystem, 'Block %s found at height %d by miner %s@%s - submit result: %j', [blockFastHash.substr(0, 6), job.height, miner.login, miner.ip, result]);
                recordShareData(miner, job, hashDiff.toString(), true, blockFastHash, shareType, blockTemplate);
                jobRefresh();
            }
        });
    }
    else if (hashDiff.lt(job.difficulty)) {
        log('warn', logSystem, 'Rejected low difficulty share of %s from %s@%s', [hashDiff.toString(), miner.login, miner.ip]);
        if (shareTrust.enabled) {
            shareTrust.setTrust(miner.ip, miner.login, false);
        }
        return false;
    }
    else {
        recordShareData(miner, job, hashDiff.toString(), false, null, shareType);
    }
    if (shareTrust.enabled && shareType == 'valid') {
        shareTrust.setTrust(miner.ip, miner.login, true);
    }
    return true;
}
function handleMinerMethod(method, params, ip, portData, sendReply, pushMessage) {
    let miner = connectedMiners[params.id];
    // Check for ban here, so preconnected attackers can't continue to screw you
    if (IsBannedIp(ip)) {
        sendReply('your IP is banned');
        return;
    }
    switch (method) {
        case 'login':
            var login = params.login;
            if (!login) {
                sendReply('missing login');
                return;
            }
            var difficulty = portData.difficulty;
            var workerName = 'unknown';
            var noRetarget = false;
            // Grep the worker name.
            var workerNameCharPos = login.indexOf('+');
            if (workerNameCharPos != -1) {
                workerName = login.substr(workerNameCharPos + 1);
                var fixedDiffCharPos = -1;
                if (config.poolServer.fixedDiff.enabled) {
                    fixedDiffCharPos = login.indexOf(config.poolServer.fixedDiff.addressSeparator);
                    workerName = workerName.split(config.poolServer.fixedDiff.addressSeparator)[0];
                }
                if (fixedDiffCharPos != -1)
                    login = login.substr(0, workerNameCharPos) + login.substr(fixedDiffCharPos, login.length);
                else
                    login = login.substr(0, workerNameCharPos);
                log('info', logSystem, 'Miner %s uses worker name: %s', [login, workerName]);
            }
            if (config.poolServer.fixedDiff.enabled) {
                let fixedDiffCharPos = login.indexOf(config.poolServer.fixedDiff.addressSeparator);
                if (fixedDiffCharPos != -1) {
                    noRetarget = true;
                    difficulty = login.substr(fixedDiffCharPos + 1);
                    if (difficulty < config.poolServer.varDiff.minDiff)
                        difficulty = config.poolServer.varDiff.minDiff;
                    login = login.substr(0, fixedDiffCharPos);
                    log('info', logSystem, 'Miner difficulty fixed to %s', [difficulty]);
                }
            }
            if (addressBase58Prefix !== cnUtil.address_decode(new Buffer(login))) {
                sendReply('invalid address used for login');
                return;
            }
            if (IsBannedIp(ip)) {
                sendReply('your IP is banned');
                return;
            }
            var minerId = utils.uid();
            miner = new Miner(minerId, login, workerName, params.pass, ip, difficulty, noRetarget, pushMessage);
            connectedMiners[minerId] = miner;
            sendReply(null, {
                id: minerId,
                job: miner.getJob(),
                status: 'OK'
            });
            log('info', logSystem, 'Miner connected %s@%s', [login, miner.ip]);
            break;
        case 'getjob':
            if (!miner) {
                sendReply('Unauthenticated');
                return;
            }
            miner.heartbeat();
            sendReply(null, miner.getJob());
            break;
        case 'submit':
            if (!miner) {
                sendReply('Unauthenticated');
                return;
            }
            miner.heartbeat();
            var job = miner.validJobs.filter(function (job) {
                return job.id === params.job_id;
            })[0];
            if (!job) {
                sendReply('Invalid job id');
                return;
            }
            params.nonce = params.nonce.substr(0, 8).toLowerCase();
            if (!noncePattern.test(params.nonce)) {
                var minerText = miner ? (' ' + miner.login + '@' + miner.ip) : '';
                log('warn', logSystem, 'Malformed nonce: ' + JSON.stringify(params) + ' from ' + minerText);
                if (!perIPStats[miner.ip]) {
                    perIPStats[miner.ip] = { validShares: 0, invalidShares: 0 };
                }
                perIPStats[miner.ip].invalidShares += Math.floor((config.poolServer.banning.checkThreshold / 4) * (config.poolServer.banning.invalidPercent / 100) - 1);
                miner.checkBan(false);
                sendReply('Malformed nonce');
                return;
            }
            else if (job.submissions.indexOf(params.nonce) !== -1) {
                var minerText = miner ? (' ' + miner.login + '@' + miner.ip) : '';
                log('warn', logSystem, 'Duplicate share: ' + JSON.stringify(params) + ' from ' + minerText);
                if (!perIPStats[miner.ip]) {
                    perIPStats[miner.ip] = { validShares: 0, invalidShares: 0 };
                }
                perIPStats[miner.ip].invalidShares += Math.floor((config.poolServer.banning.checkThreshold / 4) * (config.poolServer.banning.invalidPercent / 100) - 1);
                miner.checkBan(false);
                sendReply('Duplicate share');
                return;
            }
            job.submissions.push(params.nonce);
            var blockTemplate = currentBlockTemplate.height === job.height ? currentBlockTemplate : validBlockTemplates.filter(function (t) {
                return t.height === job.height;
            })[0];
            if (!blockTemplate) {
                sendReply('Block expired');
                return;
            }
            var shareAccepted = processShare(miner, job, blockTemplate, params.nonce, params.result);
            miner.checkBan(shareAccepted);
            if (!shareAccepted) {
                sendReply('Low difficulty share');
                return;
            }
            var now = Date.now() / 1000 | 0;
            miner.shareTimeRing.append(now - miner.lastShareTime);
            miner.lastShareTime = now;
            // miner.retarget(now);
            sendReply(null, { status: 'OK' });
            break;
        case 'keepalived':
            if (!miner) {
                sendReply('Unauthenticated');
                return;
            }
            miner.heartbeat();
            sendReply(null, { status: 'KEEPALIVED' });
            break;
        default:
            sendReply('invalid method');
            var minerText = miner ? (' ' + miner.login + '@' + miner.ip) : '';
            log('warn', logSystem, 'Invalid method: %s (%j) from %s', [method, params, minerText]);
            break;
    }
}
var httpResponse = ' 200 OK\nContent-Type: text/plain\nContent-Length: 20\n\nmining server online';
function startPoolServerTcp(callback) {
    async.each(config.poolServer.ports, function (portData, cback) {
        let handleMessage = function (socket, jsonData, pushMessage) {
            if (!jsonData.id) {
                log('warn', logSystem, 'Miner RPC request missing RPC id');
                return;
            }
            else if (!jsonData.method) {
                log('warn', logSystem, 'Miner RPC request missing RPC method');
                return;
            }
            let sendReply = function (error, result) {
                if (!socket.writable)
                    return;
                let sendData = JSON.stringify({
                    id: jsonData.id,
                    jsonrpc: '2.0',
                    error: error ? { code: -1, message: error } : null,
                    result: result
                }) + '\n';
                socket.write(sendData);
            };
            handleMinerMethod(jsonData.method, jsonData.params, socket.remoteAddress, portData, sendReply, pushMessage);
        };
        net_1.default.createServer(function (socket) {
            socket.setKeepAlive(true);
            socket.setEncoding('utf8');
            let dataBuffer = '';
            let pushMessage = function (method, params) {
                if (!socket.writable)
                    return;
                let sendData = JSON.stringify({
                    jsonrpc: '2.0',
                    method: method,
                    params: params
                }) + '\n';
                socket.write(sendData);
            };
            socket.on('data', function (d) {
                dataBuffer += d;
                if (Buffer.byteLength(dataBuffer, 'utf8') > 10240) { // 10KB
                    dataBuffer = '';
                    log('warn', logSystem, 'Socket flooding detected and prevented from %s', [socket.remoteAddress]);
                    socket.destroy();
                    return;
                }
                if (dataBuffer.indexOf('\n') !== -1) {
                    let messages = dataBuffer.split('\n');
                    let incomplete = dataBuffer.slice(-1) === '\n' ? '' : messages.pop();
                    for (let i = 0; i < messages.length; i++) {
                        let message = messages[i];
                        if (message.trim() === '')
                            continue;
                        let jsonData;
                        try {
                            jsonData = JSON.parse(message);
                        }
                        catch (e) {
                            if (message.indexOf('GET /') === 0) {
                                if (message.indexOf('HTTP/1.1') !== -1) {
                                    socket.end('HTTP/1.1' + httpResponse);
                                    break;
                                }
                                else if (message.indexOf('HTTP/1.0') !== -1) {
                                    socket.end('HTTP/1.0' + httpResponse);
                                    break;
                                }
                            }
                            log('warn', logSystem, 'Malformed message from %s: %s', [socket.remoteAddress, message]);
                            socket.destroy();
                            break;
                        }
                        handleMessage(socket, jsonData, pushMessage);
                    }
                    dataBuffer = incomplete !== undefined ? incomplete : '';
                }
            }).on('error', function (err) {
                if (err.code !== 'ECONNRESET') {
                    log('warn', logSystem, 'Socket error from %s %j', [socket.remoteAddress, err]);
                }
            }).on('close', function () {
                pushMessage = function () { };
            });
        }).listen(portData.port, function (error, result) {
            if (error) {
                log('error', logSystem, 'Could not start server listening on port %d, error: $j', [portData.port, error]);
                cback(true);
                return;
            }
            log('info', logSystem, 'Started server listening on port %d', [portData.port]);
            cback();
        });
    }, function (err) {
        if (err)
            callback(false);
        else
            callback(true);
    });
}
//# sourceMappingURL=pool.js.map