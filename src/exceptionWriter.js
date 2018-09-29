"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const cluster_1 = __importDefault(require("cluster"));
const dateformat_1 = __importDefault(require("dateformat"));
const configReader_1 = require("./configReader");
// var fs = require('fs')
// var cluster = require('cluster')
// var dateFormat = require('dateformat')
module.exports = function (logSystem) {
    process.on('uncaughtException', function (err) {
        console.log('\n' + err.stack + '\n');
        let time = dateformat_1.default(new Date(), 'yyyy-mm-dd HH:MM:ss');
        let file = `${configReader_1.cfg.config.logging.files.directory}/${logSystem}_crash.log`;
        let data = `${time}\n${err.stack}\n\n`;
        fs_1.default.appendFile(file, data, function (err) {
            if (cluster_1.default.isWorker) {
                process.exit();
            }
        });
    });
};
//# sourceMappingURL=exceptionWriter.js.map