var fs = require('fs')
var async = require('async')
var http = require('http')
var charts = require('./charts')
//import { Logger } from './logger';
import { GlobalState } from './globalstate';
let Logger = GlobalState.Logger;

var logSystem = 'chartsDataCollector';
require('./exceptionWriter.js')(logSystem);

Logger.Log('info', logSystem, 'Started');

charts.startDataCollectors();
