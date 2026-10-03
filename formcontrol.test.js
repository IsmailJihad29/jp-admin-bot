const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFormCommand } = require('./formcontrol');

test('form command parser supports a silent close without changing normal close', () => {
  assert.deepEqual(parseFormCommand('!closeform'), {
    command: 'closeform',
    silent: false,
  });
  assert.deepEqual(parseFormCommand(' !CLOSEFORM silent '), {
    command: 'closeform',
    silent: true,
  });
  assert.deepEqual(parseFormCommand('!closeform --silent'), {
    command: 'closeform',
    silent: true,
  });
});

test('form command parser rejects unknown close arguments', () => {
  assert.equal(parseFormCommand('!closeform now'), null);
  assert.equal(parseFormCommand('!openform silent'), null);
  assert.equal(parseFormCommand('hello'), null);
});

test('form command parser supports openform with optional custom code and session', () => {
  assert.deepEqual(parseFormCommand('!openform'), {
    command: 'openform',
    silent: false,
    session: 'evening',
  });
  assert.deepEqual(parseFormCommand('!openform 5821'), {
    command: 'openform',
    silent: false,
    session: 'evening',
    code: '5821',
  });
  assert.deepEqual(parseFormCommand('!openform morning'), {
    command: 'openform',
    silent: false,
    session: 'morning',
    code: null,
  });
  assert.deepEqual(parseFormCommand('!openform morning 1234'), {
    command: 'openform',
    silent: false,
    session: 'morning',
    code: '1234',
  });
  assert.equal(parseFormCommand('!openform abc'), null);
  assert.equal(parseFormCommand('!openform 12'), null);
});
