import * as TelegramBot from './telegram-lib';
import * as dbmgr from './mongo.db';
import * as redisCache from './db/redis-cache';
import { districts, states } from './db/master.data';
import { RMQ } from './processor/rabbitmq';
import { TelegramProcessor } from './processor/telegram.processor';
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

πππππ

New features announcement

You can now search
- Subscribe to your district data source use /subscribe
- GET notification when slot is available

- Improved Data sources, and supporting Rural and Nearby Areas
- weekly schedule for given center
- See weekly stock availability and much more
πππππ


You can search by your pincode directly to get nearby vaccination centers, like below.
/vaccination_411020 - pincode and age group wise vaccination center list 4β£1β£1β£0β£2β£0β£


Or if you dont know pincode then you can start looking for centers in district, start searching for your state and then by district
/states - find your state for vaccination πΊπΊ

If you know district code (or try /states) you can search directly by 
/vaccineindistrict_151 - enter district code for all list of centers ππ

If you like the concept of bot or like to appreciate this effort please send a small thank you like this.
/thanks - Say Thanks to developer :) β€οΈ

Thank you,
Vaccination Finder Bot
`
export class VaccineNotifierTelegramBot {
    bot;
    dbm = new dbmgr.DBManager();
    redisCache = new redisCache.RedisCache()
    rmqMgr = null;
    telegramProcessor
    constructor() {
        this.bot = new TelegramBot(TOKEN, options)
        this.telegramProcessor = new TelegramProcessor(this.bot)
        this.bot.on("polling_error", console.log);
        this.initCommands()
        console.log('BOT OK')
        this.rmqMgr = new RMQ()
        setInterval(() => {
            this.dbm.groupByDistrictCode().then(r => {
                let count = 0;
                r = r.sort(() => .5 - Math.random()).slice(0, 70);
                r.forEach(e => {

                    if (e._id) {
                        console.log('publishing job for district code', e._id, ++count)
                        this.rmqMgr.publish({ districtCode: e._id, ...e })
                    }

                });
            })

            // this.bot.sendMessage(developerChatId, 'Heartbeat.')

        }, 3 * 60 * 1000)

    }
    sendAnnouncement() {
        this.dbm.find().then((d) => {
            d = JSON.parse(JSON.stringify(d))
            d.forEach((e, i) => {
                if (i < 1) {
                    console.log('Sending announcement to', e)
                    this.sendMessage({ chat: e }, `
Hello ${e.first_name}

πππππ

<b>Auto filter with AGE</b>

πππππ

<b>ONLY For all subscribed users</b> we have introduced new feature for filtering results as per age, to update your preferences please click /age . 

In case you are not subscribed yet please follow below to get notified.

Click /subscribe > then select your <b>state</b> > then your <b>district</b> > then centers near you (optional)

To get started type or click on /subscribe
To unsubscribe anytime click on /unsubscribe
To snooze click /snooze

/thanks - If you like efforts and tool is helping you, you may send appreciation message to developer

Stay safe. Stay Healthy. Strong Together !


(attached message to forward to your contacts)
                    `)
                    setTimeout(() => {
                        this.sendMessage({ chat: e }, `Hello,

I found ππ <b>Vaccincation Center Finder bot</b> π€π€ on Telegramπ± \nwho helped me to find vaccination centers by
pincode 4β£2β£2β£0β£1β£0β£,\nstates πΊπΊ\ndistrict wise πΎπΎ\nCenter Wise\nWeek wise and \nYou can subscribe for updates and get automatic notifications when there is a slot near your.\nYou can try it here, its very simple, elegant and FREE\n\n
https://t.me/VaccineNotifier_IN_bot\n\nPlease Install Telegram before you click bot link, install telegram here https://telegram.org/`);
                    }, 5000);
                }
            });
        })
    }

    initCommands() {
        const _that = this;
        this.bot.onText(/\/start$/, function onText(msg) {
            msgObjs.push(msg.chat)
            _that.sendMessage(msg,
                `${isBlocked ? '<b>CURRENTLY WE ARE NOT ABLE TO GET RESPONSE FROM COWIN WEBSITE API, PLEASE TRY LATER OR CHECK ON <a href="https://www.cowin.gov.in/home">CoWIN Website</a></b>\n\n\n\n\n' : ''} ${commandSupport}`)
            setTimeout(() => {
                _that.sendMessage(msg, `Google Maps search results in your area as below: \nhttps://www.google.com/maps/search/vaccination+centres+near+me/\n\nWe dont\'t assure of these results, you may want to contact centers before reaching physically.'`)
            }, 5000);
            _that.dbm.insert(msg.chat, (isNew) => {
                _that.bot.sendMessage(developerChatId, `isNew ? ${isNew} : ${msg.chat.first_name}, started using bot ! their username is ${msg.chat.username || 'Not known'}`)

            })
        });

        this.bot.onText(/\/thanks$/, function onText(msg) {
            console.log('thanks')
            _that.bot.sendMessage(developerChatId, `${msg.chat.first_name}, said thank you ! their username is ${msg.chat.username}`)
            _that.sendMessage(msg, 'Thank you for appreciating the efforts, you can send me a thank you note on  https://t.me/bhushan0310 to appreciate it.\nThanks for using Vaccincation Finder Bot, I hope it will helped you and your family.\n <a href="https://"></a> \n\nStay Safe. Stay Healthy.')
            _that.sendMessage(msg, `Hello,

I found ππ Vaccincation Center Finder bot π€π€ on telegramπ± and it helped me to find vaccination centers by
pincode 4β£2β£2β£0β£1β£0β£,\nstates πΊπΊ\ndistrict wise πΎπΎ\n You can subscribe for updates and get automatic notifications when there is a slot near your.\nYou can try it here, its very simple, elegant and FREE\n\n
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
            let [cmd, districtCode, withZero] = msg.text.split('_')

            let date = moment();
            date = date.format('DD-MM-YYYY')
            if (!withZero) {
                setTimeout(() => {
                    _that.sendMessage(msg, `Want centers with zero available vaccine too? click /districtlevel_${districtCode}_true`)

                }, 5000);
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
                console.log('vaccination', districtCode, date, d)
                let msgStr = `Hello ${msg.chat.first_name}, there are total ${d.centers.length} available centers for next 7 days, starting from ${date}`
                msgStr += `\n(This data get updated on daily basis, so we recommend to keep checking). <b>But result will only show where slot is available.</b>\n\n`

                d.centers.map(c => {
                    let sum = 0;
                    let minAge = 100;
                    let v = Array.from(new Set(c.sessions.map(s => s.vaccine)))
                    c.sessions.forEach(s => {
                        sum += Number(s.available_capacity || 0)
                        if (minAge > s.min_age_limit) {
                            minAge = s.min_age_limit
                        }
                    });
                    c.minAge = minAge;
                    c.sum = sum;
                    c.vaccines = v;
                })
                console.log(JSON.stringify(d.centers))
                d.centers = d.centers.sort((a, b) => b.sum - a.sum)
                let added = 0;
                d.centers.forEach((c, i) => {
                    if (!withZero && c.sum > 0) {
                        msgStr += `\n<b>${c.name}</b>, \n${c.district_name} (${c.pincode}) | age limit ${c.minAge} | Fees : ${c.fee_type}\nVaccines ${c.vaccines} | Week Capacity : ${c.sum}\n<b>More Details ? /slotsinweek_${date.replace(/-/g, '_')}_${districtCode}_${c.center_id}</b>\n\n`
                        added++;
                    }
                    if (withZero) {
                        added++
                        msgStr += `\n<b>${c.name}</b>, \n${c.district_name} (${c.pincode}) | age limit ${c.minAge} | Fees : ${c.fee_type}\nVaccines ${c.vaccines} | dose 1 ${c.available_capacity_dose1} | dose 2 ${c.available_capacity_dose2} | Week Capacity : ${c.sum}\n<b>More Details ? /slotsinweek_${date.replace(/-/g, '_')}_${districtCode}_${c.center_id}</b>\n\n`

                    }
                    setTimeout(() => {
                        _that.redisCache.setVal(`${date.replace(/-/g, '_')}_${districtCode}_${c.center_id}`, JSON.stringify(c)).then(x => { })
                    }, 0);
                    if ((added + 1) % 20 === 0) {
                        _that.sendMessage(msg, msgStr)
                        msgStr = `Continued.....,\n\n starting date from ${date}\n\n`
                    }
                })
                if ((added) % 20 !== 0) {
                    _that.sendMessage(msg, msgStr)
                }
            })
        })
        this.bot.onText(/\/district_(.)*/, function onText(msg) {
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


        this.bot.onText(/\/snooze*/, function onText(msg) {
            let chatId = msg.chat.id;
            let date = new Date()
            date.setHours(date.getHours() + 5)
            _that.dbm.update({ id: chatId }, { pausedTill: date.getTime() })
            _that.bot.sendMessage(msg.chat.id, 'You are snoozed from notification list for 5 Hrs. It will resume automatically.')
        })

        this.bot.onText(/\/unsubscribe*/, function onText(msg) {
            let chatId = msg.chat.id;
            _that.dbm.update({ id: chatId }, { subscriptionURLs: [], centerIds: [], pausedTill: null, dose: null })
            _that.bot.sendMessage(msg.chat.id, 'You are unsubscribed from the notification list, thanks for using Vaccination Finder. You can /subscribe anytime later.')
        })

        this.bot.onText(/\/subscribe*/, function onText(msg) {
            var opts = {
                reply_markup: {
                    inline_keyboard: _that.chunk(JSON.parse(JSON.stringify(states)), 4).map((stateChunk, i) => {
                        return stateChunk.map((state) => {
                            return { text: state.state_name, callback_data: 'state_' + state.state_id }
                        })
                    })
                }

            };
            _that.bot.sendMessage(msg.chat.id, 'What is your state ?', opts)

        })
        this.bot.onText(/\/age*/, function onText(msg) {
            var opts = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '45+', callback_data: 'age_45' }, { text: '18+', callback_data: 'age_18' }]

                    ]
                }

            };
            _that.bot.sendMessage(msg.chat.id, 'For which age range you want notifications?', opts)

        })
        this.bot.onText(/\/dose*/, function onText(msg) {
            var opts = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '1', callback_data: 'dose_1' }, { text: '2', callback_data: 'dose_2' }]

                    ]
                }

            };
            _that.bot.sendMessage(msg.chat.id, 'For which Dose you want notifications ?', opts)
        })
        this.bot.onText(/\/filterCenter*/, function onText(msg) {
            let [cmd, value] = msg.text.split('_')
            if (value === 'reset') {
                _that.filterCenter(msg.chat.id, value)
            } else {
                _that.requestCenters(msg.chat.id, value)
            }

        })
        this.bot.on("callback_query", function (callbackQuery) {
            // 'callbackQuery' is of type CallbackQuery
            console.log(JSON.stringify(callbackQuery));
            let [type, value] = callbackQuery.data.split('_')
            let chatId = callbackQuery.from.id;
            switch (type) {
                case 'state':
                    _that.dbm.update({ id: chatId }, { state: value })
                    _that.requestDistrict(chatId, value)
                    break;
                case 'age':
                    _that.dbm.update({ id: chatId }, { age: Number(value) })
                    _that.bot.sendMessage(developerChatId, 'Updated age preferences' + value + ' chat id ' + chatId)
                    _that.bot.sendMessage(chatId, 'Understood you will now get filtered notifications for ' + value)
                    break;
                case 'dose':
                    _that.dbm.update({ id: chatId }, { dose: Number(value) })
                    _that.bot.sendMessage(developerChatId, 'Updated dose preferences' + value + ' chat id ' + chatId)
                    _that.bot.sendMessage(chatId, 'Now you will get notifications for dose ' + value)
                    break;
                case 'filterCenter':
                    _that.filterCenter(chatId, value)
                    break;
                case 'district':
                    _that.dbm.update({ id: chatId }, {
                        district: value,
                        subscriptionURLs: [
                            `https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByDistrict?district_id=${value}`,
                            `https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/findByDistrict?district_id=${value}`
                        ]
                    })
                    _that.bot.sendMessage(developerChatId, `${callbackQuery.from.first_name}, subscribed !`)
                    //_that.requestCenters(chatId, value)
                    _that.sendMessage({ chat: { id: chatId } }, `Great, you are subscribed to district code ${value}, let me know your filters as below.\n\n/age set age range filter.\n/dose - set Dose preferences\n/filterCenter_${value} to set center preferences (optional)\n/filterCenter_reset - reset center preferences`)
                    _that.sendMessage({ chat: { id: chatId } }, `
You are all set,

I understood when to get back to you, and will let you know for nearby/district level centers.\n 
Anytime you can update your subscription and<b> ONLY 1</b> subscription per user at district level allowed for now.\n

Please note that we will keep trying automatically with your latest subscription and only inform you if there is any match/slot found.

You can /unsubscribe anytime later.
In case you want to snooze messages use /snooze - this will not send messages for next 5 hours
Thanks!
`)
                    break;
                default:
                    break;
            }
            _that.bot.answerCallbackQuery(callbackQuery.id, 'Okay, got it !')
        });
    }
    filterCenter(chatId, value) {
        if (value == 'reset') {
            this.dbm.update({ id: chatId }, { centerIds: [] })
            this.bot.sendMessage(chatId, 'Filters for center Ids are removed.')
        } else {

            this.dbm.updateCenterList({ id: chatId }, value)
            this.bot.sendMessage(chatId, 'Filters updated.')
        }

    }
    requestDistrict(chatId, state_id) {
        var opts = {
            reply_markup: {
                inline_keyboard:
                    this.chunk(JSON.parse(JSON.stringify(districts[state_id])), 4).map((districtChunk, i) => {
                        return districtChunk.map((district) => {
                            return { text: district.district_name, callback_data: 'district_' + district.district_id }
                        })
                    })
            }

        };
        this.bot.sendMessage(chatId, 'Great, Click on your district to subscribe.', opts)


    }
    requestCenters(chatId, districtCode) {

        let date = moment();
        date = date.format('DD-MM-YYYY')
        this.getForWeekByDistrict(date, districtCode, (d) => {
            if (!d) {
                this.bot.sendMessage(chatId, 'Please try again later after 2-3 minutes we have reached the API limit.')
                return;
            }
            var opts = {
                reply_markup: {
                    inline_keyboard:
                        d.centers.map((center) => {
                            return [{ text: `${center.name}, ${center.block_name}, ${center.pincode}`, callback_data: 'filterCenter_' + center.center_id }]
                        })
                }
            };
            this.bot.sendMessage(chatId, 'Okay, now click on all centers you like to subscribe to.', opts)
        })

        this.getVaccinesInDistrict(districtCode, date, (r) => { //fixed date for data
            if (!r) {
                this.bot.sendMessage(chatId, 'Please try again later after 2-3 minutes we have reached the API limit.')
                return;
            }
            var opts = {
                reply_markup: {
                    inline_keyboard:
                        (r && r.sessions || []).map((center) => {
                            return [{ text: `${center.name}, ${center.block_name}, ${center.pincode}`, callback_data: 'filterCenter_' + center.center_id }]
                        })
                }
            };
            console.log('sessions', r)
            this.bot.sendMessage(chatId, 'Here are few more centers, now click on all centers you like to subscribe to.', opts)
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
            this.telegramProcessor.sendMessage(msgObj.chat.id, message)
        //this.bot.sendMessage(msgObj.chat.id, message, { parse_mode: 'HTML' })
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
        console.log('Looking for ', stateCode)
        cbFun(cbFun({ "districts": JSON.parse(JSON.stringify(districts[stateCode])), "ttl": 24 }))
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
