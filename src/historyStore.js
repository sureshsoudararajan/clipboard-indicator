// SPDX-License-Identifier: GPL-2.0-or-later
// History Store — Clipboard history persistence and management

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

/**
 * HistoryStore manages the clipboard history list.
 * - JSON-based metadata storage
 * - Configurable max size with pinned-entry exemption
 * - Deduplication of identical entries
 * - Most-recent-first ordering
 * - Session persistence
 * - Corruption recovery
 */
export class HistoryStore {
    /**
     * @param {string|Gio.Settings} arg1 - Base data directory or settings
     * @param {Gio.Settings|Object} [arg2={}] - Extension settings or options
     */
    constructor(arg1, arg2 = {}) {
        let dataDir;
        if (typeof arg1 === 'string') {
            dataDir = arg1;
            this._settings = arg2;
        } else {
            this._settings = arg1;
            dataDir = (arg2 && arg2.dataDir) || GLib.build_filenamev([GLib.get_user_data_dir(), 'clipboard-indicator']);
        }

        this._dataDir = dataDir;
        this._historyFile = GLib.build_filenamev([dataDir, 'history.json']);
        this._entries = [];
        this._listeners = new Map();
        this._saveTimeoutId = 0;
        this._dirty = false;

        // Ensure data directory exists
        GLib.mkdir_with_parents(dataDir, 0o755);
    }

    /**
     * Number of entries currently stored.
     */
    get count() {
        return this._entries.length;
    }

    get length() {
        return this._entries.length;
    }

    /**
     * Set max history size and prune if needed.
     */
    setMaxSize(_size) {
        this._enforceMaxSize();
    }

    /**
     * Prune entries older than retention days (alias for enforceRetention).
     */
    pruneExpiredEntries(days = null) {
        return this.enforceRetention(days);
    }

    /**
     * Load history from disk. Recovers gracefully from corruption.
     */
    load() {
        try {
            if (!GLib.file_test(this._historyFile, GLib.FileTest.EXISTS)) {
                this._entries = [];
                return;
            }

            const file = Gio.File.new_for_path(this._historyFile);
            const [success, contents] = file.load_contents(null);

            if (!success) {
                console.warn('[HistoryStore] Failed to read history file');
                this._entries = [];
                return;
            }

            const decoder = new TextDecoder('utf-8');
            const json = decoder.decode(contents);
            const data = JSON.parse(json);

            if (Array.isArray(data)) {
                this._entries = data.filter(e => this._isValidEntry(e));
            } else if (data && Array.isArray(data.entries)) {
                this._entries = data.entries.filter(e => this._isValidEntry(e));
            } else {
                console.warn('[HistoryStore] Invalid history format, starting fresh');
                this._entries = [];
            }

            console.debug(`[HistoryStore] Loaded ${this._entries.length} entries`);
        } catch (e) {
            console.error('[HistoryStore] Error loading history (recovering):', e);
            this._entries = [];
            try {
                const backupPath = `${this._historyFile}.corrupt.${Date.now()}`;
                const src = Gio.File.new_for_path(this._historyFile);
                const dst = Gio.File.new_for_path(backupPath);
                src.copy(dst, Gio.FileCopyFlags.NONE, null, null);
            } catch (_be) {
                // Ignore backup failure
            }
        }
    }

    /**
     * Save history to disk. Uses debounced writes for performance.
     * @param {boolean} immediate - Skip debounce and save now
     */
    save(immediate = false) {
        if (typeof this._settings?.get_boolean === 'function' && !this._settings.get_boolean('enable-persistence'))
            return;

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

        this._saveTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            this._saveTimeoutId = 0;
            this._performSave();
            return GLib.SOURCE_REMOVE;
        });
    }

    _performSave() {
        if (!this._dirty)
            return;

        try {
            const data = {
                version: 1,
                savedAt: new Date().toISOString(),
                entries: this._entries,
            };

            const json = JSON.stringify(data, null, 2);
            const file = Gio.File.new_for_path(this._historyFile);
            const encoder = new TextEncoder();

            file.replace_contents(
                encoder.encode(json),
                null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );

            try {
                GLib.chmod(this._historyFile, 0o600);
            } catch (_e) {
                // Ignore
            }

            this._dirty = false;
        } catch (e) {
            console.error('[HistoryStore] Error saving history:', e);
        }
    }

    /**
     * Add a new text entry to history.
     */
    addTextEntry(content, classification = null) {
        if (!content || content.length === 0)
            return null;

        // Deduplication check
        const enableDedup = typeof this._settings?.get_boolean === 'function'
            ? this._settings.get_boolean('enable-deduplication')
            : true;

        if (enableDedup) {
            const existingIdx = this._entries.findIndex(
                e => e.type !== 'image' && e.content === content
            );
            if (existingIdx >= 0) {
                const existing = this._entries.splice(existingIdx, 1)[0];
                existing.updatedAt = new Date().toISOString();
                existing.copyCount = (existing.copyCount || 1) + 1;
                this._entries.unshift(existing);
                this.save();
                this._emit('changed');
                return existing;
            }
        }

        const entry = {
            id: this._generateId(),
            type: 'text',
            content,
            contentType: classification?.type || 'text',
            confidence: classification?.confidence || 1.0,
            metadata: classification?.metadata || {},
            pinned: false,
            copyCount: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        this._entries.unshift(entry);
        this._enforceMaxSize();
        this.save();
        this._emit('changed');

        return entry;
    }

    /**
     * Add a new image entry to history.
     */
    addImageEntry(imageInfo, mimeType, ocrText = null, checksum = null) {
        if (!imageInfo || !imageInfo.imagePath)
            return null;

        // Image deduplication check
        const enableDedup = typeof this._settings?.get_boolean === 'function'
            ? this._settings.get_boolean('enable-deduplication')
            : true;

        if (enableDedup) {
            const existingIdx = this._entries.findIndex(e => {
                if (e.type !== 'image') return false;
                if (checksum && e.checksum) return e.checksum === checksum;
                return e.imageSize === imageInfo.size &&
                       e.imageWidth === imageInfo.width &&
                       e.imageHeight === imageInfo.height;
            });

            if (existingIdx >= 0) {
                const existing = this._entries.splice(existingIdx, 1)[0];
                existing.updatedAt = new Date().toISOString();
                existing.copyCount = (existing.copyCount || 1) + 1;
                this._entries.unshift(existing);
                this.save();
                this._emit('changed');

                // Delete duplicate disk file if newly stored
                if (existing.imagePath !== imageInfo.imagePath && this._imageHandler) {
                    this._imageHandler.deleteImage(imageInfo.imagePath, imageInfo.thumbnailPath);
                }
                return existing;
            }
        }

        const entry = {
            id: this._generateId(),
            type: 'image',
            content: null,
            contentType: 'image',
            mimeType,
            checksum: checksum || null,
            imagePath: imageInfo.imagePath,
            thumbnailPath: imageInfo.thumbnailPath,
            imageWidth: imageInfo.width,
            imageHeight: imageInfo.height,
            imageFormat: imageInfo.format,
            imageSize: imageInfo.size,
            ocrText: ocrText || null,
            pinned: false,
            copyCount: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: {},
        };

        this._entries.unshift(entry);
        this._enforceMaxSize();
        this.save();
        this._emit('changed');

        return entry;
    }

    getEntries() {
        return [...this._entries];
    }

    getEntry(id) {
        return this._entries.find(e => e.id === id) || null;
    }

    togglePin(id) {
        const entry = this._entries.find(e => e.id === id);
        if (!entry)
            return false;

        entry.pinned = !entry.pinned;
        entry.updatedAt = new Date().toISOString();
        this.save();
        this._emit('changed');
        return entry.pinned;
    }

    deleteEntry(id) {
        const idx = this._entries.findIndex(e => e.id === id);
        if (idx < 0)
            return null;

        const entry = this._entries.splice(idx, 1)[0];
        this.save();
        this._emit('changed');
        return entry;
    }

    clearNonPinned() {
        const deleted = this._entries.filter(e => !e.pinned);
        this._entries = this._entries.filter(e => e.pinned);
        this.save(true);
        this._emit('changed');
        return deleted;
    }

    clearAll() {
        const deleted = [...this._entries];
        this._entries = [];
        this.save(true);
        this._emit('changed');
        return deleted;
    }

    getPinnedEntries() {
        return this._entries.filter(e => e.pinned);
    }

    bumpEntry(id) {
        const idx = this._entries.findIndex(e => e.id === id);
        if (idx > 0) {
            const entry = this._entries.splice(idx, 1)[0];
            entry.updatedAt = new Date().toISOString();
            entry.copyCount = (entry.copyCount || 1) + 1;
            this._entries.unshift(entry);
            this.save();
            this._emit('changed');
            return entry;
        } else if (idx === 0) {
            this._entries[0].updatedAt = new Date().toISOString();
            this._entries[0].copyCount = (this._entries[0].copyCount || 1) + 1;
            this.save();
            return this._entries[0];
        }
        return null;
    }

    get pinnedCount() {
        return this._entries.filter(e => e.pinned).length;
    }

    getStats() {
        const total = this._entries.length;
        const pinned = this._entries.filter(e => e.pinned).length;
        const images = this._entries.filter(e => e.type === 'image').length;
        const links = this._entries.filter(e => e.contentType === 'url').length;
        const text = total - images;
        let totalImageSize = 0;

        for (const entry of this._entries) {
            if (entry.imageSize)
                totalImageSize += entry.imageSize;
        }

        return { total, pinned, images, links, text, totalImageSize };
    }

    updateOCRText(id, ocrText) {
        const entry = this._entries.find(e => e.id === id);
        if (!entry)
            return;

        entry.ocrText = ocrText;
        entry.updatedAt = new Date().toISOString();
        this.save();
    }

    _enforceMaxSize() {
        const maxSize = (typeof this._settings?.get_int === 'function' ? this._settings.get_int('history-size') : 50) || 50;
        const nonPinned = this._entries.filter(e => !e.pinned);

        if (nonPinned.length <= maxSize)
            return;

        const toRemove = nonPinned.length - maxSize;
        let removed = 0;

        for (let i = this._entries.length - 1; i >= 0 && removed < toRemove; i--) {
            if (!this._entries[i].pinned) {
                const entry = this._entries.splice(i, 1)[0];
                this._emit('entry-removed', entry);
                removed++;
            }
        }
    }

    enforceRetention(overrideDays = null) {
        const retentionDays = overrideDays !== null
            ? overrideDays
            : ((typeof this._settings?.get_int === 'function' ? this._settings.get_int('retention-days') : 30) || 30);

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retentionDays);
        const cutoffISO = cutoff.toISOString();

        const removed = [];
        this._entries = this._entries.filter(e => {
            if (e.pinned)
                return true;

            if (e.createdAt < cutoffISO) {
                removed.push(e);
                return false;
            }
            return true;
        });

        if (removed.length > 0) {
            for (const entry of removed)
                this._emit('entry-removed', entry);
            this.save();
            this._emit('changed');
        }

        return removed;
    }

    exportHistory(includePinned = true) {
        let entries = includePinned
            ? this._entries
            : this._entries.filter(e => !e.pinned);

        entries = entries.map(e => {
            const exported = { ...e };
            delete exported.imagePath;
            delete exported.thumbnailPath;
            return exported;
        });

        return JSON.stringify({
            version: 1,
            exportedAt: new Date().toISOString(),
            entries,
        }, null, 2);
    }

    importHistory(jsonString, merge = true) {
        const errors = [];
        let imported = 0;

        try {
            const data = JSON.parse(jsonString);
            let entries;

            if (Array.isArray(data)) {
                entries = data;
            } else if (data && Array.isArray(data.entries)) {
                entries = data.entries;
            } else {
                return { imported: 0, errors: ['Invalid import format'] };
            }

            if (!merge)
                this._entries = [];

            for (const entry of entries) {
                if (!this._isValidEntry(entry)) {
                    errors.push(`Invalid entry: ${entry.id || 'unknown'}`);
                    continue;
                }

                if (merge) {
                    const exists = this._entries.some(e => e.id === entry.id);
                    if (exists) {
                        errors.push(`Duplicate entry skipped: ${entry.id}`);
                        continue;
                    }
                }

                const sanitized = {
                    id: entry.id || this._generateId(),
                    type: entry.type || 'text',
                    content: entry.content || '',
                    contentType: entry.contentType || 'text',
                    confidence: entry.confidence || 1.0,
                    metadata: entry.metadata || {},
                    pinned: !!entry.pinned,
                    copyCount: entry.copyCount || 1,
                    createdAt: entry.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    mimeType: entry.mimeType || null,
                    ocrText: entry.ocrText || null,
                };

                this._entries.push(sanitized);
                imported++;
            }

            this._entries.sort((a, b) =>
                new Date(b.createdAt) - new Date(a.createdAt)
            );

            this._enforceMaxSize();
            this.save(true);
            this._emit('changed');
        } catch (e) {
            errors.push(`Parse error: ${e.message}`);
        }

        return { imported, errors };
    }

    getValidIds() {
        return new Set(this._entries.map(e => e.id));
    }

    _isValidEntry(entry) {
        if (!entry || typeof entry !== 'object')
            return false;
        if (!entry.id || typeof entry.id !== 'string')
            return false;
        if (entry.type === 'image')
            return true;
        if (entry.content === undefined || entry.content === null)
            return false;
        return true;
    }

    _generateId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `${timestamp}-${random}`;
    }

    on(event, callback) {
        if (!this._listeners.has(event))
            this._listeners.set(event, []);
        this._listeners.get(event).push(callback);
    }

    off(event, callback) {
        if (!this._listeners.has(event))
            return;
        const cbs = this._listeners.get(event);
        const idx = cbs.indexOf(callback);
        if (idx >= 0)
            cbs.splice(idx, 1);
    }

    _emit(event, ...args) {
        const cbs = this._listeners.get(event);
        if (!cbs)
            return;
        for (const cb of cbs) {
            try {
                cb(...args);
            } catch (e) {
                console.error(`[HistoryStore] Error in ${event} listener:`, e);
            }
        }
    }

    destroy() {
        if (this._saveTimeoutId > 0) {
            GLib.source_remove(this._saveTimeoutId);
            this._saveTimeoutId = 0;
        }

        if (this._dirty)
            this._performSave();

        this._listeners.clear();
        this._entries = [];
        this._settings = null;
    }
}

export default HistoryStore;
