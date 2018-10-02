import Config from './configReader';
import redis from 'redis';
import { RedisClient } from './redisClient';
import { LoggerClass } from './logger';

// Modules with Instance call are singletons
let cfg = Config.Instance;
let log = LoggerClass.Instance;
if(log.config === undefined)
    log.SetConfig(cfg);

let redisInst = RedisClient.Instance;
if (redisInst.config === undefined) {
    redisInst.SetConfig(cfg);
}

export namespace GlobalState {
    export let config: Config = cfg;
    //config.ReadConfig();
    export let redisClient: redis.RedisClient = redisInst.client;
    export let Logger: LoggerClass = LoggerClass.Instance;
}