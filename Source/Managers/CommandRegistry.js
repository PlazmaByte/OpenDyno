const { SlashCommandBuilder, ChannelType } = require('discord.js');

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
        autorole: 'Configure roles automatically assigned to eligible joining members.',
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
    'addemote', 'addmod', 'addrole', 'announce', 'autorole', 'command', 'customs', 'delmod',
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

const StructuredArguments = {
    ban: [
        { Type: 'User', Name: 'member', Description: 'Member or user to ban.' },
        { Type: 'Integer', Name: 'purge_days', Description: 'Recent message days to delete (0-7).', Required: false, Min: 0, Max: 7 },
        { Type: 'String', Name: 'reason', Description: 'Reason for the ban.', Required: false }
    ],
    case: [{ Type: 'Integer', Name: 'case_id', Description: 'Moderation case ID.' }],
    clean: [{ Type: 'Integer', Name: 'message_count', Description: 'Maximum messages to delete (default 50).', Required: false, Min: 1, Max: 100 }],
    clearnotes: [{ Type: 'User', Name: 'member', Description: 'Member whose notes should be cleared.' }],
    clearwarn: [{ Type: 'User', Name: 'member', Description: 'Member whose warnings should be cleared.' }],
    delnote: [{ Type: 'Integer', Name: 'note_id', Description: 'Moderator note ID.' }],
    delwarn: [{ Type: 'Integer', Name: 'warning_id', Description: 'Warning ID.' }],
    duration: [
        { Type: 'Integer', Name: 'case_id', Description: 'Active moderation case ID.' },
        { Type: 'String', Name: 'new_duration', Description: 'New timeout duration, such as 10m or 2h.' }
    ],
    editnote: [
        { Type: 'Integer', Name: 'note_id', Description: 'Moderator note ID.' },
        { Type: 'String', Name: 'new_text', Description: 'Replacement note text.' }
    ],
    kick: [
        { Type: 'User', Name: 'member', Description: 'Member to kick.' },
        { Type: 'String', Name: 'reason', Description: 'Reason for the kick.', Required: false }
    ],
    lock: [{ Type: 'Channel', Name: 'channel', Description: 'Channel to lock.', Required: false }],
    unlock: [{ Type: 'Channel', Name: 'channel', Description: 'Channel to unlock.', Required: false }],
    members: [{ Type: 'Role', Name: 'role', Description: 'Role whose members should be listed.' }],
    modlogs: [{ Type: 'User', Name: 'member', Description: 'Member whose history should be listed.' }],
    modstats: [{ Type: 'User', Name: 'moderator', Description: 'Moderator whose actions should be summarized.', Required: false }],
    mute: [
        { Type: 'User', Name: 'member', Description: 'Member to time out.' },
        { Type: 'String', Name: 'duration', Description: 'Timeout duration, such as 10m or 2h.' },
        { Type: 'String', Name: 'reason', Description: 'Reason for the timeout.', Required: false }
    ],
    note: [
        { Type: 'User', Name: 'member', Description: 'Member to attach a note to.' },
        { Type: 'String', Name: 'note', Description: 'Private moderator note.' }
    ],
    notes: [{ Type: 'User', Name: 'member', Description: 'Member whose notes should be listed.' }],
    purge: [
        { Type: 'Integer', Name: 'message_count', Description: 'Number of recent messages to delete (1-1000).', Min: 1, Max: 1000 },
        { Type: 'String', Name: 'filter', Description: 'Optional filter: bots, user, links, or images.', Required: false },
        { Type: 'User', Name: 'filter_member', Description: 'Member for the user filter.', Required: false }
    ],
    reason: [
        { Type: 'Integer', Name: 'case_id', Description: 'Moderation case ID.' },
        { Type: 'String', Name: 'new_reason', Description: 'Updated reason for the case.' }
    ],
    softban: [
        { Type: 'User', Name: 'member', Description: 'Member or user to softban.' },
        { Type: 'Integer', Name: 'purge_days', Description: 'Recent message days to delete (0-7).', Required: false, Min: 0, Max: 7 },
        { Type: 'String', Name: 'reason', Description: 'Reason for the softban.', Required: false }
    ],
    unban: [
        { Type: 'String', Name: 'user_id', Description: 'ID of the banned user.' },
        { Type: 'String', Name: 'reason', Description: 'Reason for the unban.', Required: false }
    ],
    unmute: [
        { Type: 'User', Name: 'member', Description: 'Member whose timeout should be removed.' },
        { Type: 'String', Name: 'reason', Description: 'Reason for removing the timeout.', Required: false }
    ],
    warn: [
        { Type: 'User', Name: 'member', Description: 'Member to warn.' },
        { Type: 'String', Name: 'reason', Description: 'Reason for the warning.', Required: false }
    ],
    warnings: [{ Type: 'User', Name: 'member', Description: 'Member whose warnings should be listed.' }],
    addmod: [{ Type: 'Role', Name: 'role', Description: 'Role to grant moderator access.' }],
    delmod: [{ Type: 'Role', Name: 'role', Description: 'Role to revoke moderator access from.' }],
    delrole: [{ Type: 'Role', Name: 'role', Description: 'Role to delete.' }],
    ignorechannel: [{ Type: 'Channel', Name: 'channel', Description: 'Channel to toggle on the ignore list.' }],
    ignorerole: [{ Type: 'Role', Name: 'role', Description: 'Role to toggle on the ignore list.' }],
    ignoreuser: [{ Type: 'User', Name: 'user', Description: 'User to toggle on the ignore list.' }],
    warnthreshold: [
        { Type: 'Integer', Name: 'warning_count', Description: 'Active warnings needed to trigger a timeout (2-100).', Required: false, Min: 2, Max: 100 },
        { Type: 'String', Name: 'timeout_duration', Description: 'Timeout duration, such as 10m or 2h.', Required: false }
    ],
    mentionable: [{ Type: 'Role', Name: 'role', Description: 'Role whose mentionability should be toggled.' }],
    logchannel: [
        { Type: 'Channel', Name: 'channel', Description: 'Text channel for audit logs; leave blank to clear it.', Required: false }
    ],
    modlogchannel: [
        { Type: 'Channel', Name: 'channel', Description: 'Text channel for moderation logs; leave blank to clear it.', Required: false }
    ],
    addrank: [{ Type: 'Role', Name: 'role', Description: 'Role to add to self-assignable ranks.' }],
    delrank: [{ Type: 'Role', Name: 'role', Description: 'Role to remove from self-assignable ranks.' }],
    rank: [{ Type: 'Role', Name: 'role', Description: 'Self-assignable role to join or leave.' }],
    roleinfo: [{ Type: 'Role', Name: 'role', Description: 'Role to inspect.' }],
    slowmode: [{ Type: 'Integer', Name: 'seconds', Description: 'Slowmode delay in seconds (0 disables slowmode).', Min: 0, Max: 21600 }],
    avatar: [{ Type: 'User', Name: 'member', Description: 'Member or user whose avatar should be shown.', Required: false }],
    whois: [{ Type: 'User', Name: 'member', Description: 'Member to inspect (defaults to you).', Required: false }],
    profile: [{ Type: 'User', Name: 'member', Description: 'Member profile to show (defaults to you).', Required: false }],
    points: [
        { Type: 'User', Name: 'member', Description: 'Member whose points to view or change.', Required: false },
        { Type: 'Integer', Name: 'amount', Description: 'Points to add or deduct.', Required: false }
    ],
    announce: [
        { Type: 'String', Name: 'message', Description: 'Announcement text.' },
        { Type: 'Channel', Name: 'channel', Description: 'Channel to post in (defaults to the current channel).', Required: false }
    ],
    setnick: [
        { Type: 'User', Name: 'member', Description: 'Member whose nickname should change.' },
        { Type: 'String', Name: 'nickname', Description: 'New nickname; leave blank to clear it.', Required: false }
    ]
};

const CommandArgumentOrders = {
    announce: [1, 0]
};

const FamilyArguments = {
    'autorole:add': [{ Type: 'Role', Name: 'role', Description: 'Role to assign to eligible joining members.' }],
    'autorole:remove': [{ Type: 'Role', Name: 'role', Description: 'Configured role to remove.' }],
    'autorole:list': [],
    'autorole:status': [],
    'autorole:clear': [{ Type: 'Boolean', Name: 'confirm', Description: 'Confirm removal of all configured Auto Roles.', Required: false }],
    'autorole:enable': [],
    'autorole:disable': [],
    'autorole:set-bots': [{ Type: 'Boolean', Name: 'enabled', Description: 'Whether bot accounts receive Auto Roles.' }],
    'autorole:set-humans': [{ Type: 'Boolean', Name: 'enabled', Description: 'Whether human members receive Auto Roles.' }],
    'autorole:exempt-user-add': [{ Type: 'User', Name: 'member', Description: 'Server member to exempt.' }],
    'autorole:exempt-user-remove': [{ Type: 'User', Name: 'member', Description: 'Previously exempted member.' }],
    'autorole:exempt-role-add': [{ Type: 'Role', Name: 'role', Description: 'Role whose holders should be exempt.' }],
    'autorole:exempt-role-remove': [{ Type: 'Role', Name: 'role', Description: 'Exempt role to remove.' }],
    'autorole:exemptions': [],
    'autorole:exemptions-clear': [{ Type: 'Boolean', Name: 'confirm', Description: 'Confirm removal of all Auto Role exemptions.', Required: false }],
    'autorole:validate': [],
    'autorole:sync': [{ Type: 'Boolean', Name: 'confirm', Description: 'Confirm applying configured roles to eligible existing members.', Required: false }],
    'role:assign': [
        { Type: 'User', Name: 'member', Description: 'Member to update.' },
        { Type: 'Role', Name: 'role', Description: 'Role to add.' }
    ],
    'role:remove': [
        { Type: 'User', Name: 'member', Description: 'Member to update.' },
        { Type: 'Role', Name: 'role', Description: 'Role to remove.' }
    ],
    'role:create': [
        { Type: 'String', Name: 'role_name', Description: 'Name for the new role.' },
        { Type: 'String', Name: 'hex_color', Description: 'Optional HEX color, such as #3498DB.', Required: false },
        { Type: 'Boolean', Name: 'hoist', Description: 'Display this role separately in the member list.', Required: false }
    ],
    'role:delete': [{ Type: 'Role', Name: 'role', Description: 'Role to delete.' }],
    'role:color': [
        { Type: 'Role', Name: 'role', Description: 'Role whose color should change.' },
        { Type: 'String', Name: 'hex_color', Description: 'New HEX color, such as #3498DB.' }
    ],
    'role:rename': [
        { Type: 'Role', Name: 'role', Description: 'Role to rename.' },
        { Type: 'String', Name: 'new_name', Description: 'New role name.' }
    ],
    'role:mentionable': [{ Type: 'Role', Name: 'role', Description: 'Role whose mentionability should be toggled.' }],
    'role:info': [{ Type: 'Role', Name: 'role', Description: 'Role to inspect.' }],
    'role:join': [{ Type: 'Role', Name: 'role', Description: 'Self-assignable role to join or leave.' }],
    'role:addrank': [{ Type: 'Role', Name: 'role', Description: 'Role to add to self-assignable ranks.' }],
    'role:delrank': [{ Type: 'Role', Name: 'role', Description: 'Role to remove from self-assignable ranks.' }],
    'role:persist': [
        { Type: 'User', Name: 'member', Description: 'Member whose role persistence should change.' },
        { Type: 'Role', Name: 'role', Description: 'Role to persist or stop persisting.' }
    ],
    'role:temporary': [
        { Type: 'User', Name: 'member', Description: 'Member to grant the temporary role to.' },
        { Type: 'Role', Name: 'role', Description: 'Role to grant.' },
        { Type: 'String', Name: 'duration', Description: 'How long to grant the role, such as 10m or 2h.' }
    ],
    'notes:add': [
        { Type: 'User', Name: 'member', Description: 'Member to attach a note to.' },
        { Type: 'String', Name: 'note', Description: 'Private moderator note.' }
    ],
    'notes:list': [{ Type: 'User', Name: 'member', Description: 'Member whose notes should be listed.' }],
    'notes:clear': [{ Type: 'User', Name: 'member', Description: 'Member whose notes should be cleared.' }],
    'notes:delete': [{ Type: 'Integer', Name: 'note_id', Description: 'Moderator note ID.' }],
    'notes:edit': [
        { Type: 'Integer', Name: 'note_id', Description: 'Moderator note ID.' },
        { Type: 'String', Name: 'new_text', Description: 'Replacement note text.' }
    ],
    'warnings:add': [
        { Type: 'User', Name: 'member', Description: 'Member to warn.' },
        { Type: 'String', Name: 'reason', Description: 'Reason for the warning.', Required: false }
    ],
    'warnings:list': [{ Type: 'User', Name: 'member', Description: 'Member whose warnings should be listed.' }],
    'warnings:clear': [{ Type: 'User', Name: 'member', Description: 'Member whose warnings should be cleared.' }],
    'warnings:delete': [{ Type: 'Integer', Name: 'warning_id', Description: 'Warning ID.' }],
    'cases:show': [{ Type: 'Integer', Name: 'case_id', Description: 'Moderation case ID.' }],
    'cases:reason': [
        { Type: 'Integer', Name: 'case_id', Description: 'Moderation case ID.' },
        { Type: 'String', Name: 'new_reason', Description: 'Updated reason for the case.' }
    ],
    'cases:duration': [
        { Type: 'Integer', Name: 'case_id', Description: 'Active moderation case ID.' },
        { Type: 'String', Name: 'new_duration', Description: 'New timeout duration.' }
    ],
    'cases:history': [{ Type: 'User', Name: 'member', Description: 'Member whose history should be listed.' }],
    'cases:stats': [{ Type: 'User', Name: 'moderator', Description: 'Moderator whose actions should be summarized.', Required: false }],
    'ignore:channel': [{ Type: 'Channel', Name: 'channel', Description: 'Channel to toggle on the ignore list.' }],
    'ignore:role': [{ Type: 'Role', Name: 'role', Description: 'Role to toggle on the ignore list.' }],
    'ignore:user': [{ Type: 'User', Name: 'user', Description: 'User to toggle on the ignore list.' }],
    'channel:lock': [{ Type: 'Channel', Name: 'channel', Description: 'Channel to lock.', Required: false }],
    'channel:unlock': [{ Type: 'Channel', Name: 'channel', Description: 'Channel to unlock.', Required: false }],
    'channel:clean': [{ Type: 'Integer', Name: 'message_count', Description: 'Maximum messages to delete (default 50).', Required: false, Min: 1, Max: 100 }],
    'channel:members': [{ Type: 'Role', Name: 'role', Description: 'Role whose members should be listed.' }],
    'channel:reactions': [{ Type: 'String', Name: 'message_id', Description: 'ID of the message whose reactions should be shown.' }]
};

function AddTypedOption(builder, argument) {
    const method = {
        String: 'addStringOption',
        Integer: 'addIntegerOption',
        Boolean: 'addBooleanOption',
        User: 'addUserOption',
        Role: 'addRoleOption',
        Channel: 'addChannelOption'
    }[argument.Type];
    return builder[method](option => {
        option.setName(argument.Name).setDescription(argument.Description.slice(0, 100)).setRequired(argument.Required !== false);
        if (argument.Min !== undefined) option.setMinValue(argument.Min);
        if (argument.Max !== undefined) option.setMaxValue(argument.Max);
        if (argument.Type === 'Channel') option.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
        return option;
    });
}

function AddCommandOption(subcommand, name, description, argumentsList) {
    const builder = subcommand
        .setName(name)
        .setDescription(description.slice(0, 100));
    for (const argument of argumentsList || []) AddTypedOption(builder, argument);
    return builder;
}

function GetCommandArguments(commandName) {
    if (StructuredArguments[commandName]) return StructuredArguments[commandName];
    const argument = CommandArguments[commandName];
    return argument ? [{ Type: 'String', ...argument, Required: false }] : [];
}

const SlashFamilies = {
    autorole: {
        Description: 'Configure automatic roles for eligible joining members.',
        Subcommands: {
            add: { Command: 'autorole', Prefix: ['add'], Description: 'Add an automatic role.' },
            remove: { Command: 'autorole', Prefix: ['remove'], Description: 'Remove an automatic role.' },
            list: { Command: 'autorole', Prefix: ['list'], Description: 'List automatic roles.' },
            status: { Command: 'autorole', Prefix: ['status'], Description: 'Show Auto Role settings and exemptions.' },
            clear: { Command: 'autorole', Prefix: ['clear'], Description: 'Remove all configured automatic roles.' },
            enable: { Command: 'autorole', Prefix: ['enable'], Description: 'Enable Auto Role assignments.' },
            disable: { Command: 'autorole', Prefix: ['disable'], Description: 'Disable Auto Role assignments.' },
            'set-bots': { Command: 'autorole', Prefix: ['set-bots'], Description: 'Set whether bots receive automatic roles.' },
            'set-humans': { Command: 'autorole', Prefix: ['set-humans'], Description: 'Set whether humans receive automatic roles.' },
            'exempt-user-add': { Command: 'autorole', Prefix: ['exempt-user-add'], Description: 'Exempt a member from automatic roles.' },
            'exempt-user-remove': { Command: 'autorole', Prefix: ['exempt-user-remove'], Description: 'Remove a member exemption.' },
            'exempt-role-add': { Command: 'autorole', Prefix: ['exempt-role-add'], Description: 'Exempt holders of a role from automatic roles.' },
            'exempt-role-remove': { Command: 'autorole', Prefix: ['exempt-role-remove'], Description: 'Remove a role exemption.' },
            exemptions: { Command: 'autorole', Prefix: ['exemptions'], Description: 'List member and role exemptions.' },
            'exemptions-clear': { Command: 'autorole', Prefix: ['exemptions-clear'], Description: 'Clear all Auto Role exemptions.' },
            validate: { Command: 'autorole', Prefix: ['validate'], Description: 'Check configured roles and bot permissions.' },
            sync: { Command: 'autorole', Prefix: ['sync'], Description: 'Sync configured roles to eligible existing members.' }
        }
    },
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
        const argumentsList = FamilyArguments[`${rootName}:${subcommandName}`] ||
            (route.Prefix ? [] : GetCommandArguments(route.Command));
        root.addSubcommand(subcommand => AddCommandOption(subcommand, subcommandName, route.Description, argumentsList));
        SlashRoutes.set(`${rootName}:${subcommandName}`, { ...route, Arguments: argumentsList });
    }
    SlashCommands.push(root.toJSON());
}

for (const command of Commands) {
    if (GroupedCommandNames.has(command.Name)) continue;
    const root = new SlashCommandBuilder()
        .setName(command.Name)
        .setDescription(command.Description.slice(0, 100));
    const argumentsList = GetCommandArguments(command.Name);
    for (const argument of argumentsList) AddTypedOption(root, argument);
    SlashCommands.push(root.toJSON());
    SlashRoutes.set(command.Name, {
        Command: command.Name,
        Arguments: argumentsList,
        ArgumentOrder: CommandArgumentOrders[command.Name]
    });
}

module.exports = { Commands, Groups, SlashCommands, SlashFamilies, SlashRoutes, CommandMap };
