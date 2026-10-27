// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

/**
 * Clipboard Indicator - Collections & Reusable Snippets Module
 *
 * Manages user-defined collections, persistent code/command snippets,
 * tag categorizations, and JSON export/import.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const DEFAULT_COLLECTIONS = [
    {
        id: 'code-snippets',
        name: 'Code Snippets',
        description: 'Common reusable code fragments and functions',
        isDefault: true,
        items: [],
    },
    {
        id: 'shell-commands',
        name: 'Shell Commands',
        description: 'Frequent terminal commands, scripts, and one-liners',
        isDefault: true,
        items: [
            {
                id: 'snippet-git-status',
                title: 'Git Status Short',
                content: 'git status -s',
                description: 'Show working tree status in compact format',
                contentType: 'shell-command',
                createdAt: new Date().toISOString(),
            },
            {
                id: 'snippet-pacman-update',
                title: 'Arch System Upgrade',
                content: 'sudo pacman -Syu',
                description: 'Synchronize package databases and update system',
                contentType: 'shell-command',
                createdAt: new Date().toISOString(),
            },
        ],
    },
    {
        id: 'useful-links',
        name: 'Links & Bookmarks',
        description: 'Frequently accessed documentation, links, and portals',
        isDefault: true,
        items: [],
    },
    {
        id: 'general-notes',
        name: 'General Snippets',
        description: 'Miscellaneous templates, text blocks, and canned responses',
        isDefault: true,
        items: [],
    },
];

export class CollectionManager {
    /**
     * @param {Gio.Settings|null} settings
     * @param {Object} options - { dataDir: string }
     */
    constructor(settings = null, options = {}) {
        this._settings = settings;
        this._dataDir = options.dataDir || (typeof GLib !== 'undefined' ? GLib.get_user_data_dir() + '/clipboard-indicator' : './data');
        this._filePath = GLib.build_filenamev([this._dataDir, 'collections.json']);
        this._collections = [];
        this._listeners = new Map();
        this._dirty = false;
        this._saveTimeoutId = 0;
    }

    /**
     * Load collections from disk or initialize with defaults.
     */
    load() {
        try {
            if (!GLib.file_test(this._filePath, GLib.FileTest.EXISTS)) {
                this._collections = JSON.parse(JSON.stringify(DEFAULT_COLLECTIONS));
                this.save(true);
                return;
            }

            const file = Gio.File.new_for_path(this._filePath);
            const [success, contents] = file.load_contents(null);
            if (!success) {
                console.warn('[CollectionManager] Failed to read collections file');
                this._collections = JSON.parse(JSON.stringify(DEFAULT_COLLECTIONS));
                return;
            }

            const decoder = new TextDecoder('utf-8');
            const data = JSON.parse(decoder.decode(contents));

            if (Array.isArray(data)) {
                this._collections = data;
            } else if (data && Array.isArray(data.collections)) {
                this._collections = data.collections;
            } else {
                this._collections = JSON.parse(JSON.stringify(DEFAULT_COLLECTIONS));
            }

            // Ensure all default collections exist
            for (const def of DEFAULT_COLLECTIONS) {
                if (!this._collections.some(c => c.id === def.id)) {
                    this._collections.push(JSON.parse(JSON.stringify(def)));
                }
            }
        } catch (err) {
            console.error('[CollectionManager] Error loading collections:', err);
            this._collections = JSON.parse(JSON.stringify(DEFAULT_COLLECTIONS));
        }
    }

    /**
     * Persist collections to disk.
     */
    save(immediate = false) {
        this._dirty = true;

        if (immediate) {
            if (this._saveTimeoutId > 0) {
                GLib.source_remove(this._saveTimeoutId);
                this._saveTimeoutId = 0;
            }
            this._performSave();
            return;
        }

        if (this._saveTimeoutId > 0)
            return;

        this._saveTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            this._saveTimeoutId = 0;
            this._performSave();
            return GLib.SOURCE_REMOVE;
        });
    }

    _performSave() {
        if (!this._dirty) return;

        try {
            const data = {
                version: 1,
                savedAt: new Date().toISOString(),
                collections: this._collections,
            };

            const json = JSON.stringify(data, null, 2);
            const file = Gio.File.new_for_path(this._filePath);
            const encoder = new TextEncoder();

            file.replace_contents(
                encoder.encode(json),
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );

            try {
                GLib.chmod(this._filePath, 0o600);
            } catch {}

            this._dirty = false;
        } catch (err) {
            console.error('[CollectionManager] Failed saving collections:', err);
        }
    }

    /**
     * Get all collections.
     */
    getCollections() {
        return [...this._collections];
    }

    /**
     * Get a collection by ID.
     */
    getCollection(id) {
        return this._collections.find(c => c.id === id) || null;
    }

    /**
     * Create a new collection.
     */
    createCollection(name, description = '') {
        const id = 'col-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
        const col = {
            id,
            name: (name || 'New Collection').trim(),
            description: (description || '').trim(),
            createdAt: new Date().toISOString(),
            isDefault: false,
            items: [],
        };

        this._collections.push(col);
        this.save();
        this._emit('changed');
        return col;
    }

    /**
     * Rename or update a collection.
     */
    updateCollection(id, name, description = null) {
        const col = this.getCollection(id);
        if (!col) return false;

        if (name) col.name = name.trim();
        if (description !== null) col.description = description.trim();
        col.updatedAt = new Date().toISOString();

        this.save();
        this._emit('changed');
        return true;
    }

    /**
     * Delete a collection.
     */
    deleteCollection(id) {
        const index = this._collections.findIndex(c => c.id === id);
        if (index === -1) return false;

        const removed = this._collections.splice(index, 1)[0];
        this.save();
        this._emit('changed');
        return removed;
    }

    /**
     * Create or add a snippet to a collection.
     */
    addSnippet(collectionId, title, content, description = '', contentType = 'text') {
        const col = this.getCollection(collectionId);
        if (!col) return null;

        const snippet = {
            id: 'snip-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
            title: (title || 'Snippet').trim(),
            content: content || '',
            description: (description || '').trim(),
            contentType: contentType || 'text',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        if (!Array.isArray(col.items)) col.items = [];
        col.items.unshift(snippet);

        this.save();
        this._emit('changed');
        return snippet;
    }

    /**
     * Add a clipboard entry to a collection.
     */
    addEntryToCollection(collectionId, entry) {
        if (!entry) return null;
        const title = entry.title || (entry.content ? entry.content.substring(0, 40).replace(/\n/g, ' ') : 'Entry');
        return this.addSnippet(
            collectionId,
            title,
            entry.content,
            entry.metadata?.hostname || '',
            entry.contentType || 'text'
        );
    }

    /**
     * Remove an item from a collection.
     */
    removeSnippet(collectionId, snippetId) {
        const col = this.getCollection(collectionId);
        if (!col || !Array.isArray(col.items)) return false;

        const idx = col.items.findIndex(item => item.id === snippetId);
        if (idx === -1) return false;

        col.items.splice(idx, 1);
        this.save();
        this._emit('changed');
        return true;
    }

    /**
     * Reorder items within a collection.
     */
    reorderItems(collectionId, fromIndex, toIndex) {
        const col = this.getCollection(collectionId);
        if (!col || !Array.isArray(col.items)) return false;

        if (fromIndex < 0 || fromIndex >= col.items.length || toIndex < 0 || toIndex >= col.items.length)
            return false;

        const item = col.items.splice(fromIndex, 1)[0];
        col.items.splice(toIndex, 0, item);

        this.save();
        this._emit('changed');
        return true;
    }

    /**
     * Search snippets across all collections.
     */
    searchCollections(query) {
        const q = (query || '').toLowerCase().trim();
        if (!q) return [];

        const results = [];
        for (const col of this._collections) {
            for (const item of (col.items || [])) {
                if (
                    (item.title && item.title.toLowerCase().includes(q)) ||
                    (item.content && item.content.toLowerCase().includes(q)) ||
                    (item.description && item.description.toLowerCase().includes(q)) ||
                    (col.name && col.name.toLowerCase().includes(q))
                ) {
                    results.push({
                        ...item,
                        collectionId: col.id,
                        collectionName: col.name,
                    });
                }
            }
        }
        return results;
    }

    /**
     * Export collections to JSON.
     */
    exportCollections(collectionIds = null) {
        let cols = this._collections;
        if (Array.isArray(collectionIds) && collectionIds.length > 0) {
            cols = cols.filter(c => collectionIds.includes(c.id));
        }

        return JSON.stringify({
            version: 1,
            exportedAt: new Date().toISOString(),
            collections: cols,
        }, null, 2);
    }

    /**
     * Import collections from JSON.
     */
    importCollections(jsonString, merge = true) {
        const errors = [];
        let imported = 0;

        try {
            const data = JSON.parse(jsonString);
            const cols = Array.isArray(data) ? data : (data.collections || []);

            if (!Array.isArray(cols)) {
                return { imported: 0, errors: ['Invalid collection JSON format'] };
            }

            if (!merge) {
                this._collections = [];
            }

            for (const col of cols) {
                if (!col.name || typeof col.name !== 'string') {
                    errors.push('Skipping unnamed collection');
                    continue;
                }

                const existing = this._collections.find(c => c.id === col.id || c.name.toLowerCase() === col.name.toLowerCase());
                if (existing && merge) {
                    // Merge items
                    if (Array.isArray(col.items)) {
                        for (const item of col.items) {
                            if (!existing.items.some(ei => ei.content === item.content)) {
                                existing.items.push(item);
                                imported++;
                            }
                        }
                    }
                } else {
                    this._collections.push({
                        id: col.id || 'col-' + Date.now().toString(36),
                        name: col.name,
                        description: col.description || '',
                        createdAt: col.createdAt || new Date().toISOString(),
                        isDefault: Boolean(col.isDefault),
                        items: Array.isArray(col.items) ? col.items : [],
                    });
                    imported += (col.items ? col.items.length : 1);
                }
            }

            this.save(true);
            this._emit('changed');
        } catch (err) {
            errors.push('Parse error: ' + err.message);
        }

        return { imported, errors };
    }

    on(event, callback) {
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event).push(callback);
    }

    off(event, callback) {
        const list = this._listeners.get(event);
        if (list) {
            const idx = list.indexOf(callback);
            if (idx >= 0) list.splice(idx, 1);
        }
    }

    _emit(event, ...args) {
        const list = this._listeners.get(event);
        if (list) {
            for (const cb of list) {
                try { cb(...args); } catch (e) { console.error(e); }
            }
        }
    }

    destroy() {
        if (this._saveTimeoutId > 0) {
            GLib.source_remove(this._saveTimeoutId);
            this._saveTimeoutId = 0;
        }
        if (this._dirty) {
            this._performSave();
        }
        this._listeners.clear();
        this._collections = [];
        this._settings = null;
    }
}

export default CollectionManager;
