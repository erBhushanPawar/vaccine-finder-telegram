const request = require('request');
import { logger } from "./logger"
import { MQTTConsumer } from "./mqtt-consumer";
const moment = require('moment');
var mqtt = require('mqtt')
var client = mqtt.connect('mqtt://localhost:1883')
export class MQTTManager {
    topic = 'CenterRequests'
    isConnected: boolean = false
    sharedBotInstance = null;
    burstTime = null;
    redisCacheInstance = null;
    dbInstance = null;
    totalConsumers = 1;
    currentConsumerId = 0
    constructor(botInstance, redisCache, dbm) {
        this.sharedBotInstance = botInstance;
        this.redisCacheInstance = redisCache;
        this.dbInstance = dbm;
        this.init()
        for (let index = 0; index < 1; index++) {
            new MQTTConsumer(index, botInstance, redisCache, dbm)

        }
    }

    processDB(records) {
        this.burstTime = new Date().getTime()
        let now = new Date().getTime()
        records = records.filter(record => (record.subscriptionURLs && (record.pausedTill ? record.pausedTill - now <= 0 : true)))
        console.log(records.length, 'Filtered people on paused state and not having subscription, serving for', records.map(record => record.first_name))

        records.forEach(r => {
            r.subscriptionURLs.forEach(url => {
                this.publish({ url, ...r })
            })

        });
    }

    init() {
        let _that = this;
        logger.info('Initializing MQTT', _that.redisCacheInstance)
        client.on('connect', function () {
            logger.info('Conncted to MQTT')
            _that.isConnected = true
        })
        client.on('error', function (e) {
            logger.error('Failed')
            console.error(e)
        })
    }
    publish(msg) {
        if (!this.isConnected) {
            logger.warn('MQTT is not connected');
            return;
        }
        if (typeof msg === 'object') {
            msg = JSON.stringify(msg)
        }
        // logger.info('PUB : ' + msg)
        client.publish(this.currentConsumerId + '_' + this.topic, msg)
        this.currentConsumerId++;
        if (this.currentConsumerId > this.totalConsumers) {
            this.currentConsumerId = 0;
        }
    }

}