const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { AppConfig } = require('../../Configuration/AppConfig');

const IdPattern = /^\d{15,22}$/;
const SyncingGuilds = new Set();
const DefaultAutoRoleConfig = () => ({
    Enabled: false,
    ApplyToHumans: true,
    ApplyToBots: false,
    RoleIds: [],
    ExemptUserIds: [],
    ExemptRoleIds: []
});

class AutoRoleManager {
    static GetConfig(guildData) {
        const defaults = DefaultAutoRoleConfig();
        const stored = guildData.AutoRole || {};
        return {
            Enabled: stored.Enabled === true,
            ApplyToHumans: typeof stored.ApplyToHumans === 'boolean' ? stored.ApplyToHumans : defaults.ApplyToHumans,
            ApplyToBots: typeof stored.ApplyToBots === 'boolean' ? stored.ApplyToBots : defaults.ApplyToBots,
            RoleIds: [...new Set(Array.isArray(stored.RoleIds) ? stored.RoleIds.filter(id => typeof id === 'string') : [])],
            ExemptUserIds: [...new Set(Array.isArray(stored.ExemptUserIds) ? stored.ExemptUserIds.filter(id => typeof id === 'string') : [])],
            ExemptRoleIds: [...new Set(Array.isArray(stored.ExemptRoleIds) ? stored.ExemptRoleIds.filter(id => typeof id === 'string') : [])]
        };
    }

    static FormatList(lines, limit = 1400) {
        let output = '';
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            const separator = output ? '\n' : '';
            if (output.length + separator.length + line.length > limit) {
                const remaining = lines.length - index;
                return `${output}\n...and ${remaining} more.`;
            }
            output += `${separator}${line}`;
        }
        return output || 'None';
    }

    static async HandleCommand(context, database, auditLog) {
        const [action = '', ...args] = context.Args;
        const guildData = await database.GetGuild(context.Guild.id);
        const config = this.GetConfig(guildData);
        const enabled = Boolean(config.Enabled);
        if (action === 'status' || action === 'list') {
            const roles = this.FormatList(config.RoleIds.map(id => `<@&${id}> (${id})`), 2800);
            return context.ReplyInfo('Auto Role Configuration',
                `Status: ${enabled ? 'Enabled' : 'Disabled'}\nHumans: ${config.ApplyToHumans ? 'Enabled' : 'Disabled'}\nBots: ${config.ApplyToBots ? 'Enabled' : 'Disabled'}\nRoles:\n${roles}\nExempt members: ${config.ExemptUserIds.length}\nExempt roles: ${config.ExemptRoleIds.length}`);
        }
        if (!action) {
            return context.ReplyInfo('Auto Role Help',
                'Use `autorole add|remove <role>`, `list`, `clear confirm`, `enable|disable`, `set-bots|set-humans <true|false>`, member/role exemption commands, `exemptions`, `exemptions-clear confirm`, `validate`, or `sync confirm`.');
        }
        if (action === 'enable' || action === 'disable') {
            const next = action === 'enable';
            await this.UpdateConfig(database, context.Guild.id, current => { current.Enabled = next; });
            await this.WriteAudit(auditLog, context, `Auto Role ${action}`, 'Guild configuration', 'succeeded');
            return context.ReplySuccess('Auto Role Updated', `Automatic role assignment is now ${next ? 'enabled' : 'disabled'}.`);
        }
        if (action === 'set-bots' || action === 'set-humans') {
            const value = this.ParseBoolean(args[0]);
            if (value === null) return context.ReplyError('Invalid Setting', `Use \`autorole ${action} true\` or \`autorole ${action} false\`.`);
            const key = action === 'set-bots' ? 'ApplyToBots' : 'ApplyToHumans';
            await this.UpdateConfig(database, context.Guild.id, current => { current[key] = value; });
            await this.WriteAudit(auditLog, context, `Auto Role ${action}`, String(value), 'succeeded');
            return context.ReplySuccess('Auto Role Updated', `${action === 'set-bots' ? 'Bot' : 'Human'} assignments are now ${value ? 'enabled' : 'disabled'}.`);
        }
        if (action === 'add' || action === 'remove') {
            const role = this.ResolveRole(context, args[0]);
            if (action === 'add' && !role) return context.ReplyError('Role Not Found', 'Choose a role from this server.');
            const roleId = role?.id || this.ParseId(args[0], 'role');
            if (!roleId) return context.ReplyError('Role Not Found', 'Choose a role from this server or provide its ID.');
            if (action === 'add') {
                const validation = this.ValidateAssignableRole(context, role);
                if (validation) return context.ReplyError('Role Cannot Be Assigned', validation);
            }
            let changed = false;
            await this.UpdateConfig(database, context.Guild.id, current => {
                if (action === 'add') {
                    if (!current.RoleIds.includes(roleId)) {
                        current.RoleIds.push(roleId);
                        changed = true;
                    }
                } else {
                    const remaining = current.RoleIds.filter(id => id !== roleId);
                    changed = remaining.length !== current.RoleIds.length;
                    current.RoleIds = remaining;
                }
            });
            await this.WriteAudit(auditLog, context, `Auto Role ${action}`, roleId, changed ? 'succeeded' : 'no change');
            return changed
                ? context.ReplySuccess('Auto Role Updated', action === 'add' ? `${role} will be assigned to eligible members who join.` : `Role ${role ? role : roleId} was removed from the configuration.`)
                : context.ReplyInfo('No Change', action === 'add' ? `${role} is already configured.` : `Role ${roleId} was not configured.`);
        }
        if (action === 'clear') {
            if (!this.IsConfirmed(args[0])) return context.ReplyError('Confirmation Required', 'This removes every configured Auto Role. Confirm with `autorole clear confirm`.');
            let removedCount = 0;
            await this.UpdateConfig(database, context.Guild.id, current => {
                removedCount = current.RoleIds.length;
                current.RoleIds = [];
            });
            await this.WriteAudit(auditLog, context, 'Auto Role clear', `${removedCount} configured roles`, 'succeeded');
            return context.ReplySuccess('Auto Roles Cleared', `Removed ${removedCount} configured role${removedCount === 1 ? '' : 's'}.`);
        }
        if (action === 'exemptions') {
            const users = this.FormatList(config.ExemptUserIds.map(id => `<@${id}> (${id})`));
            const roles = this.FormatList(config.ExemptRoleIds.map(id => `<@&${id}> (${id})`));
            return context.ReplyInfo('Auto Role Exemptions', `Members (skipped individually):\n${users}\nExempt roles (members already holding one are skipped):\n${roles}`);
        }
        if (action === 'exemptions-clear') {
            if (!this.IsConfirmed(args[0])) return context.ReplyError('Confirmation Required', 'This removes all Auto Role exemptions. Confirm with `autorole exemptions-clear confirm`.');
            let removedCount = 0;
            await this.UpdateConfig(database, context.Guild.id, current => {
                removedCount = current.ExemptUserIds.length + current.ExemptRoleIds.length;
                current.ExemptUserIds = [];
                current.ExemptRoleIds = [];
            });
            await this.WriteAudit(auditLog, context, 'Auto Role exemptions-clear', `${removedCount} exemptions`, 'succeeded');
            return context.ReplySuccess('Exemptions Cleared', `Removed ${removedCount} exemption${removedCount === 1 ? '' : 's'}.`);
        }
        if (action === 'sync') {
            if (!this.IsConfirmed(args[0])) {
                return context.ReplyInfo('Auto Role Sync Confirmation',
                    `This will fetch existing server members and assign configured roles to eligible members. Review the settings with \`autorole status\`, then confirm explicitly with \`autorole sync confirm\`.`);
            }
            if (!config.Enabled) return context.ReplyError('Auto Role Disabled', 'Enable Auto Roles before syncing existing members.');
            if (!config.RoleIds.length) return context.ReplyError('No Roles Configured', 'Add at least one Auto Role before syncing members.');
            if (SyncingGuilds.has(context.Guild.id)) return context.ReplyError('Sync Already Running', 'An Auto Role sync is already running for this server.');
            const botMember = context.Guild.members.me;
            if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles) || !botMember.roles?.highest) {
                return context.ReplyError('Missing Role Permissions', "OpenDyno needs Manage Roles and a resolvable highest role before syncing members.");
            }

            SyncingGuilds.add(context.Guild.id);
            try {
                let members;
                try {
                    members = await context.Guild.members.fetch();
                } catch (error) {
                    await this.WriteAudit(auditLog, context, 'Auto Role sync', config.RoleIds.join(', '), 'failed to fetch members');
                    throw error;
                }
                let membersAssigned = 0;
                let rolesAssigned = 0;
                let membersSkipped = 0;
                let rolesSkipped = 0;
                let rolesFailed = 0;
                for (const member of members.values()) {
                    const result = await this.AssignOnJoin(member, { AutoRole: config }, false,
                        role => !this.ValidateAssignableRole(context, role));
                    if (result.skipped.includes('member exempt') || result.skipped.includes('account type disabled')) {
                        membersSkipped += 1;
                    } else {
                        rolesSkipped += result.skipped.length;
                        rolesFailed += result.failed.length;
                        rolesAssigned += result.assigned.length;
                        if (result.assigned.length) membersAssigned += 1;
                    }
                }
                const outcome = `processed ${members.size}; assigned ${rolesAssigned}; skipped ${rolesSkipped} roles and ${membersSkipped} members; failed ${rolesFailed}`;
                await this.WriteAudit(auditLog, context, 'Auto Role sync', config.RoleIds.join(', '), outcome);
                return context.ReplyInfo('Auto Role Sync Complete',
                    `Members scanned: ${members.size}\nMembers updated: ${membersAssigned}\nRoles assigned: ${rolesAssigned}\nRoles skipped (held, missing, or ineligible): ${rolesSkipped}\nMembers skipped (policy or exemption): ${membersSkipped}\nRole assignment failures: ${rolesFailed}`);
            } finally {
                SyncingGuilds.delete(context.Guild.id);
            }
        }
        if (action === 'exempt-user-add' || action === 'exempt-user-remove') {
            const userId = this.ParseId(args[0], 'user');
            if (!userId) return context.ReplyError('Member Not Found', 'Specify a valid server member by mention or ID.');
            if (action === 'exempt-user-add') {
                try {
                    await context.Guild.members.fetch(userId);
                } catch (error) {
                    if (error.code === 10007 || error.code === 10013) return context.ReplyError('Member Not Found', 'That user is not a member of this server.');
                    throw error;
                }
            }
            const key = 'ExemptUserIds';
            const changed = await this.MutateIdList(database, context.Guild.id, key, userId, action.endsWith('add'));
            await this.WriteAudit(auditLog, context, `Auto Role ${action}`, userId, changed ? 'succeeded' : 'no change');
            return changed
                ? context.ReplySuccess('Exemptions Updated', `<@${userId}> was ${action.endsWith('add') ? 'exempted from' : 'removed from'} Auto Role assignment.`)
                : context.ReplyInfo('No Change', `<@${userId}> was already in the requested exemption state.`);
        }
        if (action === 'exempt-role-add' || action === 'exempt-role-remove') {
            const role = this.ResolveRole(context, args[0]);
            const roleId = role?.id || this.ParseId(args[0], 'role');
            if (!roleId) return context.ReplyError('Role Not Found', 'Choose a role from this server or provide its ID.');
            if (roleId === context.Guild.id) return context.ReplyError('Invalid Role', 'The @everyone role cannot be an Auto Role exemption.');
            if (action === 'exempt-role-add' && !role) return context.ReplyError('Role Not Found', 'Choose a role from this server.');
            const changed = await this.MutateIdList(database, context.Guild.id, 'ExemptRoleIds', roleId, action.endsWith('add'));
            await this.WriteAudit(auditLog, context, `Auto Role ${action}`, roleId, changed ? 'succeeded' : 'no change');
            return changed
                ? context.ReplySuccess('Exemptions Updated', `${role || `<@&${roleId}>`} was ${action.endsWith('add') ? 'added to' : 'removed from'} Auto Role exemptions.`)
                : context.ReplyInfo('No Change', `Role ${roleId} was already in the requested exemption state.`);
        }
        if (action === 'validate') {
            return this.ValidateConfiguration(context, config);
        }
        return context.ReplyError('Unknown Auto Role Action', 'Use `autorole` without a subcommand to see the supported operations.');
    }

    static async UpdateConfig(database, guildId, update) {
        return database.UpdateGuild(guildId, data => {
            const config = this.GetConfig(data);
            update(config);
            data.AutoRole = config;
        });
    }

    static async MutateIdList(database, guildId, key, id, add) {
        let changed = false;
        await this.UpdateConfig(database, guildId, config => {
            const list = config[key];
            if (add) {
                if (!list.includes(id)) {
                    list.push(id);
                    changed = true;
                }
            } else {
                const next = list.filter(existing => existing !== id);
                changed = next.length !== list.length;
                config[key] = next;
            }
        });
        return changed;
    }

    static ResolveRole(context, input) {
        const roleId = input?.match(/^<@&(\d+)>$/)?.[1] || input;
        return context.Guild.roles.cache.get(roleId) ||
            context.Guild.roles.cache.find(role => role.name.toLowerCase() === input?.toLowerCase()) ||
            null;
    }

    static ParseId(input, type) {
        if (!input) return null;
        const mention = type === 'role' ? input.match(/^<@&(\d+)>$/) : input.match(/^<@!?(\d+)>$/);
        const id = mention?.[1] || input;
        return IdPattern.test(id) ? id : null;
    }

    static ParseBoolean(input) {
        if (typeof input !== 'string') return null;
        if (['true', 'yes', 'on', 'enabled'].includes(input.toLowerCase())) return true;
        if (['false', 'no', 'off', 'disabled'].includes(input.toLowerCase())) return false;
        return null;
    }

    static IsConfirmed(input) {
        return input?.toLowerCase() === 'confirm' || input?.toLowerCase() === 'true';
    }

    static ValidateAssignableRole(context, role) {
        if (!role || context.Guild.roles.cache.get(role.id) !== role || role.guild?.id && role.guild.id !== context.Guild.id) {
            return 'That role does not belong to this server.';
        }
        if (role.id === context.Guild.id) return 'The @everyone role cannot be assigned.';
        if (role.managed) return 'Managed integration roles cannot be assigned by OpenDyno.';
        const botMember = context.Guild.members.me;
        if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) return 'OpenDyno needs the Manage Roles permission.';
        if (!botMember.roles?.highest || role.comparePositionTo(botMember.roles.highest) >= 0) {
            return "The role must be below OpenDyno's highest role.";
        }
        if (context.User.id !== context.Guild.ownerId &&
            (!context.Member?.roles?.highest || role.comparePositionTo(context.Member.roles.highest) >= 0)) {
            return 'The role must be below your highest role.';
        }
        return null;
    }

    static ValidateConfiguration(context, config) {
        const problems = [];
        const botMember = context.Guild.members.me;
        if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) problems.push('OpenDyno is missing Manage Roles.');
        if (!botMember?.roles?.highest) problems.push("OpenDyno's highest role could not be resolved.");
        for (const roleId of config.RoleIds) {
            const role = context.Guild.roles.cache.get(roleId);
            if (!role) problems.push(`Role ${roleId} no longer exists.`);
            else if (role.id === context.Guild.id) problems.push('The @everyone role cannot be assigned.');
            else if (role.managed) problems.push(`${role.name} is a managed role.`);
            else if (botMember?.roles?.highest && role.comparePositionTo(botMember.roles.highest) >= 0) problems.push(`${role.name} is at or above OpenDyno's highest role.`);
            else if (context.User.id !== context.Guild.ownerId &&
                (!context.Member?.roles?.highest || role.comparePositionTo(context.Member.roles.highest) >= 0)) {
                problems.push(`${role.name} is at or above your highest role.`);
            }
        }
        return context.ReplyInfo('Auto Role Validation', problems.length ? problems.join('\n') : 'All configured roles exist and are currently assignable.');
    }

    static async WriteAudit(auditLog, context, operation, target, outcome) {
        if (!auditLog) return;
        const embed = new EmbedBuilder().setColor(AppConfig.Colors.Info).setTitle('Auto Role Configuration Changed')
            .setDescription(`**Actor:** <@${context.User.id}>\n**Guild:** ${context.Guild.id}\n**Operation:** ${operation}\n**Target:** ${target}\n**Outcome:** ${outcome}`)
            .setTimestamp();
        try {
            await auditLog.Write(context.Guild, embed);
        } catch (error) {
            console.error(`[Auto Role] Configuration was saved, but audit logging failed for ${operation}:`, error);
        }
    }

    static async AssignOnJoin(member, guildData, logDiagnostics = true, roleIsAssignable = null) {
        const config = this.GetConfig(guildData);
        if (!config.Enabled || !config.RoleIds.length) return { assigned: [], skipped: [], failed: [] };
        if (member.user.bot ? !config.ApplyToBots : !config.ApplyToHumans) return { assigned: [], skipped: ['account type disabled'], failed: [] };
        if (config.ExemptUserIds.includes(member.id) ||
            member.roles.cache.some(role => config.ExemptRoleIds.includes(role.id))) {
            return { assigned: [], skipped: ['member exempt'], failed: [] };
        }

        const guild = member.guild;
        const botMember = guild.members.me;
        const botHighestRole = botMember?.roles?.highest;
        const assigned = [];
        const skipped = [];
        const failed = [];
        if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles) || !botHighestRole) {
            if (logDiagnostics) console.warn(`[Auto Role] Cannot assign roles in guild ${guild.id}: OpenDyno is missing Manage Roles or its role hierarchy could not be resolved.`);
            return { assigned, skipped, failed: [...config.RoleIds] };
        }
        for (const roleId of config.RoleIds) {
            const role = guild.roles.cache.get(roleId);
            if (!role) {
                skipped.push(roleId);
                if (logDiagnostics) console.warn(`[Auto Role] Configured role ${roleId} no longer exists in guild ${guild.id}.`);
                continue;
            }
            if (role.id === guild.id || role.managed || role.comparePositionTo(botHighestRole) >= 0) {
                skipped.push(roleId);
                if (logDiagnostics) console.warn(`[Auto Role] Configured role ${roleId} is no longer assignable in guild ${guild.id}.`);
                continue;
            }
            if (roleIsAssignable && !roleIsAssignable(role)) {
                skipped.push(roleId);
                continue;
            }
            if (member.roles.cache.has(roleId)) {
                skipped.push(roleId);
                continue;
            }
            try {
                await member.roles.add(role, 'OpenDyno Auto Role on member join');
                assigned.push(roleId);
            } catch (error) {
                failed.push(roleId);
                if (logDiagnostics) console.error(`[Auto Role] Could not assign role ${roleId} to member ${member.id} in guild ${guild.id}:`, error);
            }
        }
        return { assigned, skipped, failed };
    }
}

module.exports = { AutoRoleManager, DefaultAutoRoleConfig };
