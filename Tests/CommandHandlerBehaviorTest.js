const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const { CommandHandler } = require('../Source/Managers/CommandHandler');

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

