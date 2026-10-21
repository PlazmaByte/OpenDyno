const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Collection, PermissionFlagsBits } = require('discord.js');
const { DatabaseManager } = require('../Source/Managers/DatabaseManager');
const { AutoRoleManager, DefaultAutoRoleConfig } = require('../Source/Managers/AutoRoleManager');
const { CommandHandler } = require('../Source/Managers/CommandHandler');
const { SlashCommands, SlashFamilies } = require('../Source/Managers/CommandRegistry');
const { EventHandler } = require('../Source/Managers/EventHandler');

const guildId = '123456789012345';
const userId = '223456789012345';
const memberId = '323456789012345';

function CreateRole(id, name, position, options = {}) {
    return {
        id,
        name,
        position,
        managed: options.managed || false,
        guild: { id: guildId },
        comparePositionTo(other) { return this.position - other.position; }
    };
}

function CreateContext(args, { roles = [], hasManageRoles = true, botPosition = 10 } = {}) {
    const roleCache = new Collection(roles.map(role => [role.id, role]));
    const replies = [];
    const context = {
        Args: args,
        Guild: {
            id: guildId,
            ownerId: '423456789012345',
            roles: { cache: roleCache },
            members: {
                me: {
                    permissions: { has: permission => permission === PermissionFlagsBits.ManageRoles && hasManageRoles },
                    roles: { highest: CreateRole('bot-highest', 'Bot highest', botPosition) }
                },
                fetch: async id => ({ id })
            }
        },
        User: { id: userId, tag: 'admin#0001' },
        Member: { roles: { highest: CreateRole('admin-highest', 'Admin highest', 20) } },
        ReplySuccess: async (...values) => replies.push(['success', ...values]),
        ReplyError: async (...values) => replies.push(['error', ...values]),
        ReplyInfo: async (...values) => replies.push(['info', ...values])
    };
    return { context, replies };
}

function CreateMemoryDatabase(initial = {}) {
    const guildData = {
        Settings: {},
        ...initial,
        AutoRole: { ...DefaultAutoRoleConfig(), ...initial.AutoRole }
    };
    return {
        GuildData: guildData,
        GetGuild: async () => guildData,
        UpdateGuild: async (id, update) => {
            await update(guildData);
            return guildData;
        }
    };
}

test('Auto Role commands are exposed under one valid slash command family', () => {
    const command = SlashCommands.find(item => item.name === 'autorole');
    assert.ok(command);
    assert.equal(SlashCommands.filter(item => item.name === 'autorole').length, 1);
    assert.deepEqual(command.options.map(option => option.name), Object.keys(SlashFamilies.autorole.Subcommands));
    assert.ok(command.options.every(option => option.type === 1));
    assert.equal(SlashFamilies.autorole.Subcommands.add.Command, 'autorole');
    assert.deepEqual(SlashFamilies.autorole.Subcommands.add.Prefix, ['add']);
});

test('Auto Role slash and prefix routes share the same command and action arguments', async () => {
    const handler = new CommandHandler({}, {
        GetGuild: async () => ({ Settings: { Prefix: '?' }, CustomCommands: {} })
    });
    const invocations = [];
    handler.Execute = async (command, context) => invocations.push({ name: command.Name, args: context.Args });
    await handler.HandleMessage({
        guild: { id: guildId },
        author: { id: userId, bot: false },
        channel: { id: 'channel-test' },
        content: '?autorole add @role',
        client: {}
    });
    await handler.HandleInteraction({
        guild: { id: guildId },
        commandName: 'autorole',
        isChatInputCommand: () => true,
        options: {
            getSubcommand: () => 'add',
            getRole: () => ({ id: '523456789012345' })
        },
        user: { id: userId },
        member: {},
        channel: { id: 'channel-test' },
        client: {}
    });
    assert.deepEqual(invocations, [
        { name: 'autorole', args: ['add', '@role'] },
        { name: 'autorole', args: ['add', '523456789012345'] }
    ]);
});

test('Auto Role role configuration is idempotent, persistent, and preserves unrelated guild data', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'opendyno-autorole-'));
    const database = new DatabaseManager();
    database.FilePath = path.join(directory, 'OpenDyno.sqlite');
    const role = CreateRole('523456789012345', 'New Members', 1);
    const { context, replies } = CreateContext(['add', role.id], { roles: [role] });
    let closed = false;
    try {
        await database.Initialize();
        await database.UpdateGuild(guildId, data => { data.Settings.Prefix = '!'; });
        await AutoRoleManager.HandleCommand(context, database);
        await AutoRoleManager.HandleCommand(context, database);
        let saved = await database.GetGuild(guildId);
        assert.deepEqual(saved.AutoRole.RoleIds, [role.id]);
        assert.equal(saved.Settings.Prefix, '!');
        assert.equal(replies.filter(reply => reply[0] === 'success').length, 1);
        assert.equal(replies.filter(reply => reply[0] === 'info').length, 1);

        context.Args = ['remove', role.id];
        await AutoRoleManager.HandleCommand(context, database);
        saved = await database.GetGuild(guildId);
        assert.deepEqual(saved.AutoRole.RoleIds, []);
        await database.Close();
        closed = true;

        const reloaded = new DatabaseManager();
        reloaded.FilePath = path.join(directory, 'OpenDyno.sqlite');
        try {
            await reloaded.Initialize();
            assert.deepEqual((await reloaded.GetGuild(guildId)).AutoRole.RoleIds, []);
            assert.equal((await reloaded.GetGuild(guildId)).Settings.Prefix, '!');
        } finally {
            await reloaded.Close();
        }
    } finally {
        if (!closed) await database.Close();
        await fs.rm(directory, { recursive: true, force: true });
    }
});

test('Auto Role mutations serialize concurrent role additions without losing updates', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'opendyno-autorole-race-'));
    const database = new DatabaseManager();
    database.FilePath = path.join(directory, 'OpenDyno.sqlite');
    const roles = [
        CreateRole('523456789012345', 'One', 1),
        CreateRole('623456789012345', 'Two', 2)
    ];
    try {
        await database.Initialize();
        await Promise.all(roles.map(role => {
            const { context } = CreateContext(['add', role.id], { roles });
            return AutoRoleManager.HandleCommand(context, database);
        }));
        assert.deepEqual((await database.GetGuild(guildId)).AutoRole.RoleIds, roles.map(role => role.id));
    } finally {
        await database.Close();
        await fs.rm(directory, { recursive: true, force: true });
    }
});

test('Auto Role mutations require administrator access and enforce role hierarchy and bot permissions', () => {
    const handler = new CommandHandler({}, {});
    const command = handler.CommandMap.get('autorole');
    const { context } = CreateContext([]);
    context.Member.permissions = { has: permission => permission === PermissionFlagsBits.Administrator };
    assert.equal(handler.CheckAccess(command, context, { Mods: [] }), null);
    context.Member.permissions.has = () => false;
    assert.ok(handler.CheckAccess(command, context, { Mods: [] }));

    const highRole = CreateRole('523456789012345', 'Too High', 11);
    let validationContext = CreateContext([], { roles: [highRole], botPosition: 10 }).context;
    assert.match(AutoRoleManager.ValidateAssignableRole(validationContext, highRole), /below OpenDyno/);

    const lowRole = CreateRole('623456789012345', 'Assignable', 1);
    validationContext = CreateContext([], { roles: [lowRole], hasManageRoles: false }).context;
    assert.match(AutoRoleManager.ValidateAssignableRole(validationContext, lowRole), /Manage Roles/);

    const managedRole = CreateRole('723456789012345', 'Integration', 2, { managed: true });
    validationContext = CreateContext([], { roles: [managedRole] }).context;
    assert.match(AutoRoleManager.ValidateAssignableRole(validationContext, managedRole), /Managed integration/);

    const everyoneRole = CreateRole(guildId, '@everyone', 0);
    validationContext = CreateContext([], { roles: [everyoneRole] }).context;
    assert.match(AutoRoleManager.ValidateAssignableRole(validationContext, everyoneRole), /@everyone/);

    const foreignRole = CreateRole('823456789012345', 'Foreign', 1);
    foreignRole.guild.id = '923456789012345';
    validationContext = CreateContext([], { roles: [foreignRole] }).context;
    assert.match(AutoRoleManager.ValidateAssignableRole(validationContext, foreignRole), /does not belong/);

    validationContext = CreateContext([], { roles: [lowRole] }).context;
    validationContext.Member.roles.highest = CreateRole('admin-lowest', 'Admin role', 0);
    assert.match(AutoRoleManager.ValidateAssignableRole(validationContext, lowRole), /below your highest role/);
});

test('Auto Role clear operations require explicit confirmation', async () => {
    const database = CreateMemoryDatabase({ AutoRole: { RoleIds: ['523456789012345'] } });
    const { context, replies } = CreateContext(['clear']);
    await AutoRoleManager.HandleCommand(context, database);
    assert.deepEqual(database.GuildData.AutoRole.RoleIds, ['523456789012345']);
    assert.equal(replies[0][0], 'error');

    context.Args = ['clear', 'confirm'];
    await AutoRoleManager.HandleCommand(context, database);
    assert.deepEqual(database.GuildData.AutoRole.RoleIds, []);
});

test('Auto Role member exemptions and bot/human policies are honored on join', async () => {
    const role = CreateRole('523456789012345', 'Welcome', 1);
    const existing = new Collection();
    const guild = {
        id: guildId,
        roles: { cache: new Collection([[role.id, role]]) },
        members: {
            me: {
                permissions: { has: permission => permission === PermissionFlagsBits.ManageRoles },
                roles: { highest: CreateRole('bot-highest', 'Bot highest', 10) }
            }
        }
    };
    const member = {
        id: memberId,
        user: { bot: false },
        guild,
        roles: {
            cache: existing,
            add: async addedRole => existing.set(addedRole.id, addedRole)
        }
    };
    const config = { AutoRole: { Enabled: true, RoleIds: [role.id], ExemptUserIds: [memberId] } };
    assert.deepEqual(await AutoRoleManager.AssignOnJoin(member, config), { assigned: [], skipped: ['member exempt'], failed: [] });
    assert.equal(existing.has(role.id), false);

    config.AutoRole.ExemptUserIds = [];
    member.user.bot = true;
    assert.deepEqual(await AutoRoleManager.AssignOnJoin(member, config), { assigned: [], skipped: ['account type disabled'], failed: [] });

    config.AutoRole.ApplyToBots = true;
    assert.deepEqual(await AutoRoleManager.AssignOnJoin(member, config), { assigned: [role.id], skipped: [], failed: [] });
    assert.equal(existing.has(role.id), true);
});

test('Auto Role join assignment is inactive when disabled and safely skips when permissions are missing', async () => {
    const role = CreateRole('523456789012345', 'Welcome', 1);
    let additions = 0;
    const guild = {
        id: guildId,
        roles: { cache: new Collection([[role.id, role]]) },
        members: {
            me: {
                permissions: { has: () => false },
                roles: { highest: CreateRole('bot-highest', 'Bot highest', 10) }
            }
        }
    };
    const member = {
        id: memberId,
        user: { bot: false },
        guild,
        roles: { cache: new Collection(), add: async () => { additions += 1; } }
    };
    assert.deepEqual(await AutoRoleManager.AssignOnJoin(member, {
        AutoRole: { Enabled: false, RoleIds: [role.id] }
    }), { assigned: [], skipped: [], failed: [] });

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...values) => warnings.push(values);
    try {
        assert.deepEqual(await AutoRoleManager.AssignOnJoin(member, {
            AutoRole: { Enabled: true, RoleIds: [role.id] }
        }), { assigned: [], skipped: [], failed: [role.id] });
    } finally {
        console.warn = originalWarn;
    }
    assert.equal(additions, 0);
    assert.equal(warnings.length, 1);
});

test('Auto Role join assignment skips invalid roles and continues after an individual API failure', async () => {
    const eligible = CreateRole('523456789012345', 'Welcome', 1);
    const failing = CreateRole('623456789012345', 'Failure', 2);
    const managed = CreateRole('723456789012345', 'Managed', 3, { managed: true });
    const aboveBot = CreateRole('823456789012345', 'Above bot', 11);
    const roles = new Collection([eligible, failing, managed, aboveBot].map(role => [role.id, role]));
    const assigned = new Collection();
    const errors = [];
    const originalError = console.error;
    console.error = (...values) => errors.push(values);
    try {
        const guild = {
            id: guildId,
            roles: { cache: roles },
            members: {
                me: {
                    permissions: { has: permission => permission === PermissionFlagsBits.ManageRoles },
                    roles: { highest: CreateRole('bot-highest', 'Bot highest', 10) }
                }
            }
        };
        const member = {
            id: memberId,
            user: { bot: false },
            guild,
            roles: {
                cache: assigned,
                add: async role => {
                    if (role.id === failing.id) throw new Error('simulated API failure');
                    assigned.set(role.id, role);
                }
            }
        };
        const result = await AutoRoleManager.AssignOnJoin(member, {
            AutoRole: { Enabled: true, ApplyToHumans: true, RoleIds: [eligible.id, failing.id, managed.id, aboveBot.id, '923456789012345'] }
        });
        assert.deepEqual(result.assigned, [eligible.id]);
        assert.deepEqual(result.failed, [failing.id]);
        assert.deepEqual(result.skipped, [managed.id, aboveBot.id, '923456789012345']);
        assert.equal(assigned.has(eligible.id), true);
        assert.ok(errors.some(([message]) => String(message).includes(failing.id)));
    } finally {
        console.error = originalError;
    }
});

test('Auto Role settings and exemptions use the shared persisted configuration', async () => {
    const database = CreateMemoryDatabase();
    const role = CreateRole('523456789012345', 'New Members', 1);
    const { context, replies } = CreateContext(['set-bots', 'true'], { roles: [role] });
    await AutoRoleManager.HandleCommand(context, database);
    context.Args = ['set-humans', 'false'];
    await AutoRoleManager.HandleCommand(context, database);
    context.Args = ['exempt-role-add', role.id];
    await AutoRoleManager.HandleCommand(context, database);
    context.Args = ['exempt-user-add', memberId];
    await AutoRoleManager.HandleCommand(context, database);
    assert.equal(database.GuildData.AutoRole.ApplyToBots, true);
    assert.equal(database.GuildData.AutoRole.ApplyToHumans, false);
    assert.deepEqual(database.GuildData.AutoRole.ExemptRoleIds, [role.id]);
    assert.deepEqual(database.GuildData.AutoRole.ExemptUserIds, [memberId]);
    assert.equal(replies.filter(reply => reply[0] === 'success').length, 4);
});

test('Auto Role enable and disable persist independently from role configuration', async () => {
    const database = CreateMemoryDatabase({ AutoRole: { RoleIds: ['523456789012345'] } });
    const { context } = CreateContext(['enable']);
    await AutoRoleManager.HandleCommand(context, database);
    assert.equal(database.GuildData.AutoRole.Enabled, true);
    assert.deepEqual(database.GuildData.AutoRole.RoleIds, ['523456789012345']);
    context.Args = ['disable'];
    await AutoRoleManager.HandleCommand(context, database);
    assert.equal(database.GuildData.AutoRole.Enabled, false);
    assert.deepEqual(database.GuildData.AutoRole.RoleIds, ['523456789012345']);
});

test('Auto Role role exemptions skip members holding any configured exempt role', async () => {
    const assignedRole = CreateRole('523456789012345', 'Welcome', 1);
    const exemptRole = CreateRole('623456789012345', 'Staff', 2);
    const guild = {
        id: guildId,
        roles: { cache: new Collection([[assignedRole.id, assignedRole]]) },
        members: {
            me: {
                permissions: { has: permission => permission === PermissionFlagsBits.ManageRoles },
                roles: { highest: CreateRole('bot-highest', 'Bot highest', 10) }
            }
        }
    };
    const member = {
        id: memberId,
        user: { bot: false },
        guild,
        roles: {
            cache: new Collection([[exemptRole.id, exemptRole]]),
            add: async () => assert.fail('exempt member must not receive Auto Roles')
        }
    };
    const result = await AutoRoleManager.AssignOnJoin(member, {
        AutoRole: { Enabled: true, RoleIds: [assignedRole.id], ExemptRoleIds: [exemptRole.id] }
    });
    assert.deepEqual(result, { assigned: [], skipped: ['member exempt'], failed: [] });
});

test('Auto Role sync requires explicit confirmation and reports sequential partial outcomes', async () => {
    const welcome = CreateRole('523456789012345', 'Welcome', 1);
    const failing = CreateRole('623456789012345', 'Optional', 2);
    const exempt = CreateRole('723456789012345', 'Staff', 3);
    const roles = new Collection([[welcome.id, welcome], [failing.id, failing]]);
    let activeAssignments = 0;
    let maximumActiveAssignments = 0;
    const makeMember = (id, assignedRoles = new Collection()) => ({
        id,
        user: { bot: false },
        guild: null,
        roles: {
            cache: assignedRoles,
            add: async role => {
                activeAssignments += 1;
                maximumActiveAssignments = Math.max(maximumActiveAssignments, activeAssignments);
                await Promise.resolve();
                activeAssignments -= 1;
                if (role.id === failing.id) throw new Error('simulated API failure');
                assignedRoles.set(role.id, role);
            }
        }
    });
    const eligible = makeMember(memberId);
    const staff = makeMember(userId, new Collection([[exempt.id, exempt]]));
    const members = new Collection([[eligible.id, eligible], [staff.id, staff]]);
    let fetchCount = 0;
    const { context, replies } = CreateContext(['sync']);
    context.Guild.roles.cache = roles;
    context.Guild.members.fetch = async () => {
        fetchCount += 1;
        return members;
    };
    eligible.guild = context.Guild;
    staff.guild = context.Guild;
    const database = CreateMemoryDatabase({
        AutoRole: { Enabled: true, RoleIds: [welcome.id, failing.id], ExemptRoleIds: [exempt.id] }
    });

    await AutoRoleManager.HandleCommand(context, database);
    assert.equal(fetchCount, 0);
    assert.equal(replies[0][0], 'info');
    context.Args = ['sync', 'confirm'];
    await AutoRoleManager.HandleCommand(context, database);
    assert.equal(fetchCount, 1);
    assert.equal(maximumActiveAssignments, 1);
    assert.equal(eligible.roles.cache.has(welcome.id), true);
    assert.equal(staff.roles.cache.has(welcome.id), false);
    assert.match(replies[1][2], /Members updated: 1/);
    assert.match(replies[1][2], /Roles assigned: 1/);
    assert.match(replies[1][2], /Members skipped \(policy or exemption\): 1/);
    assert.match(replies[1][2], /Role assignment failures: 1/);
});

test('only one confirmed Auto Role sync can run per guild at a time', async () => {
    let releaseFetch;
    let fetchStarted;
    const started = new Promise(resolve => { fetchStarted = resolve; });
    const { context: firstContext } = CreateContext(['sync', 'confirm']);
    const { context: secondContext, replies } = CreateContext(['sync', 'confirm']);
    let fetchCount = 0;
    firstContext.Guild.members.fetch = () => {
        fetchCount += 1;
        fetchStarted();
        return new Promise(resolve => { releaseFetch = resolve; });
    };
    secondContext.Guild.members.fetch = async () => {
        fetchCount += 1;
        return new Collection();
    };
    const database = CreateMemoryDatabase({ AutoRole: { Enabled: true, RoleIds: ['523456789012345'] } });
    const firstSync = AutoRoleManager.HandleCommand(firstContext, database);
    await started;
    await AutoRoleManager.HandleCommand(secondContext, database);
    assert.equal(fetchCount, 1);
    assert.equal(replies[0][0], 'error');
    releaseFetch(new Collection());
    await firstSync;
});

test('Auto Role validation reports stale roles and audit records identify configuration changes', async () => {
    const database = CreateMemoryDatabase({ AutoRole: { RoleIds: ['523456789012345'] } });
    const { context, replies } = CreateContext(['validate']);
    await AutoRoleManager.HandleCommand(context, database);
    assert.match(replies[0][2], /no longer exists/);

    const auditEntries = [];
    const auditLog = {
        Write: async (guild, embed) => auditEntries.push({ guildId: guild.id, description: embed.data.description })
    };
    context.Args = ['enable'];
    await AutoRoleManager.HandleCommand(context, database, auditLog);
    assert.equal(auditEntries[0].guildId, guildId);
    assert.match(auditEntries[0].description, new RegExp(userId));
    assert.match(auditEntries[0].description, new RegExp(guildId));
    assert.match(auditEntries[0].description, /Auto Role enable/);
    assert.match(auditEntries[0].description, /succeeded/);
});

test('Auto Role settings are wired into member-join event handling and database failures are contained', async () => {
    const listeners = new Map();
    const client = { on: (event, listener) => listeners.set(event, listener) };
    const errors = [];
    const originalError = console.error;
    console.error = (...values) => errors.push(values);
    try {
        const handler = new EventHandler(client, {
            Database: { GetGuild: async () => { throw new Error('database unavailable'); } }
        }, { Write: async () => {} });
        handler.Register();
        const result = await listeners.get('guildMemberAdd')({
            id: memberId,
            guild: { id: guildId }
        });
        assert.equal(result, undefined);
        assert.ok(errors.some(([message]) => String(message).includes('member join handler failed')));
    } finally {
        console.error = originalError;
    }
});
