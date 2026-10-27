// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

import DiffEngine from '../src/diffEngine.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error('Assertion failed: ' + message);
    }
}

function runTests() {
    console.log('--- Testing DiffEngine ---');

    // 1. Identical texts
    const diffSame = DiffEngine.computeDiff('line 1\nline 2', 'line 1\nline 2');
    assert(diffSame.length === 2, 'Should have 2 lines');
    assert(diffSame.every(d => d.type === 'equal'), 'All lines should be equal');
    console.log('✓ Identical text diff passed');

    // 2. Added and removed lines
    const textA = 'Apple\nBanana\nCherry';
    const textB = 'Apple\nBlueberry\nCherry\nDate';
    const diff = DiffEngine.computeDiff(textA, textB);

    assert(diff.some(d => d.type === 'removed' && d.content === 'Banana'), 'Banana should be removed');
    assert(diff.some(d => d.type === 'added' && d.content === 'Blueberry'), 'Blueberry should be added');
    assert(diff.some(d => d.type === 'added' && d.content === 'Date'), 'Date should be added');
    assert(diff.some(d => d.type === 'equal' && d.content === 'Apple'), 'Apple should be equal');
    console.log('✓ Added/removed line diff passed');

    // 3. Similarity score
    const sim1 = DiffEngine.similarityScore('The quick brown fox', 'The quick brown fox');
    assert(sim1 === 1.0, `Expected 1.0, got ${sim1}`);

    const sim2 = DiffEngine.similarityScore('The quick brown fox', 'The fast brown dog');
    assert(sim2 > 0.3 && sim2 < 0.9, `Expected intermediate similarity, got ${sim2}`);

    const sim3 = DiffEngine.similarityScore('completely different alpha', 'omega zeta theta');
    assert(sim3 < 0.35, `Expected low similarity, got ${sim3}`);
    console.log('✓ Similarity scoring passed');

    // 4. Find similar entries
    const entries = [
        { id: '1', content: 'git commit -m "Fix bug in clipboard"' },
        { id: '2', content: 'git commit -m "Fix bug in clipboard manager"' },
        { id: '3', content: 'SELECT * FROM users WHERE active = 1;' },
    ];
    const similar = DiffEngine.findSimilar(entries, 0.7);
    assert(similar.length === 1, 'Should find 1 pair of similar entries');
    assert(similar[0].entryA.id === '1' && similar[0].entryB.id === '2', 'Should match entries 1 and 2');
    console.log('✓ Near-duplicate detection passed');

    console.log('All DiffEngine tests passed successfully!\n');
}

runTests();
