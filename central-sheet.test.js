const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCentralSheetCommand,
  getCentralSheetUrl,
  setCentralSheetUrl,
  isValidSheetReference,
} = require('./central-sheet');

test('parseCentralSheetCommand handles status command', () => {
  assert.deepEqual(parseCentralSheetCommand('!centralsheet'), {
    command: 'status',
  });
  assert.deepEqual(parseCentralSheetCommand('  !CENTRALsheet  '), {
    command: 'status',
  });
});

test('parseCentralSheetCommand handles set command with URL', () => {
  const url = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit';
  assert.deepEqual(parseCentralSheetCommand(`!centralsheet set ${url}`), {
    command: 'set',
    url: url,
  });
});

test('parseCentralSheetCommand handles set command without URL', () => {
  const parsed = parseCentralSheetCommand('!centralsheet set');
  assert.equal(parsed.command, 'set');
  assert.ok(parsed.error);
});

test('parseCentralSheetCommand handles sync command', () => {
  assert.deepEqual(parseCentralSheetCommand('!centralsheet sync'), {
    command: 'sync',
  });
});

test('parseCentralSheetCommand handles help command', () => {
  assert.deepEqual(parseCentralSheetCommand('!centralsheet help'), {
    command: 'help',
  });
});

test('parseCentralSheetCommand returns null for non-centralsheet messages', () => {
  assert.equal(parseCentralSheetCommand('!setupcohortsheet'), null);
  assert.equal(parseCentralSheetCommand('hello centralsheet'), null);
});

test('isValidSheetReference accepts spreadsheet URLs and sheet IDs', () => {
  assert.equal(isValidSheetReference('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit'), true);
  assert.equal(isValidSheetReference('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'), true);
  assert.equal(isValidSheetReference('invalid-url'), false);
  assert.equal(isValidSheetReference(''), false);
});

test('getCentralSheetUrl and setCentralSheetUrl store and retrieve URL', () => {
  const testUrl = 'https://docs.google.com/spreadsheets/d/test-id-12345678901234567890/edit';
  setCentralSheetUrl(testUrl);
  assert.equal(getCentralSheetUrl(), testUrl);
});
