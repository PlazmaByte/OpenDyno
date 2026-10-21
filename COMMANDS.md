# OpenDyno Commands

OpenDyno commands are available as Discord slash commands and as prefix commands. The default prefix is `?`; server administrators can change it with `?prefix <new-prefix>`.

Slash commands use Discord-native option types where appropriate: user, role, and channel inputs offer pickers, and numeric inputs use integer fields. Free-form inputs such as reasons and durations remain text. Quote values containing spaces in prefix commands, for example:

```text
?setnick @member "A new nickname"
?role assign @member @role
/role assign member: @member role: @role
```

## Focused command families

| Slash command | Subcommands | Prefix examples |
| --- | --- | --- |
| `/role` | `assign`, `remove`, `create`, `delete`, `color`, `rename`, `mentionable`, `info`, `list`, `join`, `addrank`, `delrank`, `persist`, `temporary` | `?role assign @member @role`, `?role color @role #3498db` |
| `/notes` | `add`, `list`, `clear`, `delete`, `edit` | `?notes add @member "Follow up with member"` |
| `/warnings` | `add`, `list`, `clear`, `delete` | `?warnings add @member "Reason"` |
| `/cases` | `show`, `reason`, `duration`, `history`, `active`, `stats` | `?cases history @member` |
| `/ignore` | `channel`, `role`, `user`, `list` | `?ignore channel #off-topic` |
| `/channel` | `lock`, `unlock`, `lockdown`, `purge`, `clean`, `slowmode`, `diagnose`, `members`, `reactions` | `?channel purge 25 links` |
| `/automod` | `enable`, `disable`, `status` | `?automod disable` |

Family subcommands accept the same arguments as their original direct command. Their slash form can be used from the Discord command picker; prefix forms use the family and subcommand names shown above.

## Standalone commands

Commands not listed in the family table remain available as individual slash commands and direct prefix commands.

### Core

| Command | Purpose |
| --- | --- |
| `/help [command-or-page]` | Lists commands or shows details for a command or family. |
| `/info` | Shows OpenDyno version and runtime information. |
| `/ping` | Shows round-trip and Discord gateway latency. |
| `/stats` | Shows host, memory, server, and user statistics. |
| `/uptime` | Shows how long OpenDyno has been running. |

### Moderation

| Command | Purpose |
| --- | --- |
| `/ban <member-or-user-id> [purge-days] [reason]` | Bans a member or user; purge days range from 0 to 7. |
| `/kick <member> [reason]` | Kicks a member. |
| `/mute <member> <duration> [reason]` | Times out a member, for example `10m`, `2h`, or `1d` (maximum 28 days). |
| `/unmute <member> [reason]` | Removes a member timeout. |
| `/softban <member-or-user-id> [purge-days] [reason]` | Bans and immediately unbans a user to remove recent messages. |
| `/unban <user-id> [reason]` | Removes a guild ban. |
| `/warn <member> [reason]` | Records a warning. |
| `/warnthreshold <count> <duration>` | Configure an automatic timeout after repeated warnings; use `off` to clear the threshold. |

Moderation actions enforce the target-versus-moderator and target-versus-bot role hierarchy checks. Bot permissions and role position must allow the requested action.

### Server management

| Command | Purpose |
| --- | --- |
| `/addmod <role>` / `/delmod <role>` | Grant or revoke moderator-command access for a role. |
| `/listmods` | Lists configured moderator roles. |
| `/prefix [new-prefix]` | Displays or changes the server prefix. |
| `/module <name> <enabled\|disabled>` | Enables or disables a module. |
| `/command <name> <enabled\|disabled>` | Enables or disables an individual command. |
| `/customs list` | Lists custom text commands. |
| `/customs add <name> <response>` | Creates a custom text command. |
| `/customs del <name>` | Deletes a custom text command. |
| `/logchannel [channel\|off]` | Sets or clears the audit log channel. |
| `/modlogchannel [channel\|off]` | Sets or clears the moderation log channel. |
| `/language [locale]` | Displays or changes the configured locale. |
| `/nick [nickname]` | Changes or clears OpenDyno's server nickname. |
| `/setnick <member> [nickname]` | Changes or clears a member's nickname. |
| `/addemote <image-url> [name]` | Adds an emoji from an image URL; a message attachment can also be used with prefix commands. |
| `/announce [channel] <message>` | Posts an announcement embed. |
| `/giveaway <duration> <prize>` | Starts a button-entry giveaway. |

### Ignore-list commands

Use `/ignore channel`, `/ignore role`, or `/ignore user` to toggle a target on the command ignore list. Use `/ignore list` to view it. The direct commands `/ignorechannel`, `/ignorerole`, `/ignoreuser`, and `/ignored` remain available.

### Utility and information

| Command | Purpose |
| --- | --- |
| `/afk [message]` | Sets your AFK status. |
| `/avatar [member-or-user-id]` | Displays a high-resolution avatar. |
| `/color <hex>` | Displays a HEX color preview. |
| `/randomcolor` | Displays a random HEX color preview. |
| `/emotes` | Lists server emojis. |
| `/highlights add <keyword>` | Adds a keyword alert for your account. |
| `/highlights del <keyword>` | Removes a keyword alert. |
| `/highlights list` | Lists your alert keywords. |
| `/inviteinfo <invite>` | Displays available information about a Discord invite. |
| `/membercount` | Displays total, human, and bot member counts. |
| `/remindme <duration> <message>` | Schedules a reminder in the current channel. |
| `/roleinfo <role>` | Displays a role's details. |
| `/roles` | Lists roles in hierarchy order. |
| `/roll [NdS]` | Rolls dice, for example `1d20`. |
| `/serverinfo` | Displays server details and channel metrics. |
| `/whois [member]` | Displays a member profile and roles. |

### Engagement

| Command | Purpose |
| --- | --- |
| `/flip` | Flips a virtual coin. |
| `/points [member] [amount]` | Views points; a server manager can add or deduct points. |
| `/poll <question> \| <option> \| <option>` | Creates a reaction poll with 2–5 options. |
| `/rps <rock\|paper\|scissors>` | Plays rock, paper, scissors. |
| `/space` | Displays current ISS location and crew information. |

### Levels and tags

| Command | Purpose |
| --- | --- |
| `/addrank <role>` / `/delrank <role>` | Adds or removes a self-assignable role. |
| `/rank <role>` | Adds or removes a self-assignable role for yourself. |
| `/ranks` | Lists self-assignable roles. |
| `/leaderboard` | Displays the server XP leaderboard. |
| `/profile [member]` | Displays XP, level, and rank. |
| `/tag <name>` | Displays a saved tag. |
| `/tag add <name> <text>` | Creates a tag. |
| `/tag edit <name> <text>` | Edits a tag. |
| `/tag del <name>` | Deletes a tag. |
| `/tags` | Lists saved tags. |

## Permission notes

- Bot features depend on its granted Discord permissions and channel overrides. Use `/channel diagnose` to inspect the current channel's effective permissions.
- Commands that change server configuration require administrator access. Moderation commands require moderator permissions or a role configured with `/addmod`.
- Commands can be disabled per server with `/command`, or by disabling a supported module with `/module`.
- Slash commands are registered globally when the bot starts; Discord can take time to propagate command changes.
