// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

import { PrivacyManager } from '../src/privacy.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error('Assertion failed: ' + message);
    }
}

function runTests() {
    console.log('--- Testing PrivacyManager ---');
    const privacy = new PrivacyManager();

    // 1. AWS Key
    const awsRes = privacy.detectSensitive('AKIAIOSFODNN7EXAMPLE');
    assert(awsRes.isSensitive, 'Should detect AWS Access Key');
    console.log('✓ AWS Access Key detection passed');

    // 2. Private SSH Key
    const sshRes = privacy.detectSensitive('-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...');
    assert(sshRes.isSensitive, 'Should detect RSA Private Key');
    console.log('✓ Private Key detection passed');

    // 3. GitHub Personal Access Token
    const ghRes = privacy.detectSensitive('ghp_0123456789abcdefghijklmnopqrstuvwxyz');
    assert(ghRes.isSensitive, 'Should detect GitHub token');
    console.log('✓ GitHub token detection passed');

    // 4. Embedded URL Password
    const urlPassRes = privacy.detectSensitive('postgres://admin:superSecret123@db.internal:5432/prod');
    assert(urlPassRes.isSensitive, 'Should detect URL credentials');
    console.log('✓ URL credential detection passed');

    // 5. Ordinary non-sensitive text
    const cleanRes = privacy.detectSensitive('Here is a normal note about groceries: milk, bread, butter.');
    assert(!cleanRes.isSensitive, 'Normal note should not be flagged as sensitive');
    console.log('✓ Non-sensitive text correctly passed');

    // 6. Source app exclusions
    assert(privacy.shouldExcludeApp('org.keepassxc.KeePassXC'), 'KeePassXC should be excluded');
    assert(privacy.shouldExcludeApp('com.bitwarden.desktop'), 'Bitwarden should be excluded');
    assert(!privacy.shouldExcludeApp('org.gnome.TextEditor'), 'GNOME Text Editor should not be excluded');
    console.log('✓ App exclusion check passed');

    console.log('All PrivacyManager tests passed successfully!\n');
}

runTests();
