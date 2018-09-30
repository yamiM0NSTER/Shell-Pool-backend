import Config from './configReader';

export interface Global extends NodeJS.Global {
    redisClient: any,
    config: Config
}