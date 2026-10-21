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
