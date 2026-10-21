const test = require('node:test');
const assert = require('node:assert/strict');
const { ArgumentParser } = require('../Source/Utilities/ArgumentParser');

test('ArgumentParser preserves quoted arguments with spaces', () => {
    assert.deepEqual(ArgumentParser.Parse('setnick @member "A nickname with spaces"'), [
        'setnick',
        '@member',
        'A nickname with spaces'
    ]);
});

test('ArgumentParser supports escaped quotes inside quoted arguments', () => {
    assert.deepEqual(ArgumentParser.Parse(`tag add quote "Say \\"hello\\""`), [
        'tag',
        'add',
        'quote',
        'Say "hello"'
    ]);
});

test('ArgumentParser accepts empty quoted arguments and tolerates unmatched quotes', () => {
    assert.deepEqual(ArgumentParser.Parse('role "" @member'), ['role', '', '@member']);
    assert.deepEqual(ArgumentParser.Parse('note @member "unfinished note'), ['note', '@member', 'unfinished note']);
});
