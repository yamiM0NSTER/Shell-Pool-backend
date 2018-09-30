"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const configReader_1 = require("./src/configReader");
const logger_1 = require("./src/logger");
require("./src/exceptionWriter");
require("./src/utils");
const shareTrust = __importStar(require("./src/shareTrust"));
const apiInterfaces_1 = __importDefault(require("./src/apiInterfaces"));
let msg = 'hi there';
console.log(msg);
console.log(msg);
console.log(msg);
console.log(msg);
console.log(msg);
console.log(msg);
console.log(`${msg}`);
let api = new apiInterfaces_1.default(configReader_1.cfg.config.daemon, configReader_1.cfg.config.wallet, configReader_1.cfg.config.api);
function getCoinPrice(callback) {
    api.jsonHttpRequest('api.cryptonator.com', 443, '', function (error, response) {
        callback(response.error ? response.error : error, response.success ? +response.ticker.price : null);
    }, '/api/ticker/' + configReader_1.cfg.config.symbol.toLowerCase() + '-usd');
}
getCoinPrice(function (error, price) {
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
logger_1.Logger.Log('error', 'test', 'Invalid module "%s", valid modules: %s', [moduleName, validModules.join(', ')]);
//console.log(cfg.config);
msg = 'ddd';
//# sourceMappingURL=app.js.map