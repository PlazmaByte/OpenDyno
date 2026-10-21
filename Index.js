const { GatewayHandler } = require('./Source/Client/GatewayHandler');

GatewayHandler.Start().then(client => {
    let shuttingDown = false;
    const shutdown = async signal => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[Shutdown] Received ${signal}; closing OpenDyno.`);
        client.destroy();
        await client.Database.Close();
        process.exitCode = 0;
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
}).catch(error => {
    console.error('[Startup] OpenDyno could not start:', error);
    process.exitCode = 1;
});
