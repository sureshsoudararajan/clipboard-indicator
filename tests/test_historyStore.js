// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

import GLib from 'gi://GLib';
import HistoryStore from '../src/historyStore.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error('Assertion failed: ' + message);
    }
}

function runTests() {
    console.log('--- Testing HistoryStore ---');

    const testDir = GLib.dir_make_tmp('test-historystore-XXXXXX');
    const store = new HistoryStore(testDir);

    // 1. Initial state
    store.load();
    assert(store.length === 0, 'Initial store should be empty');
    console.log('✓ Initial load passed');

    // 2. Add text entries
    const e1 = store.addTextEntry('First copied string');
    const e2 = store.addTextEntry('Second copied string');
    assert(store.length === 2, `Expected 2 entries, got ${store.length}`);
    assert(store.getEntries()[0].content === 'Second copied string', 'Recent entry should be at the top');
    console.log('✓ Add text entries and ordering passed');

    // 3. Deduplication
    const e3 = store.addTextEntry('First copied string');
    assert(store.length === 2, 'Deduplication should not increase total count');
    assert(store.getEntries()[0].content === 'First copied string', 'Deduplicated entry should be moved to top');
    console.log('✓ Deduplication logic passed');

    // 4. Pinning
    const pinnedState = store.togglePin(e3.id);
    assert(pinnedState === true, 'Entry should now be pinned');
    assert(store.getPinnedEntries().length === 1, 'Pinned count should be 1');
    console.log('✓ Pin / unpin passed');

    // 5. Clear non-pinned entries
    const cleared = store.clearNonPinned();
    assert(cleared.length === 1, 'Should have cleared 1 unpinned entry');
    assert(store.length === 1, 'Pinned entry should survive clearNonPinned()');
    assert(store.getEntries()[0].id === e3.id, 'Surviving entry should be the pinned one');
    console.log('✓ Pinned survival on clearNonPinned passed');

    // 6. Persistence & Reload
    store.save(true); // Force immediate synchronous save

    const storeReloaded = new HistoryStore(testDir);
    storeReloaded.load();
    assert(storeReloaded.length === 1, 'Reloaded store should maintain persisted entry');
    assert(storeReloaded.getEntries()[0].content === 'First copied string', 'Content should match');
    assert(storeReloaded.getEntries()[0].pinned === true, 'Pinned flag should persist');
    console.log('✓ Disk persistence and recovery passed');

    // 7. Stats
    const stats = storeReloaded.getStats();
    assert(stats.total === 1 && stats.pinned === 1, 'Stats should report 1 total and 1 pinned');
    console.log('✓ History stats passed');

    // Clean up
    store.destroy();
    storeReloaded.destroy();
    console.log('All HistoryStore tests passed successfully!\n');
}

runTests();
