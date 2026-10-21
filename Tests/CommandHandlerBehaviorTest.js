const test = require('node:test');
const assert = require('node:assert/strict');
const { Collection, PermissionFlagsBits, Routes } = require('discord.js');
const { AppConfig } = require('../Configuration/AppConfig');
const { CommandHandler } = require('../Source/Managers/CommandHandler');
const { SlashCommands } = require('../Source/Managers/CommandRegistry');

function CreateContext() {
    return {
        Guild: { id: 'guild-test', ownerId: 'owner-test' },
        Channel: { id: 'channel-test' },
        User: { id: 'user-test' },
        Member: {
            permissions: { has: () => false },
            roles: { cache: { has: () => false, some: () => false } }
        },
        HasResponded: false,
        ReplyError: async (...args) => args
    };
}

test('configured moderator roles do not grant administrator-only commands', () => {
    const handler = new CommandHandler({}, {});
    const context = CreateContext();
    context.Member.roles.cache.has = roleId => roleId === 'moderator-role';
    const data = { Mods: ['moderator-role'] };

    assert.equal(handler.CheckAccess({ Access: 'Administrator' }, context, data),
        'This command requires server administrator permissions.');
    assert.equal(handler.CheckAccess({ Access: 'Moderator' }, context, data), null);
});

test('administrator permissions grant both moderator and administrator access', () => {
    const handler = new CommandHandler({}, {});
    const context = CreateContext();
    context.Member.permissions.has = permission => permission === PermissionFlagsBits.Administrator;

    assert.equal(handler.CheckAccess({ Access: 'Moderator' }, context, { Mods: [] }), null);
    assert.equal(handler.CheckAccess({ Access: 'Administrator' }, context, { Mods: [] }), null);
});

test('slash command registration updates commands in one request', async () => {
    const calls = [];
    const handler = new CommandHandler({
        rest: { put: async (...args) => calls.push(args) }
    }, {});

    await handler.RegisterSlashCommands();

    if (!AppConfig.ClientId) {
        assert.deepEqual(calls, []);
        return;
    }
    assert.deepEqual(calls, [[Routes.applicationCommands(AppConfig.ClientId), { body: SlashCommands }]]);
});

test('levels and tags can be disabled independently', async () => {
    const handler = new CommandHandler({}, {});
    const context = CreateContext();
    const runs = [];
    handler.Run = async name => runs.push(name);

    const data = {
        Modules: { levels: false, tags: true },
        DisabledCommands: [],
        Ignored: { Channels: [], Users: [], Roles: [] }
    };
    await handler.Execute({ Name: 'tag', Category: 'LevelsAndTags', Access: 'Everyone' }, context, data);

    data.Modules.levels = true;
    data.Modules.tags = false;
    await handler.Execute({ Name: 'rank', Category: 'LevelsAndTags', Access: 'Everyone' }, context, data);

    assert.deepEqual(runs, ['tag', 'rank']);
});

test('disabled levels do not leave users stuck in the XP cooldown map', async () => {
    const guildData = {
        Afk: {},
        Highlights: {},
        Modules: { levels: false },
        Levels: {}
    };
    const handler = new CommandHandler({}, {
        GetGuild: async () => guildData,
        UpdateGuild: async (guildId, update) => update(guildData)
    });
    const message = {
        guild: { id: 'guild-test' },
        author: { id: 'user-test', bot: false },
        mentions: { users: new Map() },
        content: 'hello',
        channel: { send: async () => {} },
        reply: async () => {}
    };

    await handler.HandleGuildActivity(message);

    assert.equal(handler.XpCooldowns, undefined);

    guildData.Modules.levels = true;
    await handler.HandleGuildActivity(message);

    assert.ok(guildData.Levels['user-test'].Xp > 0);
    assert.ok(handler.XpCooldowns.has('guild-test:user-test'));
    handler.XpCooldowns.clear();
});

test('ordinary messages reuse their guild data read for guild activity', async () => {
    const guildData = {
        Settings: { Prefix: '?' },
        Afk: {},
        Highlights: {},
        Modules: { levels: false },
        Levels: {}
    };
    let reads = 0;
    const handler = new CommandHandler({}, {
        GetGuild: async () => {
            reads += 1;
            return guildData;
        }
    });
    const message = {
        guild: { id: 'guild-test' },
        author: { id: 'user-test', bot: false },
        content: 'ordinary message',
        mentions: { users: new Map() },
        channel: { send: async () => {} },
        reply: async () => {}
    };

    const activityData = await handler.HandleMessage(message);
    await handler.HandleGuildActivity(message, activityData);

    assert.equal(reads, 1);
});

test('members command uses fetched members instead of relying on the bounded guild cache', async () => {
    const role = { id: 'role-test', name: 'Helpers' };
    const cachedMembers = new Collection();
    const fetchedMembers = new Collection();
    for (let index = 0; index < 2500; index += 1) {
        const userId = `user-${index}`;
        const hasRole = index < 1250;
        const member = {
            user: { tag: `${hasRole ? 'helper' : 'member'}#${String(index).padStart(4, '0')}` },
            roles: { cache: hasRole ? new Collection([['role-test', role]]) : new Collection() }
        };
        fetchedMembers.set(userId, member);
        if (index < 100) cachedMembers.set(userId, member);
    }
    const replies = [];
    const context = {
        Args: ['role-test'],
        Guild: {
            members: { cache: cachedMembers, fetch: async () => fetchedMembers },
            roles: { cache: new Collection([['role-test', role]]) }
        },
        ReplyInfo: async (...args) => replies.push(args)
    };
    const handler = new CommandHandler({}, {});

    await handler.RunModeration('members', context, { Cases: [] });

    assert.equal(context.Guild.members.cache.size, 100);
    assert.equal(replies[0][0], 'Members with Helpers');
    assert.equal(replies[0][1], `1250 members\n${Array.from({ length: 80 }, (_, index) => `helper#${String(index).padStart(4, '0')}`).join('\n')}`);
});

test('member count uses the complete fetched collection, not the bounded guild cache', async () => {
    const cachedMembers = new Collection();
    const fetchedMembers = new Collection();
    for (let index = 0; index < 2500; index += 1) {
        const member = { user: { bot: index % 3 === 0 } };
        fetchedMembers.set(`user-${index}`, member);
        if (index < 100) cachedMembers.set(`user-${index}`, member);
    }
    const replies = [];
    const context = {
        Guild: {
            memberCount: 2500,
            members: { cache: cachedMembers, fetch: async () => fetchedMembers }
        },
        ReplyInfo: async (...args) => replies.push(args)
    };
    const handler = new CommandHandler({}, {});

    await handler.RunUtility('membercount', context, {});

    assert.equal(context.Guild.members.cache.size, 100);
    assert.deepEqual(replies[0], ['Member Count', 'Total: 2,500\nHumans: 1,666\nBots: 834']);
});
