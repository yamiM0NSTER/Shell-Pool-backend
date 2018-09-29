"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("./src/logger");
require("./src/exceptionWriter");
require("./src/utils");
const shareTrust = __importStar(require("./src/shareTrust"));
let msg = 'hi there';
console.log(msg);
console.log(msg);
console.log(msg);
console.log(msg);
console.log(msg);
console.log(msg);
console.log(`${msg}`);
console.log(shareTrust);
let validModules = ['pool', 'api', 'unlocker', 'payments', 'chartsDataCollector'];
let moduleName = 'whatever';
logger_1.Logger.Log('error', 'test', 'Invalid module "%s", valid modules: %s', [moduleName, validModules.join(', ')]);
//console.log(cfg.config);
msg = 'ddd';
//# sourceMappingURL=app.js.map