const path = require('node:path');

require('dotenv').config();

const AppConfig = Object.freeze({
    Token: process.env.DISCORD_TOKEN,
    ClientId: process.env.DISCORD_CLIENT_ID,
    DatabaseUrl: process.env.DATABASE_URL,
    DataFile: process.env.OPENDYNO_DATA_FILE || path.join(process.cwd(), 'Data', 'OpenDyno.sqlite'),
    DefaultPrefix: '?',
    DefaultLocale: 'en',
    Colors: Object.freeze({
        Success: 0x2ECC71,
        Error: 0xE74C3C,
        Warning: 0xF1C40F,
        Info: 0x3498DB
    })
});

module.exports = { AppConfig };
