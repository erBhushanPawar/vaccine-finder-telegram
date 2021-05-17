import * as dbmgr from '../mongo.db';

export class TelegramProcessor {
    sharedBotInstance = null;
    static instance: TelegramProcessor;
    dbm = new dbmgr.DBManager();
    constructor(botInstance) {
        this.sharedBotInstance = botInstance;
    }
    getI() {
        if (!TelegramProcessor.instance) {
            return null;
        }
        return TelegramProcessor.instance;
    }

    sendMessage(chatId, message, opts) {
        const _that = this;

        let msgObj: any = { message, msgId: this.getMsgId(), chatId, acceptedOn: new Date().getTime() }
        message += '\n\n\n' + 'MsgId : ' + msgObj.msgId
        this.sharedBotInstance.sendMessage(chatId, message, { parse_mode: 'HTML', ...opts })
            .then(() => {
                console.log('Delivered message to', chatId)//.substring(0, 500))
                msgObj.deliveredOn = new Date().getTime();
                _that.dbm.saveMsg(msgObj)
            })
            .catch(function (error) {
                if (error.response && error.response.statusCode === 403) {
                    console.warn('blocked by, removing from db', chatId)
                    _that.dbm.delete(chatId)
                }
                msgObj.failedOn = new Date().getTime();
                _that.dbm.saveMsg(msgObj)
            });
    }
    getMsgId(length = 6) {
        const result = []
        var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var charactersLength = characters.length;
        for (var i = 0; i < length; i++) {
            result.push(characters.charAt(Math.floor(Math.random() *
                charactersLength)));
        }
        return result.join('');
    }
}