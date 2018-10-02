import Config from './configReader';
import redis from 'redis';
import {LoggerClass} from './logger';

export interface Global extends NodeJS.Global {
    redisClient: redis.RedisClient,
    config: Config,
    Logger: LoggerClass
}