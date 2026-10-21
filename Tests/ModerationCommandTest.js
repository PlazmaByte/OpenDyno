const test = require('node:test');
const assert = require('node:assert/strict');
const { CommandHandler } = require('../Source/Managers/CommandHandler');
const { PermissionChecker } = require('../Source/Utilities/PermissionChecker');

function MakeMember(id, position) {
    return {
        id,
        roles: {
            highest: {
                comparePositionTo: role => position - role.position,
                position
            }
        }
    };
}

test('server owner protection applies to moderation, not member management hierarchy checks', () => {
    const context = {
        Guild: { ownerId: 'owner', members: { me: MakeMember('bot', 10) } },
        Member: MakeMember('moderator', 5)
    };
    const owner = MakeMember('owner', 1);

    assert.equal(PermissionChecker.CanModerate(context, owner), 'The server owner cannot be targeted.');
    assert.equal(PermissionChecker.CanManageMember(context, owner), null);
});

test('clearing warnings deactivates records and retains the warning history', async () => {
    const updates = [];
    const database = {
        UpdateGuild: async (guildId, update) => {
            await update(data);
            return data;
        },
        UpdateCase: async (...args) => updates.push(args)
    };
    const handler = new CommandHandler({}, database);
    const data = {
        Cases: [
            { CaseId: 4, UserId: '12345678901234567', ActionType: 'WARN', Active: true },
            { CaseId: 5, UserId: '12345678901234567', ActionType: 'KICK', Active: true }
        ],
        Warnings: [
            { Id: 1, UserId: '12345678901234567', CaseId: 4, Active: true },
            { Id: 2, UserId: '12345678901234567', CaseId: 3, Active: false }
        ]
    };
    const response = [];
    const context = {
        Args: ['12345678901234567'],
        Guild: {
            id: 'guild-1',
            members: { fetch: async () => null }
        },
        ReplySuccess: async (...args) => response.push(args),
        ReplyError: async (...args) => response.push(args)
    };

    await handler.RunModeration('clearwarn', context, data);

    assert.equal(data.Warnings.length, 2);
    assert.equal(data.Warnings[0].Active, false);
    assert.equal(data.Warnings[1].Active, false);
    assert.equal(data.Cases[0].Active, false);
    assert.equal(data.Cases[1].Active, true);
    assert.deepEqual(updates, [['guild-1', 4, { Active: false }]]);
    assert.match(response[0][1], /history was retained/);
});

function CreateWarningFixture({ threshold = null, timeout = async () => {} } = {}) {
    const events = [];
    const target = {
        id: '12345678901234567',
        user: { tag: 'target#0001' },
        roles: { highest: { position: 1, comparePositionTo: role => 1 - role.position } },
        timeout: async (...args) => {
            events.push(['timeout', ...args]);
            return timeout(...args);
        },
        send: async () => events.push(['dm'])
    };
    const data = {
        Cases: [],
        Warnings: [],
        TimedActions: [],
        Settings: { ModLogChannelId: null, WarningThresholds: threshold }
    };
    const response = [];
    const database = {
        CreateWarning: async (...args) => {
            events.push(['createWarning', ...args]);
            return {
                Case: { CaseId: 10 },
                Warning: { Id: 7 },
                PreviousWarningCount: threshold ? threshold.Count - 1 : 0,
                WarningCount: threshold?.Count || 1,
                WarningThresholds: threshold
            };
        },
        CreateCase: async (...args) => {
            events.push(['createCase', ...args]);
            return 11;
        },
        UpdateGuild: async (guildId, update) => {
            events.push(['updateGuild']);
            await update(data);
            return data;
        },
        SaveGuild: async () => events.push(['saveGuild'])
    };
    const handler = new CommandHandler({ user: { id: 'bot-id' } }, database);
    handler.ScheduleMuteExpiry = (...args) => events.push(['scheduleExpiry', ...args]);
    const context = {
        Args: [target.id, 'policy violation'],
        User: { id: 'moderator-id', tag: 'moderator#0001' },
        Guild: {
            id: 'guild-id',
            name: 'Test Server',
            ownerId: 'owner-id',
            members: {
                me: { id: 'bot-id', roles: { highest: { position: 10 } } },
                fetch: async () => target
            }
        },
        Member: { id: 'moderator-id', roles: { highest: { position: 5 } } },
        ReplySuccess: async (...args) => response.push(['success', ...args]),
        ReplyError: async (...args) => response.push(['error', ...args])
    };
    return { data, database, events, handler, response, target, context };
}

test('warning is committed once before notification and does not save a stale snapshot', async () => {
    const fixture = CreateWarningFixture();

    await fixture.handler.RunModeration('warn', fixture.context, fixture.data);

    assert.equal(fixture.events.filter(([name]) => name === 'createWarning').length, 1);
    assert.deepEqual(fixture.events.map(([name]) => name), ['createWarning', 'dm']);
    assert.match(fixture.response[0][2], /Case #10; warning #7/);
    assert.ok(!fixture.events.some(([name]) => name === 'saveGuild'));
});

test('rejected warning hierarchy checks happen before warning persistence', async () => {
    const fixture = CreateWarningFixture();
    fixture.target.roles.highest.position = 6;
    fixture.target.roles.highest.comparePositionTo = role => 6 - role.position;

    await fixture.handler.RunModeration('warn', fixture.context, fixture.data);

    assert.equal(fixture.events.length, 0);
    assert.equal(fixture.response[0][0], 'error');
});

test('threshold crossing applies one timeout and persists its case and expiry', async () => {
    const fixture = CreateWarningFixture({ threshold: { Count: 2, Action: 'MUTE', Duration: 60000 } });

    await fixture.handler.RunModeration('warn', fixture.context, fixture.data);

    assert.equal(fixture.events.filter(([name]) => name === 'timeout').length, 1);
    assert.equal(fixture.events.filter(([name]) => name === 'createCase').length, 1);
    assert.equal(fixture.events.filter(([name]) => name === 'updateGuild').length, 1);
    assert.equal(fixture.data.TimedActions[0].CaseId, 11);
    assert.match(fixture.response[0][2], /Automatic timeout applied/);
});

test('failed automatic timeout keeps the warning and reports the partial outcome', async () => {
    const fixture = CreateWarningFixture({
        threshold: { Count: 2, Action: 'MUTE', Duration: 60000 },
        timeout: async () => { throw new Error('Discord timeout failed'); }
    });

    await fixture.handler.RunModeration('warn', fixture.context, fixture.data);

    assert.equal(fixture.events.filter(([name]) => name === 'createWarning').length, 1);
    assert.equal(fixture.events.filter(([name]) => name === 'createCase').length, 0);
    assert.ok(fixture.events.some(([name]) => name === 'dm'));
    assert.match(fixture.response[0][2], /warning was recorded, but the automatic timeout could not be applied/);
});

test('deleting a warning deactivates its moderation case and updates persistent state atomically', async () => {
    const data = {
        Cases: [{ CaseId: 5, ActionType: 'WARN', Active: true }],
        Warnings: [{ Id: 3, CaseId: 5, UserId: 'target-id', Active: true }]
    };
    const updates = [];
    const responses = [];
    const database = {
        UpdateGuild: async (guildId, update) => {
            await update(data);
            return data;
        },
        UpdateCase: async (...args) => updates.push(args)
    };
    const handler = new CommandHandler({}, database);
    const context = {
        Args: ['3'],
        Guild: { id: 'guild-id', members: { fetch: async () => null } },
        ReplySuccess: async (...args) => responses.push(args),
        ReplyError: async (...args) => responses.push(args)
    };

    await handler.RunModeration('delwarn', context, data);

    assert.deepEqual(data.Warnings, []);
    assert.equal(data.Cases[0].Active, false);
    assert.deepEqual(updates, [['guild-id', 5, { Active: false }]]);
    assert.equal(responses[0][0], 'Entry Deleted');
});

test('active moderation list uses the updated scheduled expiration time', async () => {
    const replies = [];
    const handler = new CommandHandler({}, {});
    const context = {
        Args: [],
        ReplyInfo: async (...args) => replies.push(args)
    };
    const data = {
        Cases: [{
            CaseId: 8,
            UserId: 'user-id',
            ActionType: 'MUTE',
            Active: true,
            Duration: 7200000,
            Timestamp: new Date(Date.now() - 86400000).toISOString()
        }],
        TimedActions: [{ Type: 'MUTE', CaseId: 8, ExpiresAt: Date.now() + 3660000 }]
    };

    await handler.RunModeration('moderations', context, data);

    assert.match(replies[0][1], /1 hour/);
});
