
let redis = require('redis')
const { promisify } = require("util");
export class RedisCache {
    /* Values are hard-coded for this example, it's usually best to bring these in via file or environment variable for production */

    client = redis.createClient();
    getAsync = promisify(this.client.get).bind(this.client);
    setAsync = promisify(this.client.set).bind(this.client);
    constructor() {
        console.log('REDIS OK')
        this.client.on("error", function (error) {
            console.error('REDIS error: ', error);
        });
    }
    async getVal(key: string) {

        return await this.getAsync(key);
    }

    async setVal(key: string, val) {
        console.log('setVal', key, val);
        return await this.setAsync(key, val);
    }
}