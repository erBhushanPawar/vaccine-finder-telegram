var TelegramBot = require('./telegram-lib');
var moment = require('moment');
var request = require('request');
var TOKEN = '1619827676:AAGWd6i1z4unyzg-nCScX58RlERyU-9ACw8';
var options = {
    polling: true
};
var commandSupport = "\n\n/start - begin conversation\n/vaccination_411020 - pincode and age group wise vaccination center list\n/states - find your state for vaccination\n/district_21 - find your district code for vaccination\n/vaccineindistrict_369 - enter district code for all list of centers\n/thanks - Say Thanks to developer :)\n";
var VaccineNotifierTelegramBot = (function () {
    function VaccineNotifierTelegramBot() {
        this.bot = new TelegramBot(TOKEN, options);
        this.initCommands();
    }
    VaccineNotifierTelegramBot.prototype.initCommands = function () {
        console.log('OK');
        var _that = this;
        this.bot.onText(/\/start$/, function onText(msg) {
            console.log('start');
            _that.sendMessage(msg, 'Hi You can try any sample command from below to get started. \n\n' + commandSupport);
        });
        this.bot.onText(/\/thanks$/, function onText(msg) {
            console.log('thanks');
            _that.sendMessage(msg, 'Thank you for appreciating the efforts, you can send me a thank you note on  https://t.me/bhushan0310 to appreciate it.\n Thanks for using Vaccincation Notifier Bot. <a href="https://"></a> \n\nStay Safe. Stay Healthy.');
        });
        this.bot.onText(/\/states$/, function onText(msg) {
            var dmsg = '';
            _that.getStates(function (r) {
                dmsg = r.states.map(function (d) { return ("<b>" + d.state_name + "</b> /district_" + d.state_id); }).join('\n');
                _that.sendMessage(msg, dmsg);
            });
        });
        this.bot.onText(/\/district(.)*/, function onText(msg) {
            var _a = msg.text.split('_'), cmd = _a[0], stateCode = _a[1];
            var dmsg = '';
            if (!stateCode) {
                _that.sendMessage(msg, "Please provide a state code to find districts, use /states for more information");
                return;
            }
            _that.getDistricts(stateCode, function (r) {
                console.log(r);
                dmsg = r.districts.map(function (d) { return ("<b>" + d.district_name + "</b> /vaccineindistrict_" + d.district_id); }).join('\n');
                _that.sendMessage(msg, dmsg);
            });
        });
        this.bot.onText(/\/vaccineindistrict(.)*/, function onText(msg) {
            var _a = msg.text.split('_'), cmd = _a[0], districtCode = _a[1], date = _a[2];
            if (!date) {
                date = moment();
                date = date.format('DD-MM-YYYY');
            }
            if (!districtCode) {
                _that.sendMessage(msg, "Please provide a district code to find vaccination centers, use /states for more information");
                return;
            }
            _that.getVaccinesInDistrict(districtCode, date, function (r) {
                _that.chunk(r.sessions, 10).forEach(function (ar) {
                    console.log('Sending.......', ar);
                    _that.buildAndSendMessage([{ validSlots: ar }], msg, r.sessions.length);
                });
            });
        });
        this.bot.onText(/\/vaccination(.)*/, function onText(msg) {
            var _a = msg.text.split('_'), cmd = _a[0], pincode = _a[1], age = _a[2];
            console.log(msg.chat);
            if (!pincode) {
                _that.sendMessage(msg, "Please give me pin code to find vaccination center like <b>/vaccination_422010</b> or try /states to find center");
            }
            else {
                _that.checkAvailability(pincode, age, function (d) {
                    console.log('vaccination', d);
                    var totalSize = d.validSlots.length;
                    _that.chunk(d.validSlots, 15).forEach(function (r) {
                        _that.buildAndSendMessage([{ validSlots: r }], msg, totalSize);
                    });
                });
            }
        });
    };
    VaccineNotifierTelegramBot.prototype.chunk = function (array, size) {
        var result = [];
        if (size > array.length) {
            return [array];
        }
        while (array.length > 0) {
            result.push(array.splice(0, size));
        }
        return result;
    };
    VaccineNotifierTelegramBot.prototype.sendMessage = function (msgObj, message) {
        console.info("Telegram sending message to ::: " + msgObj.chat.id + " :: " + msgObj.chat.first_name + " :: " + msgObj.chat.username + ":::\n " + message);
        // this.bot.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' })
        this.bot.sendMessage(msgObj.chat.id, message, { parse_mode: 'HTML' });
    };
    VaccineNotifierTelegramBot.prototype.buildAndSendMessage = function (response, msgObj, totalSize) {
        console.log('vaccination response', response);
        var msg = "Hello " + msgObj.first_name + ", \n\nBelow are the details available as per covin website.\n\n";
        if (!response || !response.length) {
            msg += "There is no information available on this location, you can try your /district for other possible locations.";
        }
        else {
            (response || []).forEach(function (e) {
                if (e.validSlots && e.validSlots.length) {
                    msg += " - " + e.validSlots.length + " slots available \n\n";
                    e.validSlots.forEach(function (vs) {
                        msg += "\n\n<b>" + vs.name + ", " + vs.block_name + ", " + vs.district_name + ", " + vs.state_name + " </b>\n";
                        msg += "Center Id : (" + vs.center_id + ") | " + vs.vaccine + " (" + vs.available_capacity + ") | Fees : " + vs.fee + " (" + vs.fee_type + ") | ";
                        msg += "Date : <i>" + vs.date + "</i> | from " + vs.from + " - " + vs.to + " | Minimum age Limit : " + vs.min_age_limit + " | ";
                        msg += "<a href=\"https://maps.google.com/?q=" + vs.lat + "," + vs.long + "\">Google map location</a>\n";
                        msg += "Center Timing as below:\n";
                        vs.slots.forEach(function (slot) {
                            msg += slot + "\n";
                        });
                    });
                }
                else {
                    msg += ' - No Slots available';
                }
            });
        }
        this.sendMessage(msgObj, msg);
    };
    VaccineNotifierTelegramBot.prototype.checkAvailability = function (pincode, age, cbFun) {
        var _this = this;
        var result = {
            validSlots: []
        };
        var datesArray = this.fetchNextDays(2);
        var processed = 0;
        datesArray.forEach(function (date) {
            _this.getSlotsForDate(pincode, date, age, function (r) {
                (_a = result.validSlots).push.apply(_a, r);
                processed++;
                if (processed === datesArray.length - 1) {
                    console.log('Giving callback');
                    cbFun(result);
                }
                var _a;
            });
        });
    };
    VaccineNotifierTelegramBot.prototype.getSlotsForDate = function (PINCODE, DATE, AGE, cbFun) {
        var config = {
            method: 'get',
            url: 'https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/findByPin?pincode=' + PINCODE + '&date=' + DATE,
            headers: {
                'accept': 'application/json',
                'Accept-Language': 'hi_IN'
            }
        };
        request(config.url, { json: true, header: config.headers }, function (err, res, body) {
            if (err) {
                return console.log(err);
            }
            console.log(config.url);
            cbFun(body.sessions);
        });
    };
    VaccineNotifierTelegramBot.prototype.getStates = function (cbFun) {
        console.log('getStates')
        request('https://cdn-api.co-vin.in/api/v2/admin/location/states', {}, function (err, res, body) {
            if (err) {
                return console.log(err);
            }
            cbFun(JSON.parse(body));
        });
    };
    VaccineNotifierTelegramBot.prototype.getDistricts = function (stateCode, cbFun) {
        request("https://cdn-api.co-vin.in/api/v2/admin/location/districts/" + stateCode, {}, function (err, res, body) {
            if (err) {
                return console.log(err);
            }
            cbFun(JSON.parse(body));
        });
    };
    VaccineNotifierTelegramBot.prototype.getVaccinesInDistrict = function (districtCode, date, cbFun) {
        var url = "https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/findByDistrict?district_id=" + districtCode + "&date=" + date;
        console.log(url);
        request(url, {}, function (err, res, body) {
            if (err) {
                return console.log(err);
            }
            cbFun(JSON.parse(body));
        });
    };
    VaccineNotifierTelegramBot.prototype.fetchNextDays = function (count) {
        var dates = [];
        var today = moment();
        for (var i = 0; i < count; i++) {
            var dateString = today.format('DD-MM-YYYY');
            dates.push(dateString);
            today.add(1, 'day');
        }
        return dates;
    };
    return VaccineNotifierTelegramBot;
})();
exports.VaccineNotifierTelegramBot = VaccineNotifierTelegramBot;
new VaccineNotifierTelegramBot();
