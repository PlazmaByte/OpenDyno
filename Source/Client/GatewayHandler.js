const { OpenDynoClient } = require('./OpenDynoClient');

class GatewayHandler {
    static async Start() {
        const client = new OpenDynoClient();
        await client.Start();
        return client;
    }
}

module.exports = { GatewayHandler };
