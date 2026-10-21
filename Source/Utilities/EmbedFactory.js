const { EmbedBuilder } = require('discord.js');
const { AppConfig } = require('../../Configuration/AppConfig');

class EmbedFactory {
    static CreateSuccess(title, description) {
        return this.Create(title, description, AppConfig.Colors.Success, '✅');
    }

    static CreateError(title, description) {
        return this.Create(title, description, AppConfig.Colors.Error, '❌');
    }

    static CreateWarning(title, description) {
        return this.Create(title, description, AppConfig.Colors.Warning, '⚠️');
    }

    static CreateInfo(title, description) {
        return this.Create(title, description, AppConfig.Colors.Info);
    }

    static Create(title, description, color = AppConfig.Colors.Info, indicator = null) {
        const embed = new EmbedBuilder().setColor(color).setTitle(String(title).slice(0, 256));
        if (description) embed.setDescription(String(description).slice(0, 4096));
        if (indicator) embed.setTitle(`${indicator} ${String(title).slice(0, 250)}`);
        return embed.setTimestamp();
    }
}

module.exports = { EmbedFactory };
