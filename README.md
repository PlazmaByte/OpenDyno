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

Slash commands group only related operations into focused families instead of broad category menus. Examples include `/role assign`, `/role color`, `/notes add`, `/warnings clear`, `/cases history`, `/channel purge`, `/ignore user`, and `/automod enable`. Unrelated commands remain directly available (for example `/ban`, `/avatar`, and `/ping`). Prefix commands keep their existing direct form (for example `?ban @member`) and support the same focused families (for example `?role assign @member @role`). Each slash subcommand accepts an optional `arguments` field. Both invocation styles support quoting multi-word arguments, such as `?setnick @member "A new nickname"` or `/role rename arguments: @role "Community Helper"`. Server administrators can change the prefix with `?prefix <new-prefix>`. Slash command propagation may take time on Discord.

## Persistence

When `DATABASE_URL` points to a reachable PostgreSQL database, OpenDyno creates and uses `OpenDynoGuildData`, `GuildSettings`, and `ModerationCases` tables. Otherwise, Node.js 22.5+ uses a persistent SQLite database at `Data/OpenDyno.sqlite`. If the built-in SQLite module is unavailable (for example, on Node.js 20), OpenDyno uses a persistent JSON fallback. Set `OPENDYNO_DATA_FILE` to change the local database or fallback file location.

## Command areas

- **Core:** `help`, `info`, `ping`, `stats`, `uptime`
- **Moderation:** ban/kick/timeout/warn, cases and notes, history, purge, channel lock, and permission diagnosis
- **Management:** moderator roles, command/module switches, ignored targets, custom commands, roles, nicknames, giveaways, and prefix
- **Utility:** AFK, avatars, color previews, invites, reminders, server/member/role information, and dice
- **Engagement:** points, polls, rock-paper-scissors, coin flips, and ISS status
- **Levels and tags:** XP leaderboard/profile, self-assignable roles, and custom tags

See [COMMANDS.md](./COMMANDS.md) for the complete command and subcommand reference.

Moderation operations check target hierarchy against both the invoking moderator and the bot. Configure the bot's role above the roles it needs to manage. Audit events are sent only when a guild's `LogChannelId` is configured in its stored guild settings.

Run `npm test` for the unit tests.
