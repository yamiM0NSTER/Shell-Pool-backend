"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const redis_1 = __importDefault(require("redis"));
class RedisClient {
    constructor() {
        this.config = undefined;
    }
    static get Instance() {
        // Do you need arguments? Make it a regular method instead.
        return this._instance || (this._instance = new this());
    }
    SetConfig(config) {
        this.config = config;
        this.client = redis_1.default.createClient(config.config.redis.port, config.config.redis.host);
    }
}
exports.RedisClient = RedisClient;
//# sourceMappingURL=redisClient.js.map