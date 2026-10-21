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
