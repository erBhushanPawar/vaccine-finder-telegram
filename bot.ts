import * as TelegramBot from './telegram-lib';
import * as dbmgr from './src/mongo.db';
const moment = require('moment');
const request = require('request');
let developerChatId = '1216194906'
var TOKEN = '1619827676:AAGWd6i1z4unyzg-nCScX58RlERyU-9ACw8';
var options = {
    polling: true
};
const msgObjs = []
let commandSupport = `

Welcome to Vaccination Finder,
This bot can help you find the vaccination for you and your family. 

You can search by your pincode directly to get nearby vaccination centers, like below.
/vaccination_411020 - pincode and age group wise vaccination center list 4⃣1⃣1⃣0⃣2⃣0⃣


Or if you dont know pincode then you can start looking for centers in district, start searching for your state and then by district
/states - find your state for vaccination 🗺🗺

If you know district code (or try /states) you can search directly by 
/vaccineindistrict_151 - enter district code for all list of centers 💉💉

If you like the concept of bot or like to appreciate this effort please send a small thank you like this.
/thanks - Say Thanks to developer :) ❤️

Thank you,
Vaccination Finder Bot
`

export class VaccineNotifierTelegramBot {
    bot;
    dbm = new dbmgr.DBManager();
    constructor() {
        this.bot = new TelegramBot(TOKEN, options)
        this.initCommands()
    }

    initCommands() {
        console.log('OK')
        const _that = this;
        this.bot.onText(/\/start$/, function onText(msg) {
            msgObjs.push(msg.chat)
            console.log(msg.chat)

            _that.bot.sendMessage(developerChatId, `${msg.chat.first_name}, started using bot ! their username is ${msg.chat.username || 'Not known'}`)
            _that.sendMessage(msg, commandSupport)
            _that.dbm.insert(msg.chat)
        });

        this.bot.onText(/\/thanks$/, function onText(msg) {
            console.log('thanks')
            _that.bot.sendMessage(developerChatId, `${msg.chat.first_name}, said thank you ! their username is ${msg.chat.username}`)
            _that.sendMessage(msg, 'Thank you for appreciating the efforts, you can send me a thank you note on  https://t.me/bhushan0310 to appreciate it.\nThanks for using Vaccincation Finder Bot, I hope it will helped you and your family.\n <a href="https://"></a> \n\nStay Safe. Stay Healthy.')
            _that.sendMessage(msg, `Hello,

I found 💉💉 Vaccincation Center Finder bot 🤖🤖 on telegram📱 and it helped me to find vaccination centers by
pincode 4⃣2⃣2⃣0⃣1⃣0⃣,\nstates 🗺🗺\ndistrict wise 🗾🗾\nYou can try it here, its very simple and elegant and FREE\n\n
https://t.me/VaccineNotifier_IN_bot`);
        });

        this.bot.onText(/\/states$/, function onText(msg) {
            let dmsg = ''
            _that.getStates((r) => {
                dmsg = r.states.map(d => `<b>${d.state_name}</b> /district_${d.state_id}`).join('\n')
                _that.sendMessage(msg, dmsg)
            })
        });

        this.bot.onText(/\/district(.)*/, function onText(msg) {
            let [cmd, stateCode] = msg.text.split('_')
            let dmsg = ''
            if (!stateCode) {
                _that.sendMessage(msg, `Please provide a state code to find districts, use /states for more information`)
                return;
            }
            _that.getDistricts(stateCode, (r) => {
                console.log(r)
                dmsg = r.districts.map(d => `<b>${d.district_name}</b> /vaccineindistrict_${d.district_id}`).join('\n')
                _that.sendMessage(msg, dmsg)
            })
        });

        this.bot.onText(/\/vaccineindistrict(.)*/, function onText(msg) {
            let [cmd, districtCode, date] = msg.text.split('_')
            if (!date) {
                date = moment();
                date = date.format('DD-MM-YYYY')
            }
            if (!districtCode) {
                _that.sendMessage(msg, `Please provide a district code to find vaccination centers, use /states for more information`)
                return;
            }
            _that.getVaccinesInDistrict(districtCode, date, (r) => {
                _that.chunk(r.sessions, 10).forEach(ar => {
                    console.log('Sending.......', ar)
                    _that.buildAndSendMessage([{ validSlots: ar }], msg, r.sessions.length)
                })
            })
        });

        this.bot.onText(/\/vaccination(.)*/, function onText(msg) {
            let [cmd, pincode, age] = msg.text.split('_')
            console.log(msg.chat)
            if (!pincode) {
                _that.sendMessage(msg, `Please give me pin code to find vaccination center like <b>/vaccination_422010</b> or try /states to find center`)
            } else {
                _that.checkAvailability(pincode, age, (d) => {
                    console.log('vaccination', d)
                    let totalSize = d.validSlots.length;
                    _that.chunk(d.validSlots, 15).forEach(r => {
                        _that.buildAndSendMessage([{ validSlots: r }], msg, totalSize)
                    })
                })
            }
        })
    }
    chunk(array, size) {
        var result = [];
        if (size > array.length) {
            return [array];
        }
        while (array.length > 0) {
            result.push(array.splice(0, size))
        }
        return result;

    }
    sendMessage(msgObj, message) {
        console.info(`Telegram sending message to ::: ${msgObj.chat.id} :: ${msgObj.chat.first_name} :: ${msgObj.chat.username}:::\n ${message}`)
        // this.bot.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' })
        this.bot.sendMessage(msgObj.chat.id, message, { parse_mode: 'HTML' })
    }


    buildAndSendMessage(response, msgObj, totalSize?) {
        console.log('vaccination response', response, msgObj);
        let msg = `Hello ${msgObj.chat.first_name}, \n\nBelow are the details available as per covin website.\n\n`;
        if (!response || !response.length) {

            msg += `There is no information available on this location, you can try your /district for other possible locations.`
        } else {

            (response || []).forEach((e) => {

                if (e.validSlots && e.validSlots.length) {
                    msg += ` - ${e.validSlots.length} slots available \n\n`
                    e.validSlots.forEach(vs => {
                        msg += `\n\n<b>${vs.name}, ${vs.block_name}, ${vs.district_name}, ${vs.state_name} </b>\n`
                        msg += `Center Id : (${vs.center_id}) | ${vs.vaccine} (${vs.available_capacity}) | Fees : ${vs.fee} (${vs.fee_type}) | `
                        msg += `Date : <i>${vs.date}</i> | from ${vs.from} - ${vs.to} | Minimum age Limit : ${vs.min_age_limit} | `

                        msg += `<a href="https://maps.google.com/?q=${vs.lat},${vs.long}">Google map location</a>\n`
                        msg += `Center Timing as below:\n`
                        vs.slots.forEach(slot => {
                            msg += `${slot}\n`
                        })

                    });

                } else {
                    msg += ' - No Slots available, please check back again tomorrow !'
                }

            });
        }
        this.sendMessage(msgObj, msg)

    }
    checkAvailability(pincode, age, cbFun) {
        const result = {
            validSlots: []
        }
        let datesArray = this.fetchNextDays(2);
        let processed = 0;
        datesArray.forEach(date => {
            this.getSlotsForDate(pincode, date, age, (r) => {
                result.validSlots.push(...r)
                processed++;
                if (processed === datesArray.length - 1) {
                    console.log('Giving callback')
                    cbFun(result)
                }
            });
        })

    }

    getSlotsForDate(PINCODE, DATE, AGE, cbFun) {
        let config = {
            method: 'get',
            url: 'https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/findByPin?pincode=' + PINCODE + '&date=' + DATE,
            headers: {
                'accept': 'application/json',
                'Accept-Language': 'hi_IN'
            }
        };


        request(config.url, { json: true, header: config.headers }, (err, res, body) => {
            if (err) { return console.log(err); }
            console.log(config.url);
            cbFun(body.sessions)
        });
    }

    getStates(cbFun) {
        request('https://cdn-api.co-vin.in/api/v2/admin/location/states', {}, (err, res, body) => {
            if (err) { return console.log(err); }
            cbFun(JSON.parse(body))
        });
    }

    getDistricts(stateCode, cbFun) {

        request(`https://cdn-api.co-vin.in/api/v2/admin/location/districts/${stateCode}`, {}, (err, res, body) => {
            if (err) { return console.log(err); }
            cbFun(JSON.parse(body))
        });
    }

    getVaccinesInDistrict(districtCode, date, cbFun) {

        const url = `https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/findByDistrict?district_id=${districtCode}&date=${date}`;
        console.log(url)
        request(url, {}, (err, res, body) => {
            if (err) { return console.log(err); }
            cbFun(JSON.parse(body))
        });
    }

    fetchNextDays(count) {
        let dates = [];
        let today = moment();
        for (let i = 0; i < count; i++) {
            let dateString = today.format('DD-MM-YYYY')
            dates.push(dateString);
            today.add(1, 'day');
        }
        return dates;
    }


}

new VaccineNotifierTelegramBot()