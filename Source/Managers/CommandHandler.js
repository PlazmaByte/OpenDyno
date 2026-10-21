const os = require('node:os');
const { randomUUID } = require('node:crypto');
const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits,
    Routes
} = require('discord.js');
const { AppConfig } = require('../../Configuration/AppConfig');
const { Commands, Groups, SlashCommands, SlashFamilies, SlashRoutes, CommandMap } = require('./CommandRegistry');
const { CommandContext } = require('../Utilities/CommandContext');
const { EmbedFactory } = require('../Utilities/EmbedFactory');
const { ErrorHandler } = require('../Utilities/ErrorHandler');
const { PermissionChecker } = require('../Utilities/PermissionChecker');
const { TimeParser } = require('../Utilities/TimeParser');
const { ArgumentParser } = require('../Utilities/ArgumentParser');

const DefaultReason = 'No reason provided.';
const MentionPattern = /^<@!?(\d+)>$/;
const IdPattern = /^\d{15,22}$/;

class CommandHandler {
    constructor(client, database) {
        this.Client = client;
        this.Database = database;
        this.CommandMap = CommandMap;
    }

    async RegisterSlashCommands() {
        if (!AppConfig.ClientId) {
            console.warn('[Commands] DISCORD_CLIENT_ID is unset; slash commands were not registered.');
            return;
        }
        const route = Routes.applicationCommands(AppConfig.ClientId);
        await this.Client.rest.put(route, { body: [] });
        await this.Client.rest.put(route, { body: SlashCommands });
        console.log(`[Commands] Registered ${SlashCommands.length} slash commands.`);
    }

    async HandleMessage(message) {
        if (!message.guild || message.author.bot) return;
        const data = await this.Database.GetGuild(message.guild.id);
        const prefix = data.Settings.Prefix || AppConfig.DefaultPrefix;
        if (!message.content.startsWith(prefix)) return;
        const input = message.content.slice(prefix.length).trim();
        if (!input) return;
        const [name, ...args] = ArgumentParser.Parse(input);
        if (!name) return;
        const rootName = name.toLowerCase();
        const subcommandName = args[0]?.toLowerCase();
        const route = SlashFamilies[rootName]?.Subcommands[subcommandName];
        if (route) {
            args.shift();
            const command = this.CommandMap.get(route.Command);
            const context = new CommandContext(message, [...(route.Prefix || []), ...args, ...(route.Suffix || [])], false);
            return this.Execute(command, context, data);
        }
        const command = this.CommandMap.get(rootName);
        if (!command) {
            if (SlashFamilies[rootName]) {
                const context = new CommandContext(message, [], false);
                return context.ReplyError('Subcommand Required', `Use \`${prefix}${rootName} <subcommand> ...\`. See \`${prefix}help\` for available subcommands.`);
            }
            const custom = data.CustomCommands[name.toLowerCase()];
            if (custom) return message.reply({ content: custom.slice(0, 2000), allowedMentions: { parse: [], repliedUser: false } });
            return;
        }
        const context = new CommandContext(message, args, false);
        return this.Execute(command, context, data);
    }

    async HandleInteraction(interaction) {
        if (!interaction.isChatInputCommand() || !interaction.guild) return;
        const subcommandName = interaction.options.getSubcommand(false);
        const route = SlashRoutes.get(subcommandName ? `${interaction.commandName}:${subcommandName}` : interaction.commandName);
        if (!route) {
            console.error(`[Commands] Slash route ${interaction.commandName}${subcommandName ? ` ${subcommandName}` : ''} has no handler.`);
            return interaction.reply({ content: 'This command is temporarily unavailable.', ephemeral: true });
        }
        let slashArgs = [];
        if (route.Arguments?.[0]?.Legacy) {
            const input = interaction.options.getString(route.Arguments[0].Name) || '';
            slashArgs = ArgumentParser.Parse(input);
        } else if (route.Arguments?.length) {
            slashArgs = route.Arguments.map(argument => {
                const getter = `get${argument.Type}`;
                const value = interaction.options[getter](argument.Name);
                if (value === null || value === undefined) return '';
                if (argument.Type === 'Boolean' && argument.Name === 'hoist') return value ? 'hoist' : '';
                return ['User', 'Role', 'Channel'].includes(argument.Type) ? value.id : String(value);
            });
            if (route.ArgumentOrder) slashArgs = route.ArgumentOrder.map(index => slashArgs[index]);
            while (slashArgs.length && slashArgs[slashArgs.length - 1] === '') slashArgs.pop();
        }
        const context = new CommandContext(interaction, [...(route.Prefix || []), ...slashArgs, ...(route.Suffix || [])], true);
        const command = this.CommandMap.get(route.Command);
        if (!command) {
            console.error(`[Commands] Slash route target ${route.Command} is not registered.`);
            return interaction.reply({ content: 'This command is temporarily unavailable.', ephemeral: true });
        }
        return this.Execute(command, context);
    }

    async Execute(command, context, loadedData = null) {
        context.CommandName = command.Name;
        let deferTimer;
        if (context.IsSlash) {
            deferTimer = setTimeout(() => {
                if (context.HasResponded || context.Interaction.replied || context.Interaction.deferred) return;
                context.DeferPromise = context.Interaction.deferReply().catch(error => {
                    console.error(`[Commands] Could not defer ${command.Name}:`, error);
                });
            }, 1800);
        }
        try {
            const data = loadedData || await this.Database.GetGuild(context.Guild.id);
            const moduleName = command.Name === 'slowmode'
                ? 'management'
                : command.Category === 'LevelsAndTags' ? 'levelsandtags' : command.Category.toLowerCase();
            const featureModule = command.Name === 'tag' || command.Name === 'tags'
                ? 'tags'
                : moduleName === 'levelsandtags' ? 'levels' : moduleName;
            if (command.Name !== 'module' && (
                data.Modules[moduleName] === false ||
                data.Modules[featureModule] === false
            )) {
                return context.ReplyError('Module Disabled', `The ${command.Category} module is disabled in this server.`);
            }
            if (data.DisabledCommands.includes(command.Name)) {
                return context.ReplyError('Command Disabled', 'This command is disabled in this server.');
            }
            if (data.Ignored.Channels.includes(context.Channel.id) ||
                data.Ignored.Users.includes(context.User.id) ||
                context.Member.roles.cache.some(role => data.Ignored.Roles.includes(role.id))) {
                return context.ReplyError('Commands Ignored', 'Commands are disabled for you or this channel.');
            }
            const accessError = this.CheckAccess(command, context, data);
            if (accessError) return context.ReplyError('Permission Denied', accessError);
            return await this.Run(command.Name, context, data);
        } catch (error) {
            await ErrorHandler.Handle(error, context);
        } finally {
            if (deferTimer) clearTimeout(deferTimer);
        }
    }

    CheckAccess(command, context, data) {
        if (command.Access === 'Everyone') return null;
        const administrator = context.Member.permissions.has(PermissionFlagsBits.Administrator) ||
            context.Guild.ownerId === context.User.id;
        const configuredModerator = data.Mods.some(roleId => context.Member.roles.cache.has(roleId));
        const permission = command.Access === 'Moderator'
            ? context.Member.permissions.has(PermissionFlagsBits.ModerateMembers) || context.Member.permissions.has(PermissionFlagsBits.ManageMessages)
            : administrator;
        const hasAccess = command.Access === 'Administrator'
            ? administrator
            : administrator || configuredModerator || permission;
        if (!hasAccess) {
            return command.Access === 'Moderator'
                ? 'This command requires moderator permissions or a configured moderator role.'
                : 'This command requires server administrator permissions.';
        }
        return null;
    }

    async Run(name, context, data) {
        if (Groups.Core && Object.hasOwn(Groups.Core, name)) return this.RunCore(name, context);
        if (Groups.Moderation && Object.hasOwn(Groups.Moderation, name)) return this.RunModeration(name, context, data);
        if (Groups.Management && Object.hasOwn(Groups.Management, name)) return this.RunManagement(name, context, data);
        if (Groups.Utility && Object.hasOwn(Groups.Utility, name)) return this.RunUtility(name, context, data);
        if (Groups.Engagement && Object.hasOwn(Groups.Engagement, name)) return this.RunEngagement(name, context, data);
        if (Groups.LevelsAndTags && Object.hasOwn(Groups.LevelsAndTags, name)) return this.RunLevelsAndTags(name, context, data);
        return context.ReplyError('Unknown Command', 'This command is not available.');
    }

    async ResolveMember(context, input) {
        const id = input?.match(MentionPattern)?.[1] || input;
        if (!id || !IdPattern.test(id)) return null;
        try {
            return await context.Guild.members.fetch(id);
        } catch (error) {
            if (error.code === 10007 || error.code === 10013) return null;
            throw error;
        }
    }

    ResolveRole(context, input) {
        const id = input?.match(/^<@&(\d+)>$/)?.[1] || input;
        return context.Guild.roles.cache.get(id) || context.Guild.roles.cache.find(role => role.name.toLowerCase() === input?.toLowerCase()) || null;
    }

    ResolveChannel(context, input) {
        const id = input?.match(/^<#(\d+)>$/)?.[1] || input;
        return context.Guild.channels.cache.get(id) || null;
    }

    TargetError(context, member) {
        return PermissionChecker.CanModerate(context, member);
    }

    async RecordModerationCase(context, data, userId, action, reason = DefaultReason, duration = null, active = true, moderatorId = context.User.id) {
        const caseId = await this.Database.CreateCase(context.Guild.id, userId, moderatorId, action, reason, duration, active);
        const channelId = data.Settings.ModLogChannelId;
        if (channelId) {
            try {
                const channel = context.Guild.channels.cache.get(channelId) || await context.Guild.channels.fetch(channelId);
                if (!channel?.isTextBased()) throw new Error(`Configured moderation log channel ${channelId} is not text-based.`);
                const color = action === 'WARN' ? AppConfig.Colors.Warning : AppConfig.Colors.Error;
                const embed = new EmbedBuilder().setColor(color).setTitle(`Moderation Case #${caseId}`)
                    .setDescription(`**Action:** ${action}\n**User:** <@${userId}>\n**Moderator:** <@${moderatorId}>\n**Reason:** ${reason}`)
                    .setTimestamp();
                if (duration) embed.addFields({ name: 'Duration', value: TimeParser.Format(duration) });
                await channel.send({ embeds: [embed] });
            } catch (error) {
                console.error(`[Moderation] Case #${caseId} was stored, but could not be sent to the moderation log:`, error);
            }
        }
        return caseId;
    }

    async RunCore(name, context) {
        const client = this.Client;
        if (name === 'help') {
            const requested = /^\d+$/.test(context.Args[0] || '') ? null : context.Args[0]?.toLowerCase();
            const requestedFamily = requested && SlashFamilies[requested];
            if (requestedFamily) {
                const subcommands = Object.entries(requestedFamily.Subcommands)
                    .map(([subcommand, route]) => `\`${subcommand}\` — ${route.Description}`)
                    .join('\n');
                return context.ReplyInfo(`Help: /${requested}`, `${requestedFamily.Description}\n${subcommands}\n\nPrefix: \`${(await this.Database.GetGuild(context.Guild.id)).Settings.Prefix}${requested} <subcommand> ...\``);
            }
            const command = requested && this.CommandMap.get(requested);
            if (requested && !command) return context.ReplyError('Command Not Found', `No command named \`${requested}\` exists.`);
            if (command) return context.ReplyInfo(`Help: ${command.Name}`, `${command.Description}\n**Category:** ${command.Category}\n**Prefix:** \`${(await this.Database.GetGuild(context.Guild.id)).Settings.Prefix}\``);
            const familyEntries = Object.entries(SlashFamilies).map(([name, family]) => ({
                Category: 'Command Families',
                Name: `/${name} (${Object.keys(family.Subcommands).join(', ')})`
            }));
            const directEntries = Commands
                .filter(item => SlashRoutes.has(item.Name))
                .map(item => ({ Category: item.Category, Name: `/${item.Name}` }));
            const entries = [...familyEntries, ...directEntries]
                .sort((left, right) => left.Category.localeCompare(right.Category) || left.Name.localeCompare(right.Name));
            const pages = [];
            for (let index = 0; index < entries.length; index += 15) {
                const pageEntries = entries.slice(index, index + 15);
                let category = '';
                let page = '';
                for (const entry of pageEntries) {
                    if (category !== entry.Category) {
                        category = entry.Category;
                        page += `${page ? '\n' : ''}**${category}**\n`;
                    }
                    page += `\`${entry.Name}\`  `;
                }
                pages.push(page);
            }
            const pageIndex = Math.min(Math.max(Number(context.Args[0]) - 1 || 0, 0), pages.length - 1);
            const embed = EmbedFactory.CreateInfo('OpenDyno Commands', pages[pageIndex])
                .setFooter({ text: `Page ${pageIndex + 1} of ${pages.length} • Use help <command> or help <page>` });
            return context.Send({ embeds: [embed] });
        }
        if (name === 'info') {
            const { version } = require('../../package.json');
            return context.ReplyInfo('OpenDyno', `Version: ${version}\nNode.js: ${process.version}\nEnvironment: ${process.env.NODE_ENV || 'production'}\nServers: ${client.guilds.cache.size}\nCommands: ${Commands.length}`);
        }
        if (name === 'ping') {
            const sent = Date.now();
            const response = await context.Send({ embeds: [EmbedFactory.CreateInfo('Pong', 'Measuring latency…')] });
            const roundTrip = Date.now() - sent;
            const embed = EmbedFactory.CreateInfo('Pong', `Round trip: ${roundTrip} ms\nWebSocket heartbeat: ${client.ws.ping} ms`);
            return context.IsSlash
                ? context.Interaction.editReply({ embeds: [embed] })
                : response.edit({ embeds: [embed] });
        }
        if (name === 'stats') {
            const memory = process.memoryUsage();
            const users = client.guilds.cache.reduce((sum, guild) => sum + guild.memberCount, 0);
            return context.ReplyInfo('OpenDyno Statistics', `Host: ${os.type()} ${os.release()} (${os.arch()})\nCPU cores: ${os.cpus().length}\nSystem memory: ${(os.totalmem() / 1073741824).toFixed(2)} GB\nProcess memory: ${(memory.rss / 1048576).toFixed(1)} MB\nServers: ${client.guilds.cache.size}\nConnected users: ${users.toLocaleString()}`);
        }
        if (name === 'uptime') return context.ReplyInfo('Uptime', TimeParser.Format(process.uptime() * 1000));
        throw new Error(`No core implementation registered for ${name}.`);
    }

    async RunModeration(name, context, data) {
        const args = [...context.Args];
        const target = await this.ResolveMember(context, args[0]);
        const reasonFrom = (start = 1) => args.slice(start).join(' ').trim() || DefaultReason;
        const caseRows = data.Cases;
        const userIdFrom = args[0]?.match(MentionPattern)?.[1] || args[0];

        if (name === 'case') {
            const entry = caseRows.find(item => String(item.CaseId) === args[0]);
            if (!entry) return context.ReplyError('Case Not Found', `No moderation case \`${args[0] || ''}\` was found.`);
            return context.ReplyInfo(`Case #${entry.CaseId}`, `**Action:** ${entry.ActionType}\n**User:** <@${entry.UserId}>\n**Moderator:** <@${entry.ModeratorId}>\n**Reason:** ${entry.Reason}\n**Date:** <t:${Math.floor(new Date(entry.Timestamp).getTime() / 1000)}:F>\n**Active:** ${entry.Active ? 'Yes' : 'No'}${entry.Duration ? `\n**Duration:** ${TimeParser.Format(entry.Duration)}` : ''}`);
        }
        if (name === 'diagnose') {
            const bot = context.Guild.members.me;
            const missing = ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ManageMessages', 'ModerateMembers', 'BanMembers', 'KickMembers']
                .filter(permission => !bot.permissionsIn(context.Channel).has(PermissionFlagsBits[permission]));
            const overwrites = context.Channel.permissionOverwrites.cache.map(overwrite => `${overwrite.type === 0 ? 'Role' : 'Member'} ${overwrite.id}: allow ${overwrite.allow.bitfield.toString()}, deny ${overwrite.deny.bitfield.toString()}`);
            return context.ReplyInfo('Permission Diagnosis', `Channel: <#${context.Channel.id}>\nBot effective permissions: ${bot.permissionsIn(context.Channel).bitfield.toString()}\nMissing common permissions: ${missing.length ? missing.join(', ') : 'None'}\nExecutor highest role: ${context.Member.roles.highest.name}\nBot highest role: ${bot.roles.highest.name}\nExecutor is above bot: ${context.Member.roles.highest.comparePositionTo(bot.roles.highest) > 0 ? 'Yes' : 'No'}\nChannel overrides: ${overwrites.slice(0, 10).join('\n') || 'None'}`);
        }
        if (name === 'purge') {
            const count = Number(args[0]);
            if (!Number.isInteger(count) || count < 1 || count > 1000) return context.ReplyError('Invalid Count', 'Specify a message count from 1 to 1000.');
            if (!PermissionChecker.HasBotPermission(context, PermissionFlagsBits.ManageMessages)) return context.ReplyError('Missing Permissions', 'OpenDyno needs Manage Messages in this channel.');
            const filter = args[1]?.toLowerCase();
            const filterValue = args[2];
            if (filter === 'user' && !filterValue) return context.ReplyError('User Required', 'Use purge <count> user <member>.');
            if (filter === 'user' && !(filterValue.match(MentionPattern)?.[1] || IdPattern.test(filterValue))) {
                return context.ReplyError('Invalid User', 'Specify a member mention or user ID for the user filter.');
            }
            if (filter && !['bots', 'user', 'links', 'images'].includes(filter)) {
                return context.ReplyError('Invalid Filter', 'Use bots, user <member>, links, or images.');
            }
            const searchLimit = filter ? 1000 : count;
            let fetched = [];
            let before;
            for (let tries = 0; tries < 10 && fetched.length < searchLimit; tries += 1) {
                const batch = await context.Channel.messages.fetch({ limit: Math.min(100, searchLimit - fetched.length), ...(before ? { before } : {}) });
                if (!batch.size) break;
                fetched.push(...batch.values());
                before = batch.last().id;
                if (batch.size < 100) break;
            }
            let candidates = fetched.slice(0, count);
            if (filter === 'bots') candidates = fetched.filter(message => message.author.bot).slice(0, count);
            else if (filter === 'user') {
                const id = filterValue?.match(MentionPattern)?.[1] || filterValue;
                candidates = fetched.filter(message => message.author.id === id).slice(0, count);
            } else if (filter === 'links') candidates = fetched.filter(message => /https?:\/\/\S+/i.test(message.content)).slice(0, count);
            else if (filter === 'images') candidates = fetched.filter(message => message.attachments.size > 0 || /https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(message.content)).slice(0, count);
            let deleted = 0;
            for (let index = 0; index < candidates.length; index += 100) {
                const messages = candidates.slice(index, index + 100);
                deleted += (await context.Channel.bulkDelete(messages, true)).size;
            }
            return context.ReplySuccess('Messages Purged', `Deleted ${deleted} recent message${deleted === 1 ? '' : 's'}.`);
        }
        if (name === 'clean') {
            const count = Math.min(100, Math.max(1, Number(args[0]) || 50));
            const messages = await context.Channel.messages.fetch({ limit: 100 });
            const ours = messages.filter(message => message.author.id === this.Client.user.id).first(count);
            if (!ours.length) return context.ReplyInfo('Cleaned', 'There are no recent OpenDyno messages to delete.');
            const deleted = await context.Channel.bulkDelete(ours, true);
            return context.ReplySuccess('Cleaned', `Deleted ${deleted.size} recent OpenDyno message${deleted.size === 1 ? '' : 's'}.`);
        }
        if (name === 'lock' || name === 'unlock') {
            const channel = this.ResolveChannel(context, args[0]) || context.Channel;
            const everyone = context.Guild.roles.everyone;
            await channel.permissionOverwrites.edit(everyone, { SendMessages: name === 'lock' ? false : null });
            return context.ReplySuccess(name === 'lock' ? 'Channel Locked' : 'Channel Unlocked', `${channel} is ${name === 'lock' ? 'locked' : 'unlocked'}.`);
        }
        if (name === 'lockdown') {
            const channels = context.Guild.channels.cache.filter(channel => channel.isTextBased() && channel.permissionOverwrites);
            let updated = 0;
            for (const channel of channels.values()) {
                await channel.permissionOverwrites.edit(context.Guild.roles.everyone, { SendMessages: false });
                updated += 1;
            }
            return context.ReplySuccess('Server Locked Down', `Locked ${updated} text channels.`);
        }
        if (name === 'members') {
            const role = this.ResolveRole(context, args[0]);
            if (!role) return context.ReplyError('Role Not Found', 'Specify a role by mention, ID, or exact name.');
            await context.Guild.members.fetch();
            const members = role.members.map(member => member.user.tag);
            return context.ReplyInfo(`Members with ${role.name}`, `${members.length} member${members.length === 1 ? '' : 's'}${members.length ? `\n${members.slice(0, 80).join('\n')}` : ''}`);
        }
        if (name === 'modlogs' || name === 'warnings' || name === 'notes') {
            if (!userIdFrom) return context.ReplyError('Member Required', 'Specify a member or user ID.');
            const collection = name === 'modlogs' ? caseRows.filter(item => item.UserId === userIdFrom)
                : name === 'warnings' ? data.Warnings.filter(item => item.UserId === userIdFrom)
                    : data.Notes.filter(item => item.UserId === userIdFrom);
            const title = name === 'modlogs' ? `Moderation history for ${userIdFrom}` : `${name === 'warnings' ? 'Warnings' : 'Notes'} for ${userIdFrom}`;
            const pageSize = 10;
            const pageCount = Math.max(1, Math.ceil(collection.length / pageSize));
            const page = Number(args[1] || 1);
            if (!Number.isInteger(page) || page < 1 || page > pageCount) {
                return context.ReplyError('Invalid Page', `Choose a page from 1 to ${pageCount}.`);
            }
            const lines = collection.slice().reverse().slice((page - 1) * pageSize, page * pageSize).map(item => name === 'modlogs'
                ? `#${item.CaseId} ${item.ActionType} — ${item.Reason}`
                : `#${item.Id} <@${item.ModeratorId}> — ${item.Content || item.Reason}${item.Active === false ? ' (cleared)' : ''}`);
            return context.ReplyInfo(title, `${collection.length} record${collection.length === 1 ? '' : 's'} • Page ${page}/${pageCount}${lines.length ? `\n${lines.join('\n')}` : ''}`);
        }
        if (name === 'clearnotes' || name === 'clearwarn') {
            if (!userIdFrom) return context.ReplyError('Member Required', 'Specify a member or user ID.');
            const key = name === 'clearnotes' ? 'Notes' : 'Warnings';
            const matching = data[key].filter(item => item.UserId === userIdFrom && (key !== 'Warnings' || item.Active !== false));
            const before = matching.length;
            if (key === 'Notes') {
                data.Notes = data.Notes.filter(item => item.UserId !== userIdFrom);
            } else {
                for (const warning of matching) {
                    warning.Active = false;
                    const warningCase = data.Cases.find(entry => entry.CaseId === warning.CaseId);
                    if (warningCase) {
                        warningCase.Active = false;
                        await this.Database.UpdateCase(context.Guild.id, warningCase.CaseId, { Active: false });
                    }
                }
            }
            await this.Database.SaveGuild(context.Guild.id, data);
            return context.ReplySuccess(name === 'clearnotes' ? 'Notes Cleared' : 'Warnings Cleared', name === 'clearnotes'
                ? `Removed ${before} note(s).`
                : `Cleared ${before} active warning(s); warning history was retained.`);
        }
        if (name === 'note') {
            if (!userIdFrom || !args.slice(1).join(' ').trim()) return context.ReplyError('Usage', 'Use note <member> <private note>.');
            const id = Math.max(0, ...data.Notes.map(item => item.Id || 0)) + 1;
            data.Notes.push({ Id: id, UserId: userIdFrom, ModeratorId: context.User.id, Content: args.slice(1).join(' '), Timestamp: new Date().toISOString() });
            await this.Database.SaveGuild(context.Guild.id, data);
            return context.ReplySuccess('Note Added', `Private note #${id} was recorded.`);
        }
        if (name === 'warn') {
            if (!target) return context.ReplyError('Member Not Found', 'Specify a current server member.');
            const error = this.TargetError(context, target);
            if (error) return context.ReplyError('Cannot Warn Member', error);
            const reason = reasonFrom();
            const id = Math.max(0, ...data.Warnings.map(item => item.Id || 0)) + 1;
            const caseId = await this.RecordModerationCase(context, data, target.id, 'WARN', reason);
            data.Cases.push({ CaseId: caseId, GuildId: context.Guild.id, UserId: target.id, ModeratorId: context.User.id, ActionType: 'WARN', Reason: reason, Duration: null, Timestamp: new Date().toISOString(), Active: true });
            data.Warnings.push({ Id: id, UserId: target.id, ModeratorId: context.User.id, Reason: reason, CaseId: caseId, Timestamp: new Date().toISOString(), Active: true });
            const threshold = data.Settings.WarningThresholds;
            const warningCount = data.Warnings.filter(item => item.UserId === target.id && item.Active).length;
            if (threshold?.Count && warningCount === threshold.Count && threshold.Action === 'MUTE') {
                const configuredDuration = Number(threshold.Duration);
                const duration = Number.isSafeInteger(configuredDuration) && configuredDuration > 0 && configuredDuration <= 28 * 86400000
                    ? configuredDuration : 600000;
                await target.timeout(duration, `Automatic warning threshold reached (${warningCount})`);
                const muteCaseId = await this.RecordModerationCase(context, data, target.id, 'MUTE', 'Automatic warning threshold reached.', duration, true, this.Client.user.id);
                data.Cases.push({ CaseId: muteCaseId, GuildId: context.Guild.id, UserId: target.id, ModeratorId: this.Client.user.id, ActionType: 'MUTE', Reason: 'Automatic warning threshold reached.', Duration: duration, Timestamp: new Date().toISOString(), Active: true });
                const expiresAt = Date.now() + duration;
                data.TimedActions.push({ Type: 'MUTE', UserId: target.id, CaseId: muteCaseId, ExpiresAt: expiresAt });
                this.ScheduleMuteExpiry(context.Guild.id, muteCaseId, expiresAt);
            }
            await this.Database.SaveGuild(context.Guild.id, data);
            await target.send({ embeds: [EmbedFactory.CreateWarning('Server Warning', `You were warned in **${context.Guild.name}**.\nReason: ${reason}`)] }).catch(error => {
                if (error.code !== 50007) throw error;
            });
            return context.ReplySuccess('Warning Recorded', `${target.user.tag} was warned. Case #${caseId}; warning #${id}.`);
        }
        if (name === 'ban' || name === 'softban' || name === 'kick' || name === 'mute' || name === 'unmute') {
            const targetId = target?.id || (IdPattern.test(args[0] || '') ? args[0] : null);
            if (!targetId || (!target && !['ban', 'softban'].includes(name))) return context.ReplyError('Member Not Found', 'Specify a current server member.');
            const error = target ? this.TargetError(context, target) : null;
            if (error) return context.ReplyError('Cannot Moderate Member', error);
            if (name === 'mute') {
                const duration = TimeParser.Parse(args[1]);
                if (!duration || duration > 28 * 86400000) return context.ReplyError('Invalid Duration', 'Use a duration such as 10m, 2h, or 1d (maximum 28 days).');
                const reason = reasonFrom(2);
                await target.timeout(duration, reason);
                const caseId = await this.RecordModerationCase(context, data, target.id, 'MUTE', reason, duration);
                data.Cases.push({ CaseId: caseId, GuildId: context.Guild.id, UserId: target.id, ModeratorId: context.User.id, ActionType: 'MUTE', Reason: reason, Duration: duration, Timestamp: new Date().toISOString(), Active: true });
                const expiresAt = Date.now() + duration;
                data.TimedActions.push({ Type: 'MUTE', UserId: target.id, CaseId: caseId, ExpiresAt: expiresAt });
                await this.Database.SaveGuild(context.Guild.id, data);
                this.ScheduleMuteExpiry(context.Guild.id, caseId, expiresAt);
                return context.ReplySuccess('Member Timed Out', `${target.user.tag} was timed out for ${TimeParser.Format(duration)}. Case #${caseId}.`);
            }
            if (name === 'unmute') {
                await target.timeout(null, reasonFrom());
                const muteRoleId = data.Settings.MuteRoleId;
                const muteRole = muteRoleId && context.Guild.roles.cache.get(muteRoleId);
                if (muteRole && target.roles.cache.has(muteRole.id)) await target.roles.remove(muteRole, reasonFrom());
                for (const entry of data.Cases) if (entry.UserId === target.id && entry.ActionType === 'MUTE' && entry.Active) entry.Active = false;
                data.TimedActions = data.TimedActions.filter(item => !(item.Type === 'MUTE' && item.UserId === target.id));
                await this.Database.SaveGuild(context.Guild.id, data);
                for (const entry of data.Cases.filter(item => item.UserId === target.id && item.ActionType === 'MUTE' && !item.Active)) {
                    await this.Database.UpdateCase(context.Guild.id, entry.CaseId, { Active: false });
                }
                const caseId = await this.RecordModerationCase(context, data, target.id, 'UNMUTE', reasonFrom(), null, false);
                return context.ReplySuccess('Timeout Removed', `${target.user.tag}'s timeout was removed. Case #${caseId}.`);
            }
            let purgeDays = 0;
            let reasonIndex = 1;
            if (name === 'ban' || name === 'softban') {
                const parsed = Number(args[1]);
                if (args[1] !== undefined && Number.isInteger(parsed) && parsed >= 0 && parsed <= 7) {
                    purgeDays = parsed;
                    reasonIndex = 2;
                } else if (/^\d+$/.test(args[1] || '')) {
                    return context.ReplyError('Invalid Purge Days', 'Message purge days must be between 0 and 7.');
                }
            }
            const reason = reasonFrom(reasonIndex);
            const targetUser = target?.user || await this.Client.users.fetch(targetId).catch(error => {
                if (error.code === 10013) return null;
                throw error;
            });
            if (targetUser) await targetUser.send({ embeds: [EmbedFactory.CreateWarning(`Server ${name === 'kick' ? 'Removal' : 'Ban'}`, `Action in **${context.Guild.name}**.\nReason: ${reason}`)] }).catch(error => {
                if (error.code !== 50007) throw error;
            });
            if (name === 'kick') await target.kick(reason);
            else {
                await context.Guild.members.ban(targetId, { deleteMessageSeconds: purgeDays * 86400, reason });
                if (name === 'softban') await context.Guild.members.unban(targetId, `Softban completed: ${reason}`);
            }
            const action = name === 'softban' ? 'SOFTBAN' : name.toUpperCase();
            const caseId = await this.RecordModerationCase(context, data, targetId, action, reason, null, name !== 'softban');
            return context.ReplySuccess(`${name === 'kick' ? 'Member Kicked' : name === 'softban' ? 'Softban Complete' : 'Member Banned'}`, `${targetUser?.tag || targetId} was ${name === 'kick' ? 'kicked' : name === 'softban' ? 'softbanned' : 'banned'}. Case #${caseId}.`);
        }
        if (name === 'unban') {
            if (!IdPattern.test(args[0] || '')) return context.ReplyError('User ID Required', 'Use unban <user ID> [reason].');
            await context.Guild.members.unban(args[0], reasonFrom());
            for (const entry of data.Cases) {
                if (entry.UserId === args[0] && entry.ActionType === 'BAN' && entry.Active) {
                    entry.Active = false;
                    await this.Database.UpdateCase(context.Guild.id, entry.CaseId, { Active: false });
                }
            }
            await this.Database.SaveGuild(context.Guild.id, data);
            const caseId = await this.RecordModerationCase(context, data, args[0], 'UNBAN', reasonFrom(), null, false);
            return context.ReplySuccess('User Unbanned', `User ${args[0]} was unbanned. Case #${caseId}.`);
        }
        if (name === 'delnote' || name === 'editnote' || name === 'delwarn') {
            const id = Number(args[0]);
            const key = name === 'delwarn' ? 'Warnings' : 'Notes';
            const entryIndex = data[key].findIndex(item => item.Id === id);
            if (entryIndex === -1) return context.ReplyError('Entry Not Found', `No ${key.toLowerCase()} entry #${id} exists.`);
            if (name === 'editnote') {
                const content = args.slice(1).join(' ').trim();
                if (!content) return context.ReplyError('Text Required', 'Provide the replacement note text.');
                data.Notes[entryIndex].Content = content;
            } else data[key].splice(entryIndex, 1);
            await this.Database.SaveGuild(context.Guild.id, data);
            return context.ReplySuccess(name === 'editnote' ? 'Note Updated' : 'Entry Deleted', `Entry #${id} was ${name === 'editnote' ? 'updated' : 'deleted'}.`);
        }
        if (name === 'reason') {
            const entry = data.Cases.find(item => item.CaseId === Number(args[0]));
            const reason = args.slice(1).join(' ').trim();
            if (!entry || !reason) return context.ReplyError('Usage', 'Use reason <case ID> <new reason>.');
            entry.Reason = reason;
            await this.Database.SaveGuild(context.Guild.id, data);
            await this.Database.UpdateCase(context.Guild.id, entry.CaseId, { Reason: reason });
            return context.ReplySuccess('Reason Updated', `Case #${entry.CaseId} reason was updated.`);
        }
        if (name === 'duration') {
            const entry = data.Cases.find(item => item.CaseId === Number(args[0]) && item.Active && item.Duration);
            const duration = TimeParser.Parse(args[1]);
            if (!entry || !duration || duration > 28 * 86400000) return context.ReplyError('Invalid Duration', 'Use duration <active case ID> <new duration, maximum 28 days>.');
            const member = await this.ResolveMember(context, entry.UserId);
            if (!member) return context.ReplyError('Member Not Found', 'That case member is no longer in this server.');
            await member.timeout(duration, `Duration updated by ${context.User.tag}`);
            entry.Duration = duration;
            const expiresAt = Date.now() + duration;
            let timed = data.TimedActions.find(item => item.CaseId === entry.CaseId);
            if (!timed) {
                timed = { Type: 'MUTE', UserId: entry.UserId, CaseId: entry.CaseId };
                data.TimedActions.push(timed);
            }
            timed.ExpiresAt = expiresAt;
            await this.Database.SaveGuild(context.Guild.id, data);
            await this.Database.UpdateCase(context.Guild.id, entry.CaseId, { Duration: duration });
            this.ScheduleMuteExpiry(context.Guild.id, entry.CaseId, expiresAt);
            return context.ReplySuccess('Duration Updated', `Case #${entry.CaseId} is now ${TimeParser.Format(duration)}.`);
        }
        if (name === 'moderations') {
            const active = data.Cases.filter(entry => entry.Active && entry.Duration);
            const lines = active.map(entry => `#${entry.CaseId} ${entry.ActionType} <@${entry.UserId}> — ${TimeParser.Format(Math.max(0, entry.Timestamp ? new Date(entry.Timestamp).getTime() + entry.Duration - Date.now() : entry.Duration))}`);
            return context.ReplyInfo('Active Temporary Moderations', lines.join('\n') || 'No active temporary actions were found.');
        }
        if (name === 'modstats') {
            const id = args[0]?.match(MentionPattern)?.[1] || args[0] || context.User.id;
            const actions = caseRows.filter(entry => entry.ModeratorId === id);
            const totals = {};
            for (const entry of actions) totals[entry.ActionType] = (totals[entry.ActionType] || 0) + 1;
            return context.ReplyInfo(`Moderator Statistics: ${id}`, `Total recorded actions: ${actions.length}\n${Object.entries(totals).map(([action, count]) => `${action}: ${count}`).join('\n') || 'No actions recorded.'}`);
        }
        if (name === 'star') {
            const message = await context.Channel.messages.fetch(args[0]);
            const reactions = message.reactions.cache.map(reaction => `${reaction.emoji} ${reaction.count}`).join('\n');
            return context.ReplyInfo('Message Reactions', `Message: ${message.url}\n${reactions || 'No reactions.'}`);
        }
        throw new Error(`No moderation implementation registered for ${name}.`);
    }

    async RunManagement(name, context, data) {
        const args = context.Args;
        const toggle = (list, value) => {
            const index = list.indexOf(value);
            if (index === -1) {
                list.push(value);
                return true;
            }
            list.splice(index, 1);
            return false;
        };
        if (name === 'prefix') {
            if (!args[0]) return context.ReplyInfo('Server Prefix', `Current prefix: \`${data.Settings.Prefix}\``);
            if (args[0].length > 5 || /\s/.test(args[0])) return context.ReplyError('Invalid Prefix', 'A prefix must be 1–5 non-space characters.');
            data.Settings.Prefix = args[0];
            await this.Database.SaveGuild(context.Guild.id, data);
            return context.ReplySuccess('Prefix Updated', `Commands now use \`${args[0]}\`.`);
        }
        if (name === 'addmod' || name === 'delmod') {
            const role = this.ResolveRole(context, args[0]);
            if (!role) return context.ReplyError('Role Not Found', 'Specify a role by mention, ID, or exact name.');
            const add = name === 'addmod';
            const exists = data.Mods.includes(role.id);
            if (add === exists) return context.ReplyError('No Change', `That role is ${add ? 'already' : 'not'} a moderator role.`);
            toggle(data.Mods, role.id);
            await this.Database.SaveGuild(context.Guild.id, data);
            return context.ReplySuccess(add ? 'Moderator Role Added' : 'Moderator Role Removed', `${role.name} ${add ? 'can now' : 'can no longer'} use moderator commands.`);
        }
        if (name === 'listmods') {
            const roles = data.Mods.map(id => context.Guild.roles.cache.get(id)).filter(Boolean);
            return context.ReplyInfo('Moderator Roles', roles.map(role => `${role} (${role.members.size} members)`).join('\n') || 'No moderator roles are configured.');
        }
        if (name === 'command') {
            const commandName = args[0]?.toLowerCase();
            const state = args[1]?.toLowerCase();
            if (!this.CommandMap.has(commandName) || !['enabled', 'disabled'].includes(state)) {
                return context.ReplyError('Usage', 'Use command <name> <enabled|disabled>.');
            }
            const canonicalName = this.CommandMap.get(commandName).Name;
            if (['command', 'module'].includes(canonicalName) && state === 'disabled') {
                return context.ReplyError('Command Protected', 'The command and module managers cannot be disabled.');
            }
            const index = data.DisabledCommands.indexOf(canonicalName);
            if (state === 'disabled' && index === -1) data.DisabledCommands.push(canonicalName);
            if (state === 'enabled' && index !== -1) data.DisabledCommands.splice(index, 1);
            await this.Database.SaveGuild(context.Guild.id, data);
            return context.ReplySuccess('Command Updated', `${canonicalName} is now ${state}.`);
        }
        if (name === 'customs') {
            const action = args[0]?.toLowerCase();
            if (action === 'list') {
                const lines = Object.keys(data.CustomCommands);
                return context.ReplyInfo('Custom Commands', lines.map(item => `\`${item}\``).join(', ') || 'No custom commands are configured.');
            }
            if (action === 'add') {
                const key = args[1]?.toLowerCase();
                const response = args.slice(2).join(' ').trim();
                if (!/^[a-z0-9_-]{1,32}$/.test(key || '') || !response) return context.ReplyError('Usage', 'Use customs add <name> <response>.');
                data.CustomCommands[key] = response.slice(0, 2000);
                await this.Database.SaveGuild(context.Guild.id, data);
                return context.ReplySuccess('Custom Command Added', `Use \`${data.Settings.Prefix}${key}\` to post the saved response.`);
            }
            if (action === 'del' || action === 'delete') {
                const key = args[1]?.toLowerCase();
                if (!key || !Object.hasOwn(data.CustomCommands, key)) return context.ReplyError('Command Not Found', 'That custom command does not exist.');
                delete data.CustomCommands[key];
                await this.Database.SaveGuild(context.Guild.id, data);
                return context.ReplySuccess('Custom Command Deleted', `\`${key}\` was deleted.`);
            }
            return context.ReplyInfo('Custom Commands', 'Use customs list, customs add <name> <response>, or customs del <name>.');
        }
        if (name === 'ignorechannel' || name === 'ignorerole' || name === 'ignoreuser') {
            const kind = name === 'ignorechannel' ? 'Channels' : name === 'ignorerole' ? 'Roles' : 'Users';
            const id = args[0]?.match(name === 'ignorechannel' ? /^<#(\d+)>$/ : name === 'ignorerole' ? /^<@&(\d+)>$/ : MentionPattern)?.[1] || args[0];
            const candidate = kind === 'Channels' ? context.Guild.channels.cache.has(id)
                : kind === 'Roles' ? context.Guild.roles.cache.has(id)
                    : IdPattern.test(id || '');
            if (!candidate) return context.ReplyError('Invalid Target', 'Specify a valid channel, role, or user ID.');
            const added = toggle(data.Ignored[kind], id);
            await this.Database.SaveGuild(context.Guild.id, data);
            return context.ReplySuccess('Ignore List Updated', `${kind.slice(0, -1)} ${id} was ${added ? 'added to' : 'removed from'} the ignore list.`);
        }
        if (name === 'ignored') {
            const lines = Object.entries(data.Ignored).map(([kind, ids]) => `**${kind}:** ${ids.map(id => kind === 'Channels' ? `<#${id}>` : kind === 'Roles' ? `<@&${id}>` : `<@${id}>`).join(', ') || 'None'}`);
            return context.ReplyInfo('Ignored Targets', lines.join('\n'));
        }
        if (name === 'logchannel' || name === 'modlogchannel') {
            const setting = name === 'logchannel' ? 'LogChannelId' : 'ModLogChannelId';
            if (!args[0] || args[0].toLowerCase() === 'off') {
                data.Settings[setting] = null;
            } else {
                const channel = this.ResolveChannel(context, args[0]);
                if (!channel?.isTextBased()) return context.ReplyError('Text Channel Required', 'Choose a text channel or use `off` to clear the setting.');
                data.Settings[setting] = channel.id;
            }
            await this.Database.SaveGuild(context.Guild.id, data);
            return context.ReplySuccess('Log Channel Updated', `${name === 'logchannel' ? 'Audit' : 'Moderation'} logs ${data.Settings[setting] ? `will be sent to <#${data.Settings[setting]}>` : 'are disabled'}.`);
        }
        if (name === 'warnthreshold') {
            if (!args[0] || args[0].toLowerCase() === 'off') {
                data.Settings.WarningThresholds = null;
                await this.Database.SaveGuild(context.Guild.id, data);
                return context.ReplySuccess('Warning Threshold Cleared', 'Automatic warning timeouts are disabled.');
            }
            const count = Number(args[0]);
            const duration = TimeParser.Parse(args[1]);
            if (!Number.isInteger(count) || count < 2 || count > 100 || !duration || duration > 28 * 86400000) {
                return context.ReplyError('Invalid Threshold', 'Use warnthreshold <2–100 warnings> <duration up to 28 days>, or warnthreshold off.');
            }
            data.Settings.WarningThresholds = { Count: count, Action: 'MUTE', Duration: duration };
            await this.Database.SaveGuild(context.Guild.id, data);
            return context.ReplySuccess('Warning Threshold Set', `${count} active warnings will trigger a ${TimeParser.Format(duration)} timeout.`);
        }
        if (name === 'language') {
            if (!args[0]) return context.ReplyInfo('Server Language', `Current locale: ${data.Settings.Locale}`);
            if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(args[0])) return context.ReplyError('Invalid Locale', 'Use a locale such as en, en-US, or fr.');
            data.Settings.Locale = args[0];
            await this.Database.SaveGuild(context.Guild.id, data);
            return context.ReplySuccess('Language Updated', `Server locale set to ${args[0]}.`);
        }
        if (name === 'module') {
            const moduleName = args[0]?.toLowerCase();
            const state = args[1]?.toLowerCase();
            if (state === 'status') {
                if (!moduleName) return context.ReplyError('Module Required', 'Specify a module, for example automod.');
                const enabled = moduleName === 'automod'
                    ? data.Settings.AutoModEnabled
                    : data.Modules[moduleName] !== false;
                return context.ReplyInfo(`${moduleName} Status`, `${moduleName} is ${enabled ? 'enabled' : 'disabled'}.`);
            }
            if (!moduleName || !['enabled', 'disabled'].includes(state)) return context.ReplyError('Usage', 'Use module <name> <enabled|disabled>.');
            data.Modules[moduleName] = state === 'enabled';
            if (moduleName === 'automod') data.Settings.AutoModEnabled = state === 'enabled';
            await this.Database.SaveGuild(context.Guild.id, data);
            return context.ReplySuccess('Module Updated', `${moduleName} is now ${state}.`);
        }
        if (name === 'addrole') {
            const roleName = args[0];
            if (!roleName) return context.ReplyError('Role Name Required', 'Use addrole <name> [#hex] [hoist].');
            const color = args.find(value => /^#?[0-9a-f]{6}$/i.test(value));
            const hoist = args.some(value => value.toLowerCase() === 'hoist');
            const role = await context.Guild.roles.create({ name: roleName, color: color ? parseInt(color.replace('#', ''), 16) : undefined, hoist, reason: `Created by ${context.User.tag}` });
            return context.ReplySuccess('Role Created', `Created ${role}.`);
        }
        if (name === 'delrole' || name === 'rolecolor' || name === 'rolename' || name === 'mentionable') {
            const role = this.ResolveRole(context, args[0]);
            if (!role) return context.ReplyError('Role Not Found', 'Specify a role by mention, ID, or exact name.');
            if (role.managed || role.position >= context.Guild.members.me.roles.highest.position) return context.ReplyError('Role Cannot Be Managed', 'OpenDyno cannot modify this managed or higher role.');
            if (name === 'delrole') {
                await role.delete(`Deleted by ${context.User.tag}`);
                return context.ReplySuccess('Role Deleted', `Role ${role.name} was deleted.`);
            }
            if (name === 'rolecolor') {
                if (!/^#?[0-9a-f]{6}$/i.test(args[1] || '')) return context.ReplyError('Invalid Color', 'Provide a HEX color such as #3498db.');
                await role.setColor(parseInt(args[1].replace('#', ''), 16));
            } else if (name === 'rolename') {
                const roleName = args.slice(1).join(' ').trim();
                if (!roleName) return context.ReplyError('Name Required', 'Provide a new role name.');
                await role.setName(roleName);
            } else await role.setMentionable(!role.mentionable);
            return context.ReplySuccess('Role Updated', `${role.name} was updated.`);
        }
        if (name === 'role') {
            const member = await this.ResolveMember(context, args[0]);
            const role = this.ResolveRole(context, args[1]);
            if (!member || !role) return context.ReplyError('Usage', 'Use role <member> <role> [add|remove].');
            const hierarchyError = this.TargetError(context, member);
            if (hierarchyError) return context.ReplyError('Cannot Manage Member', hierarchyError);
            if (role.managed || role.position >= context.Guild.members.me.roles.highest.position ||
                (context.Guild.ownerId !== context.User.id && role.position >= context.Member.roles.highest.position)) {
                return context.ReplyError('Role Hierarchy', 'That role is too high for you or OpenDyno to manage.');
            }
            const shouldAdd = args[2]?.toLowerCase() === 'add' ? true : args[2]?.toLowerCase() === 'remove' ? false : !member.roles.cache.has(role.id);
            await member.roles[shouldAdd ? 'add' : 'remove'](role, `Role command by ${context.User.tag}`);
            return context.ReplySuccess('Member Role Updated', `${role.name} was ${shouldAdd ? 'added to' : 'removed from'} ${member.user.tag}.`);
        }
        if (name === 'setnick') {
            const member = await this.ResolveMember(context, args[0]);
            if (!member) return context.ReplyError('Member Not Found', 'Specify a current server member.');
            const hierarchyError = this.TargetError(context, member);
            if (hierarchyError) return context.ReplyError('Cannot Rename Member', hierarchyError);
            const nickname = args.slice(1).join(' ').trim();
            await member.setNickname(nickname || null, `Changed by ${context.User.tag}`);
            return context.ReplySuccess('Nickname Updated', `${member.user.tag}'s nickname was ${nickname ? 'updated' : 'cleared'}.`);
        }
        if (name === 'nick') {
            const nickname = args.join(' ').trim();
            await context.Guild.members.me.setNickname(nickname || null);
            return context.ReplySuccess('Bot Nickname Updated', `OpenDyno's nickname was ${nickname ? 'updated' : 'cleared'}.`);
        }
        if (name === 'rolepersist' || name === 'temprole') {
            const member = await this.ResolveMember(context, args[0]);
            const role = this.ResolveRole(context, args[1]);
            if (!member || !role) return context.ReplyError('Usage', name === 'temprole' ? 'Use temprole <member> <role> <duration>.' : 'Use rolepersist <member> <role>.');
            const hierarchyError = this.TargetError(context, member);
            if (hierarchyError) return context.ReplyError('Cannot Manage Member', hierarchyError);
            if (role.managed || role.position >= context.Guild.members.me.roles.highest.position ||
                (context.Guild.ownerId !== context.User.id && role.position >= context.Member.roles.highest.position)) return context.ReplyError('Role Hierarchy', 'That role is too high for you or OpenDyno to manage.');
            if (name === 'temprole') {
                const duration = TimeParser.Parse(args[2]);
                if (!duration) return context.ReplyError('Invalid Duration', 'Use a duration such as 10m, 2h, or 1d.');
                await member.roles.add(role);
                const expiresAt = Date.now() + duration;
                const existing = data.TimedActions.find(item => item.Type === 'ROLE' && item.UserId === member.id && item.RoleId === role.id);
                if (existing) existing.ExpiresAt = expiresAt;
                else data.TimedActions.push({ Type: 'ROLE', UserId: member.id, RoleId: role.id, ExpiresAt: expiresAt });
                await this.Database.SaveGuild(context.Guild.id, data);
                this.ScheduleRoleRemoval(context.Guild.id, member.id, role.id, expiresAt);
                return context.ReplySuccess('Temporary Role Added', `${role.name} was granted for ${TimeParser.Format(duration)}.`);
            }
            const roles = data.PersistentRoles[member.id] || [];
            const added = toggle(roles, role.id);
            if (roles.length) data.PersistentRoles[member.id] = roles;
            else delete data.PersistentRoles[member.id];
            await this.Database.SaveGuild(context.Guild.id, data);
            return context.ReplySuccess('Persistent Role Updated', `${role.name} ${added ? 'will be restored when the member rejoins' : 'will no longer be restored'}.`);
        }
        if (name === 'addemote') {
            const attachmentUrl = context.Message?.attachments.first()?.url;
            const url = args[0]?.startsWith('http') ? args[0] : attachmentUrl;
            const emojiName = (args[0]?.startsWith('http') ? args[1] : args[0]) || 'opendyno';
            if (!url) return context.ReplyError('Image Required', 'Provide an image URL or attach an image.');
            const emoji = await context.Guild.emojis.create({ attachment: url, name: emojiName });
            return context.ReplySuccess('Emoji Added', `Added ${emoji}.`);
        }
        if (name === 'announce') {
            const channel = this.ResolveChannel(context, args[0]) || context.Channel;
            const text = (args[0] && channel.id !== context.Channel.id ? args.slice(1).join(' ') : args.join(' ')).trim();
            if (!text) return context.ReplyError('Announcement Required', 'Provide announcement text.');
            await channel.send({ embeds: [EmbedFactory.CreateInfo('Announcement', text)] });
            return context.ReplySuccess('Announcement Sent', `Posted in ${channel}.`);
        }
        if (name === 'slowmode') {
            const seconds = Number(args[0]);
            if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) return context.ReplyError('Invalid Slowmode', 'Specify a value between 0 and 21600 seconds.');
            await context.Channel.setRateLimitPerUser(seconds);
            return context.ReplySuccess('Slowmode Updated', `Slowmode is ${seconds ? `${seconds} seconds` : 'disabled'}.`);
        }
        if (name === 'giveaway') {
            const duration = TimeParser.Parse(args[0]);
            const prize = args.slice(1).join(' ').trim();
            if (!duration || !prize) return context.ReplyError('Usage', 'Use giveaway <duration> <prize>.');
            if (duration > 27 * 86400000) return context.ReplyError('Duration Too Long', 'Giveaway durations must be 27 days or shorter.');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`giveaway_${Date.now()}`).setLabel('Enter giveaway').setStyle(ButtonStyle.Primary));
            const post = await context.Channel.send({ embeds: [EmbedFactory.CreateInfo('Giveaway', `Prize: **${prize}**\nEnds <t:${Math.floor((Date.now() + duration) / 1000)}:R>\nEntries: 0`)], components: [row] });
            const buttonId = row.components[0].data.custom_id;
            const entrants = new Set();
            const collector = post.createMessageComponentCollector({ time: duration });
            collector.on('collect', async interaction => {
                if (interaction.customId !== buttonId) return;
                entrants.add(interaction.user.id);
                await interaction.reply({ content: 'You entered the giveaway.', ephemeral: true });
                await post.edit({ embeds: [EmbedFactory.CreateInfo('Giveaway', `Prize: **${prize}**\nEnds <t:${Math.floor((Date.now() + duration) / 1000)}:R>\nEntries: ${entrants.size}`)] })
                    .catch(error => console.error('[Giveaway] Could not update entry count:', error));
            });
            collector.on('end', async () => {
                const winner = [...entrants][Math.floor(Math.random() * entrants.size)];
                await post.edit({ components: [] }).catch(error => console.error('[Giveaway] Could not disable entry button:', error));
                await context.Channel.send({
                    content: winner ? `Giveaway winner for **${prize}**: <@${winner}>` : `Giveaway for **${prize}** ended with no entries.`,
                    allowedMentions: winner ? { users: [winner] } : { parse: [] }
                }).catch(error => console.error('[Giveaway] Could not announce the result:', error));
            });
            return context.ReplySuccess('Giveaway Started', `The giveaway ends in ${TimeParser.Format(duration)}.`);
        }
        throw new Error(`No management implementation registered for ${name}.`);
    }

    ScheduleRoleRemoval(guildId, userId, roleId, expiresAt) {
        this.ScheduleAt(expiresAt, async () => {
            try {
                const data = await this.Database.GetGuild(guildId);
                const action = data.TimedActions.find(item => item.Type === 'ROLE' && item.UserId === userId && item.RoleId === roleId);
                if (!action) return;
                if (action.ExpiresAt > Date.now()) {
                    this.ScheduleRoleRemoval(guildId, userId, roleId, action.ExpiresAt);
                    return;
                }
                const guild = this.Client.guilds.cache.get(guildId);
                const member = await guild?.members.fetch(userId);
                if (member?.roles.cache.has(roleId)) await member.roles.remove(roleId, 'Temporary role expired');
                await this.Database.UpdateGuild(guildId, data => {
                    data.TimedActions = data.TimedActions.filter(item => !(item.Type === 'ROLE' && item.UserId === userId && item.RoleId === roleId));
                });
            } catch (error) {
                console.error(`[TimedRole] Could not remove ${roleId} from ${userId}:`, error);
            }
        });
    }

    ScheduleMuteExpiry(guildId, caseId, expiresAt) {
        this.ScheduleAt(expiresAt, async () => {
            await this.Database.UpdateGuild(guildId, data => {
                const entry = data.Cases.find(item => item.CaseId === caseId);
                const action = data.TimedActions.find(item => item.Type === 'MUTE' && item.CaseId === caseId);
                if (!entry || !action) return;
                if (action.ExpiresAt > Date.now()) {
                    this.ScheduleMuteExpiry(guildId, caseId, action.ExpiresAt);
                    return;
                }
                if (entry) entry.Active = false;
                data.TimedActions = data.TimedActions.filter(item => item.CaseId !== caseId);
            });
            const data = await this.Database.GetGuild(guildId);
            const entry = data.Cases.find(item => item.CaseId === caseId);
            if (entry && !entry.Active) await this.Database.UpdateCase(guildId, caseId, { Active: false });
        });
    }

    ScheduleAt(timestamp, action) {
        const schedule = () => {
            const remaining = timestamp - Date.now();
            const timer = setTimeout(() => {
                if (remaining > 2147483647) schedule();
                else Promise.resolve().then(action).catch(error => console.error('[Scheduler] Timed action failed:', error));
            }, Math.max(0, Math.min(remaining, 2147483647)));
            timer.unref();
        };
        schedule();
    }

    async RunUtility(name, context, data) {
        const args = context.Args;
        if (name === 'afk') {
            const message = args.join(' ').trim().slice(0, 300) || 'AFK';
            data.Afk[context.User.id] = { Message: message, Since: Date.now() };
            await this.Database.SaveGuild(context.Guild.id, data);
            return context.ReplySuccess('AFK Enabled', message);
        }
        if (name === 'avatar') {
            const userId = args[0]?.match(MentionPattern)?.[1] || args[0] || context.User.id;
            const member = await this.ResolveMember(context, userId);
            const user = member?.user || await this.Client.users.fetch(userId).catch(error => {
                if (error.code === 10013) return null;
                throw error;
            });
            if (!user) return context.ReplyError('User Not Found', 'Could not find that Discord user.');
            const embed = EmbedFactory.CreateInfo(`${user.tag}'s Avatar`, `[Open full-size image](${member?.displayAvatarURL({ size: 4096 }) || user.displayAvatarURL({ size: 4096 })})`)
                .setImage(member?.displayAvatarURL({ size: 1024 }) || user.displayAvatarURL({ size: 1024 }));
            return context.Send({ embeds: [embed] });
        }
        if (name === 'color' || name === 'randomcolor') {
            const color = name === 'randomcolor'
                ? Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, '0').toUpperCase()
                : (args[0] || '').replace(/^#/, '').toUpperCase();
            if (!/^[0-9A-F]{6}$/.test(color)) return context.ReplyError('Invalid Color', 'Provide a six-digit HEX color, such as #3498DB.');
            const embed = EmbedFactory.CreateInfo(`#${color}`, `HEX: \`#${color}\`\nRGB: ${parseInt(color.slice(0, 2), 16)}, ${parseInt(color.slice(2, 4), 16)}, ${parseInt(color.slice(4, 6), 16)}`)
                .setColor(parseInt(color, 16));
            return context.Send({ embeds: [embed] });
        }
        if (name === 'emotes') {
            const list = context.Guild.emojis.cache.map(emoji => `${emoji} \`${emoji.name}\``);
            return context.ReplyInfo('Server Emojis', list.join(' • ') || 'This server has no custom emojis.');
        }
        if (name === 'highlights') {
            const action = args[0]?.toLowerCase();
            const keyword = args.slice(1).join(' ').trim().toLowerCase();
            const list = data.Highlights[context.User.id] || [];
            if (action === 'list' || !action) return context.ReplyInfo('Your Highlights', list.join(', ') || 'No keywords are registered.');
            if (!['add', 'del', 'delete'].includes(action) || !keyword) return context.ReplyError('Usage', 'Use highlights add <keyword>, highlights del <keyword>, or highlights list.');
            if (keyword.length > 80) return context.ReplyError('Keyword Too Long', 'Keywords must be 80 characters or fewer.');
            const existing = list.indexOf(keyword);
            if (action === 'add' && existing === -1) list.push(keyword);
            if (action !== 'add' && existing !== -1) list.splice(existing, 1);
            if (list.length) data.Highlights[context.User.id] = list;
            else delete data.Highlights[context.User.id];
            await this.Database.SaveGuild(context.Guild.id, data);
            return context.ReplySuccess('Highlights Updated', `Keyword \`${keyword}\` ${action === 'add' ? 'registered' : 'removed'}.`);
        }
        if (name === 'inviteinfo') {
            const code = (args[0] || '').match(/(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)?([A-Za-z0-9-]+)/)?.[1];
            if (!code) return context.ReplyError('Invite Required', 'Provide a Discord invite URL or code.');
            const invite = await this.Client.fetchInvite(code);
            const guild = invite.guild;
            return context.ReplyInfo('Invite Information', `Server: ${guild?.name || 'Unknown'}\nServer ID: ${guild?.id || 'Unknown'}\nMembers: ${invite.memberCount ?? 'Unavailable'}\nOnline: ${invite.presenceCount ?? 'Unavailable'}\nChannel: ${invite.channel?.name || 'Unavailable'}\nExpires: ${invite.expiresAt ? `<t:${Math.floor(invite.expiresAt.getTime() / 1000)}:R>` : 'Never or unknown'}`);
        }
        if (name === 'membercount') {
            await context.Guild.members.fetch();
            const bots = context.Guild.members.cache.filter(member => member.user.bot).size;
            return context.ReplyInfo('Member Count', `Total: ${context.Guild.memberCount.toLocaleString()}\nHumans: ${(context.Guild.memberCount - bots).toLocaleString()}\nBots: ${bots.toLocaleString()}`);
        }
        if (name === 'remindme') {
            const duration = TimeParser.Parse(args[0]);
            const reminder = args.slice(1).join(' ').trim();
            if (!duration || !reminder) return context.ReplyError('Usage', 'Use remindme <duration> <message>, for example remindme 30m check the oven.');
            const channelId = context.Channel.id;
            const userId = context.User.id;
            const guildId = context.Guild.id;
            const deadline = Date.now() + duration;
            const reminderId = randomUUID();
            data.TimedActions.push({ Type: 'REMINDER', Id: reminderId, UserId: userId, ChannelId: channelId, Message: reminder, ExpiresAt: deadline });
            await this.Database.SaveGuild(guildId, data);
            this.ScheduleReminder(guildId, reminderId, userId, channelId, reminder, deadline);
            return context.ReplySuccess('Reminder Set', `I’ll remind you in ${TimeParser.Format(duration)}.`);
        }
        if (name === 'roleinfo') {
            const role = this.ResolveRole(context, args[0]);
            if (!role) return context.ReplyError('Role Not Found', 'Specify a role by mention, ID, or exact name.');
            return context.ReplyInfo(`Role: ${role.name}`, `ID: ${role.id}\nCreated: <t:${Math.floor(role.createdTimestamp / 1000)}:D>\nColor: ${role.hexColor}\nMembers: ${role.members.size}\nPermissions: ${role.permissions.toArray().join(', ') || 'None'}\nMentionable: ${role.mentionable}`);
        }
        if (name === 'roles') {
            const roles = [...context.Guild.roles.cache.values()].sort((left, right) => right.position - left.position);
            return context.ReplyInfo('Server Roles', roles.map(role => `${role} — ${role.members.size} member${role.members.size === 1 ? '' : 's'}`).join('\n').slice(0, 4000));
        }
        if (name === 'roll') {
            const match = (args[0] || '1d6').match(/^(\d{1,2})d(\d{1,6})$/i);
            if (!match || Number(match[1]) < 1 || Number(match[1]) > 20 || Number(match[2]) < 2) return context.ReplyError('Invalid Dice', 'Use dice notation such as 1d20 (up to 20 dice).');
            const rolls = Array.from({ length: Number(match[1]) }, () => Math.floor(Math.random() * Number(match[2])) + 1);
            return context.ReplyInfo('Dice Roll', `${match[0]}: ${rolls.join(' + ')} = **${rolls.reduce((sum, value) => sum + value, 0)}**`);
        }
        if (name === 'serverinfo') {
            const guild = context.Guild;
            const channels = guild.channels.cache;
            return context.ReplyInfo(guild.name, `ID: ${guild.id}\nOwner: <@${guild.ownerId}>\nCreated: <t:${Math.floor(guild.createdTimestamp / 1000)}:D>\nMembers: ${guild.memberCount}\nBoosts: ${guild.premiumSubscriptionCount || 0} (level ${guild.premiumTier})\nChannels: ${channels.size} total (${channels.filter(channel => channel.isTextBased()).size} text-based)\nRoles: ${guild.roles.cache.size}\nEmojis: ${guild.emojis.cache.size}`);
        }
        if (name === 'whois') {
            const member = await this.ResolveMember(context, args[0] || context.User.id);
            if (!member) return context.ReplyError('Member Not Found', 'Specify a current server member.');
            const roles = member.roles.cache.filter(role => role.id !== context.Guild.id).sort((a, b) => b.position - a.position).map(role => role.toString());
            return context.ReplyInfo(`User: ${member.user.tag}`, `ID: ${member.id}\nCreated: <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>\nJoined: ${member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown'}\nBot: ${member.user.bot ? 'Yes' : 'No'}\nNickname: ${member.nickname || 'None'}\nRoles: ${roles.join(', ') || 'None'}`);
        }
        throw new Error(`No utility implementation registered for ${name}.`);
    }

    ScheduleReminder(guildId, reminderId, userId, channelId, message, expiresAt) {
        this.ScheduleAt(expiresAt, async () => {
            try {
                const data = await this.Database.GetGuild(guildId);
                const reminder = data.TimedActions.find(item => item.Type === 'REMINDER' && item.Id === reminderId);
                if (!reminder) return;
                if (reminder.ExpiresAt > Date.now()) {
                    this.ScheduleReminder(guildId, reminderId, userId, channelId, message, reminder.ExpiresAt);
                    return;
                }
                const channel = await this.Client.channels.fetch(channelId);
                await channel.send({ content: `<@${userId}> Reminder: ${message}`, allowedMentions: { users: [userId] } });
                await this.Database.UpdateGuild(guildId, data => {
                    data.TimedActions = data.TimedActions.filter(item => !(item.Type === 'REMINDER' && item.Id === reminderId));
                });
            } catch (error) {
                console.error(`[Reminder] Could not deliver reminder for ${userId}:`, error);
            }
        });
    }

    async RestoreTimedActions() {
        for (const guild of this.Client.guilds.cache.values()) {
            const data = await this.Database.GetGuild(guild.id);
            for (const action of data.TimedActions) {
                if (action.Type === 'ROLE') this.ScheduleRoleRemoval(guild.id, action.UserId, action.RoleId, action.ExpiresAt);
                else if (action.Type === 'REMINDER') this.ScheduleReminder(guild.id, action.Id, action.UserId, action.ChannelId, action.Message, action.ExpiresAt);
                else if (action.Type === 'MUTE') this.ScheduleMuteExpiry(guild.id, action.CaseId, action.ExpiresAt);
            }
        }
    }

    async RunEngagement(name, context, data) {
        const args = context.Args;
        if (name === 'flip') return context.ReplyInfo('Coin Flip', Math.random() < 0.5 ? 'Heads' : 'Tails');
        if (name === 'points') {
            const targetId = args[0]?.match(MentionPattern)?.[1] || args[0] || context.User.id;
            const changeArg = args[1];
            const current = Number(data.Points[targetId] || 0);
            if (!changeArg) return context.ReplyInfo('Activity Points', `<@${targetId}> has **${current}** point${current === 1 ? '' : 's'}.`);
            if (!context.Member.permissions.has(PermissionFlagsBits.ManageGuild) &&
                !context.Member.permissions.has(PermissionFlagsBits.Administrator)) {
                return context.ReplyError('Permission Denied', 'Only server managers can change activity points.');
            }
            const amount = Number(changeArg);
            if (!Number.isSafeInteger(amount) || amount === 0) return context.ReplyError('Invalid Amount', 'Specify a non-zero whole number of points.');
            data.Points[targetId] = Math.max(0, current + amount);
            await this.Database.SaveGuild(context.Guild.id, data);
            return context.ReplySuccess('Points Updated', `<@${targetId}> now has ${data.Points[targetId]} points.`);
        }
        if (name === 'poll') {
            const parts = context.RawArgs.split('|').map(value => value.trim()).filter(Boolean);
            const question = parts.shift();
            if (!question || parts.length < 2 || parts.length > 5) return context.ReplyError('Usage', 'Use poll <question> | <option> | <option> (2–5 options).');
            const letters = ['🇦', '🇧', '🇨', '🇩', '🇪'];
            const description = parts.map((option, index) => `${letters[index]} ${option}`).join('\n');
            const post = await context.Channel.send({ embeds: [EmbedFactory.CreateInfo(`Poll: ${question}`, description)] });
            for (let index = 0; index < parts.length; index += 1) await post.react(letters[index]);
            return context.ReplySuccess('Poll Created', `Poll message: ${post.url}`);
        }
        if (name === 'rps') {
            const choice = args[0]?.toLowerCase();
            if (!['rock', 'paper', 'scissors'].includes(choice)) return context.ReplyError('Choose Your Move', 'Use rps <rock|paper|scissors>.');
            const choices = ['rock', 'paper', 'scissors'];
            const bot = choices[Math.floor(Math.random() * choices.length)];
            const result = choice === bot ? 'It’s a tie.' :
                (choice === 'rock' && bot === 'scissors') || (choice === 'paper' && bot === 'rock') || (choice === 'scissors' && bot === 'paper')
                    ? 'You win.' : 'OpenDyno wins.';
            return context.ReplyInfo('Rock, Paper, Scissors', `You: ${choice}\nOpenDyno: ${bot}\n${result}`);
        }
        if (name === 'space') {
            const [positionResponse, crewResponse] = await Promise.all([
                fetch('https://api.wheretheiss.at/v1/satellites/25544', { signal: AbortSignal.timeout(8000) }),
                fetch('https://api.open-notify.org/astros.json', { signal: AbortSignal.timeout(8000) })
            ]);
            if (!positionResponse.ok || !crewResponse.ok) throw new Error(`Space data service returned HTTP ${positionResponse.status}/${crewResponse.status}.`);
            const position = await positionResponse.json();
            const crew = await crewResponse.json();
            return context.ReplyInfo('International Space Station', `Latitude: ${Number(position.latitude).toFixed(4)}°\nLongitude: ${Number(position.longitude).toFixed(4)}°\nAltitude: ${Number(position.altitude).toFixed(1)} km\nCrew aboard: ${(crew.people || []).filter(person => person.craft === 'ISS').map(person => person.name).join(', ') || 'Unavailable'}`);
        }
        throw new Error(`No engagement implementation registered for ${name}.`);
    }

    async RunLevelsAndTags(name, context, data) {
        const args = context.Args;
        const toggle = (list, value) => {
            const index = list.indexOf(value);
            if (index === -1) {
                list.push(value);
                return true;
            }
            list.splice(index, 1);
            return false;
        };
        if (name === 'addrank' || name === 'delrank' || name === 'ranks' || name === 'rank') {
            if (name === 'ranks') {
                const roles = data.Ranks.map(id => context.Guild.roles.cache.get(id)).filter(Boolean);
                return context.ReplyInfo('Self-Assignable Ranks', roles.map(role => role.toString()).join(', ') || 'No self-assignable ranks are configured.');
            }
            const role = this.ResolveRole(context, args[0]);
            if (!role) return context.ReplyError('Role Not Found', 'Specify a role by mention, ID, or exact name.');
            if (name === 'addrank' || name === 'delrank') {
                if (name === 'addrank' && (role.managed || role.position >= context.Guild.members.me.roles.highest.position)) {
                    return context.ReplyError('Role Hierarchy', 'OpenDyno cannot assign that role.');
                }
                const isAdded = data.Ranks.includes(role.id);
                if (name === 'addrank' && !isAdded) data.Ranks.push(role.id);
                if (name === 'delrank' && isAdded) data.Ranks.splice(data.Ranks.indexOf(role.id), 1);
                await this.Database.SaveGuild(context.Guild.id, data);
                return context.ReplySuccess('Rank List Updated', `${role.name} ${name === 'addrank' ? 'is now' : 'is no longer'} self-assignable.`);
            }
            if (!data.Ranks.includes(role.id)) return context.ReplyError('Rank Unavailable', 'That role is not configured as self-assignable.');
            if (role.managed || role.position >= context.Guild.members.me.roles.highest.position) return context.ReplyError('Role Hierarchy', 'OpenDyno cannot assign this role.');
            const member = context.Member;
            const adding = !member.roles.cache.has(role.id);
            await member.roles[adding ? 'add' : 'remove'](role);
            return context.ReplySuccess('Rank Updated', `${role.name} was ${adding ? 'added to' : 'removed from'} your roles.`);
        }
        if (name === 'leaderboard') {
            const top = Object.entries(data.Levels).sort((left, right) => (right[1].Xp || 0) - (left[1].Xp || 0)).slice(0, 10);
            const lines = top.map(([id, profile], index) => `${index + 1}. <@${id}> — Level ${profile.Level || 0}, ${profile.Xp || 0} XP`);
            return context.ReplyInfo('XP Leaderboard', lines.join('\n') || 'No activity has been recorded yet.');
        }
        if (name === 'profile') {
            const member = await this.ResolveMember(context, args[0] || context.User.id);
            if (!member) return context.ReplyError('Member Not Found', 'Specify a current server member.');
            const profile = data.Levels[member.id] || { Xp: 0, Level: 0 };
            const rank = Object.values(data.Levels).filter(value => (value.Xp || 0) > profile.Xp).length + 1;
            return context.ReplyInfo(`Rank Profile: ${member.user.username}`, `Level: ${profile.Level || 0}\nXP: ${profile.Xp || 0}\nServer rank: #${rank}\nActivity points: ${data.Points[member.id] || 0}`);
        }
        if (name === 'slowmode') {
            const seconds = Number(args[0]);
            if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) return context.ReplyError('Invalid Slowmode', 'Specify a value between 0 and 21600 seconds.');
            await context.Channel.setRateLimitPerUser(seconds);
            return context.ReplySuccess('Slowmode Updated', `Slowmode is ${seconds ? `${seconds} seconds` : 'disabled'}.`);
        }
        if (name === 'tags' || name === 'tag') {
            if (name === 'tags') return context.ReplyInfo('Server Tags', Object.keys(data.Tags).map(tag => `\`${tag}\``).join(', ') || 'No tags are configured.');
            const action = args[0]?.toLowerCase();
            if (['add', 'create', 'edit', 'del', 'delete'].includes(action)) {
                if (!context.Member.permissions.has(PermissionFlagsBits.ManageGuild) &&
                    !context.Member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return context.ReplyError('Permission Denied', 'Only server managers can change tags.');
                }
                const key = args[1]?.toLowerCase();
                if (!/^[a-z0-9_-]{1,32}$/.test(key || '')) return context.ReplyError('Tag Name Required', 'Tag names may contain letters, numbers, underscores, and hyphens.');
                if (action === 'del' || action === 'delete') {
                    if (!Object.hasOwn(data.Tags, key)) return context.ReplyError('Tag Not Found', 'That tag does not exist.');
                    delete data.Tags[key];
                } else {
                    const content = args.slice(2).join(' ').trim();
                    if (!content) return context.ReplyError('Tag Content Required', 'Provide tag text.');
                    if (action !== 'edit' && Object.hasOwn(data.Tags, key)) return context.ReplyError('Tag Exists', 'Use tag edit to change this tag.');
                    if (action === 'edit' && !Object.hasOwn(data.Tags, key)) return context.ReplyError('Tag Not Found', 'That tag does not exist.');
                    data.Tags[key] = content.slice(0, 2000);
                }
                await this.Database.SaveGuild(context.Guild.id, data);
                return context.ReplySuccess('Tag Updated', `Tag \`${key}\` was ${action === 'del' || action === 'delete' ? 'deleted' : 'saved'}.`);
            }
            const key = action || '';
            if (!Object.hasOwn(data.Tags, key)) return context.ReplyError('Tag Not Found', `No tag named \`${key}\` exists.`);
            return context.ReplyInfo(key, data.Tags[key]);
        }
        throw new Error(`No levels or tags implementation registered for ${name}.`);
    }

    async HandleGuildActivity(message) {
        if (!message.guild || message.author.bot) return;
        const data = await this.Database.GetGuild(message.guild.id);
        const afk = data.Afk[message.author.id];
        if (afk) {
            delete data.Afk[message.author.id];
            await this.Database.UpdateGuild(message.guild.id, currentData => {
                delete currentData.Afk[message.author.id];
            });
            await message.reply({ content: 'Welcome back. Your AFK status has been cleared.', allowedMentions: { repliedUser: false } });
        }
        for (const userId of message.mentions.users.keys()) {
            const status = data.Afk[userId];
            if (status && userId !== message.author.id) {
                await message.reply({ content: `<@${userId}> is AFK: ${status.Message}`, allowedMentions: { users: [userId], repliedUser: false } });
            }
        }
        for (const [userId, keywords] of Object.entries(data.Highlights)) {
            if (userId === message.author.id || !keywords.some(keyword => message.content.toLowerCase().includes(keyword))) continue;
            const member = await message.guild.members.fetch(userId).catch(error => {
                if (error.code === 10007) return null;
                throw error;
            });
            if (member) await message.channel.send({ content: `<@${userId}> A highlight matched in ${message.channel}.`, allowedMentions: { users: [userId] } });
        }
        if (data.Modules.levels === false || data.Modules.levelsandtags === false) return;
        const cooldownKey = `${message.guild.id}:${message.author.id}`;
        if ((this.XpCooldowns ||= new Map()).has(cooldownKey)) return;
        this.XpCooldowns.set(cooldownKey, Date.now());
        const timer = setTimeout(() => this.XpCooldowns.delete(cooldownKey), 60000);
        timer.unref();
        let reachedLevel = null;
        let levelsEnabled = true;
        try {
            await this.Database.UpdateGuild(message.guild.id, currentData => {
                if (currentData.Modules.levels === false || currentData.Modules.levelsandtags === false) {
                    levelsEnabled = false;
                    return;
                }
                const profile = currentData.Levels[message.author.id] || { Xp: 0, Level: 0 };
                profile.Xp += 1 + Math.floor(Math.random() * 5);
                const nextLevel = Math.floor(Math.sqrt(profile.Xp / 100));
                if (nextLevel > profile.Level) {
                    profile.Level = nextLevel;
                    reachedLevel = nextLevel;
                }
                currentData.Levels[message.author.id] = profile;
            });
        } catch (error) {
            clearTimeout(timer);
            this.XpCooldowns.delete(cooldownKey);
            throw error;
        }
        if (!levelsEnabled) {
            clearTimeout(timer);
            this.XpCooldowns.delete(cooldownKey);
            return;
        }
        if (reachedLevel !== null) {
            await message.channel.send({
                content: `Congratulations <@${message.author.id}>! You reached level ${reachedLevel}.`,
                allowedMentions: { users: [message.author.id] }
            });
        }
    }
}

module.exports = { CommandHandler };
