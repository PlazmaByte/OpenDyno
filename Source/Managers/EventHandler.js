const { EmbedBuilder, Events } = require('discord.js');
const { AppConfig } = require('../../Configuration/AppConfig');

class EventHandler {
    constructor(client, commandHandler, auditLog) {
        this.Client = client;
        this.CommandHandler = commandHandler;
        this.AuditLog = auditLog;
    }

    Register() {
        this.Client.on(Events.InteractionCreate, interaction => this.RunSafe(() => this.CommandHandler.HandleInteraction(interaction), 'interaction'));
        this.Client.on(Events.MessageCreate, message => this.RunSafe(async () => {
            await this.CommandHandler.HandleMessage(message);
            await this.RunSafe(() => this.CommandHandler.HandleGuildActivity(message), 'guild message activity');
        }, 'message'));
        this.Client.on(Events.MessageDelete, message => this.RunSafe(async () => {
            if (!message.guild || message.author?.bot) return;
            const embed = new EmbedBuilder().setColor(AppConfig.Colors.Warning).setTitle('Message Deleted')
                .setDescription(`Author: ${message.author || 'Unknown'}\nChannel: ${message.channel}\nContent: ${(message.content || '[unavailable]').slice(0, 3000)}`)
                .setTimestamp();
            await this.AuditLog.Write(message.guild, embed);
        }, 'message delete'));
        this.Client.on(Events.MessageUpdate, (oldMessage, newMessage) => this.RunSafe(async () => {
            if (!newMessage.guild || newMessage.author?.bot || oldMessage.content === newMessage.content) return;
            const embed = new EmbedBuilder().setColor(AppConfig.Colors.Warning).setTitle('Message Edited')
                .setDescription(`Author: ${newMessage.author}\nChannel: ${newMessage.channel}\n[Jump to message](${newMessage.url})`)
                .addFields(
                    { name: 'Before', value: (oldMessage.content || '[unavailable]').slice(0, 1000) },
                    { name: 'After', value: (newMessage.content || '[unavailable]').slice(0, 1000) }
                ).setTimestamp();
            await this.AuditLog.Write(newMessage.guild, embed);
        }, 'message update'));
        this.Client.on(Events.GuildMemberAdd, member => this.RunSafe(async () => {
            const data = await this.CommandHandler.Database.GetGuild(member.guild.id);
            const roleIds = data.PersistentRoles[member.id] || [];
            for (const roleId of roleIds) {
                const role = member.guild.roles.cache.get(roleId);
                if (role && !role.managed && role.position < member.guild.members.me.roles.highest.position) {
                    await member.roles.add(role, 'Restored persistent role');
                }
            }
            const embed = new EmbedBuilder().setColor(AppConfig.Colors.Success).setTitle('Member Joined')
                .setDescription(`${member.user.tag} (${member.id})`).setTimestamp();
            await this.AuditLog.Write(member.guild, embed);
        }, 'member join'));
        this.Client.on(Events.GuildMemberRemove, member => this.RunSafe(async () => {
            const embed = new EmbedBuilder().setColor(AppConfig.Colors.Warning).setTitle('Member Left')
                .setDescription(`${member.user.tag} (${member.id})`).setTimestamp();
            await this.AuditLog.Write(member.guild, embed);
        }, 'member leave'));
    }

    RunSafe(action, eventName) {
        return Promise.resolve().then(action).catch(error => {
            console.error(`[Event] ${eventName} handler failed:`, error);
        });
    }
}

module.exports = { EventHandler };
