"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const configReader_1 = __importDefault(require("./configReader"));
const redisClient_1 = require("./redisClient");
const logger_1 = require("./logger");
// Modules with Instance call are singletons
let cfg = configReader_1.default.Instance;
let log = logger_1.LoggerClass.Instance;
if (log.config === undefined)
    log.SetConfig(cfg);
let redisInst = redisClient_1.RedisClient.Instance;
if (redisInst.config === undefined) {
    redisInst.SetConfig(cfg);
}
var GlobalState;
(function (GlobalState) {
    GlobalState.config = cfg;
    //config.ReadConfig();
    GlobalState.redisClient = redisInst.client;
    GlobalState.Logger = logger_1.LoggerClass.Instance;
})(GlobalState = exports.GlobalState || (exports.GlobalState = {}));
//# sourceMappingURL=globalstate.js.map