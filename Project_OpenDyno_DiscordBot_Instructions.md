# OpenDyno Master Architecture & Developer Blueprint

## 1. System Vision & Rules
OpenDyno is an open-source, production-ready Discord bot engineered as a 1:1 functional equivalent to Dyno Bot's moderation, utility, role management, and server administration systems. 

### Mandatory Architectural Constraints:
1. **Strict PascalCase Enforcement:** Every file, class, interface, type, and module name across the entire codebase MUST use `PascalCase` (e.g., `BanCommand.js`, `DatabaseManager.js`, `AuditLogger.js`).
2. **Clean Bot UX & Minimalist Styling:**
   - **No Emoji Spam:** Limit emoji usage to single, functional status indicators in embeds (e.g., `✅` for success, `❌` for errors, `⚠️` for warnings, `🔨` for moderation actions). Never use decorative emoji walls.
   - **Embed Palette:** 
     - Success: `#2ECC71`
     - Moderation / Action Required: `#E74C3C`
     - Warning: `#F1C40F`
     - Information / Utility: `#3498DB`
3. **Zero Complex Power Configuration:** Features must work out-of-the-box with sensible defaults. Server settings are stored in SQLite/PostgreSQL with automatic fallback defaults.
4. **Dual Slash & Prefix Invocation:** Commands must support both Discord Slash Commands and traditional configurable prefix execution (`?command`) through a unified execution path.
5. **Role Hierarchy Safety:** All moderation actions MUST validate that:
   - Target user is not the Server Owner.
   - Target user's highest role is lower than the Executor's highest role.
   - Target user's highest role is lower than the Bot's highest role.

---

## 2. Directory Structure

```text
OpenDyno/
├── Source/
│   ├── Client/
│   │   ├── OpenDynoClient.js
│   │   └── GatewayHandler.js
│   ├── Commands/
│   │   ├── Core/
│   │   │   ├── HelpCommand.js
│   │   │   ├── InfoCommand.js
│   │   │   ├── PingCommand.js
│   │   │   ├── StatsCommand.js
│   │   │   └── UptimeCommand.js
│   │   ├── Moderation/
│   │   │   ├── BanCommand.js
│   │   │   ├── CaseCommand.js
│   │   │   ├── CleanCommand.js
│   │   │   ├── ClearNotesCommand.js
│   │   │   ├── ClearWarnCommand.js
│   │   │   ├── DelNoteCommand.js
│   │   │   ├── DelWarnCommand.js
│   │   │   ├── DiagnoseCommand.js
│   │   │   ├── DurationCommand.js
│   │   │   ├── EditNoteCommand.js
│   │   │   ├── KickCommand.js
│   │   │   ├── LockCommand.js
│   │   │   ├── LockdownCommand.js
│   │   │   ├── MembersCommand.js
│   │   │   ├── ModerationsCommand.js
│   │   │   ├── ModLogsCommand.js
│   │   │   ├── ModStatsCommand.js
│   │   │   ├── MuteCommand.js
│   │   │   ├── NoteCommand.js
│   │   │   ├── NotesCommand.js
│   │   │   ├── PurgeCommand.js
│   │   │   ├── ReasonCommand.js
│   │   │   ├── SoftbanCommand.js
│   │   │   ├── StarCommand.js
│   │   │   ├── UnbanCommand.js
│   │   │   ├── UnlockCommand.js
│   │   │   ├── UnmuteCommand.js
│   │   │   ├── WarnCommand.js
│   │   │   └── WarningsCommand.js
│   │   ├── Management/
│   │   │   ├── AddEmoteCommand.js
│   │   │   ├── AddModCommand.js
│   │   │   ├── AddRoleCommand.js
│   │   │   ├── AnnounceCommand.js
│   │   │   ├── CommandCommand.js
│   │   │   ├── CustomsCommand.js
│   │   │   ├── DelModCommand.js
│   │   │   ├── DelRoleCommand.js
│   │   │   ├── GiveawayCommand.js
│   │   │   ├── IgnoreChannelCommand.js
│   │   │   ├── IgnoreRoleCommand.js
│   │   │   ├── IgnoreUserCommand.js
│   │   │   ├── IgnoredCommand.js
│   │   │   ├── LanguageCommand.js
│   │   │   ├── ListModsCommand.js
│   │   │   ├── MentionableCommand.js
│   │   │   ├── ModuleCommand.js
│   │   │   ├── NickCommand.js
│   │   │   ├── PrefixCommand.js
│   │   │   ├── RoleCommand.js
│   │   │   ├── RoleColorCommand.js
│   │   │   ├── RoleNameCommand.js
│   │   │   ├── RolePersistCommand.js
│   │   │   ├── SetNickCommand.js
│   │   │   └── TempRoleCommand.js
│   │   ├── Utility/
│   │   │   ├── AfkCommand.js
│   │   │   ├── AvatarCommand.js
│   │   │   ├── ColorCommand.js
│   │   │   ├── EmotesCommand.js
│   │   │   ├── HighlightsCommand.js
│   │   │   ├── InviteInfoCommand.js
│   │   │   ├── MemberCountCommand.js
│   │   │   ├── RandomColorCommand.js
│   │   │   ├── RemindMeCommand.js
│   │   │   ├── RoleInfoCommand.js
│   │   │   ├── RolesCommand.js
│   │   │   ├── RollCommand.js
│   │   │   ├── ServerInfoCommand.js
│   │   │   └── WhoisCommand.js
│   │   ├── Engagement/
│   │   │   ├── FlipCommand.js
│   │   │   ├── PointsCommand.js
│   │   │   ├── PollCommand.js
│   │   │   ├── RpsCommand.js
│   │   │   └── SpaceCommand.js
│   │   └── LevelsAndTags/
│   │       ├── AddRankCommand.js
│   │       ├── DelRankCommand.js
│   │       ├── LeaderboardCommand.js
│   │       ├── ProfileCommand.js
│   │       ├── RankCommand.js
│   │       ├── RanksCommand.js
│   │       ├── SlowmodeCommand.js
│   │       ├── TagCommand.js
│   │       └── TagsCommand.js
│   ├── Events/
│   │   ├── InteractionCreateEvent.js
│   │   ├── MessageCreateEvent.js
│   │   ├── MessageDeleteEvent.js
│   │   ├── MessageUpdateEvent.js
│   │   ├── GuildMemberAddEvent.js
│   │   └── GuildMemberRemoveEvent.js
│   ├── Managers/
│   │   ├── CommandHandler.js
│   │   ├── EventHandler.js
│   │   ├── DatabaseManager.js
│   │   ├── ModerationEngine.js
│   │   ├── AuditLogPipeline.js
│   │   └── TimeParser.js
│   └── Utilities/
│       ├── EmbedFactory.js
│       ├── ErrorHandler.js
│       └── PermissionChecker.js
├── Configuration/
│   └── AppConfig.js
├── Index.js
└── package.json
```

---

## 3. Data Schema Specifications

### `GuildSettings` Table
- `GuildId` (TEXT, PK): Discord Guild ID
- `Prefix` (TEXT, Default: `?`): Command prefix
- `LogChannelId` (TEXT, Nullable): Audit log output channel
- `ModLogChannelId` (TEXT, Nullable): Moderation log output channel
- `MuteRoleId` (TEXT, Nullable): Auto-generated/assigned mute role ID
- `AutoModEnabled` (BOOLEAN, Default: true)

### `ModerationCases` Table
- `CaseId` (INTEGER, PK, AutoIncrement)
- `GuildId` (TEXT): Associated Guild ID
- `UserId` (TEXT): Target Member ID
- `ModeratorId` (TEXT): Executor Member ID
- `ActionType` (TEXT): BAN | KICK | MUTE | WARN | SOFTBAN | UNBAN | UNMUTE
- `Reason` (TEXT, Default: "No reason provided.")
- `Duration` (INTEGER, Nullable): Duration in milliseconds if timed action
- `Timestamp` (DATETIME): Action timestamp
- `Active` (BOOLEAN, Default: true)

---

## 4. Standardized Base Class Templates

### `BaseCommand.js`
```javascript
const { PermissionFlagsBits } = require('discord.js');

class BaseCommand {
    constructor(options) {
        this.Name = options.Name;
        this.Description = options.Description;
        this.Category = options.Category;
        this.Aliases = options.Aliases || [];
        this.UserPermissions = options.UserPermissions || [];
        this.BotPermissions = options.BotPermissions || [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
        this.SlashData = options.SlashData;
    }

    async Execute(Context) {
        throw new Error(`Execute method not implemented in ${this.constructor.name}`);
    }
}

module.exports = { BaseCommand };
```

### `CommandContext.js` (Unified Action Layer)
```javascript
const { EmbedFactory } = require('../Utilities/EmbedFactory');

class CommandContext {
    constructor(interactionOrMessage, args = [], isSlash = true) {
        this.Interaction = isSlash ? interactionOrMessage : null;
        this.Message = !isSlash ? interactionOrMessage : null;
        this.IsSlash = isSlash;
        this.Guild = interactionOrMessage.guild;
        this.Channel = interactionOrMessage.channel;
        this.User = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        this.Member = interactionOrMessage.member;
        this.Args = args;
    }

    async ReplySuccess(title, message) {
        const embed = EmbedFactory.CreateSuccess(title, message);
        return this.Send({ embeds: [embed] });
    }

    async ReplyError(title, message) {
        const embed = EmbedFactory.CreateError(title, message);
        return this.Send({ embeds: [embed], ephemeral: true });
    }

    async Send(options) {
        if (this.IsSlash) {
            if (this.Interaction.replied || this.Interaction.deferred) {
                return this.Interaction.followUp(options);
            }
            return this.Interaction.reply(options);
        }
        return this.Channel.send(options);
    }
}

module.exports = { CommandContext };
```

---

## 5. Comprehensive Command Specifications & Behavior Dictionary

The AI engine must generate each command according to these strict 1:1 behavioral definitions:

### Category: Core
- **HelpCommand:** Displays dynamic paginated command list sorted by category. Supports argument lookup (`?help ban`).
- **InfoCommand:** Displays OpenDyno system info, version, environment details, and runtime status.
- **PingCommand:** Calculates round-trip latency and WebSocket heartbeats.
- **StatsCommand:** Displays host OS metrics, memory consumption (RAM), active guild count, and connected users.
- **UptimeCommand:** Formats `process.uptime()` into human-readable duration (`X days, Y hours, Z minutes`).

### Category: Moderation
- **BanCommand:** Accepts member mention/ID, optional message purge days (`0-7`), and reason. Issues ban, logs case ID, sends DM to target if possible.
- **CaseCommand:** Fetches and displays case metadata for a specific `CaseId`.
- **CleanCommand:** Deletes recent messages posted by OpenDyno.
- **ClearNotesCommand:** Deletes all recorded moderator notes for a user.
- **ClearWarnCommand:** Clears all active warnings for a user.
- **DelNoteCommand:** Removes a single note by Note ID.
- **DelWarnCommand:** Removes a single warning entry by Warning ID.
- **DiagnoseCommand:** Evaluates channel overrides, hierarchy, and bot permission bitfields to locate execution failures.
- **DurationCommand:** Modifies the countdown timer of an active temporary punishment.
- **EditNoteCommand:** Updates the text payload of an existing note ID.
- **KickCommand:** Kicks target member from server and registers moderation log case.
- **LockCommand:** Overrides `@everyone` role permissions in target channel to `SendMessages: false`.
- **LockdownCommand:** Locks all channels defined in server moderation configuration.
- **MembersCommand:** Returns total count and list of users assigned to specified role(s).
- **ModerationsCommand:** Displays active temporary mutes and bans along with remaining duration timers.
- **ModLogsCommand:** Displays paginated infraction history for a specified user.
- **ModStatsCommand:** Calculates total actions performed by a specific moderator.
- **MuteCommand:** Applies Discord native timeout or Mute role for a human-readable duration (e.g., `10m`, `2h`, `1d`).
- **NoteCommand:** Appends a private moderator memo to a user profile.
- **NotesCommand:** Fetches all private memos attached to a target user.
- **PurgeCommand:** Bulk deletes specified number of messages (1–1000). Filters: `bots`, `user`, `links`, `images`.
- **ReasonCommand:** Updates reason field for an existing `CaseId`.
- **SoftbanCommand:** Bans and immediately unbans target member to wipe recent message history without permanent removal.
- **StarCommand:** Fetches current Starboard interaction metrics for a message ID.
- **UnbanCommand:** Removes guild ban for target User ID.
- **UnlockCommand:** Restores `@everyone` role write permissions on a locked channel.
- **UnmuteCommand:** Clears timeout or removes Mute role from target member.
- **WarnCommand:** Adds formal warning entry to user record; triggers auto-punishment thresholds if configured.
- **WarningsCommand:** Retrieves warning count and historical warning logs for a user.

### Category: Server Management
- **AddEmoteCommand:** Uploads image URL or attachment as a custom server emoji.
- **AddModCommand:** Grants a role moderator privileges in OpenDyno settings.
- **AddRoleCommand:** Creates new server role with optional hex color and hoist flag.
- **AnnounceCommand:** Sends styled embed announcement to designated channel.
- **CommandCommand:** Toggles individual command state (`enabled`/`disabled`) per guild.
- **CustomsCommand:** Manages custom server commands.
- **DelModCommand:** Revokes moderator privileges from a role.
- **DelRoleCommand:** Deletes a server role.
- **GiveawayCommand:** Initializes timed reaction/button giveaway with random winner selection.
- **IgnoreChannelCommand:** Disables command processing within specified channel.
- **IgnoreRoleCommand:** Disables command invocation for members holding specified role.
- **IgnoreUserCommand:** Prevents specific user from invoking bot commands.
- **IgnoredCommand:** Returns list of all ignored channels, roles, and users.
- **LanguageCommand:** Configures locale for bot messages.
- **ListModsCommand:** Lists all roles and members with moderator permissions.
- **MentionableCommand:** Toggles mentionability flag on a role.
- **ModuleCommand:** Enables/disables entire feature modules (e.g., AutoMod, Logging).
- **NickCommand:** Updates OpenDyno's bot nickname in the server.
- **PrefixCommand:** Reads or updates guild prefix.
- **RoleCommand:** Adds or removes a role from a user.
- **RoleColorCommand:** Edits hex color of a role.
- **RoleNameCommand:** Updates display name of a role.
- **RolePersistCommand:** Configures persistent roles that automatically re-apply if user leaves and rejoin.
- **SetNickCommand:** Updates nickname of target member.
- **TempRoleCommand:** Grants a role to a user for a specified duration, removing it automatically upon expiration.

### Category: Utility & Information
- **AfkCommand:** Sets AFK status message that triggers auto-reply when user is mentioned.
- **AvatarCommand:** Displays user profile avatar or guild avatar in high resolution.
- **ColorCommand:** Generates image preview embed for given HEX color code.
- **EmotesCommand:** Displays list of all custom emojis in current server.
- **HighlightsCommand:** Registers user keyword alerts for server message monitoring.
- **InviteInfoCommand:** Retrieves information regarding a Discord invite link.
- **MemberCountCommand:** Displays server member breakdown (Humans vs Bots).
- **RandomColorCommand:** Generates random HEX color preview.
- **RemindMeCommand:** Sets timed reminder notice.
- **RoleInfoCommand:** Displays role ID, creation date, permissions, and member count.
- **RolesCommand:** Displays list of all guild roles sorted by hierarchy position.
- **RollCommand:** Simulates dice rolls (e.g., `1d20`).
- **ServerInfoCommand:** Displays server details, owner, region, boost status, and channel metrics.
- **WhoisCommand:** Displays detailed user profile info, join dates, account age, and roles.

### Category: Self-Contained Engagement
- **FlipCommand:** Flips a virtual coin (Heads/Tails).
- **PointsCommand:** Views, adds, or deducts guild activity points stored in local DB.
- **PollCommand:** Creates interactive reaction or button poll.
- **RpsCommand:** Interactive Rock, Paper, Scissors game.
- **SpaceCommand:** Queries public space API for ISS coordinates and crew roster.

### Category: Levels & Tags
- **AddRankCommand:** Marks an existing role as self-assignable.
- **DelRankCommand:** Removes role from self-assignable rank list.
- **LeaderboardCommand:** Displays top guild members ranked by level/XP.
- **ProfileCommand:** Displays rank card containing level, XP, and rank position.
- **RankCommand:** Self-assigns or removes joinable rank role.
- **RanksCommand:** Lists all self-assignable ranks.
- **SlowmodeCommand:** Sets channel slowmode cooldown rate.
- **TagCommand:** Retrieves, creates, edits, or deletes custom server tags.
- **TagsCommand:** Displays list of all stored server tags.

---

## 6. Centralized Error Handling Specification

All execution pathways MUST be wrapped inside the `ErrorHandler` utility:

```javascript
class ErrorHandler {
    static async Handle(error, commandContext) {
        console.error(`[Error] Execution failed in ${commandContext.CommandName || 'Unknown'}:`, error);

        if (error.code === 50013) {
            return commandContext.ReplyError('Missing Permissions', 'OpenDyno lacks the required Discord permissions to perform this action.');
        }

        if (error.code === 50007) {
            return commandContext.ReplyError('Direct Messages Blocked', 'Cannot send Direct Message to target user.');
        }

        return commandContext.ReplyError('Execution Error', 'An unexpected internal error occurred while executing this command.');
    }
}

module.exports = { ErrorHandler };
```