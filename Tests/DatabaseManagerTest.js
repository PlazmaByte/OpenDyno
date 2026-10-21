const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DatabaseManager } = require('../Source/Managers/DatabaseManager');

test('DatabaseManager persists defaults, settings, and moderation cases locally', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'opendyno-test-'));
    const filePath = path.join(directory, 'OpenDyno.sqlite');
    const database = new DatabaseManager();
    database.FilePath = filePath;
    try {
        await database.Initialize();
        const initial = await database.GetGuild('guild-test');
        assert.equal(initial.Settings.Prefix, '?');
        initial.Settings.Prefix = '!';
        await database.SaveGuild('guild-test', initial);
        const caseId = await database.CreateCase('guild-test', 'user-test', 'mod-test', 'WARN', 'test warning');
        const loaded = await database.GetGuild('guild-test');
        assert.equal(loaded.Settings.Prefix, '!');
        assert.equal(loaded.Cases[0].CaseId, caseId);
        assert.equal(loaded.Cases[0].Reason, 'test warning');
    } finally {
        await database.Close();
        await fs.rm(directory, { recursive: true, force: true });
    }
});

test('DatabaseManager serializes concurrent case creation without duplicate IDs', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'opendyno-test-'));
    const database = new DatabaseManager();
    database.FilePath = path.join(directory, 'OpenDyno.sqlite');
    try {
        await database.Initialize();
        const ids = await Promise.all(Array.from({ length: 12 }, (_, index) =>
            database.CreateCase('guild-test', `user-${index}`, 'mod-test', 'WARN', `warning ${index}`)
        ));
        assert.equal(new Set(ids).size, ids.length);
        const guild = await database.GetGuild('guild-test');
        assert.equal(guild.Cases.length, 12);
    } finally {
        await database.Close();
        await fs.rm(directory, { recursive: true, force: true });
    }
});

test('DatabaseManager atomically creates persistent warnings with unique IDs and counts', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'opendyno-test-'));
    const database = new DatabaseManager();
    database.FilePath = path.join(directory, 'OpenDyno.sqlite');
    try {
        await database.Initialize();
        const warnings = await Promise.all(Array.from({ length: 12 }, (_, index) =>
            database.CreateWarning('guild-test', 'user-test', `mod-${index}`, `warning ${index}`)
        ));

        assert.equal(new Set(warnings.map(item => item.Warning.Id)).size, 12);
        assert.equal(new Set(warnings.map(item => item.Case.CaseId)).size, 12);
        assert.deepEqual(warnings.map(item => item.Warning.Id).sort((a, b) => a - b),
            Array.from({ length: 12 }, (_, index) => index + 1));
        assert.deepEqual(warnings.map(item => item.WarningCount).sort((a, b) => a - b),
            Array.from({ length: 12 }, (_, index) => index + 1));
        const loaded = await database.GetGuild('guild-test');
        assert.equal(loaded.Warnings.length, 12);
        assert.equal(loaded.Cases.filter(item => item.ActionType === 'WARN').length, 12);
        assert.equal(loaded.Warnings.filter(item => item.Active).length, 12);

        await database.UpdateGuild('guild-test', guild => {
            guild.Warnings.pop();
        });
        const nextWarning = await database.CreateWarning('guild-test', 'user-test', 'mod-next', 'next warning');
        assert.equal(nextWarning.Warning.Id, 13);
        assert.equal(nextWarning.WarningCount, 12);
        const staleSnapshot = await database.GetGuild('guild-test');
        await database.UpdateGuild('guild-test', guild => {
            guild.TimedActions.push({ Type: 'REMINDER', Id: 'reminder-1', ExpiresAt: Date.now() + 60000 });
        });
        await database.CreateWarning('guild-test', 'user-test', 'mod-last', 'last warning');
        staleSnapshot.Settings.Prefix = '!';
        await database.SaveGuild('guild-test', staleSnapshot);
        const afterStaleSave = await database.GetGuild('guild-test');
        assert.equal(afterStaleSave.Settings.Prefix, '!');
        assert.equal(afterStaleSave.Warnings.length, 13);
        assert.equal(afterStaleSave.Cases.filter(item => item.ActionType === 'WARN').length, 14);
        assert.equal(afterStaleSave.TimedActions[0].Id, 'reminder-1');
    } finally {
        await database.Close();
        await fs.rm(directory, { recursive: true, force: true });
    }
});
