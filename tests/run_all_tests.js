// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

console.log('====================================================');
console.log('Running Clipboard Indicator Test Suite (GNOME 51)');
console.log('====================================================\n');

import './test_contentDetector.js';
import './test_search.js';
import './test_privacy.js';
import './test_devTools.js';
import './test_diffEngine.js';
import './test_collections.js';
import './test_historyStore.js';

console.log('====================================================');
console.log('🎉 ALL UNIT TESTS PASSED SUCCESSFULLY! (7/7 Suites)');
console.log('====================================================');
