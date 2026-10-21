const fs = require('node:fs/promises');
const path = require('node:path');
const { AppConfig } = require('../../Configuration/AppConfig');

const DefaultGuildData = () => ({
    Settings: { Prefix: AppConfig.DefaultPrefix, LogChannelId: null, ModLogChannelId: null, MuteRoleId: null, AutoModEnabled: true, WarningThresholds: null, Locale: AppConfig.DefaultLocale },
    Cases: [],
    Notes: [],
    Warnings: [],
    Mods: [],
    Ignored: { Channels: [], Roles: [], Users: [] },
    DisabledCommands: [],
    Modules: {},
    CustomCommands: {},
    Tags: {},
    Ranks: [],
    Points: {},
    Levels: {},
    Afk: {},
    Highlights: {},
    PersistentRoles: {},
    TimedActions: []
});

class DatabaseManager {
    constructor() {
        this.Pool = null;
        this.Sqlite = null;
        this.Data = {};
        this.FilePath = AppConfig.DataFile;
        this.WriteQueue = Promise.resolve();
        this.GuildQueues = new Map();
    }

    async Initialize() {
        if (AppConfig.DatabaseUrl) {
            let pool;
            try {
                const { Pool } = require('pg');
                pool = new Pool({ connectionString: AppConfig.DatabaseUrl, ssl: process.env.DATABASE_SSL === 'false' ? false : true });
                await pool.query('SELECT 1');
                await pool.query(`CREATE TABLE IF NOT EXISTS "OpenDynoGuildData" ("GuildId" TEXT PRIMARY KEY, "Data" JSONB NOT NULL)`);
                await pool.query(`CREATE TABLE IF NOT EXISTS "GuildSettings" ("GuildId" TEXT PRIMARY KEY, "Prefix" TEXT NOT NULL DEFAULT '?', "LogChannelId" TEXT, "ModLogChannelId" TEXT, "MuteRoleId" TEXT, "AutoModEnabled" BOOLEAN NOT NULL DEFAULT TRUE)`);
                await pool.query(`CREATE TABLE IF NOT EXISTS "ModerationCases" ("CaseId" BIGSERIAL PRIMARY KEY, "GuildId" TEXT NOT NULL, "UserId" TEXT NOT NULL, "ModeratorId" TEXT NOT NULL, "ActionType" TEXT NOT NULL, "Reason" TEXT NOT NULL DEFAULT 'No reason provided.', "Duration" BIGINT, "Timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "Active" BOOLEAN NOT NULL DEFAULT TRUE)`);
                this.Pool = pool;
                console.log('[Database] Connected to PostgreSQL.');
                return;
            } catch (error) {
                await pool?.end().catch(closeError => console.error('[Database] Could not close failed PostgreSQL connection:', closeError.message));
                console.error('[Database] PostgreSQL unavailable; trying a local database fallback:', error.message);
            }
        }
        await fs.mkdir(path.dirname(this.FilePath), { recursive: true });
        try {
            const { DatabaseSync } = require('node:sqlite');
            this.Sqlite = new DatabaseSync(this.FilePath);
            this.Sqlite.exec(`CREATE TABLE IF NOT EXISTS "OpenDynoGuildData" ("GuildId" TEXT PRIMARY KEY, "Data" TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS "GuildSettings" ("GuildId" TEXT PRIMARY KEY, "Prefix" TEXT NOT NULL DEFAULT '?', "LogChannelId" TEXT, "ModLogChannelId" TEXT, "MuteRoleId" TEXT, "AutoModEnabled" INTEGER NOT NULL DEFAULT 1);
                CREATE TABLE IF NOT EXISTS "ModerationCases" ("CaseId" INTEGER PRIMARY KEY AUTOINCREMENT, "GuildId" TEXT NOT NULL, "UserId" TEXT NOT NULL, "ModeratorId" TEXT NOT NULL, "ActionType" TEXT NOT NULL, "Reason" TEXT NOT NULL DEFAULT 'No reason provided.', "Duration" INTEGER, "Timestamp" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, "Active" INTEGER NOT NULL DEFAULT 1);`);
            console.log(`[Database] Using SQLite data store: ${this.FilePath}`);
            return;
        } catch (error) {
            if (error.code !== 'ERR_UNKNOWN_BUILTIN_MODULE' && error.code !== 'MODULE_NOT_FOUND') throw error;
            console.warn('[Database] Built-in SQLite is unavailable; using persistent local JSON fallback.');
            if (this.FilePath.toLowerCase().endsWith('.sqlite')) {
                this.FilePath = `${this.FilePath.slice(0, -'.sqlite'.length)}.json`;
            } else {
                this.FilePath = `${this.FilePath}.json`;
            }
            await fs.mkdir(path.dirname(this.FilePath), { recursive: true });
        }
        try {
            this.Data = JSON.parse(await fs.readFile(this.FilePath, 'utf8'));
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            this.Data = {};
            await this.Flush();
        }
        console.log(`[Database] Using local JSON fallback: ${this.FilePath}`);
    }

    async GetGuild(guildId) {
        const defaults = DefaultGuildData();
        let stored;
        if (this.Pool) {
            const result = await this.Pool.query('SELECT "Data" FROM "OpenDynoGuildData" WHERE "GuildId" = $1', [guildId]);
            stored = result.rows[0]?.Data;
        } else if (this.Sqlite) {
            const result = this.Sqlite.prepare('SELECT "Data" FROM "OpenDynoGuildData" WHERE "GuildId" = ?').get(guildId);
            stored = result ? JSON.parse(result.Data) : undefined;
        } else {
            stored = this.Data[guildId];
        }
        if (!stored) return defaults;
        return {
            ...defaults,
            ...stored,
            Settings: { ...defaults.Settings, ...stored.Settings },
            Ignored: { ...defaults.Ignored, ...stored.Ignored }
        };
    }

    async SaveGuild(guildId, guildData) {
        if (this.Pool) {
            await this.Pool.query(
                `INSERT INTO "OpenDynoGuildData" ("GuildId", "Data") VALUES ($1, $2::jsonb) ON CONFLICT ("GuildId") DO UPDATE SET "Data" = EXCLUDED."Data"`,
                [guildId, JSON.stringify(guildData)]
            );
            await this.Pool.query(
                `INSERT INTO "GuildSettings" ("GuildId", "Prefix", "LogChannelId", "ModLogChannelId", "MuteRoleId", "AutoModEnabled") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("GuildId") DO UPDATE SET "Prefix"=EXCLUDED."Prefix", "LogChannelId"=EXCLUDED."LogChannelId", "ModLogChannelId"=EXCLUDED."ModLogChannelId", "MuteRoleId"=EXCLUDED."MuteRoleId", "AutoModEnabled"=EXCLUDED."AutoModEnabled"`,
                [guildId, guildData.Settings.Prefix, guildData.Settings.LogChannelId, guildData.Settings.ModLogChannelId, guildData.Settings.MuteRoleId, guildData.Settings.AutoModEnabled]
            );
            return;
        }
        if (this.Sqlite) {
            this.Sqlite.prepare(`INSERT INTO "OpenDynoGuildData" ("GuildId", "Data") VALUES (?, ?) ON CONFLICT ("GuildId") DO UPDATE SET "Data" = excluded."Data"`).run(guildId, JSON.stringify(guildData));
            this.Sqlite.prepare(`INSERT INTO "GuildSettings" ("GuildId", "Prefix", "LogChannelId", "ModLogChannelId", "MuteRoleId", "AutoModEnabled") VALUES (?,?,?,?,?,?) ON CONFLICT ("GuildId") DO UPDATE SET "Prefix"=excluded."Prefix", "LogChannelId"=excluded."LogChannelId", "ModLogChannelId"=excluded."ModLogChannelId", "MuteRoleId"=excluded."MuteRoleId", "AutoModEnabled"=excluded."AutoModEnabled"`).run(
                guildId,
                guildData.Settings.Prefix,
                guildData.Settings.LogChannelId,
                guildData.Settings.ModLogChannelId,
                guildData.Settings.MuteRoleId,
                guildData.Settings.AutoModEnabled ? 1 : 0
            );
            return;
        }
        this.Data[guildId] = guildData;
        this.WriteQueue = this.WriteQueue.then(() => this.Flush());
        return this.WriteQueue;
    }

    async UpdateGuild(guildId, update) {
        const previous = this.GuildQueues.get(guildId) || Promise.resolve();
        const operation = previous.catch(() => {}).then(async () => {
            const data = await this.GetGuild(guildId);
            await update(data);
            await this.SaveGuild(guildId, data);
            return data;
        });
        this.GuildQueues.set(guildId, operation);
        try {
            return await operation;
        } finally {
            if (this.GuildQueues.get(guildId) === operation) this.GuildQueues.delete(guildId);
        }
    }

    async CreateCase(guildId, userId, moderatorId, actionType, reason = 'No reason provided.', duration = null, active = true) {
        let entry;
        if (this.Pool) {
            const result = await this.Pool.query(
                `INSERT INTO "ModerationCases" ("GuildId", "UserId", "ModeratorId", "ActionType", "Reason", "Duration", "Active") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING "CaseId", "Timestamp"`,
                [guildId, userId, moderatorId, actionType, reason, duration, active]
            );
            entry = { CaseId: Number(result.rows[0].CaseId), GuildId: guildId, UserId: userId, ModeratorId: moderatorId, ActionType: actionType, Reason: reason, Duration: duration, Timestamp: new Date(result.rows[0].Timestamp).toISOString(), Active: active };
            await this.UpdateGuild(guildId, data => data.Cases.push(entry));
            return entry.CaseId;
        }
        if (this.Sqlite) {
            const result = this.Sqlite.prepare(
                `INSERT INTO "ModerationCases" ("GuildId", "UserId", "ModeratorId", "ActionType", "Reason", "Duration", "Active") VALUES (?,?,?,?,?,?,?)`
            ).run(guildId, userId, moderatorId, actionType, reason, duration, active ? 1 : 0);
            entry = { CaseId: Number(result.lastInsertRowid), GuildId: guildId, UserId: userId, ModeratorId: moderatorId, ActionType: actionType, Reason: reason, Duration: duration, Timestamp: new Date().toISOString(), Active: active };
            await this.UpdateGuild(guildId, data => data.Cases.push(entry));
            return entry.CaseId;
        }
        await this.UpdateGuild(guildId, data => {
            const caseId = Math.max(0, ...data.Cases.map(item => item.CaseId || 0)) + 1;
            entry = { CaseId: caseId, GuildId: guildId, UserId: userId, ModeratorId: moderatorId, ActionType: actionType, Reason: reason, Duration: duration, Timestamp: new Date().toISOString(), Active: active };
            data.Cases.push(entry);
        });
        return entry.CaseId;
    }

    async UpdateCase(guildId, caseId, changes) {
        const allowed = { Reason: '"Reason"', Duration: '"Duration"', Active: '"Active"' };
        const entries = Object.entries(changes).filter(([key]) => Object.hasOwn(allowed, key));
        if (!entries.length || (!this.Pool && !this.Sqlite)) return;
        const assignments = entries.map(([key], index) => `${allowed[key]} = $${index + 1}`).join(', ');
        const values = entries.map(([, value]) => value);
        if (this.Sqlite) {
            const sqliteAssignments = entries.map(([key], index) => `${allowed[key]} = ?`).join(', ');
            const sqliteValues = entries.map(([key, value]) => key === 'Active' ? (value ? 1 : 0) : value);
            this.Sqlite.prepare(`UPDATE "ModerationCases" SET ${sqliteAssignments} WHERE "GuildId" = ? AND "CaseId" = ?`).run(...sqliteValues, guildId, caseId);
            return;
        }
        values.push(guildId, caseId);
        await this.Pool.query(
            `UPDATE "ModerationCases" SET ${assignments} WHERE "GuildId" = $${values.length - 1} AND "CaseId" = $${values.length}`,
            values
        );
    }

    async Flush() {
        const temporaryPath = `${this.FilePath}.tmp`;
        await fs.writeFile(temporaryPath, JSON.stringify(this.Data, null, 2), 'utf8');
        await fs.rename(temporaryPath, this.FilePath);
    }

    async Close() {
        await this.WriteQueue;
        if (this.Pool) await this.Pool.end();
        if (this.Sqlite) this.Sqlite.close();
    }
}

module.exports = { DatabaseManager, DefaultGuildData };
