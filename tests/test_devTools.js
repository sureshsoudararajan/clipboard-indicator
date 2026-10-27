// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

import DevTools from '../src/devTools.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error('Assertion failed: ' + message);
    }
}

function runTests() {
    console.log('--- Testing DevTools ---');

    // 1. JSON formatting
    const rawJson = '{"arch":"linux","gnome":51,"wayland":true}';
    const jsonRes = DevTools.formatJSON(rawJson, 2);
    assert(jsonRes.success, 'JSON formatting should succeed');
    assert(jsonRes.result.includes('\n  "arch": "linux"'), 'JSON should be indented');
    console.log('✓ JSON format and validate passed');

    // 2. URL Encode / Decode
    const origUrl = 'https://example.com/search?q=gnome 51 & wayland';
    const encoded = DevTools.urlEncode(origUrl);
    assert(encoded.includes('%20') || encoded.includes('+'), 'URL should be encoded');
    const decodedRes = DevTools.urlDecode(encoded);
    assert(decodedRes.success && decodedRes.result === origUrl, 'URL decode should restore original');
    console.log('✓ URL encode/decode passed');

    // 3. Base64 Encode / Decode
    const testStr = 'Hello GNOME 51 Clipboard Manager! 🚀';
    const b64 = DevTools.base64Encode(testStr);
    assert(b64.length > 0, 'Base64 string should not be empty');
    const b64Res = DevTools.base64Decode(b64);
    assert(b64Res.success && b64Res.result === testStr, 'Base64 decode should restore unicode string');
    console.log('✓ Base64 encode/decode with emojis passed');

    // 4. Whitespace normalization
    const messy = '   Line 1    with   spaces   \r\n\r\n   Line 2   ';
    const clean = DevTools.normalizeWhitespace(messy);
    assert(clean === 'Line 1 with spaces\n\nLine 2', `Unexpected normalized whitespace: "${clean}"`);
    console.log('✓ Whitespace normalization passed');

    // 5. Hostname & Param stripping
    const complexUrl = 'https://api.github.com/repos/gnome/shell?branch=main&auth=xyz#readme';
    assert(DevTools.extractHostname(complexUrl) === 'api.github.com', 'Should extract hostname');
    assert(DevTools.stripQueryParams(complexUrl) === 'https://api.github.com/repos/gnome/shell', 'Should strip query and hash');
    console.log('✓ URL components and query stripping passed');

    console.log('All DevTools tests passed successfully!\n');
}

runTests();
