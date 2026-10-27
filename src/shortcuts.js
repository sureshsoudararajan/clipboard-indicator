// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

/**
 * Clipboard Indicator - Keyboard Shortcut Manager
 *
 * Registers and manages global keybindings using GNOME Shell's Main.wm.addKeybinding.
 * Supports configurable hotkeys with GSettings backing and clean teardown.
 */

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class ShortcutManager {
    /**
     * @param {Gio.Settings} settings
     * @param {Object} options - { indicator, popup, historyStore }
     */
    constructor(settings, options = {}) {
        this._settings = settings;
        this._indicator = options.indicator || null;
        this._popup = options.popup || null;
        this._historyStore = options.historyStore || null;
        this._registeredBindings = new Set();
    }

    /**
     * Set or update references to UI/store.
     */
    setReferences(options = {}) {
        if (options.indicator) this._indicator = options.indicator;
        if (options.popup) this._popup = options.popup;
        if (options.historyStore) this._historyStore = options.historyStore;
    }

    /**
     * Register all configured global keybindings.
     */
    register() {
        if (!this._settings) return;

        this._handlers = {
            'toggle-popup': () => this._togglePopup(),
            'toggle-pinned': () => this._togglePinned(),
            'clear-history': () => this._clearHistory(),
        };

        this._settingsSignals = [];

        for (const [keyName, handler] of Object.entries(this._handlers)) {
            this._registerBinding(keyName, handler);

            const signalId = this._settings.connect(`changed::${keyName}`, () => {
                this._registerBinding(keyName, handler);
            });
            this._settingsSignals.push(signalId);
        }
    }

    /**
     * Safely register a single keybinding by schema key name.
     */
    _registerBinding(keyName, handler) {
        try {
            // Remove previous binding if registered
            if (this._registeredBindings.has(keyName)) {
                Main.wm.removeKeybinding(keyName);
                this._registeredBindings.delete(keyName);
            }

            const schema = this._settings.settings_schema;
            if (!schema || !schema.has_key(keyName)) {
                return;
            }

            const shortcutValues = this._settings.get_strv(keyName);
            if (!shortcutValues || shortcutValues.length === 0 || !shortcutValues[0]) {
                // Shortcut not bound or empty
                return;
            }

            const success = Main.wm.addKeybinding(
                keyName,
                this._settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
                handler
            );

            if (success !== 0) {
                this._registeredBindings.add(keyName);
            } else {
                console.warn(`[ShortcutManager] Failed to register keybinding: ${keyName}. It may conflict with another shortcut.`);
            }
        } catch (err) {
            console.error(`[ShortcutManager] Exception registering ${keyName}:`, err);
        }
    }

    /**
     * Unregister all registered keybindings.
     */
    unregister() {
        if (this._settings && this._settingsSignals) {
            for (const signalId of this._settingsSignals) {
                try {
                    this._settings.disconnect(signalId);
                } catch (_err) {}
            }
        }
        this._settingsSignals = [];

        for (const keyName of this._registeredBindings) {
            try {
                Main.wm.removeKeybinding(keyName);
            } catch (err) {
                console.error(`[ShortcutManager] Failed unregistering ${keyName}:`, err);
            }
        }
        this._registeredBindings.clear();
    }

    /**
     * Toggle popup menu visibility.
     */
    _togglePopup() {
        if (!this._indicator) return;

        if (this._indicator.menu) {
            this._indicator.menu.toggle();
            if (this._indicator.menu.isOpen && this._popup) {
                this._popup.focusSearch?.();
            }
        }
    }

    /**
     * Toggle pinned items filter in popup.
     */
    _togglePinned() {
        if (!this._indicator) return;

        if (this._indicator.menu && !this._indicator.menu.isOpen) {
            this._indicator.menu.open();
        }

        if (this._popup) {
            this._popup.filterPinnedOnly?.();
        }
    }

    /**
     * Clear all non-pinned history items.
     */
    _clearHistory() {
        if (this._historyStore) {
            this._historyStore.clearNonPinned();
        }
    }

    destroy() {
        this.unregister();
        this._indicator = null;
        this._popup = null;
        this._historyStore = null;
        this._settings = null;
    }
}

export default ShortcutManager;
