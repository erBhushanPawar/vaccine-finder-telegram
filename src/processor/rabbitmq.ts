let amqp = require('amqplib/callback_api');
export class RMQ {
    channel = null;
    queue = 'task_queue';
    constructor() {
        this.init();
    }

    init() {
        const _that = this;
        amqp.connect('amqp://localhost', function (error0, connection) {
            if (error0) {
                throw error0;
            }
            connection.createChannel(function (error1, channel) {
                if (error1) {
                    throw error1;
                }

                channel.assertQueue(_that.queue, {
                    durable: true
                });

                _that.channel = channel;
                console.log(" [x] Connected '%s'");
            });

        });
    }
    publish(msg) {
        if (typeof msg === 'object') {
            msg = JSON.stringify(msg);
        }
        this.channel.sendToQueue(this.queue, Buffer.from(msg), {
            persistent: true
        });
    }
}