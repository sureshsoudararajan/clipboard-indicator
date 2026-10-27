// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

import ContentDetector from '../src/contentDetector.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error('Assertion failed: ' + message);
    }
}

function runTests() {
    console.log('--- Testing ContentDetector ---');
    const detector = new ContentDetector();

    // 1. URL detection
    const urlRes = detector.classify('https://archlinux.org/packages/?q=gnome');
    assert(urlRes.type === 'url', `Expected url, got ${urlRes.type}`);
    assert(urlRes.confidence >= 0.8, 'Expected high confidence for URL');
    assert(urlRes.metadata.hostname === 'archlinux.org', 'Expected hostname archlinux.org');
    console.log('✓ URL classification passed');

    // 2. Email detection
    const emailRes = detector.classify('user.name+tag@example.co.uk');
    assert(emailRes.type === 'email', `Expected email, got ${emailRes.type}`);
    console.log('✓ Email classification passed');

    // 3. JSON detection
    const jsonRes = detector.classify('{"name": "gnome", "version": 51, "wayland": true}');
    assert(jsonRes.type === 'json', `Expected json, got ${jsonRes.type}`);
    assert(jsonRes.confidence === 1.0, 'Expected 1.0 confidence for valid JSON');
    console.log('✓ JSON classification passed');

    // 4. Shell command
    const cmdRes = detector.classify('sudo pacman -Syu --noconfirm');
    assert(cmdRes.type === 'shell-command', `Expected shell-command, got ${cmdRes.type}`);
    console.log('✓ Shell command classification passed');

    // 5. Code heuristics
    const codeRes = detector.classify('function calculateSum(a, b) {\n    return a + b;\n}');
    assert(codeRes.type === 'code', `Expected code, got ${codeRes.type}`);

    const pyImportRes = detector.classify('import json');
    assert(pyImportRes.type === 'code', `Expected code for import json, got ${pyImportRes.type}`);

    const pyPrintRes = detector.classify('print(f"City: {data[\'address\'][\'city\']}")');
    assert(pyPrintRes.type === 'code', `Expected code for python print, got ${pyPrintRes.type}`);

    const javaImportRes = detector.classify('import com.fasterxml.jackson.databind.ObjectMapper;');
    assert(javaImportRes.type === 'code', `Expected code for java import, got ${javaImportRes.type}`);
    console.log('✓ Code classification passed');

    // 6. UUID
    const uuidRes = detector.classify('123e4567-e89b-12d3-a456-426614174000');
    assert(uuidRes.type === 'uuid', `Expected uuid, got ${uuidRes.type}`);
    console.log('✓ UUID classification passed');

    // 7. IP Address
    const ipRes = detector.classify('192.168.1.254');
    assert(ipRes.type === 'ip-address', `Expected ip-address, got ${ipRes.type}`);
    console.log('✓ IP classification passed');

    // 8. Unicode & Tamil text
    const tamilText = 'வணக்கம், இது ஒரு தமிழ் கிளிப்போர்டு சோதனை';
    const tamilRes = detector.classify(tamilText);
    assert(tamilRes.type === 'text', `Expected text, got ${tamilRes.type}`);
    console.log('✓ Unicode / Tamil text classification passed');

    // 9. Multiline text
    const multiRes = detector.classify('First line\nSecond line\nThird line');
    assert(multiRes.type === 'multiline-text', `Expected multiline-text, got ${multiRes.type}`);
    console.log('✓ Multiline text classification passed');

    // 10. Empty & null handling
    assert(detector.classify(null).type === 'text', 'Null should return text');
    assert(detector.classify('').type === 'text', 'Empty string should return text');
    console.log('✓ Null/empty robustness passed');

    console.log('All ContentDetector tests passed successfully!\n');
}

runTests();
