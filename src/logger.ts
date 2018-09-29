import { cfg } from "./configReader";
import fs from 'fs';
import util from 'util';
import dateFormat from 'dateformat';
import clc from 'cli-color';

type SeverityMap = {
    [key: string]: clc.Format;
}

let severityMap: SeverityMap = {
    'info': clc.blue,
    'warn': clc.yellow,
    'error': clc.red
}

class LoggerClass {
    logDir: string = cfg.config.logging.files.directory;

    // TODO: SeverityLevels enum
    severityLevels = ['info', 'warn', 'error'];

    pendingWrites: { [name: string]: string } = {};

    constructor() {

    }

    // no longer use :any
    Log(severity: any, system: any, text: any, data: any) {
        let logConsole: boolean = this.severityLevels.lastIndexOf(severity) >= this.severityLevels.lastIndexOf(cfg.config.logging.console.level);
        let logFiles: boolean = this.severityLevels.lastIndexOf(severity) >= this.severityLevels.lastIndexOf(cfg.config.logging.files.level);

        if (!logConsole && !logFiles)
            return;

        let time: string = dateFormat(new Date(), 'yyyy-mm-dd HH:MM:ss');
        let formattedMessage: string = text;

        if (data) {
            data.unshift(text);
            formattedMessage = util.format.apply(null, data);
        }

        if (logConsole) {
            if (cfg.config.logging.console.colors)
                console.log(`${severityMap[severity](time)} ${clc.white.bold('[' + system + ']')} ${formattedMessage}`);
            else
                console.log(`${time} [${system}] ${formattedMessage}`);
        }

        if (logFiles) {

            let fileName: string = `${this.logDir}/${system}_${severity}.log`;
            let fileLine: string = `${time} ${formattedMessage}\n`;
            this.pendingWrites[fileName] = (this.pendingWrites[fileName] || '') + fileLine;
        }
    }

    IntervalFunc() {
        for (let fileName in this.pendingWrites) {
            let data = this.pendingWrites[fileName];
            fs.appendFile(fileName, data, (err) => { 
                if (err) console.log(err);
            });
            delete this.pendingWrites[fileName];
        }
    }

    Init() {
        if (!fs.existsSync(this.logDir)) {
            try {
                fs.mkdirSync(this.logDir);
            }
            catch (e) {
                throw e;
            }
        }

        setInterval(this.IntervalFunc, cfg.config.logging.files.flushInterval * 1000);
    }
}

let Logger = new LoggerClass;
Logger.Init();
export {Logger};