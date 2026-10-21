const test = require('node:test');
const assert = require('node:assert/strict');
const { Commands, SlashCommands, SlashFamilies, SlashRoutes } = require('../Source/Managers/CommandRegistry');

test('related command families use focused roots instead of broad category roots', () => {
    assert.ok(SlashCommands.length < Commands.length);
    assert.ok(Commands.length >= 70);
    assert.equal(new Set(Commands.map(command => command.Name)).size, Commands.length);
    const reachable = new Set();

    for (const slashCommand of SlashCommands) {
        assert.match(slashCommand.name, /^[a-z0-9_-]{1,32}$/);
        assert.ok(slashCommand.description.length > 0 && slashCommand.description.length <= 100);
        assert.ok(slashCommand.options.length <= 25);

        const isFamily = slashCommand.options.some(option => option.type === 1);
        for (const option of slashCommand.options) {
            if (option.type === 1) {
                const route = SlashRoutes.get(`${slashCommand.name}:${option.name}`);
                assert.ok(route, `missing route for /${slashCommand.name} ${option.name}`);
                assert.ok(Commands.some(command => command.Name === route.Command));
                reachable.add(route.Command);
                assert.ok(option.options.every(argument => argument.name !== 'arguments'));
                assert.ok(option.options.every(argument => argument.description !== 'Command arguments'));
            } else {
                assert.equal(option.type, 3);
                assert.notEqual(option.name, 'arguments');
                assert.ok(option.description.length > 0);
                const route = SlashRoutes.get(slashCommand.name);
                assert.ok(route, `missing direct route for /${slashCommand.name}`);
                reachable.add(route.Command);
            }
        }
        if (!isFamily) {
            const route = SlashRoutes.get(slashCommand.name);
            assert.ok(route, `missing direct route for /${slashCommand.name}`);
            reachable.add(route.Command);
        }
    }

    assert.deepEqual([...reachable].sort(), Commands.map(command => command.Name).sort());
    assert.deepEqual(Object.keys(SlashFamilies.role.Subcommands).slice(0, 2), ['assign', 'remove']);
    assert.deepEqual(Object.keys(SlashFamilies.automod.Subcommands), ['enable', 'disable', 'status']);
    assert.ok(!SlashCommands.some(command => ['moderation', 'core', 'management'].includes(command.name)));
    assert.ok(SlashCommands.length <= 100);
});

test('slash inputs use descriptive names and only appear for commands that accept input', () => {
    const directInputCommands = SlashCommands.filter(command =>
        !command.options.some(option => option.type === 1) && (command.options || []).length > 0
    );
    const familyInputCommands = SlashCommands.flatMap(command =>
        (command.options || [])
            .filter(option => option.type === 1 && option.options.length > 0)
            .map(option => ({ name: `${command.name} ${option.name}`, option: option.options[0] }))
    );
    const inputs = [
        ...directInputCommands.map(command => ({ name: `/${command.name}`, option: command.options[0] })),
        ...familyInputCommands
    ];

    assert.ok(inputs.length > 0);
    for (const input of inputs) {
        assert.match(input.option.name, /^[a-z][a-z0-9_-]{0,31}$/);
        assert.notEqual(input.option.name, 'arguments', input.name);
        assert.notEqual(input.option.description, 'Command arguments', input.name);
        assert.ok(input.option.description.length > 0, input.name);
    }
    assert.ok(!inputs.some(input => input.name === '/ping' || input.name === 'automod status'));
});

test('command names and descriptions fit Discord application command constraints', () => {
    for (const command of Commands) {
        assert.match(command.Name, /^[a-z0-9_-]{1,32}$/);
        assert.ok(command.Description.length > 0 && command.Description.length <= 100);
    }
    for (const [rootName, family] of Object.entries(SlashFamilies)) {
        assert.match(rootName, /^[a-z0-9_-]{1,32}$/);
        for (const subcommandName of Object.keys(family.Subcommands)) {
            assert.match(subcommandName, /^[a-z0-9_-]{1,32}$/);
        }
    }
});
