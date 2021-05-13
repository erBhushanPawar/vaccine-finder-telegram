const request = require('request');
import { logger } from "./logger"
const moment = require('moment');
var mqtt = require('mqtt')
var client = mqtt.connect('mqtt://localhost:1883')
export class MQTTConsumer {
    topic = 'CenterRequests'
    isConnected: boolean = false
    sharedBotInstance = null;
    burstTime = null;
    redisCacheInstance = null;
    dbInstance = null;
    consumerId = null
    constructor(index, botInstance, redisCache, dbm) {
        this.consumerId = index + '_' + new Date().getTime() + '      '
        this.topic = index + '_CenterRequests'
        this.sharedBotInstance = botInstance;
        this.redisCacheInstance = redisCache;
        this.dbInstance = dbm;
        this.init()

    }

    init() {
        let _that = this;
        logger.info(_that.consumerId + 'Initializing MQTT consumer')
        client.on('connect', function () {
            logger.info(_that.consumerId + 'Conncted to MQTT')
        })
        client.on('error', function (e) {
            logger.error(_that.consumerId + 'Failed')
            console.error(e)
        })
        client.subscribe(_that.topic, function (err) {
            if (!err) {
                _that.isConnected = true;
            }
            //logger.info('SUB OK')
        })
        client.on('message', function (topic, message) {
            // message is Buffer
            let msg = JSON.parse(message.toString());
            //logger.info(`REC :  ${topic} ${JSON.stringify(msg)}`)

            // check in cache for current burstTime

            try {
                _that.redisCacheInstance.getVal(msg.url + '__' + _that.burstTime).then(function (cache) {
                    console.log(_that.consumerId + 'REDIS cache', cache)
                    if (cache) {
                        console.log(_that.consumerId + 'USE Cache', msg.url + '__' + _that.burstTime)
                        _that.parseResponse(msg, JSON.parse(cache))
                    } else {
                        _that.makeGetRequest(msg.url, (d) => {
                            _that.parseResponse(msg, d)

                        })
                    }
                })

            } catch (error) {
                console.log(_that.consumerId + error)
            }
        })
    }
    parseResponse(msg, d) {
        let filteredData = this.processResponse(d)
        if (filteredData.length) {
            this.redisCacheInstance.setVal(msg.url + '__' + this.burstTime, JSON.stringify({ centers: filteredData }))
        }
        var opts = {
            reply_markup: {
                inline_keyboard: []
                // filteredData.map((center) => {
                //     return [{ text: `${center.name}, ${center.block_name}, ${center.pincode}`, callback_data: 'filterCenter_' + center.center_id }]
                // })
            }
        };
        opts.reply_markup.inline_keyboard.push([{ text: `Reset Filter`, callback_data: 'filterCenter_reset' }])
        let available = []
        let totalQty = 0;
        filteredData.map(center => {

            center.minAge = Math.min(...center.sessions.map(s => s.min_age_limit))
            if (!msg.age || msg.age == center.minAge) {

                if (!msg.centerIds || !msg.centerIds.length || (msg.centerIds).includes('' + center.center_id)) {

                    available.push(`${center.name}, ${center.address}, ${center.block_name},${center.pincode} \n Min Age: ${center.minAge} Quantity ${center.total}`)
                    totalQty += center.total
                }
            }
        })

        console.warn(this.consumerId + `Available Slots ${available.length} | ${totalQty} | ${msg.first_name} | ${msg.last_name} | age : ${msg.age}`)
        if (available.length > 0) {
            try {
                this.sharedBotInstance.sendMessage(msg.id, `There are total ${available.length} centers have capacity for booking slots. Please visit https://selfregistration.cowin.gov.in/ for booking. 
                \n
${available.join('\n\n')}
Current Filter by centers : ${msg.centerIds ? msg.centerIds.join(', ') : 'No filters'}
                \n\nWant specific centers ? Select specific centers using /subscribe\nWant to snooze for 5 hours ? click /snooze`, opts)
                // let date = new Date()
                // date.setHours(date.getHours() + 1)
                // logger.warn(`AUTO SNOOZE for 1 hour for ${msg.first_name} as sent message recently`)
                // this.dbInstance.update({ id: msg.id }, { pausedTill: date.getTime() })
            } catch (error) {
                console.log(this.consumerId + 'Failed in sending message', error)
            }
        }
    }
    processResponse(response) {
        //console.log(JSON.stringify(response.centers))
        if (!response || !response.centers) {
            logger.warn(this.consumerId + 'Empty Data, we will try later')
            return []
        }

        return response.centers.map(c => {
            let total = 0;
            c.available = [];

            c.sessions.forEach(s => {
                if (s.available_capacity > 0) {
                    c.available.push(s)
                    total += s.available_capacity;
                }
            })
            c.total = total;
            //console.log('ONe center', c.name, c.total, c.center_id)
            return c;
        }).filter(c => c.total > 0).sort((a, b) => b.total - a.total)
    }

    makeGetRequest(url, cbFun) {
        let date = moment();
        date = date.format('DD-MM-YYYY')
        const options = {
            url: url + `&date=${date}`,
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36' }
        };
        logger.info(this.consumerId + 'Consumer GET ' + options.url)

        request(options, function (err, res, body) {
            try {
                let json = JSON.parse(body);

                cbFun(json)
            } catch (error) {
                console.error('Failed to fetch data', options.url, error)
                cbFun(null)
            }
        });
    }
}