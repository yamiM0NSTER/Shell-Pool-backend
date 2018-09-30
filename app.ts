import Config from './src/configReader';
import { Global } from './src/defines';

const globalAny: Global = <Global>global;
globalAny.config = new Config();
globalAny.config.ReadConfig();

import { Logger } from './src/logger';
import './src/exceptionWriter';
import './src/utils';
import * as shareTrust from './src/shareTrust';
import apiInterfaces from './src/apiInterfaces';


let msg = 'hi there';
console.log(msg);
console.log(msg);
console.log(msg);
console.log(msg);
console.log(msg);
console.log(msg);
console.log(`${msg}`);
let api = new apiInterfaces(globalAny.config.config.daemon, globalAny.config.config.wallet, globalAny.config.config.api);

function getCoinPrice(callback: Function) {
    api.jsonHttpRequest('api.cryptonator.com', 443, '', function (error: any, response: any) {
        callback(response.error ? response.error : error, response.success ? +response.ticker.price : null)
    }, '/api/ticker/' + globalAny.config.config.symbol.toLowerCase() + '-usd')
}

getCoinPrice(function (error: any, price: any) {
    if (error) {
        console.log(error);
        return;
    }
    else {
        console.log(price);
    }
});

console.log(shareTrust);
let validModules = ['pool', 'api', 'unlocker', 'payments', 'chartsDataCollector'];
let moduleName = 'whatever';
Logger.Log('error', 'test', 'Invalid module "%s", valid modules: %s', [moduleName, validModules.join(', ')]);
//console.log(cfg.config);
msg = 'ddd';