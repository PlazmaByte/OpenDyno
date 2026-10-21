const test = require('node:test');
const assert = require('node:assert/strict');
const { TimeParser } = require('../Source/Utilities/TimeParser');

test('TimeParser accepts combined human-readable durations', () => {
    assert.equal(TimeParser.Parse('1d 2h 30m'), 95400000);
    assert.equal(TimeParser.Parse('10m'), 600000);
    assert.equal(TimeParser.Parse('2 weeks'), 1209600000);
});

test('TimeParser rejects malformed and zero durations', () => {
    assert.equal(TimeParser.Parse(''), null);
    assert.equal(TimeParser.Parse('0m'), null);
    assert.equal(TimeParser.Parse('2h later'), null);
});

test('TimeParser formats uptime as days, hours, and minutes', () => {
    assert.equal(TimeParser.Format(90061000), '1 day, 1 hour, 1 minute');
    assert.equal(TimeParser.Format(0), '0 minutes');
});
