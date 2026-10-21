const { PermissionFlagsBits } = require('discord.js');

class BaseCommand {
    constructor(options) {
        this.Name = options.Name;
        this.Description = options.Description;
        this.Category = options.Category;
        this.Aliases = options.Aliases || [];
        this.UserPermissions = options.UserPermissions || [];
        this.BotPermissions = options.BotPermissions || [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
        this.SlashData = options.SlashData;
    }

    async Execute() {
        throw new Error(`Execute method not implemented in ${this.constructor.name}`);
    }
}

module.exports = { BaseCommand };
