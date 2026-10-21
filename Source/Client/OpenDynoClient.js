const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { DatabaseManager } = require('../Managers/DatabaseManager');
const { CommandHandler } = require('../Managers/CommandHandler');
const { AuditLogPipeline } = require('../Managers/AuditLogPipeline');
const { EventHandler } = require('../Managers/EventHandler');
const { AppConfig } = require('../../Configuration/AppConfig');

class OpenDynoClient extends Client {
    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildModeration,
                GatewayIntentBits.GuildEmojisAndStickers,
                GatewayIntentBits.GuildInvites,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMessageReactions,
                GatewayIntentBits.MessageContent
            ],
            partials: [Partials.Message, Partials.Channel, Partials.Reaction]
        });
        this.Database = new DatabaseManager();
        this.CommandHandler = new CommandHandler(this, this.Database);
        this.AuditLog = new AuditLogPipeline(this.Database);
        this.EventHandler = new EventHandler(this, this.CommandHandler, this.AuditLog);
        this.EventHandler.Register();
        this.once('ready', () => this.OnReady());
        this.on('error', error => console.error('[Discord] Client error:', error));
    }

    async Start() {
        if (!AppConfig.Token) throw new Error('DISCORD_TOKEN is required. Configure it in the environment before starting OpenDyno.');
        await this.Database.Initialize();
        try {
            await this.login(AppConfig.Token);
        } catch (error) {
            await this.Database.Close();
            throw error;
        }
    }

    async OnReady() {
        console.log(`[Discord] Logged in as ${this.user.tag}.`);
        try {
            await this.CommandHandler.RegisterSlashCommands();
            await this.CommandHandler.RestoreTimedActions();
        } catch (error) {
            console.error('[Startup] Could not initialize commands or scheduled actions:', error);
        }
    }
}

module.exports = { OpenDynoClient };
