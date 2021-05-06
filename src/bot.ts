import * as TelegramBot from './telegram-lib';
import * as dbmgr from './mongo.db';
import * as redisCache from './db/redis-cache';
import { districts, states } from './db/master.data';

const moment = require('moment');
const request = require('request');

let developerChatId = '1216194906'
var TOKEN = process.env.TOKEN;

var options = {
    polling: true
};
const msgObjs = []
let isBlocked = false;
let commandSupport = `
Welcome to Vaccination Finder,
This bot can help you find the vaccination for you and your family. 

🎉🎉🎉🎉🎉

New features announcement

You can now search
- Improved Data sources, and supporting Rural and Nearby Areas
- weekly schedule for given center
- See weekly stock availability and much more

🎉🎉🎉🎉🎉


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
    redisCache = new redisCache.RedisCache()
    constructor() {
        this.bot = new TelegramBot(TOKEN, options)
        this.bot.on("polling_error", console.log);
        this.initCommands()
        console.log('BOT OK')
        //this.sendAnnouncement()
    }

    sendAnnouncement() {
        this.dbm.find().then((d) => {
            d = JSON.parse(JSON.stringify(d))
            d.forEach((e, i) => {
                if (i < 1) {
                    console.log('Sending announcement to', e)
                    this.sendMessage({ chat: e }, `Hello ${e.first_name}\n\n 
🚨🚨🚨
<b>Important : Security and Verification Request by Telegram</b>

Dear valued user,
Some users (and you may also in future) get Verification request by Telegram. <b>This request is sent by Telegram and not by our bot.</b>
This is sent to check users on highly active bots and channels by Telegram automatically to confirm that your are REAL users and not other bots. 

If you are requested the same, please complete the process without worrying that your information may be compromized.
(Please see screenshot of verification request.)
** WE don't get any information about your verification **

Also,

In case you were facing server unavailable from yesterday, it was because of request limit imposed by government website. 
We worked hard to resolve that issue for now and it should be good. But they can only serve 100 requests per 5 minutes, so we will try to respond you as soon as possible. 
In case of request limit is reached on our end then we will respond after some time automatically, you are requested to wait for some time.

🙏 We request your support in this time. 🙏
Stay safe. Stay Healthy. Strong Together !
                    `)
                    this.bot.sendPhoto(e.id, 'https://originscan.in/assets/image/telegram-real-user.jpeg')
                }
            });
        })
    }

    initCommands() {
        const _that = this;
        this.bot.onText(/\/start$/, function onText(msg) {
            msgObjs.push(msg.chat)
            _that.bot.sendMessage(developerChatId, `isBlocked ? ${isBlocked} : ${msg.chat.first_name}, started using bot ! their username is ${msg.chat.username || 'Not known'}`)
            _that.sendMessage(msg,
                `${isBlocked ? '<b>CURRENTLY WE ARE NOT ABLE TO GET RESPONSE FROM COWIN WEBSITE API, PLEASE TRY LATER OR CHECK ON <a href="https://www.cowin.gov.in/home">CoWIN Website</a></b>\n\n\n\n\n' : ''} ${commandSupport}`)
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
                if (!r) {
                    _that.sendMessage(msg, 'Server is busy or not reponding at the moment, please try again later. Please check on official website here on <a href="https://www.cowin.gov.in/home">CoWIN Website</a>')
                    return;
                }
                dmsg = r.states.map(d => `<b>${d.state_name}</b> /district_${d.state_id}`).join('\n')
                _that.sendMessage(msg, dmsg)
            })
        });
        this.bot.onText(/\/districtlevel*/, function onText(msg) {
            let [cmd, districtCode, date] = msg.text.split('_')
            if (!date) {
                date = moment();
                date = date.format('DD-MM-YYYY')
            }
            if (!districtCode) {
                _that.sendMessage(msg, `Please provide a district code to find vaccination centers, use /states for more information`)
                return;
            }
            _that.getForWeekByDistrict(date, districtCode, (d) => {
                if (!d) {
                    _that.sendMessage(msg, 'Server is busy or not reponding at the moment, please try again later. Please check on official website here on <a href="https://www.cowin.gov.in/home">CoWIN Website</a>')
                    return;
                }
                console.log('vaccination', d)
                let msgStr = `Hello ${msg.chat.first_name}, there are total ${d.centers.length} available centers for next 7 days, starting from ${date}`
                msgStr += `\n(This data get updated on daily basis, so we recommend to keep checking)\n\n`

                // d.centers = d.centers.sort((a, b) => a.name - b.name)
                d.centers.forEach((c, i) => {
                    let sum = 0;
                    let minAge = 100;
                    let v = Array.from(new Set(c.sessions.map(s => s.vaccine)))
                    c.sessions.forEach(s => {
                        sum += Number(s.available_capacity || 0)
                        if (minAge > s.min_age_limit) {
                            minAge = s.min_age_limit
                        }
                    });
                    msgStr += `\n<b>${c.name}</b>, \n${c.district_name} (${c.pincode}) | age limit ${minAge} | Fees : ${c.fee_type}\nVaccines ${v} | Week Capacity : ${sum}\n<b>More Details ? /slotsinweek_${date.replace(/-/g, '_')}_${districtCode}_${c.center_id}</b>\n\n`
                    setTimeout(() => {
                        _that.redisCache.setVal(`${date.replace(/-/g, '_')}_${districtCode}_${c.center_id}`, JSON.stringify(c)).then(x => { })
                    }, 0);
                    if ((i + 1) % 20 === 0) {
                        _that.sendMessage(msg, msgStr)
                        msgStr = `Continued.....,\n\n starting date from ${date}\n\n`
                    }
                })
                if ((d.centers.length + 1) % 20 !== 0) {
                    _that.sendMessage(msg, msgStr)
                }
            })
        })
        this.bot.onText(/\/district(.)*/, function onText(msg) {
            let [cmd, stateCode] = msg.text.split('_')
            let dmsg = ''
            if (!stateCode) {
                _that.sendMessage(msg, `Please provide a state code to find districts, use /states for more information`)
                return;
            }
            _that.getDistricts(stateCode, (r) => {
                dmsg = r.districts.map(d => `\n\n<b>${d.district_name}</b>\n     Main Centers: /vaccineindistrict_${d.district_id}\n     Rural and Nearby: /districtlevel_${d.district_id}`).join('\n')
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
                if (!r) {
                    _that.sendMessage(msg, 'Server is busy or not reponding at the moment, please try again later. Please check on official website here on <a href="https://www.cowin.gov.in/home">CoWIN Website</a>')
                    return;
                }
                _that.chunk(r.sessions, 10).forEach(ar => {
                    console.log('Sending.......', ar)
                    _that.buildAndSendMessage([{ validSlots: ar }], msg, districtCode)
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
                    if (!d) {
                        _that.sendMessage(msg, 'Server is busy or not reponding at the moment, please try again later. Please check on official website here on <a href="https://www.cowin.gov.in/home">CoWIN Website</a>')
                        return;
                    }
                    console.log('vaccination', d)
                    let totalSize = d.validSlots.length;
                    _that.chunk(d.validSlots, 15).forEach(r => {
                        _that.buildAndSendMessage([{ validSlots: r }], msg)
                    })
                })
            }
        })

        this.bot.onText(/\/slotsinweek(.)*/, function onText(msg) {
            let key = msg.text.replace('/slotsinweek_', '')
            _that.redisCache.getVal(key).then(v => {
                if (v) {
                    try {
                        v = JSON.parse(v)
                    } catch (error) {

                    }
                    let msgStr = `Hello ${msg.chat.first_name}, below details are available for next 7 days\n\n`
                    msgStr += `\n<b>${v.name}</b>, \n${v.district_name}, ${v.state_name}, ${v.pincode}\n\n`
                    v.sessions.forEach(session => {
                        msgStr += `\n<i>${session.date}</i> | Capacity ${session.available_capacity} | min age ${session.min_age_limit}`
                    })
                    _that.sendMessage(msg, msgStr)
                }
            })
        })
        this.bot.onText(/\/week(.)*/, function onText(msg) {
            let [cmd, pincode, date] = msg.text.split('_')
            console.log(msg.chat)
            if (!pincode) {
                _that.sendMessage(msg, `Please give me pin code to find vaccination center like <b>/week_422010</b>`)
            } else {
                if (!date) {
                    date = moment();
                    date = date.format('DD-MM-YYYY')
                }
                _that.getForWeek(date, pincode, (d) => {
                    if (!d) {
                        _that.sendMessage(msg, 'Server is busy or not reponding at the moment, please try again later. Please check on official website here on <a href="https://www.cowin.gov.in/home">CoWIN Website</a>')
                        return;
                    }
                    console.log('vaccination', d)
                    let msgStr = `Hello ${msg.chat.first_name}, there are total ${d.centers.length} available centers for next 7 days, starting from ${date}`
                    msgStr += `\n(This data get updated on daily basis, so we recommend to keep checking)\n\n`
                    d.centers.forEach((c, i) => {
                        let sum = 0;
                        c.sessions.forEach(s => {
                            sum += Number(s.available_capacity || 0)
                        });
                        msgStr += `\n<b>${c.name}</b>, \n${c.district_name}, ${c.state_name}, ${c.pincode}\n`
                        msgStr += `<b>Total Weekly Capacity: ${sum}</b> | For Details /slotsinweek_${date.replace(/-/g, '_')}_${pincode}_${c.center_id}\n`
                        _that.redisCache.setVal(`${date.replace(/-/g, '_')}_${pincode}_${c.center_id}`, JSON.stringify(c))
                        if ((i + 1) % 10 === 0) {
                            _that.sendMessage(msg, msgStr)
                            msgStr = `Continued.....,\n\n starting date from ${date}\n\n`
                        }
                    })
                    if ((d.centers.length + 1) % 10 !== 0) {
                        _that.sendMessage(msg, msgStr)
                    }
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
        if (message && message.length)
            this.bot.sendMessage(msgObj.chat.id, message, { parse_mode: 'HTML' })
    }


    buildAndSendMessage(response, msgObj, districtCode?) {
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
                        msg += `Center Id : (${vs.center_id}) | pincode : ${vs.pincode} | ${vs.vaccine} (${vs.available_capacity}) | Fees : ${vs.fee} (${vs.fee_type}) | `
                        msg += `Date : <i>${vs.date}</i> | from ${vs.from} - ${vs.to} | Minimum age Limit : ${vs.min_age_limit} | `

                        msg += `<a href="https://maps.google.com/?q=${vs.lat},${vs.long}">Google map location</a>\n`
                        msg += `<b>Weekly Schedule ? /week_${vs.pincode}</b>`

                    });

                } else {
                    msg += ' - No Slots available, please check back again tomorrow !' + (districtCode ? ` Or try /districtlevel_${districtCode}` : '')
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
        const url = 'https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/findByPin?pincode=' + PINCODE + '&date=' + DATE
        this.makeGetRequest(url, cbFun)
    }

    getForWeek(date, pincode, cbFun) {
        const url = `https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByPin?pincode=${pincode}&date=${date}`
        this.makeGetRequest(url, cbFun)
    }

    getForWeekByDistrict(date, district_id, cbFun) {
        const url = `https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByDistrict?district_id=${district_id}&date=${date}`
        this.makeGetRequest(url, cbFun)
    }

    getStates(cbFun) {
        cbFun({ "states": states, "ttl": 24 })
    }

    setBlockedStatus() {
        isBlocked = true;
        setTimeout(() => {
            isBlocked = false;
        }, 7 * 60 * 1000); // 7 min
    }

    getDistricts(stateCode, cbFun) {
        cbFun(cbFun({ "districts": districts[stateCode], "ttl": 24 }))
    }

    makeGetRequest(url, cbFun) {
        const options = {
            url,
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36' }
        };

        request(options, function (err, res, body) {
            try {
                let json = JSON.parse(body);
                console.log(json);
                cbFun(json)
            } catch (error) {
                cbFun(null)
            }
        });
    }

    getVaccinesInDistrict(districtCode, date, cbFun) {
        const url = `https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/findByDistrict?district_id=${districtCode}&date=${date}`;
        console.log(url)
        this.makeGetRequest(url, cbFun)
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
