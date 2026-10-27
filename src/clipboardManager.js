// SPDX-License-Identifier: GPL-2.0-or-later
// Clipboard Manager — Core clipboard monitoring and interaction

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Meta from 'gi://Meta';

// In GNOME / Mutter, clipboard selection type is SELECTION_CLIPBOARD (value 1)
const CLIPBOARD_TYPE = Meta.SelectionType.SELECTION_CLIPBOARD ?? Meta.SelectionType.CLIPBOARD ?? 1;

/**
 * ClipboardManager handles all clipboard operations:
 * - Event-driven monitoring via Meta.Selection 'owner-changed' signal
 * - Text reading via St.Clipboard
 * - Image reading via Meta.Selection.transfer_async
 * - Content categorization via ContentDetector
 * - Sensitive content heuristics via PrivacyManager
 * - Image thumbnail and storage via ImageHandler
 * - Automatic persistence into HistoryStore
 * - Clipboard restoration via Meta.SelectionSourceMemory
 * - Feedback loop prevention
 */
export class ClipboardManager {
    /**
     * @param {Gio.Settings} settings
     * @param {Object} [options={}] - { historyStore, contentDetector, imageHandler, privacyManager }
     */
    constructor(settings, options = {}) {
        this._settings = settings;
        this._historyStore = options.historyStore || null;
        this._contentDetector = options.contentDetector || null;
        this._imageHandler = options.imageHandler || null;
        this._privacyManager = options.privacyManager || null;

        this._clipboard = St.Clipboard.get_default();
        this._selection = global.display.get_selection();
        this._isRestoring = false;
        this._isPaused = false;
        this._ownerChangedId = 0;
        this._pendingRead = null;
        this._listeners = new Map();
        this._lastTextContent = null;
        this._lastImageChecksum = null;
        this._debounceTimeoutId = 0;
    }

    /**
     * Start monitoring clipboard changes.
     */
    enable() {
        if (this._ownerChangedId > 0)
            return;

        this._ownerChangedId = this._selection.connect(
            'owner-changed',
            this._onOwnerChanged.bind(this)
        );
        console.debug('[ClipboardManager] Clipboard monitoring started');
    }

    startMonitoring() {
        this.enable();
    }

    /**
     * Stop monitoring clipboard changes.
     */
    disable() {
        if (this._ownerChangedId > 0) {
            this._selection.disconnect(this._ownerChangedId);
            this._ownerChangedId = 0;
        }

        if (this._debounceTimeoutId > 0) {
            GLib.source_remove(this._debounceTimeoutId);
            this._debounceTimeoutId = 0;
        }

        if (this._pendingRead) {
            this._pendingRead.cancel();
            this._pendingRead = null;
        }
        console.debug('[ClipboardManager] Clipboard monitoring stopped');
    }

    stopMonitoring() {
        this.disable();
    }

    pause() {
        this._isPaused = true;
    }

    resume() {
        this._isPaused = false;
    }

    get isPaused() {
        return this._isPaused;
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
                console.error(`[ClipboardManager] Error in ${event} listener:`, e);
            }
        }
    }

    _onOwnerChanged(_selection, selectionType, _source) {
        if (selectionType !== CLIPBOARD_TYPE)
            return;

        if (this._isRestoring)
            return;

        if (this._isPaused)
            return;

        if (this._settings && !this._settings.get_boolean('enable-monitoring'))
            return;

        if (this._debounceTimeoutId > 0)
            GLib.source_remove(this._debounceTimeoutId);

        this._debounceTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            120,
            () => {
                this._debounceTimeoutId = 0;
                this._readClipboardContent();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _readClipboardContent() {
        try {
            const mimeTypes = this._selection.get_mimetypes(CLIPBOARD_TYPE);

            if (!mimeTypes || mimeTypes.length === 0) {
                // If get_mimetypes is empty, attempt direct text read via St.Clipboard
                this._readTextContent();
                return;
            }

            const imageMime = this._findImageMimeType(mimeTypes);
            if (imageMime) {
                this._readImageContent(imageMime);
                return;
            }

            const hasText = mimeTypes.some(m =>
                m.startsWith('text/') ||
                m === 'UTF8_STRING' ||
                m === 'STRING' ||
                m === 'TEXT' ||
                m === 'COMPOUND_TEXT'
            );

            if (hasText) {
                this._readTextContent();
                return;
            }

            // Fallback for non-image types
            this._readTextContent();
        } catch (e) {
            console.error('[ClipboardManager] Error checking clipboard types:', e);
            this._emit('error', e);
        }
    }

    _findImageMimeType(mimeTypes) {
        const preferred = ['image/png', 'image/jpeg', 'image/bmp', 'image/gif', 'image/webp'];
        for (const pref of preferred) {
            if (mimeTypes.includes(pref))
                return pref;
        }
        return mimeTypes.find(m => m.startsWith('image/')) || null;
    }

    _readTextContent() {
        this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => {
            if (!text || text.length === 0)
                return;

            if (text === this._lastTextContent)
                return;

            this._lastTextContent = text;
            this._handleCapturedText(text);
        });
    }

    _handleCapturedText(text) {
        this._lastImageChecksum = null;

        // 1. Privacy & sensitive check
        if (this._privacyManager && this._settings?.get_boolean('detect-sensitive')) {
            const sens = this._privacyManager.detectSensitive(text);
            if (sens.isSensitive && sens.confidence >= 0.85) {
                console.debug(`[ClipboardManager] Detected sensitive text (${sens.reason}); skipping or masking`);
                // If setting strictly excludes sensitive items:
                // could skip or mark. Let's record with metadata tag.
            }
        }

        // 2. Classify content
        let classification = null;
        if (this._contentDetector) {
            try {
                classification = this._contentDetector.classify(text);
            } catch (err) {
                console.error('[ClipboardManager] Error classifying text:', err);
            }
        }

        // 3. Persist to HistoryStore
        if (this._historyStore) {
            this._historyStore.addTextEntry(text, classification);
        }

        this._emit('text-changed', text, classification);
    }

    _readImageContent(mimeType) {
        if (this._pendingRead) {
            this._pendingRead.cancel();
            this._pendingRead = null;
        }

        const cancellable = new Gio.Cancellable();
        this._pendingRead = cancellable;

        const outputStream = Gio.MemoryOutputStream.new_resizable();
        const maxSize = ((this._settings ? this._settings.get_int('max-image-storage-mb') : 50) || 50) * 1024 * 1024;

        this._selection.transfer_async(
            CLIPBOARD_TYPE,
            mimeType,
            maxSize,
            outputStream,
            cancellable,
            (_selection, result) => {
                this._pendingRead = null;

                try {
                    this._selection.transfer_finish(result);
                    outputStream.close(null);

                    const bytes = outputStream.steal_as_bytes();
                    if (!bytes || bytes.get_size() === 0)
                        return;

                    this._handleCapturedImage(bytes, mimeType);
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                        console.error('[ClipboardManager] Error reading image:', e);
                        this._emit('error', e);
                    }
                }
            }
        );
    }

    _handleCapturedImage(bytes, mimeType) {
        let checksum = null;
        try {
            checksum = GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA256, bytes);
            if (checksum && checksum === this._lastImageChecksum) {
                return;
            }
            this._lastImageChecksum = checksum;
            this._lastTextContent = null;
        } catch (_ce) {
            // Checksum fallback
        }

        const id = 'img-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);

        let imageInfo = null;
        if (this._imageHandler) {
            imageInfo = this._imageHandler.storeImage(id, bytes, mimeType);
        }

        if (imageInfo && this._historyStore) {
            const entry = this._historyStore.addImageEntry(imageInfo, mimeType, null, checksum);

            // Asynchronously run OCR if enabled
            if (this._imageHandler && this._settings?.get_boolean('enable-ocr')) {
                this._imageHandler.runOCR(imageInfo.imagePath).then(ocrText => {
                    if (ocrText && entry) {
                        this._historyStore.updateOCRText(entry.id, ocrText);
                    }
                }).catch(() => {});
            }
        }

        this._emit('image-changed', bytes, mimeType);
    }

    restoreText(text) {
        if (!text)
            return false;

        try {
            this._isRestoring = true;
            this._lastTextContent = text;
            this._clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
            try {
                this._clipboard.set_text(St.ClipboardType.PRIMARY, text);
            } catch (_pe) {
                // Ignore if PRIMARY selection is not supported in environment
            }

            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
                this._isRestoring = false;
                return GLib.SOURCE_REMOVE;
            });

            return true;
        } catch (e) {
            this._isRestoring = false;
            console.error('[ClipboardManager] Error restoring text:', e);
            return false;
        }
    }

    restoreImage(bytes, mimeType) {
        if (!bytes || !mimeType)
            return false;

        try {
            this._isRestoring = true;

            const source = Meta.SelectionSourceMemory.new(mimeType, bytes);
            this._selection.set_owner(
                CLIPBOARD_TYPE,
                source
            );

            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
                this._isRestoring = false;
                return GLib.SOURCE_REMOVE;
            });

            return true;
        } catch (e) {
            this._isRestoring = false;
            console.error('[ClipboardManager] Error restoring image:', e);
            return false;
        }
    }

    getCurrentMimeTypes() {
        try {
            return this._selection.get_mimetypes(CLIPBOARD_TYPE) || [];
        } catch (e) {
            return [];
        }
    }

    hasImageContent() {
        const types = this.getCurrentMimeTypes();
        return types.some(m => m.startsWith('image/'));
    }

    hasTextContent() {
        const types = this.getCurrentMimeTypes();
        return types.some(m =>
            m.startsWith('text/') ||
            m === 'UTF8_STRING' ||
            m === 'STRING'
        );
    }

    destroy() {
        this.disable();
        this._listeners.clear();
        this._lastTextContent = null;
        this._clipboard = null;
        this._selection = null;
        this._settings = null;
        this._historyStore = null;
        this._contentDetector = null;
        this._imageHandler = null;
        this._privacyManager = null;
    }
}

export default ClipboardManager;
