// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

/**
 * Clipboard Indicator - Search & Filter Engine
 *
 * Provides fast, local searching across text content, URLs, hostnames, OCR text,
 * tags, and metadata. Supports type filtering and pinned-only queries.
 * Fully compatible with GJS ESM and standalone test environments.
 */

export class SearchEngine {
    constructor(settings = null) {
        this._settings = settings;
    }

    /**
     * Search and filter a list of clipboard entries.
     *
     * @param {Array<Object>} entries - Array of history entry objects.
     * @param {string} [query=''] - Text search query.
     * @param {Object} [filters={}] - Optional filters: { type: string|null, pinnedOnly: boolean, collectionId: string|null }
     * @returns {Array<Object>} Sorted/filtered entries matching criteria.
     */
    search(entries, query = '', filters = {}) {
        if (!Array.isArray(entries) || entries.length === 0)
            return [];

        const normalizedQuery = (query || '').trim().toLowerCase();
        const typeFilter = filters.type && filters.type !== 'all' ? filters.type : null;
        const pinnedOnly = Boolean(filters.pinnedOnly);
        const collectionId = filters.collectionId || null;

        // 1. Filter phase
        let matches = entries.filter(entry => {
            if (!entry) return false;

            // Pinned-only filter
            if (pinnedOnly && !entry.pinned)
                return false;

            // Collection filter
            if (collectionId && entry.collectionId !== collectionId)
                return false;

            // Type filter
            if (typeFilter) {
                if (typeFilter === 'pinned') {
                    if (!entry.pinned) return false;
                } else if (typeFilter === 'image') {
                    if (entry.type !== 'image' && entry.contentType !== 'image') return false;
                } else if (typeFilter === 'url' || typeFilter === 'link' || typeFilter === 'links') {
                    if (entry.contentType !== 'url') return false;
                } else if (typeFilter === 'text') {
                    if (entry.type === 'image' || entry.contentType === 'image' || entry.contentType === 'url') return false;
                } else if (entry.contentType !== typeFilter) {
                    return false;
                }
            }

            // Text search filter
            if (!normalizedQuery)
                return true;

            return this._matchesQuery(entry, normalizedQuery);
        });

        // 2. Ranking phase: if there is an active search query, score and sort by relevance
        if (normalizedQuery) {
            matches = matches.map(entry => ({
                entry,
                score: this._scoreMatch(entry, normalizedQuery),
            }))
            .sort((a, b) => b.score - a.score)
            .map(item => item.entry);
        }

        return matches;
    }

    /**
     * Check whether an entry matches the query string.
     *
     * @param {Object} entry
     * @param {string} query - Lowercase query string
     * @returns {boolean}
     */
    _matchesQuery(entry, query) {
        // Content text
        if (typeof entry.content === 'string' && entry.content.toLowerCase().includes(query))
            return true;

        // OCR text for images
        if (typeof entry.ocrText === 'string' && entry.ocrText.toLowerCase().includes(query))
            return true;

        // Title or label
        if (typeof entry.title === 'string' && entry.title.toLowerCase().includes(query))
            return true;

        // URL / Hostname metadata
        if (entry.metadata) {
            if (typeof entry.metadata.hostname === 'string' && entry.metadata.hostname.toLowerCase().includes(query))
                return true;
            if (typeof entry.metadata.url === 'string' && entry.metadata.url.toLowerCase().includes(query))
                return true;
            if (typeof entry.metadata.filename === 'string' && entry.metadata.filename.toLowerCase().includes(query))
                return true;
        }

        // Tags or collections
        if (Array.isArray(entry.tags)) {
            if (entry.tags.some(tag => typeof tag === 'string' && tag.toLowerCase().includes(query)))
                return true;
        }

        if (typeof entry.collectionName === 'string' && entry.collectionName.toLowerCase().includes(query))
            return true;

        return false;
    }

    /**
     * Compute a relevance score for an entry against the query.
     * Higher score = better relevance.
     *
     * @param {Object} entry
     * @param {string} query - Lowercase query string
     * @returns {number}
     */
    _scoreMatch(entry, query) {
        let score = 0;
        const content = (entry.content || '').toLowerCase();
        const ocr = (entry.ocrText || '').toLowerCase();
        const title = (entry.title || '').toLowerCase();
        const hostname = (entry.metadata?.hostname || '').toLowerCase();

        // Exact match
        if (content === query || title === query) {
            score += 100;
        } else if (content.startsWith(query) || title.startsWith(query)) {
            score += 50;
        } else if (hostname && hostname.includes(query)) {
            score += 40;
        } else if (content.includes(query)) {
            score += 20;
        } else if (ocr.includes(query)) {
            score += 15;
        }

        // Pinned bonus
        if (entry.pinned)
            score += 10;

        // Frequency bonus
        if (entry.copyCount && entry.copyCount > 1) {
            score += Math.min(entry.copyCount, 10);
        }

        // Recency bonus: newer items get a slight bump
        if (entry.updatedAt || entry.createdAt) {
            const ageHours = (Date.now() - new Date(entry.updatedAt || entry.createdAt).getTime()) / (1000 * 3600);
            if (ageHours < 24)
                score += 5;
            else if (ageHours < 168)
                score += 2;
        }

        return score;
    }

    /**
     * Filter entries by type only.
     */
    filterByType(entries, type) {
        return this.search(entries, '', { type });
    }

    /**
     * Get pinned entries only.
     */
    getPinned(entries) {
        return this.search(entries, '', { pinnedOnly: true });
    }

    destroy() {
        this._settings = null;
    }
}

export default SearchEngine;
