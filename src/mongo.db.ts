import { connect } from 'mongoose';
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

    async insert(entry) {
        await UsersModel.create(entry)
        console.log('Added to DB', entry);

    }
}
