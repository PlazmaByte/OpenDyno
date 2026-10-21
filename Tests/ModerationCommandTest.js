const test = require('node:test');
const assert = require('node:assert/strict');
const { CommandHandler } = require('../Source/Managers/CommandHandler');

test('clearing warnings deactivates records and retains the warning history', async () => {
    const updates = [];
    const database = {
        SaveGuild: async () => {},
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
