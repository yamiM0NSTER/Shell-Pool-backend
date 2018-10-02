"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
//import cfg from "./configReader";
const fs_1 = __importDefault(require("fs"));
const util_1 = __importDefault(require("util"));
const dateformat_1 = __importDefault(require("dateformat"));
const cli_color_1 = __importDefault(require("cli-color"));
const globalAny = global;
let severityMap = {
    'info': cli_color_1.default.blue,
    'warn': cli_color_1.default.yellow,
    'error': cli_color_1.default.red
};
class LoggerClass {
    constructor() {
        // TODO: SeverityLevels enum
        this.severityLevels = ['info', 'warn', 'error'];
        this.pendingWrites = {};
        this.config = undefined;
    }
    static get Instance() {
        // Do you need arguments? Make it a regular method instead.
        return this._instance || (this._instance = new this());
    }
    SetConfig(config) {
        this.config = config;
        this.logDir = this.config.config.logging.files.directory;
    }
    // no longer use :any
    Log(severity, system, text, data) {
        let logConsole = this.severityLevels.lastIndexOf(severity) >= this.severityLevels.lastIndexOf(this.config.config.logging.console.level);
        let logFiles = this.severityLevels.lastIndexOf(severity) >= this.severityLevels.lastIndexOf(this.config.config.logging.files.level);
        if (!logConsole && !logFiles)
            return;
        let time = dateformat_1.default(new Date(), 'yyyy-mm-dd HH:MM:ss');
        let formattedMessage = text;
        if (data) {
            data.unshift(text);
            formattedMessage = util_1.default.format.apply(null, data);
        }
        if (logConsole) {
            if (this.config.config.logging.console.colors)
                console.log(`${severityMap[severity](time)} ${cli_color_1.default.white.bold('[' + system + ']')} ${formattedMessage}`);
            else
                console.log(`${time} [${system}] ${formattedMessage}`);
        }
        if (logFiles) {
            let fileName = `${this.logDir}/${system}_${severity}.log`;
            let fileLine = `${time} ${formattedMessage}\n`;
            this.pendingWrites[fileName] = (this.pendingWrites[fileName] || '') + fileLine;
        }
    }
    IntervalFunc() {
        for (let fileName in this.pendingWrites) {
            let data = this.pendingWrites[fileName];
            fs_1.default.appendFile(fileName, data, (err) => {
                if (err)
                    console.log(err);
            });
            delete this.pendingWrites[fileName];
        }
    }
    Init() {
        if (!fs_1.default.existsSync(this.logDir)) {
            try {
                fs_1.default.mkdirSync(this.logDir);
            }
            catch (e) {
                throw e;
            }
        }
        setInterval(this.IntervalFunc, this.config.config.logging.files.flushInterval * 1000);
    }
}
exports.LoggerClass = LoggerClass;
//# sourceMappingURL=logger.js.map