const { EmbedFactory } = require('./EmbedFactory');

class CommandContext {
    constructor(interactionOrMessage, args = [], isSlash = true) {
        this.Interaction = isSlash ? interactionOrMessage : null;
        this.Message = isSlash ? null : interactionOrMessage;
        this.IsSlash = isSlash;
        this.Guild = interactionOrMessage.guild;
        this.Channel = interactionOrMessage.channel;
        this.User = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        this.Member = interactionOrMessage.member;
        this.Args = args;
        this.Client = interactionOrMessage.client;
        this.CommandName = '';
        this.HasResponded = false;
    }

    get RawArgs() {
        return this.Args.join(' ');
    }

    async ReplySuccess(title, message) {
        return this.Send({ embeds: [EmbedFactory.CreateSuccess(title, message)] });
    }

    async ReplyError(title, message) {
        return this.Send({ embeds: [EmbedFactory.CreateError(title, message)], ephemeral: this.IsSlash });
    }

    async ReplyInfo(title, message) {
        return this.Send({ embeds: [EmbedFactory.CreateInfo(title, message)] });
    }

    async Send(options) {
        this.HasResponded = true;
        if (this.IsSlash) {
            if (this.DeferPromise) await this.DeferPromise;
            if (this.Interaction.deferred && !this.Interaction.replied) {
                const { ephemeral, ...editOptions } = options;
                return this.Interaction.editReply(editOptions);
            }
            if (this.Interaction.replied || this.Interaction.deferred) {
                const { ephemeral, ...followUpOptions } = options;
                return this.Interaction.followUp({ ...followUpOptions, ephemeral });
            }
            return this.Interaction.reply(options);
        }
        const { ephemeral, ...messageOptions } = options;
        return this.Channel.send(messageOptions);
    }
}

module.exports = { CommandContext };
