const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'resources', 'plugins.json'), 'utf8'));

test('catálogo tem IDs únicos e URLs válidas', () => {
  const ids = new Set();
  for (const plugin of catalog) {
    assert.ok(plugin.id);
    assert.equal(ids.has(plugin.id), false, `ID duplicado: ${plugin.id}`);
    ids.add(plugin.id);
    const url = new URL(plugin.startUrl);
    assert.ok(['http:', 'https:'].includes(url.protocol));
  }
});

test('todo plugin declara permissões e categoria', () => {
  for (const plugin of catalog) {
    assert.ok(Array.isArray(plugin.permissions));
    assert.ok(plugin.category);
    assert.equal(plugin.enabled, true);
  }
});
