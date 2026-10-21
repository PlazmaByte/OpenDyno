class AuditLogPipeline {
    constructor(database) {
        this.Database = database;
    }

    async Write(guild, message, category = 'LogChannelId') {
        const data = await this.Database.GetGuild(guild.id);
        if (data.Modules.logging === false) return;
        const channelId = data.Settings[category];
        if (!channelId) return;
        const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(error => {
            if (error.code === 10003) return null;
            throw error;
        });
        if (channel?.isTextBased()) await channel.send({ embeds: [message] });
    }
}

module.exports = { AuditLogPipeline };
