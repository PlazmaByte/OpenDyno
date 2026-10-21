# OpenDyno Discord Bot

OpenDyno is a Discord.js 14 bot with unified prefix and slash commands for moderation, server management, utility, engagement, ranks, and tags.

## Requirements and setup

- Node.js 20 or later (Node.js 22.5+ enables the built-in SQLite store)
- A Discord application and bot token
- The bot's **Message Content** and **Server Members** privileged gateway intents enabled in the Discord Developer Portal

1. Install dependencies with `npm install`.
2. Set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` in the process environment. `DATABASE_URL` is optional; TLS certificate verification is enabled for PostgreSQL by default. Set `DATABASE_SSL=false` only for a PostgreSQL server that does not use SSL.
3. Invite the bot with the `bot` and `applications.commands` scopes and only the permissions needed for enabled commands. Common permissions include View Channels, Send Messages, Embed Links, Read Message History, Manage Messages, Moderate Members, Ban Members, Kick Members, Manage Roles, Manage Channels, Manage Nicknames, and Manage Emojis and Stickers.
4. Start the bot with `npm start`.

Slash commands group only related operations into focused families instead of broad category menus. Examples include `/role assign`, `/role color`, `/notes add`, `/warnings clear`, `/cases history`, `/channel purge`, `/ignore user`, and `/automod enable`. Unrelated commands remain directly available (for example `/ban`, `/avatar`, and `/ping`). Prefix commands keep their existing direct form (for example `?ban @member`) and support the same focused families (for example `?role assign @member @role`). Slash commands use Discord-native user, role, and channel pickers and integer fields where appropriate; free-form reasons and other text remain text inputs. Both invocation styles support quoting multi-word arguments, such as `?setnick @member "A new nickname"` or `/role rename role: @role new_name: "Community Helper"`. Server administrators can change the prefix with `?prefix <new-prefix>`. Slash command propagation may take time on Discord.

## Auto Roles

Server administrators can configure roles to be assigned when eligible members join:

- `/autorole add <role>` / `?autorole add @role`
- `/autorole remove <role>` / `?autorole remove @role`
- `/autorole list` and `/autorole status`
- `/autorole enable` / `/autorole disable`
- `/autorole set-humans <enabled>` and `/autorole set-bots <enabled>`
- `/autorole exempt-user-add <member>` / `exempt-user-remove <member>`
- `/autorole exempt-role-add <role>` / `exempt-role-remove <role>`
- `/autorole exemptions` to list exemptions
- `/autorole clear confirm:true` and `/autorole exemptions-clear confirm:true` to clear settings after explicit confirmation
- `/autorole validate` to check configured roles and the bot's Manage Roles access and role hierarchy
- `/autorole sync confirm:true` to deliberately apply the configured roles to eligible existing members

The equivalent prefix forms use `?autorole <subcommand> ...`; clear operations require the extra `confirm` argument (for example, `?autorole clear confirm`). Auto Roles are disabled until enabled, apply to humans by default, and do not apply to bots by default. A member exemption skips that member; a role exemption skips any joining member who already has at least one exempt role. On join, deleted, managed, already-held, or no-longer-assignable roles are skipped, and one failed assignment does not prevent other configured roles from being attempted. OpenDyno requires the server-level **Manage Roles** permission and must be positioned above each configured role. Configuration mutations are stored in the existing per-guild database record and are included in the configured audit log when available.

The existing-member sync is separate from join handling and configuration changes never trigger it. It first displays a warning; the follow-up invocation must explicitly confirm. Sync processes members and individual role assignments sequentially, respects bot/human policies and exemptions, and reports assigned, skipped, and failed totals. Discord.js handles API rate limits. Very large guilds may take a long time to sync.

## Persistence

When `DATABASE_URL` points to a reachable PostgreSQL database, OpenDyno creates and uses `OpenDynoGuildData`, `GuildSettings`, and `ModerationCases` tables. Otherwise, Node.js 22.5+ uses a persistent SQLite database at `Data/OpenDyno.sqlite`. If the built-in SQLite module is unavailable (for example, on Node.js 20), OpenDyno uses a persistent JSON fallback. Set `OPENDYNO_DATA_FILE` to change the local database or fallback file location.

Warning creation stores its warning and moderation case together, with warning IDs and threshold counts calculated against the committed guild state. PostgreSQL and SQLite use database transactions for this operation. The JSON fallback is intended for a single running bot instance; do not point multiple instances at the same JSON file.

To limit memory use in larger servers, the Discord client keeps up to 100 guild members per server and 1,000 users in its shared cache; the bot's own guild member is retained. Commands that need complete member lists fetch the full list on demand, so cache limits do not truncate their results.

## Command areas

- **Core:** `help`, `info`, `ping`, `stats`, `uptime`
- **Moderation:** ban/kick/timeout/warn, cases and notes, history, purge, channel lock, and permission diagnosis
- **Management:** moderator roles, command/module switches, ignored targets, custom commands, Auto Roles, roles, nicknames, giveaways, and prefix
- **Utility:** AFK, avatars, color previews, invites, reminders, server/member/role information, and dice
- **Engagement:** points, polls, rock-paper-scissors, coin flips, and ISS status
- **Levels and tags:** XP leaderboard/profile, self-assignable roles, and custom tags

See [COMMANDS.md](./COMMANDS.md) for the complete command and subcommand reference.

Moderation operations check target hierarchy against both the invoking moderator and the bot. Configure the bot's role above the roles it needs to manage. Audit events are sent only when a guild's `LogChannelId` is configured in its stored guild settings.

Run `npm test` for the unit tests.
