import fs from 'fs';
import cluster from 'cluster'
import dateFormat from 'dateformat';
import { cfg } from './configReader';

// var fs = require('fs')
// var cluster = require('cluster')
// var dateFormat = require('dateformat')

module.exports = function (logSystem: any) {
  process.on('uncaughtException', function (err) {
    console.log('\n' + err.stack + '\n')
    let time = dateFormat(new Date(), 'yyyy-mm-dd HH:MM:ss')
    let file = `${cfg.config.logging.files.directory}/${logSystem}_crash.log`;
    let data = `${time}\n${err.stack}\n\n`;
    fs.appendFile(file, data, function (err) {
      if (cluster.isWorker) {
          process.exit();
        }
    })
  })
}
