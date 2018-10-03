//import cluster from 'cluster';
import os from 'os';
import { GlobalState } from './src/globalstate';

let config = GlobalState.config.config;
let donations: any = GlobalState.config.donations;
let redisClient = GlobalState.redisClient;

const cluster = require('cluster');
//var os = require('os');
//var redis = require('redis');

// if (redisClient === undefined) {
//     var redisClient = redis.createClient(config.redis.port, config.redis.host);

//     globalAny.redisClient.on('error', function (err) {
//         console.log("Error " + err);
//     });
// }
//let redisClient = globalAny.redisClient;

// import { Logger } from './src/logger';
// if (!globalAny.Logger)
//     globalAny.Logger = Logger;
import './src/exceptionWriter';
import './src/utils';
import * as shareTrust from './src/shareTrust';
import apiInterfaces from './src/apiInterfaces';


// if (cluster.isMaster) {
//     masterProcess();
// } else {
//     childProcess();
// }

// function masterProcess() {
//     console.log(`Master ${process.pid} is running`);

//     for (let i = 0; i < 10; i++) {
//         console.log(`Forking process number ${i}...`);
//         cluster.fork({
//             workerType: 'pool',
//             forkId: i.toString()
//         });
//     }

//     process.exit();
// }

// function childProcess() {
//     console.log(`Worker ${process.pid} started and finished`);

//     process.exit();
// }
// console.log(msg);
// console.log(msg);
// console.log(msg);
// console.log(msg);
// console.log(msg);
// console.log(`${msg}`);
// let api = new apiInterfaces(globalAny.config.config.daemon, globalAny.config.config.wallet, globalAny.config.config.api);

// function getCoinPrice(callback: Function) {
//     api.jsonHttpRequest('api.cryptonator.com', 443, '', function (error: any, response: any) {
//         callback(response.error ? response.error : error, response.success ? +response.ticker.price : null)
//     }, '/api/ticker/' + globalAny.config.config.symbol.toLowerCase() + '-usd')
// }

// getCoinPrice(function (error: any, price: any) {
//     if (error) {
//         console.log(error);
//         return;
//     }
//     else {
//         console.log(price);
//     }
// });

// console.log(shareTrust);
//let validModules = ['pool', 'api', 'unlocker', 'payments', 'chartsDataCollector'];
//let moduleName = 'whatever';
//Logger.Log('error', 'test', 'Invalid module "%s", valid modules: %s', [moduleName, validModules.join(', ')]);
//console.log(cfg.config);
//msg = 'ddd';


//require('./src/configReader.js');
//require('./src/logger.js');
//require('./lib/configReader1.js');

//require('./lib/logger.js');

//global.redisClient = redis.createClient(config.redis.port, config.redis.host);

var log = function (severity: any, system: any, text: any, data?: any) {
    GlobalState.Logger.Log(severity, system, text, data);
    //global.log(severity, system, threadId + text, data)
}


var logSystem = 'master';
//require('./lib/exceptionWriter.js')(logSystem);
require('./src/exceptionWriter.js')(logSystem);



if (cluster.isWorker) {
    switch (process.env.workerType) {
        case 'pool':
            require('./src/pool.js');
            break;
        case 'blockUnlocker':
            require('./src/blockUnlocker.js');
            break;
        case 'paymentProcessor':
            require('./src/paymentProcessor.js');
            break;
        case 'api':
            require('./src/api.js');
            break;
        case 'cli':
            require('./src/cli.js');
            break
        case 'chartsDataCollector':
            require('./src/chartsDataCollector.js');
            break

    }
    //process.exit(); // this simply doesn't work cuz it kills child processes
    //return; // typescript cancers about it
}



var singleModule = (function () {

    var validModules = ['pool', 'api', 'unlocker', 'payments', 'chartsDataCollector'];

    for (var i = 0; i < process.argv.length; i++) {
        if (process.argv[i].indexOf('-module=') === 0) {
            var moduleName = process.argv[i].split('=')[1];
            if (validModules.indexOf(moduleName) > -1)
                return moduleName;

            log('error', logSystem, 'Invalid module "%s", valid modules: %s', [moduleName, validModules.join(', ')]);
            process.exit();
        }
    }
})();


(function init() {
    if (!cluster.isMaster)
        return;
    checkRedisVersion(function () {

        if (singleModule) {
            log('info', logSystem, 'Running in single module mode: %s', [singleModule]);

            switch (singleModule) {
                case 'pool':
                    spawnPoolWorkers();
                    break;
                case 'unlocker':
                    spawnBlockUnlocker();
                    break;
                case 'payments':
                    spawnPaymentProcessor();
                    break;
                case 'api':
                    spawnApi();
                    break;
                case 'chartsDataCollector':
                    spawnChartsDataCollector();
                    break;
            }
        }
        else {
            spawnPoolWorkers();
            spawnBlockUnlocker();
            spawnPaymentProcessor();
            spawnApi();
            spawnChartsDataCollector();
        }

        spawnCli();

    });
})();


function checkRedisVersion(callback: any) {

    redisClient.info(function (error: any, response: any) {
        if (error) {
            log('error', logSystem, 'Redis version check failed');
            return;
        }
        var parts = response.split('\r\n');
        var version;
        var versionString;
        for (var i = 0; i < parts.length; i++) {
            if (parts[i].indexOf(':') !== -1) {
                var valParts = parts[i].split(':');
                if (valParts[0] === 'redis_version') {
                    versionString = valParts[1];
                    version = parseFloat(versionString);
                    break;
                }
            }
        }
        if (!version) {
            log('error', logSystem, 'Could not detect redis version - must be super old or broken');
            return;
        }
        else if (version < 2.6) {
            log('error', logSystem, "You're using redis version %s the minimum required version is 2.6. Follow the damn usage instructions...", [versionString]);
            return;
        }
        log('info', logSystem, 'Redis check passed.');
        callback();
    });
}

function spawnPoolWorkers() {
    if (!config.poolServer || !config.poolServer.enabled || !config.poolServer.ports || config.poolServer.ports.length === 0)
        return;

    if (config.poolServer.ports.length === 0) {
        log('error', logSystem, 'Pool server enabled but no ports specified');
        return;
    }

    let numForks: number = (function () {
        if (!config.poolServer.clusterForks)
            return 1;
        if (config.poolServer.clusterForks === 'auto')
            return os.cpus().length;
        if (isNaN(config.poolServer.clusterForks))
            return 1;
        return config.poolServer.clusterForks;
    })();

    let poolWorkers: any = {};

    var createPoolWorker = function (forkId: any) {
        var worker: any = cluster.fork({
            workerType: 'pool',
            forkId: forkId,
            redisClient: redisClient
        });
        worker.forkId = forkId;
        worker.type = 'pool';
        poolWorkers[forkId] = worker;
        worker.on('exit', function (code: any, signal: any) {
            log('error', logSystem, 'Pool fork %s died, spawning replacement worker...', [forkId]);
            setTimeout(function () {
                createPoolWorker(forkId);
            }, 2000);
        }).on('message', function (msg: any) {
            switch (msg.type) {
                case 'banIP':
                    Object.keys(cluster.workers).forEach(function (id) {
                        if (cluster.workers[id].type === 'pool') {
                            cluster.workers[id].send({ type: 'banIP', ip: msg.ip });
                        }
                    });
                    break;
                case 'shareTrust':
                    Object.keys(cluster.workers).forEach(function (id) {
                        if (cluster.workers[id].type === 'pool' && cluster.workers[id].forkId != worker.forkId) {
                            cluster.workers[id].send({ type: 'shareTrust', ip: msg.ip, address: msg.address, shareValidated: msg.shareValidated });
                        }
                    });
                    break;
            }
        });
    };

    let i = 1;
    let spawnInterval: NodeJS.Timer = setInterval(function () {
        createPoolWorker(i.toString());
        i++;
        if (i - 1 === numForks) {
            clearInterval(spawnInterval);
            log('info', logSystem, 'Pool spawned on %d thread(s)', [numForks]);
        }
    }, 10);
}

function spawnBlockUnlocker() {

    if (!config.blockUnlocker || !config.blockUnlocker.enabled) return;

    var worker = cluster.fork({
        workerType: 'blockUnlocker'
    });
    worker.on('exit', function (code: any, signal: any) {
        log('error', logSystem, 'Block unlocker died, spawning replacement...');
        setTimeout(function () {
            spawnBlockUnlocker();
        }, 2000);
    });

}

function spawnPaymentProcessor() {

    if (!config.payments || !config.payments.enabled) return;

    var worker = cluster.fork({
        workerType: 'paymentProcessor'
    });
    worker.on('exit', function (code: any, signal: any) {
        log('error', logSystem, 'Payment processor died, spawning replacement...');
        setTimeout(function () {
            spawnPaymentProcessor();
        }, 2000);
    });
}

function spawnApi() {
    if (!config.api || !config.api.enabled) return;

    var worker = cluster.fork({
        workerType: 'api'
    });
    worker.on('exit', function (code: any, signal: any) {
        log('error', logSystem, 'API died, spawning replacement...');
        setTimeout(function () {
            spawnApi();
        }, 2000);
    });
}

function spawnCli() {

}

function spawnChartsDataCollector() {
    if (!config.charts) return;

    var worker = cluster.fork({
        workerType: 'chartsDataCollector'
    });
    worker.on('exit', function (code: any, signal: any) {
        log('error', logSystem, 'chartsDataCollector died, spawning replacement...');
        setTimeout(function () {
            spawnChartsDataCollector();
        }, 2000);
    });
}
