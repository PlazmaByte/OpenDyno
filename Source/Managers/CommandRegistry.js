const { SlashCommandBuilder } = require('discord.js');

const Groups = {
    Core: {
        help: 'Displays available commands or details for one command.',
        info: 'Displays OpenDyno version and runtime information.',
        ping: 'Displays Discord API latency.',
        stats: 'Displays host and bot usage statistics.',
        uptime: 'Displays how long OpenDyno has been running.'
    },
    Moderation: {
        ban: 'Bans a member. Usage: ban <member> [purgeDays] [reason]',
        case: 'Displays a moderation case by its ID.',
        clean: 'Deletes recent messages sent by OpenDyno.',
        clearnotes: 'Deletes all notes for a member.',
        clearwarn: 'Clears active warnings for a member.',
        delnote: 'Deletes a moderator note by ID.',
        delwarn: 'Deletes a warning by ID.',
        diagnose: 'Inspects permissions and hierarchy for this channel.',
        duration: 'Changes an active temporary moderation duration.',
        editnote: 'Edits a moderator note by ID.',
        kick: 'Kicks a member from the server.',
        lock: 'Locks this or a specified channel.',
        lockdown: 'Locks server text channels.',
        members: 'Lists members with a specified role.',
        moderations: 'Lists active temporary moderation actions.',
        modlogs: 'Displays a member moderation history.',
        modstats: 'Displays actions recorded for a moderator.',
        mute: 'Times out a member for a duration such as 10m or 2h.',
        note: 'Adds a private moderator note to a member.',
        notes: 'Displays notes for a member.',
        purge: 'Bulk-deletes up to 1000 messages. Filters: bots, user, links, images.',
        reason: 'Changes the reason for a moderation case.',
        softban: 'Bans and unbans a member to remove recent messages.',
        star: 'Displays the reactions for a message.',
        unban: 'Unbans a user by ID.',
        unlock: 'Unlocks this or a specified channel.',
        unmute: 'Removes a member timeout.',
        warn: 'Adds a formal warning to a member.',
        warnings: 'Displays a member warning history.'
    },
    Management: {
        addemote: 'Adds a custom emoji from an image URL or attachment.',
        addmod: 'Grants moderator privileges to a role.',
        addrole: 'Creates a role.',
        announce: 'Posts an announcement to a channel.',
        command: 'Enables or disables a command.',
        customs: 'Creates, lists, or removes custom text commands.',
        delmod: 'Revokes moderator privileges from a role.',
        delrole: 'Deletes a role.',
        giveaway: 'Starts a timed giveaway.',
        ignorechannel: 'Toggles command ignoring for a channel.',
        ignorerole: 'Toggles command ignoring for a role.',
        ignoreuser: 'Toggles command ignoring for a user.',
        ignored: 'Lists ignored channels, roles, and users.',
        language: 'Sets this server bot-message locale.',
        listmods: 'Lists configured moderator roles.',
        logchannel: 'Sets or clears the audit log channel.',
        mentionable: 'Toggles role mentionability.',
        module: 'Enables or disables a bot module.',
        modlogchannel: 'Sets or clears the moderation log channel.',
        nick: 'Changes OpenDyno’s nickname.',
        prefix: 'Displays or changes this server prefix.',
        role: 'Adds or removes a role from a member.',
        rolecolor: 'Changes a role color.',
        rolename: 'Changes a role name.',
        rolepersist: 'Toggles role persistence for members.',
        setnick: 'Changes a member nickname.',
        temprole: 'Grants a role temporarily. Usage: temprole <member> <role> <duration>',
        warnthreshold: 'Sets automatic timeout after a warning count, or clears the threshold.'
    },
    Utility: {
        afk: 'Sets your AFK status message.',
        avatar: 'Displays a member avatar.',
        color: 'Displays a HEX color preview.',
        emotes: 'Lists server custom emojis.',
        highlights: 'Adds or removes keyword notifications.',
        inviteinfo: 'Displays information for a server invite.',
        membercount: 'Displays server member counts.',
        randomcolor: 'Displays a random color.',
        remindme: 'Sets a reminder. Usage: remindme <duration> <message>',
        roleinfo: 'Displays role details.',
        roles: 'Lists server roles by hierarchy.',
        roll: 'Rolls dice, for example 1d20.',
        serverinfo: 'Displays server details.',
        whois: 'Displays member details.'
    },
    Engagement: {
        flip: 'Flips a coin.',
        points: 'Views or changes activity points.',
        poll: 'Creates a poll. Usage: poll <question> | <option> | <option>',
        rps: 'Plays rock, paper, scissors.',
        space: 'Displays current ISS location and crew.'
    },
    LevelsAndTags: {
        addrank: 'Adds a role to self-assignable ranks.',
        delrank: 'Removes a self-assignable rank.',
        leaderboard: 'Displays the server XP leaderboard.',
        profile: 'Displays your or a member’s rank profile.',
        rank: 'Adds or removes a self-assignable role.',
        ranks: 'Lists self-assignable roles.',
        slowmode: 'Sets this channel slowmode.',
        tag: 'Gets or manages a server tag.',
        tags: 'Lists server tags.'
    }
};

const ModeratorCommands = new Set([
    'ban', 'case', 'clearnotes', 'clearwarn', 'delnote', 'delwarn', 'diagnose',
    'duration', 'editnote', 'kick', 'lock', 'lockdown', 'members', 'moderations',
    'modlogs', 'modstats', 'mute', 'note', 'notes', 'purge', 'reason', 'softban',
    'star', 'unban', 'unlock', 'unmute', 'warn', 'warnings'
]);

const AdministratorCommands = new Set([
    'addemote', 'addmod', 'addrole', 'announce', 'command', 'customs', 'delmod',
    'delrole', 'giveaway', 'ignorechannel', 'ignorerole', 'ignoreuser', 'language',
    'logchannel', 'mentionable', 'module', 'modlogchannel', 'nick', 'prefix',
    'rolecolor', 'rolename', 'rolepersist', 'setnick', 'temprole', 'warnthreshold',
    'addrank', 'delrank', 'slowmode', 'role'
]);

const Commands = [];
const CommandMap = new Map();
for (const [category, entries] of Object.entries(Groups)) {
    for (const [name, description] of Object.entries(entries)) {
        const command = {
            Name: name,
            Description: description,
            Category: category,
            Aliases: name === 'warnings' ? ['warns'] : name === 'membercount' ? ['memberscount'] : [],
            Access: ModeratorCommands.has(name) ? 'Moderator' : AdministratorCommands.has(name) ? 'Administrator' : 'Everyone'
        };
        Commands.push(command);
        CommandMap.set(name, command);
        for (const alias of command.Aliases) CommandMap.set(alias, command);
    }
}

const CommandArguments = {
    help: { Name: 'command_or_page', Description: 'Command or help page number to look up.' },
    ban: { Name: 'member_days_reason', Description: 'Member or user ID, optional purge days (0-7), and reason.' },
    case: { Name: 'case_id', Description: 'Moderation case ID to display.' },
    clean: { Name: 'message_count', Description: 'Maximum number of recent OpenDyno messages to delete (default 50).' },
    clearnotes: { Name: 'member', Description: 'Member whose moderator notes should be cleared.' },
    clearwarn: { Name: 'member', Description: 'Member whose active warnings should be cleared.' },
    delnote: { Name: 'note_id', Description: 'ID of the moderator note to delete.' },
    delwarn: { Name: 'warning_id', Description: 'ID of the warning to delete.' },
    duration: { Name: 'case_and_duration', Description: 'Moderation case ID and new duration.' },
    editnote: { Name: 'note_and_text', Description: 'Note ID followed by the replacement text.' },
    kick: { Name: 'member_and_reason', Description: 'Member to kick and optional reason.' },
    lock: { Name: 'channel', Description: 'Channel to lock (defaults to the current channel).' },
    unlock: { Name: 'channel', Description: 'Channel to unlock (defaults to the current channel).' },
    members: { Name: 'role', Description: 'Role whose members should be listed.' },
    modlogs: { Name: 'member', Description: 'Member whose moderation history should be listed.' },
    modstats: { Name: 'moderator', Description: 'Moderator whose actions should be summarized (defaults to you).' },
    mute: { Name: 'member_duration_reason', Description: 'Member, timeout duration, and optional reason.' },
    note: { Name: 'member_and_note', Description: 'Member followed by the private note text.' },
    notes: { Name: 'member', Description: 'Member whose notes should be listed.' },
    purge: { Name: 'count_and_filter', Description: 'Message count, with an optional filter and filter target.' },
    reason: { Name: 'case_and_reason', Description: 'Moderation case ID followed by the updated reason.' },
    softban: { Name: 'member_days_reason', Description: 'Member or user ID, optional purge days (0-7), and reason.' },
    star: { Name: 'message_id', Description: 'ID of the message whose reactions should be shown.' },
    unban: { Name: 'user_id_and_reason', Description: 'Banned user ID and optional reason.' },
    unmute: { Name: 'member_and_reason', Description: 'Member whose timeout should be removed and optional reason.' },
    warn: { Name: 'member_and_reason', Description: 'Member to warn and optional reason.' },
    warnings: { Name: 'member', Description: 'Member whose warning history should be listed.' },
    addemote: { Name: 'image_and_name', Description: 'Image URL and optional emoji name; a message attachment also works.' },
    addmod: { Name: 'role', Description: 'Role to grant moderator access.' },
    addrole: { Name: 'role_name', Description: 'Name for the new role.' },
    announce: { Name: 'channel_and_message', Description: 'Optional channel followed by announcement text.' },
    command: { Name: 'command_and_state', Description: 'Command name followed by enabled or disabled.' },
    customs: { Name: 'action_name_response', Description: 'Action and its values, such as add <name> <response>.' },
    delmod: { Name: 'role', Description: 'Role to revoke moderator access from.' },
    delrole: { Name: 'role', Description: 'Role to delete.' },
    giveaway: { Name: 'duration_and_prize', Description: 'Giveaway duration followed by the prize.' },
    ignorechannel: { Name: 'channel', Description: 'Channel to toggle on the command ignore list.' },
    ignorerole: { Name: 'role', Description: 'Role to toggle on the command ignore list.' },
    ignoreuser: { Name: 'user', Description: 'User to toggle on the command ignore list.' },
    language: { Name: 'locale', Description: 'Locale to set, such as en or en-US.' },
    logchannel: { Name: 'channel_or_off', Description: 'Text channel for audit logs, or off to clear it.' },
    mentionable: { Name: 'role', Description: 'Role whose mentionability should be toggled.' },
    module: { Name: 'module_and_state', Description: 'Module name followed by enabled or disabled.' },
    modlogchannel: { Name: 'channel_or_off', Description: 'Text channel for moderation logs, or off to clear it.' },
    nick: { Name: 'nickname', Description: 'New nickname for OpenDyno; leave blank to clear it.' },
    prefix: { Name: 'new_prefix', Description: 'New server prefix (1-5 characters).' },
    role: { Name: 'member_and_role', Description: 'Member and role to add or remove.' },
    rolecolor: { Name: 'role_and_color', Description: 'Role followed by a HEX color.' },
    rolename: { Name: 'role_and_name', Description: 'Role followed by its new name.' },
    rolepersist: { Name: 'member_and_role', Description: 'Member and role whose persistence should be toggled.' },
    setnick: { Name: 'member_and_nickname', Description: 'Member followed by a nickname; leave blank to clear it.' },
    temprole: { Name: 'member_role_duration', Description: 'Member, role, and duration for the temporary role.' },
    warnthreshold: { Name: 'count_and_duration', Description: 'Warning count and timeout duration, or off to clear the threshold.' },
    afk: { Name: 'status_message', Description: 'Your AFK status message.' },
    avatar: { Name: 'member_or_user_id', Description: 'Member or user ID (defaults to you).' },
    color: { Name: 'hex_color', Description: 'Six-digit HEX color, such as #3498DB.' },
    highlights: { Name: 'action_and_keyword', Description: 'Action and keyword, such as add <keyword> or del <keyword>.' },
    inviteinfo: { Name: 'invite', Description: 'Discord invite link or invite code.' },
    remindme: { Name: 'duration_and_message', Description: 'Reminder duration followed by the reminder text.' },
    roleinfo: { Name: 'role', Description: 'Role to inspect.' },
    roll: { Name: 'dice', Description: 'Dice notation such as 1d20 (defaults to 1d6).' },
    whois: { Name: 'member', Description: 'Member to inspect (defaults to you).' },
    points: { Name: 'member_and_amount', Description: 'Optional member and point adjustment amount.' },
    poll: { Name: 'question_and_options', Description: 'Question and 2-5 options separated by | characters.' },
    rps: { Name: 'move', Description: 'Your move: rock, paper, or scissors.' },
    addrank: { Name: 'role', Description: 'Role to add to self-assignable ranks.' },
    delrank: { Name: 'role', Description: 'Role to remove from self-assignable ranks.' },
    profile: { Name: 'member', Description: 'Member whose rank profile should be shown (defaults to you).' },
    rank: { Name: 'role', Description: 'Self-assignable role to join or leave.' },
    slowmode: { Name: 'seconds', Description: 'Slowmode delay in seconds (0 disables slowmode).' },
    tag: { Name: 'action_name_and_text', Description: 'Tag name, or action and values for add, edit, or del.' }
};

function AddCommandOption(subcommand, name, description, argumentOption) {
    const builder = subcommand
        .setName(name)
        .setDescription(description.slice(0, 100));
    if (argumentOption) {
        builder.addStringOption(option => option
            .setName(argumentOption.Name)
            .setDescription(argumentOption.Description.slice(0, 100))
            .setRequired(false));
    }
    return builder;
}

const SlashFamilies = {
    role: {
        Description: 'Manage roles, self-assignable ranks, and role details.',
        Subcommands: {
            assign: { Command: 'role', Description: 'Add a role to a member.', Suffix: ['add'] },
            remove: { Command: 'role', Description: 'Remove a role from a member.', Suffix: ['remove'] },
            create: { Command: 'addrole', Description: 'Create a server role.' },
            delete: { Command: 'delrole', Description: 'Delete a server role.' },
            color: { Command: 'rolecolor', Description: 'Change a role color.' },
            rename: { Command: 'rolename', Description: 'Rename a role.' },
            mentionable: { Command: 'mentionable', Description: 'Toggle role mentionability.' },
            info: { Command: 'roleinfo', Description: 'Display role details.' },
            list: { Command: 'ranks', Description: 'List self-assignable ranks.' },
            join: { Command: 'rank', Description: 'Join or leave a self-assignable role.' },
            addrank: { Command: 'addrank', Description: 'Make a role self-assignable.' },
            delrank: { Command: 'delrank', Description: 'Remove a self-assignable rank.' },
            persist: { Command: 'rolepersist', Description: 'Toggle member role persistence.' },
            temporary: { Command: 'temprole', Description: 'Grant a role for a duration.' }
        }
    },
    notes: {
        Description: 'Manage private moderator notes.',
        Subcommands: {
            add: { Command: 'note', Description: 'Add a private note.' },
            list: { Command: 'notes', Description: 'List notes for a member.' },
            clear: { Command: 'clearnotes', Description: 'Clear all notes for a member.' },
            delete: { Command: 'delnote', Description: 'Delete a note by ID.' },
            edit: { Command: 'editnote', Description: 'Edit a note by ID.' }
        }
    },
    warnings: {
        Description: 'Manage member warnings.',
        Subcommands: {
            add: { Command: 'warn', Description: 'Add a formal warning.' },
            list: { Command: 'warnings', Description: 'List a member warning history.' },
            clear: { Command: 'clearwarn', Description: 'Clear active member warnings.' },
            delete: { Command: 'delwarn', Description: 'Delete a warning by ID.' }
        }
    },
    cases: {
        Description: 'Review and update moderation cases.',
        Subcommands: {
            show: { Command: 'case', Description: 'Display a case by ID.' },
            reason: { Command: 'reason', Description: 'Update a case reason.' },
            duration: { Command: 'duration', Description: 'Update an active timeout duration.' },
            history: { Command: 'modlogs', Description: 'List a member moderation history.' },
            active: { Command: 'moderations', Description: 'List active temporary actions.' },
            stats: { Command: 'modstats', Description: 'Show a moderator action summary.' }
        }
    },
    ignore: {
        Description: 'Manage channels, roles, and users ignored by commands.',
        Subcommands: {
            channel: { Command: 'ignorechannel', Description: 'Toggle a channel on the ignore list.' },
            role: { Command: 'ignorerole', Description: 'Toggle a role on the ignore list.' },
            user: { Command: 'ignoreuser', Description: 'Toggle a user on the ignore list.' },
            list: { Command: 'ignored', Description: 'List ignored channels, roles, and users.' }
        }
    },
    channel: {
        Description: 'Manage channel moderation and message tools.',
        Subcommands: {
            lock: { Command: 'lock', Description: 'Lock a channel.' },
            unlock: { Command: 'unlock', Description: 'Unlock a channel.' },
            lockdown: { Command: 'lockdown', Description: 'Lock all server text channels.' },
            purge: { Command: 'purge', Description: 'Bulk-delete recent messages.' },
            clean: { Command: 'clean', Description: 'Delete recent messages from OpenDyno.' },
            slowmode: { Command: 'slowmode', Description: 'Set this channel slowmode.' },
            diagnose: { Command: 'diagnose', Description: 'Inspect channel permissions.' },
            members: { Command: 'members', Description: 'List members with a role.' },
            reactions: { Command: 'star', Description: 'Inspect reactions on a message.' }
        }
    },
    automod: {
        Description: 'Enable, disable, and inspect automatic moderation.',
        Subcommands: {
            enable: { Command: 'module', Description: 'Enable automatic moderation.', Prefix: ['automod', 'enabled'] },
            disable: { Command: 'module', Description: 'Disable automatic moderation.', Prefix: ['automod', 'disabled'] },
            status: { Command: 'module', Description: 'Show automatic moderation settings.', Prefix: ['automod', 'status'] }
        }
    }
};

const GroupedCommandNames = new Set(
    Object.values(SlashFamilies)
        .flatMap(family => Object.values(family.Subcommands).map(route => route.Command))
        .filter(commandName => commandName !== 'module')
);

const SlashRoutes = new Map();
const SlashCommands = [];

for (const [rootName, family] of Object.entries(SlashFamilies)) {
    const root = new SlashCommandBuilder().setName(rootName).setDescription(family.Description.slice(0, 100));
    for (const [subcommandName, route] of Object.entries(family.Subcommands)) {
        const argumentOption = route.Prefix ? undefined : CommandArguments[route.Command];
        root.addSubcommand(subcommand => AddCommandOption(subcommand, subcommandName, route.Description, argumentOption));
        SlashRoutes.set(`${rootName}:${subcommandName}`, { ...route, ArgumentOption: argumentOption });
    }
    SlashCommands.push(root.toJSON());
}

for (const command of Commands) {
    if (GroupedCommandNames.has(command.Name)) continue;
    const root = new SlashCommandBuilder()
        .setName(command.Name)
        .setDescription(command.Description.slice(0, 100));
    const argumentOption = CommandArguments[command.Name];
    if (argumentOption) {
        root.addStringOption(option => option
            .setName(argumentOption.Name)
            .setDescription(argumentOption.Description.slice(0, 100))
            .setRequired(false));
    }
    SlashCommands.push(root.toJSON());
    SlashRoutes.set(command.Name, { Command: command.Name, ArgumentOption: argumentOption });
}

module.exports = { Commands, Groups, SlashCommands, SlashFamilies, SlashRoutes, CommandMap };
