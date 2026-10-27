// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

/**
 * Clipboard Indicator - Diff & Similarity Engine
 *
 * Implements line-by-line text diffing and similarity detection
 * for comparing clipboard entries and finding near-duplicates.
 */

export class DiffEngine {
    /**
     * Compute a line-by-line diff between textA (original) and textB (modified).
     *
     * @param {string} textA - Base text
     * @param {string} textB - Modified text
     * @returns {Array<{ type: 'equal'|'added'|'removed', content: string, lineA?: number, lineB?: number }>}
     */
    static computeDiff(textA, textB) {
        const linesA = typeof textA === 'string' && textA.length > 0 ? textA.split(/\r?\n/) : [];
        const linesB = typeof textB === 'string' && textB.length > 0 ? textB.split(/\r?\n/) : [];

        // Fast path: both empty
        if (linesA.length === 0 && linesB.length === 0)
            return [];

        // Fast path: A empty (all added)
        if (linesA.length === 0) {
            return linesB.map((line, idx) => ({
                type: 'added',
                content: line,
                lineB: idx + 1,
            }));
        }

        // Fast path: B empty (all removed)
        if (linesB.length === 0) {
            return linesA.map((line, idx) => ({
                type: 'removed',
                content: line,
                lineA: idx + 1,
            }));
        }

        // Fast path: identical strings
        if (textA === textB) {
            return linesA.map((line, idx) => ({
                type: 'equal',
                content: line,
                lineA: idx + 1,
                lineB: idx + 1,
            }));
        }

        // Compute Longest Common Subsequence (LCS) matrix
        const n = linesA.length;
        const m = linesB.length;
        const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < m; j++) {
                if (linesA[i] === linesB[j]) {
                    dp[i + 1][j + 1] = dp[i][j] + 1;
                } else {
                    dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
                }
            }
        }

        // Backtrack to build diff output
        const result = [];
        let i = n;
        let j = m;

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
                result.unshift({
                    type: 'equal',
                    content: linesA[i - 1],
                    lineA: i,
                    lineB: j,
                });
                i--;
                j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                result.unshift({
                    type: 'added',
                    content: linesB[j - 1],
                    lineB: j,
                });
                j--;
            } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
                result.unshift({
                    type: 'removed',
                    content: linesA[i - 1],
                    lineA: i,
                });
                i--;
            }
        }

        return result;
    }

    /**
     * Compute a similarity score between two texts (0.0 to 1.0).
     * Uses a hybrid of token Jaccard similarity and character Levenshtein.
     *
     * @param {string} textA
     * @param {string} textB
     * @returns {number} Value between 0.0 (completely distinct) and 1.0 (identical)
     */
    static similarityScore(textA, textB) {
        if (!textA && !textB) return 1.0;
        if (!textA || !textB) return 0.0;
        if (textA === textB) return 1.0;

        const strA = textA.trim();
        const strB = textB.trim();
        if (strA === strB) return 1.0;

        // For short strings, Levenshtein distance
        if (strA.length < 256 && strB.length < 256) {
            const dist = this._levenshteinDistance(strA, strB);
            const maxLen = Math.max(strA.length, strB.length);
            return maxLen === 0 ? 1.0 : Math.max(0, 1 - dist / maxLen);
        }

        // For longer strings, word-level Jaccard similarity
        const wordsA = new Set(strA.toLowerCase().split(/\s+/).filter(Boolean));
        const wordsB = new Set(strB.toLowerCase().split(/\s+/).filter(Boolean));

        if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
        if (wordsA.size === 0 || wordsB.size === 0) return 0.0;

        let intersection = 0;
        for (const word of wordsA) {
            if (wordsB.has(word)) intersection++;
        }

        const union = wordsA.size + wordsB.size - intersection;
        return union === 0 ? 1.0 : intersection / union;
    }

    /**
     * Scan an array of entries for near-duplicates above a similarity threshold.
     *
     * @param {Array<Object>} entries
     * @param {number} [threshold=0.8]
     * @param {number} [maxComparisons=100]
     * @returns {Array<{ entryA: Object, entryB: Object, similarity: number }>}
     */
    static findSimilar(entries, threshold = 0.8, maxComparisons = 100) {
        if (!Array.isArray(entries) || entries.length < 2)
            return [];

        const results = [];
        const limit = Math.min(entries.length, maxComparisons);

        for (let i = 0; i < limit; i++) {
            const entryA = entries[i];
            if (!entryA || entryA.type === 'image' || !entryA.content) continue;

            for (let j = i + 1; j < limit; j++) {
                const entryB = entries[j];
                if (!entryB || entryB.type === 'image' || !entryB.content) continue;

                const score = this.similarityScore(entryA.content, entryB.content);
                if (score >= threshold && score < 1.0) {
                    results.push({
                        entryA,
                        entryB,
                        similarity: Math.round(score * 100) / 100,
                    });
                }
            }
        }

        return results.sort((a, b) => b.similarity - a.similarity);
    }

    static _levenshteinDistance(s1, s2) {
        const m = s1.length;
        const n = s2.length;
        let prev = new Uint32Array(n + 1);
        let curr = new Uint32Array(n + 1);

        for (let j = 0; j <= n; j++) prev[j] = j;

        for (let i = 1; i <= m; i++) {
            curr[0] = i;
            const c1 = s1.charCodeAt(i - 1);
            for (let j = 1; j <= n; j++) {
                const c2 = s2.charCodeAt(j - 1);
                const cost = c1 === c2 ? 0 : 1;
                curr[j] = Math.min(
                    prev[j] + 1,       // deletion
                    curr[j - 1] + 1,   // insertion
                    prev[j - 1] + cost // substitution
                );
            }
            const tmp = prev;
            prev = curr;
            curr = tmp;
        }

        return prev[n];
    }
}

export default DiffEngine;
