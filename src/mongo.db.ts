import { connect } from 'mongoose';
import { query } from 'winston';
import MsgsModel from './db/msgs.model';
import UsersModel from './db/users.model';
import { logger } from './logger';


const { MONGO_HOST = "localhost", MONGO_PORT = "27017", MONGO_DATABASE = "vaccineNotifierBot" } = process.env;

export const appConfig = {
    database: {
        url: `mongodb://${MONGO_HOST}:${MONGO_PORT}/${MONGO_DATABASE}`,
        options: {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            useFindAndModify: false,
        },
    },
    databaseQueryLimit: 10,
};



export class DBManager {
    constructor() {
        this.connectToDatabase()
    }
    private connectToDatabase() {
        connect(appConfig.database.url, appConfig.database.options)
            .then(() => {
                logger.info('🟢 The database is connected.');
            })
            .catch((error: Error) => {
                logger.error(`🔴 Unable to connect to the database: ${error}.`);
            });
    }

    async insert(entry, cbFun?) {
        try {
            UsersModel.findOne({ id: entry.id }).then((user) => {
                if (user) {
                    cbFun(false)
                    console.log('Returning user', entry); return
                }
                UsersModel.create(entry)
                cbFun(true)
                console.log('Added to DB', entry);
            })
        } catch (error) {

        }
    }
    async find(query = {}, skip = 0, limit = 5000) {
        console.log('Find in DB', query);
        const r = await UsersModel.find(query, {}, { skip, limit })
        return r;
    }
    async groupByDistrictCode() {
        console.log('Find in DB', query);
        const r = await UsersModel.aggregate([{ $group: { _id: "$district", users: { $push: "$$ROOT" } } }]);
        return r;
    }
    async update(query = {}, newData) {
        console.log('Update in DB', query, newData);
        const r = await UsersModel.updateOne(query, { ...newData })
        return r;
    }
    async updateCenterList(query = {}, centerId) {
        console.log('Update centers in DB', query, centerId);
        const r = await UsersModel.updateOne(query, { $push: { centerIds: centerId } })
        return r;
    }

    async delete(chatId) {
        console.log('Update centers in DB', query);
        const r = await UsersModel.deleteOne({ id: chatId })
        return r;
    }

    async saveMsg(obj) {
        //console.log('Save msg in db', obj);
        const r = await MsgsModel.create(obj)
        return r;
    }
}
