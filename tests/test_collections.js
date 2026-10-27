// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

import GLib from 'gi://GLib';
import CollectionManager from '../src/collections.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error('Assertion failed: ' + message);
    }
}

function runTests() {
    console.log('--- Testing CollectionManager ---');

    // Use a temporary test directory
    const testDir = GLib.dir_make_tmp('test-collections-XXXXXX');
    const manager = new CollectionManager(null, { dataDir: testDir });

    manager.load();
    const initialCols = manager.getCollections();
    assert(initialCols.length >= 4, 'Should initialize with 4 default collections');
    console.log('✓ Default collections initialization passed');

    // Create a new collection
    const created = manager.createCollection('Project X Notes', 'Notes for Project X');
    assert(created.id && created.name === 'Project X Notes', 'Should create new collection');
    console.log('✓ Create collection passed');

    // Add snippet
    const snip = manager.addSnippet(
        created.id,
        'Database Migration',
        'alembic upgrade head',
        'Run DB migrations',
        'shell-command'
    );
    assert(snip && snip.content === 'alembic upgrade head', 'Should add snippet to collection');
    console.log('✓ Add snippet passed');

    // Search across collections
    const searchRes = manager.searchCollections('alembic');
    assert(searchRes.length === 1 && searchRes[0].title === 'Database Migration', 'Should find snippet via search');
    console.log('✓ Collection search passed');

    // Export collections
    const exportedJson = manager.exportCollections();
    assert(exportedJson.includes('Project X Notes') && exportedJson.includes('alembic upgrade head'), 'Export should contain collection and snippet');
    console.log('✓ Collection export passed');

    // Clean up
    manager.destroy();
    console.log('All CollectionManager tests passed successfully!\n');
}

runTests();
