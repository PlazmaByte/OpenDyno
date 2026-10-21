const { PermissionFlagsBits } = require('discord.js');

class PermissionChecker {
    static CanModerate(context, targetMember) {
        if (!targetMember) return 'That member is not in this server.';
        if (targetMember.id === context.Guild.ownerId) return 'The server owner cannot be targeted.';
        if (context.Member.id !== context.Guild.ownerId &&
            targetMember.roles.highest.comparePositionTo(context.Member.roles.highest) >= 0) {
            return 'That member has an equal or higher role than you.';
        }
        const botMember = context.Guild.members.me;
        if (!botMember || targetMember.roles.highest.comparePositionTo(botMember.roles.highest) >= 0) {
            return 'That member has an equal or higher role than OpenDyno.';
        }
        return null;
    }

    static HasBotPermission(context, permission) {
        return Boolean(context.Guild?.members?.me?.permissionsIn(context.Channel).has(permission));
    }

    static Require(context, permission) {
        if (!context.Member?.permissions?.has(permission)) {
            return 'You do not have permission to use this command.';
        }
        if (!this.HasBotPermission(context, permission)) {
            return 'OpenDyno is missing a required permission in this channel.';
        }
        return null;
    }
}

module.exports = { PermissionChecker, PermissionFlagsBits };
