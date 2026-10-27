/**
 * Clipboard Indicator GNOME Shell Extension
 *
 * Advanced clipboard manager for GNOME. Maintains clipboard history for text,
 * links, and images with search, pinning, collections, and keyboard shortcuts.
 *
 * @copyright 2026 Suresh
 * @license GPL-3.0-or-later
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Core domain & storage modules
import {ClipboardManager} from './src/clipboardManager.js';
import {HistoryStore} from './src/historyStore.js';
import {ContentDetector} from './src/contentDetector.js';
import {ImageHandler} from './src/imageHandler.js';
import {SearchEngine} from './src/search.js';
import {ShortcutManager} from './src/shortcuts.js';
import {PrivacyManager} from './src/privacy.js';
import {CollectionManager} from './src/collections.js';

// UI components
import {ClipboardIndicator} from './src/ui/panelIndicator.js';
import {ClipboardPopup} from './src/ui/clipboardPopup.js';

/**
 * Main extension lifecycle class for Clipboard Indicator.
 */
export default class ClipboardIndicatorExtension extends Extension {
    /**
     * Initializes extension instance properties.
     */
    constructor(metadata) {
        super(metadata);

        this._settings = null;
        this._settingsSignals = [];

        // Data directory paths
        this._dataDir = null;
        this._imagesDir = null;

        // Core services
        this._privacyManager = null;
        this._imageHandler = null;
        this._contentDetector = null;
        this._collectionManager = null;
        this._searchEngine = null;
        this._historyStore = null;
        this._clipboardManager = null;
        this._shortcutManager = null;

        // UI instances
        this._popup = null;
        this._indicator = null;
    }

    /**
     * Extension enable entrypoint.
     * Initializes settings, prepares storage directories, instantiates core services,
     * builds the panel indicator and popup UI, registers keybindings, and begins clipboard monitoring.
     */
    enable() {
        console.debug(`[ClipboardIndicator] Enabling extension: ${this.uuid} (v${this.metadata.version || 1})`);

        try {
            // 1. Initialize settings
            this._settings = this.getSettings();

            // 2. Setup storage directories using XDG standards and extension path
            this._setupDataDirectories();

            // 3. Initialize core services and handlers
            this._initServices();

            // 4. Load persisted clipboard history from disk
            this._loadHistory();

            // 5. Construct and mount the panel indicator and popup menu
            this._initUI();

            // 6. Register global keyboard shortcuts
            this._initShortcuts();

            // 7. Start clipboard monitoring if enabled in settings
            if (this._settings.get_boolean('enable-monitoring')) {
                this._clipboardManager?.startMonitoring();
            }

            // 8. Connect listeners for dynamic settings changes
            this._connectSettingsSignals();

            console.info(`[ClipboardIndicator] Extension enabled successfully.`);
        } catch (err) {
            console.error(`[ClipboardIndicator] Critical error during enable: ${err.message}`, err);
            // Graceful cleanup on partial failure
            this.disable();
        }
    }

    /**
     * Extension disable entrypoint.
     * Stops monitoring, releases keyboard shortcuts, tears down UI, flushes state to disk,
     * and clears all references and signal connections.
     */
    disable() {
        console.debug(`[ClipboardIndicator] Disabling extension: ${this.uuid}`);

        // 1. Disconnect settings change listeners
        this._disconnectSettingsSignals();

        // 2. Stop clipboard monitoring
        if (this._clipboardManager) {
            try {
                this._clipboardManager.stopMonitoring();
            } catch (err) {
                console.error(`[ClipboardIndicator] Error stopping clipboard monitoring: ${err.message}`);
            }
        }

        // 3. Unbind keyboard shortcuts
        if (this._shortcutManager) {
            try {
                this._shortcutManager.destroy();
            } catch (err) {
                console.error(`[ClipboardIndicator] Error destroying shortcut manager: ${err.message}`);
            }
            this._shortcutManager = null;
        }

        // 4. Tear down UI components
        if (this._indicator) {
            try {
                this._indicator.destroy();
            } catch (err) {
                console.error(`[ClipboardIndicator] Error destroying panel indicator: ${err.message}`);
            }
            this._indicator = null;
        }
        this._popup = null;

        // 5. Flush and persist history to disk
        if (this._historyStore) {
            try {
                if (this._settings?.get_boolean('enable-persistence')) {
                    this._historyStore.save();
                }
                this._historyStore.destroy();
            } catch (err) {
                console.error(`[ClipboardIndicator] Error persisting history store: ${err.message}`);
            }
            this._historyStore = null;
        }

        // 6. Destroy remaining core services
        if (this._clipboardManager) {
            try {
                this._clipboardManager.destroy();
            } catch (err) {
                console.error(`[ClipboardIndicator] Error destroying clipboard manager: ${err.message}`);
            }
            this._clipboardManager = null;
        }

        if (this._imageHandler) {
            try {
                this._imageHandler.destroy();
            } catch (err) {
                console.error(`[ClipboardIndicator] Error destroying image handler: ${err.message}`);
            }
            this._imageHandler = null;
        }

        if (this._privacyManager) {
            try {
                this._privacyManager.destroy();
            } catch (err) {
                console.error(`[ClipboardIndicator] Error destroying privacy manager: ${err.message}`);
            }
            this._privacyManager = null;
        }

        if (this._collectionManager) {
            try {
                this._collectionManager.destroy();
            } catch (err) {
                console.error(`[ClipboardIndicator] Error destroying collection manager: ${err.message}`);
            }
            this._collectionManager = null;
        }

        if (this._contentDetector) {
            try {
                this._contentDetector.destroy();
            } catch (err) {
                console.error(`[ClipboardIndicator] Error destroying content detector: ${err.message}`);
            }
            this._contentDetector = null;
        }

        if (this._searchEngine) {
            try {
                this._searchEngine.destroy();
            } catch (err) {
                console.error(`[ClipboardIndicator] Error destroying search engine: ${err.message}`);
            }
            this._searchEngine = null;
        }

        // 7. Clear settings and paths
        this._settings = null;
        this._dataDir = null;
        this._imagesDir = null;

        console.info(`[ClipboardIndicator] Extension disabled successfully.`);
    }

    /**
     * Resolves and creates user storage directories in compliance with XDG base directory specification.
     * Uses ${XDG_DATA_HOME:-~/.local/share}/clipboard-indicator
     */
    _setupDataDirectories() {
        const xdgDataDir = GLib.get_user_data_dir();
        this._dataDir = GLib.build_filenamev([xdgDataDir, 'clipboard-indicator']);
        this._imagesDir = GLib.build_filenamev([this._dataDir, 'images']);

        for (const dirPath of [this._dataDir, this._imagesDir]) {
            try {
                const dir = Gio.File.new_for_path(dirPath);
                if (!dir.query_exists(null)) {
                    dir.make_directory_with_parents(null);
                    console.debug(`[ClipboardIndicator] Created directory: ${dirPath}`);
                }
            } catch (err) {
                console.error(`[ClipboardIndicator] Failed creating directory ${dirPath}: ${err.message}`);
            }
        }
    }

    /**
     * Instantiates all core domain services, passing configuration and references.
     */
    _initServices() {
        // Privacy manager handles sensitive content masking and credential heuristics
        this._privacyManager = new PrivacyManager(this._settings, {
            dataDir: this._dataDir,
        });

        // Image handler manages disk storage, thumbnail generation, OCR, and memory limits
        this._imageHandler = new ImageHandler(this._settings, {
            dataDir: this._dataDir,
            imagesDir: this._imagesDir,
        });

        // Content detector categorizes entries (text, code, url, color, sensitive, image)
        this._contentDetector = new ContentDetector(this._settings, {
            privacyManager: this._privacyManager,
        });

        // Collection manager organizes items into folders / tags
        this._collectionManager = new CollectionManager(this._settings, {
            dataDir: this._dataDir,
        });

        // Search engine indexes items and handles fuzzy/similarity searches
        this._searchEngine = new SearchEngine(this._settings);

        // History store maintains the in-memory ring buffer and persists state to JSON
        this._historyStore = new HistoryStore(this._settings, {
            dataDir: this._dataDir,
            privacyManager: this._privacyManager,
            imageHandler: this._imageHandler,
            collectionManager: this._collectionManager,
        });

        // Clipboard manager coordinates low-level Mutter MetaSelection and GJS St.Clipboard
        this._clipboardManager = new ClipboardManager(this._settings, {
            historyStore: this._historyStore,
            contentDetector: this._contentDetector,
            imageHandler: this._imageHandler,
            privacyManager: this._privacyManager,
        });
    }

    /**
     * Loads persisted clipboard history and collections from disk.
     */
    _loadHistory() {
        if (!this._settings.get_boolean('enable-persistence')) {
            console.debug(`[ClipboardIndicator] Persistence is disabled by user settings; skipping history load.`);
            return;
        }

        try {
            this._collectionManager?.load();
            this._historyStore?.load();
            console.debug(`[ClipboardIndicator] Persisted history loaded (${this._historyStore?.count ?? 0} items).`);
        } catch (err) {
            console.error(`[ClipboardIndicator] Failed to load history from disk: ${err.message}`);
        }
    }

    /**
     * Instantiates the panel indicator button and the dropdown clipboard popup menu,
     * then attaches the indicator to the GNOME Shell status area.
     */
    _initUI() {
        // ClipboardPopup contains search bar, collections filter, item list, and action buttons
        this._popup = new ClipboardPopup(this._settings, {
            historyStore: this._historyStore,
            clipboardManager: this._clipboardManager,
            searchEngine: this._searchEngine,
            collectionManager: this._collectionManager,
            imageHandler: this._imageHandler,
            extension: this,
        });

        // ClipboardIndicator is the status bar icon/button in Main.panel
        this._indicator = new ClipboardIndicator(this._settings, {
            popup: this._popup,
            historyStore: this._historyStore,
            extension: this,
        });

        // Add to GNOME Shell panel status area
        Main.panel.addToStatusArea('clipboard-indicator', this._indicator);
    }

    /**
     * Registers keybindings via ShortcutManager and Main.wm.addKeybinding.
     */
    _initShortcuts() {
        this._shortcutManager = new ShortcutManager(this._settings, {
            indicator: this._indicator,
            popup: this._popup,
            historyStore: this._historyStore,
        });
        this._shortcutManager.register();
    }

    /**
     * Subscribes to GSettings property changes to update extension state dynamically.
     */
    _connectSettingsSignals() {
        const connect = (key, handler) => {
            const signalId = this._settings.connect(`changed::${key}`, handler);
            this._settingsSignals.push(signalId);
        };

        // Toggle clipboard monitoring on/off
        connect('enable-monitoring', () => {
            const enabled = this._settings.get_boolean('enable-monitoring');
            if (enabled) {
                this._clipboardManager?.startMonitoring();
            } else {
                this._clipboardManager?.stopMonitoring();
            }
        });

        // React to history size limit changes
        connect('history-size', () => {
            const newSize = this._settings.get_int('history-size');
            this._historyStore?.setMaxSize(newSize);
        });

        // Retention days changes
        connect('retention-days', () => {
            const days = this._settings.get_int('retention-days');
            this._historyStore?.pruneExpiredEntries(days);
        });

        // Update indicator UI when label visibility setting toggles
        connect('show-indicator-label', () => {
            this._indicator?.updateLabelVisibility();
        });

        // Update popup styling on density / theme changes
        connect('display-density', () => {
            this._popup?.updateDensity();
        });

        connect('theme-mode', () => {
            this._popup?.updateTheme();
        });

        // Dynamic reactivity for timestamps, preview lines, and height
        connect('show-timestamps', () => {
            this._popup?.refresh();
        });

        connect('preview-lines', () => {
            this._popup?.refresh();
        });

        connect('popup-height', () => {
            this._popup?.updateHeight();
        });

        connect('enable-similarity', () => {
            this._popup?.updateSimilarityVisibility();
        });
    }

    /**
     * Disconnects all connected GSettings change listeners.
     */
    _disconnectSettingsSignals() {
        if (!this._settings || !this._settingsSignals.length) {
            return;
        }

        for (const signalId of this._settingsSignals) {
            try {
                this._settings.disconnect(signalId);
            } catch (err) {
                console.error(`[ClipboardIndicator] Failed to disconnect settings signal: ${err.message}`);
            }
        }
        this._settingsSignals = [];
    }
}
