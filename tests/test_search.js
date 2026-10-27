// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

import SearchEngine from '../src/search.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error('Assertion failed: ' + message);
    }
}

function runTests() {
    console.log('--- Testing SearchEngine ---');
    const search = new SearchEngine();

    const sampleEntries = [
        {
            id: '1',
            type: 'text',
            contentType: 'url',
            content: 'https://gitlab.gnome.org/GNOME/gnome-shell',
            title: 'GNOME Shell GitLab',
            metadata: { hostname: 'gitlab.gnome.org' },
            pinned: false,
        },
        {
            id: '2',
            type: 'text',
            contentType: 'code',
            content: 'const clipboard = St.Clipboard.get_default();',
            pinned: true,
        },
        {
            id: '3',
            type: 'image',
            contentType: 'image',
            imagePath: '/tmp/test.png',
            ocrText: 'Invoice #10492 Total $50.00',
            pinned: false,
        },
        {
            id: '4',
            type: 'text',
            contentType: 'text',
            content: 'வணக்கம் உலகம் (Hello World)',
            pinned: false,
        },
    ];

    // 1. Text search
    const r1 = search.search(sampleEntries, 'clipboard');
    assert(r1.length === 1 && r1[0].id === '2', 'Should find entry 2 by content');
    console.log('✓ Text search matching passed');

    // 2. URL Hostname search
    const r2 = search.search(sampleEntries, 'gitlab.gnome.org');
    assert(r2.length === 1 && r2[0].id === '1', 'Should find URL by hostname');
    console.log('✓ Hostname metadata search passed');

    // 3. OCR text search
    const r3 = search.search(sampleEntries, 'Invoice');
    assert(r3.length === 1 && r3[0].id === '3', 'Should find image entry by OCR text');
    console.log('✓ OCR text search passed');

    // 4. Unicode / Tamil search
    const r4 = search.search(sampleEntries, 'வணக்கம்');
    assert(r4.length === 1 && r4[0].id === '4', 'Should find Tamil unicode text');
    console.log('✓ Unicode / Tamil search passed');

    // 5. Pinned-only filter
    const r5 = search.getPinned(sampleEntries);
    assert(r5.length === 1 && r5[0].id === '2', 'Should return only pinned items');
    console.log('✓ Pinned filter passed');

    // 6. Type filter
    const r6 = search.filterByType(sampleEntries, 'image');
    assert(r6.length === 1 && r6[0].id === '3', 'Should return only image items');

    const r6_text = search.filterByType(sampleEntries, 'text');
    assert(r6_text.every(e => e.contentType !== 'url' && e.contentType !== 'image'), 'Text filter must exclude URLs and images');
    assert(r6_text.length === 2, 'Text filter should return code and plain text entries');

    const r6_url = search.filterByType(sampleEntries, 'url');
    assert(r6_url.length === 1 && r6_url[0].id === '1', 'URL filter should return only URL entries');
    console.log('✓ Type filter passed');

    // 7. Non-matching query
    const r7 = search.search(sampleEntries, 'nonexistentstring12345');
    assert(r7.length === 0, 'Should return empty array for non-matching query');
    console.log('✓ Empty results handling passed');

    console.log('All SearchEngine tests passed successfully!\n');
}

runTests();
