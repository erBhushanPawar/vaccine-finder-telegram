import { TelegramProcessor } from "./telegram.processor";

const amqp = require('amqplib/callback_api');
const request = require('request');
const moment = require('moment');
const TelegramBot = require('../telegram-lib');
let developerChatId = '1216194906'
const bot = new TelegramBot(process.env.TOKEN, {})
const consumerId = 'rmq01'
const telegramProcessor = new TelegramProcessor(bot)

export class RMQConsumer {

    constructor() {
        const _that = this;
        let wasBlocked = false;
        amqp.connect('amqp://localhost', function (error0, connection) {
            if (error0) {
                throw error0;
            }
            connection.createChannel(function (error1, channel) {
                if (error1) {
                    throw error1;
                }
                var queue = 'task_queue';

                channel.assertQueue(queue, {
                    durable: true
                });
                channel.prefetch(1);
                console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", queue);
                channel.consume(queue, function (msg) {
                    try {
                        let msgObj = JSON.parse(msg.content.toString())
                        let urls = []
                        msgObj.users.forEach((u) => {
                            urls.push(...u.subscriptionURLs)
                        })
                        msgObj.url = urls[0]
                        console.log("[x] Received %s", msgObj, 'Total users are', msgObj.users.length, msgObj.url, urls);
                        if (msgObj.url) {
                            _that.makeGetRequest(msgObj.url, (d) => {
                                if (!d) {
                                    console.log('Waiting for 1 minute, as last request was failed.')
                                    telegramProcessor.sendMessage(developerChatId, `Request was failed so waiting for a minute`, {})
                                    wasBlocked = true;
                                    setTimeout(() => {
                                        channel.nack(msg);
                                    }, 1 * 60 * 1000);
                                    return
                                }
                                if (wasBlocked) {
                                    telegramProcessor.sendMessage(developerChatId, `Resumed...`, {})
                                    wasBlocked = false;
                                }
                                _that.parseResponse(msgObj, d)
                                channel.ack(msg);
                                console.log(" [x] Done", msgObj.url);
                            })
                        } else {
                            channel.ack(msg);

                        }
                    } catch (error) {
                        console.log(error)
                    }

                }, {
                    // manual acknowledgment mode,
                    // see https://www.rabbitmq.com/confirms.html for details
                    noAck: false
                });
            });
        });
    }

    makeGetRequest(url, cbFun) {
        let date = moment();
        date = date.format('DD-MM-YYYY')
        const options = {
            url: url + `&date=${date}`,
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36' }
        };
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


    parseResponse(msgObj, d) {
        let filteredData = this.processResponse(d)

        var opts = {
            reply_markup: {
                inline_keyboard: []
            }
        };
        opts.reply_markup.inline_keyboard.push([{ text: `Reset Filter`, callback_data: 'filterCenter_reset' }])
        try {
            let now = new Date().getTime()
            msgObj.users.forEach(msg => {

                if (msg.pausedTill - now > 0) {
                    console.warn(`User snoozed..........`)
                } else {
                    let available = []
                    let totalQty = 0;
                    filteredData.map(center => {
                        center.minAge = Math.min(...center.sessions.map(s => s.min_age_limit))
                        if (!msg.age || msg.age == center.minAge) {
                            if (!msg.centerIds || !msg.centerIds.length || msg.centerIds.includes('' + center.center_id)) {

                                if (center.total) {
                                    let vaccine = Array.from(new Set(center.sessions.map(session => session.vaccine))).join(', ')
                                    let dose1 = Array.from(new Set(center.sessions.map(session => session.available_capacity_dose1))).reduce((a: any, b: any) => a + b)
                                    let dose2 = Array.from(new Set(center.sessions.map(session => session.available_capacity_dose2))).reduce((a: any, b: any) => a + b)
                                    let add = false;
                                    console.log(msg.first_name, dose1, dose2)
                                    if (msg.dose) {
                                        if (msg.dose == 1 && dose1 > 0) {
                                            add = true;
                                        }
                                        if (msg.dose == 2 && dose2 > 0) {
                                            add = true;
                                        }
                                    } else {
                                        add = true;
                                    }
                                    if (add) {
                                        available.push(`${center.name}, ${center.address}, ${center.block_name},${center.pincode} \nMin Age: ${center.minAge} \n<b>Quantity</b> ${center.total} | <b>Dose 1:</b> ${dose1} | <b>Dose 2:</b> ${dose2} | vaccine ${vaccine}`)
                                        totalQty += center.total
                                    }
                                }
                            }
                        }
                    });
                    console.warn(consumerId + `Available Slots ${available.length} | ${totalQty} | ${msg.first_name} | ${msg.last_name} | age : ${msg.age}`)
                    if (available.length > 0) {
                        try {
                            telegramProcessor.sendMessage(msg.id, `There are total ${available.length} centers have capacity for booking slots.Please visit https://selfregistration.cowin.gov.in/ for booking. 
                                    \n${available.join('\n--------------------------------\n\n')}Current Filter by centers: ${msg.centerIds ? msg.centerIds.join(', ') : 'No filters'}
                                    \n\nWant specific centers ? Select specific centers using /subscribe\nWant to snooze for 5 hours ? click /snooze`, opts, true)
                        } catch (error) {
                            console.log(consumerId + 'Failed in sending message', error)
                        }
                    }
                }
            })
        } catch (error) {
            console.log('Error while parsing message', error)
        }

    }
    processResponse(response) {
        //console.log(JSON.stringify(response.centers))
        if (!response || !response.centers) {
            console.warn(consumerId + 'Empty Data, we will try later')
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

}

new RMQConsumer()