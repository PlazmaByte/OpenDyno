const test = require('node:test');
const assert = require('node:assert/strict');
const { CommandHandler } = require('../Source/Managers/CommandHandler');

function CreateMessage(content) {
    return {
        guild: { id: 'guild-test' },
        author: { id: 'user-test', bot: false },
        channel: { id: 'channel-test' },
        content,
        client: {}
    };
}

test('focused family prefixes dispatch the leaf command and retain arguments', async () => {
    const handler = new CommandHandler({}, {
        GetGuild: async () => ({
            Settings: { Prefix: '?' },
            CustomCommands: {}
        })
    });
    const invoked = [];
    handler.Execute = async (command, context) => invoked.push({ name: command.Name, args: context.Args });

    await handler.HandleMessage(CreateMessage('?role assign @user @role'));
    await handler.HandleMessage(CreateMessage('?role color @role #3498db'));
    await handler.HandleMessage(CreateMessage('?notes add @user "Please follow the rules"'));
    await handler.HandleMessage(CreateMessage('?automod disable'));
    await handler.HandleMessage(CreateMessage('?ban @user "spam links"'));

    assert.deepEqual(invoked.map(item => item.name), ['role', 'rolecolor', 'note', 'module', 'ban']);
    assert.deepEqual(invoked[0].args, ['@user', '@role', 'add']);
    assert.deepEqual(invoked[1].args, ['@role', '#3498db']);
    assert.deepEqual(invoked[2].args, ['@user', 'Please follow the rules']);
    assert.deepEqual(invoked[3].args, ['automod', 'disabled']);
    assert.deepEqual(invoked[4].args, ['@user', 'spam links']);
});

test('slash family routes dispatch their mapped leaf with route arguments', async () => {
    const handler = new CommandHandler({}, {});
    const invoked = [];
    handler.Execute = async (command, context) => invoked.push({ name: command.Name, args: context.Args });
    const makeInteraction = (commandName, subcommand, argumentName, argumentsText) => ({
        guild: { id: 'guild-test' },
        commandName,
        isChatInputCommand: () => true,
        options: {
            getSubcommand: () => subcommand,
            getString: name => name === argumentName ? argumentsText : null
        },
        user: { id: 'user-test' },
        member: {},
        channel: { id: 'channel-test' },
        client: {}
    });

    await handler.HandleInteraction(makeInteraction('role', 'assign', 'member_and_role', '@user @role'));
    await handler.HandleInteraction(makeInteraction('automod', 'disable', null, null));
    await handler.HandleInteraction(makeInteraction('ban', null, 'member_days_reason', '@user 2 repeated spam'));

    assert.deepEqual(invoked.map(item => item.name), ['role', 'module', 'ban']);
    assert.deepEqual(invoked[0].args, ['@user', '@role', 'add']);
    assert.deepEqual(invoked[1].args, ['automod', 'disabled']);
    assert.deepEqual(invoked[2].args, ['@user', '2', 'repeated', 'spam']);
});
