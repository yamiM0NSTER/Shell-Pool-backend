import redis from 'redis';

export class RedisClient {
    private static _instance: RedisClient;
    client!: redis.RedisClient;
    config: any;
    

    constructor() {
        this.config = undefined;
    }

    public static get Instance() {
        // Do you need arguments? Make it a regular method instead.
        return this._instance || (this._instance = new this());
    }

    SetConfig(config: any) {
        this.config = config;
        this.client = redis.createClient(config.config.redis.port, config.config.redis.host);
    }

}