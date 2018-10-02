"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require('fs');
var async = require('async');
var http = require('http');
var charts = require('./charts');
//import { Logger } from './logger';
const globalstate_1 = require("./globalstate");
let Logger = globalstate_1.GlobalState.Logger;
var logSystem = 'chartsDataCollector';
require('./exceptionWriter.js')(logSystem);
Logger.Log('info', logSystem, 'Started');
charts.startDataCollectors();
//# sourceMappingURL=chartsDataCollector.js.map