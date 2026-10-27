// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

/**
 * Clipboard Indicator - Panel Indicator Button (GNOME 51 / Dash to Panel compatible)
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';


import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

export class ClipboardIndicator extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    /**
     * @param {Gio.Settings} settings
     * @param {Object} options - { popup, historyStore, extension }
     */
    constructor(settings, options = {}) {
        super(0.5, 'Clipboard Indicator', false);

        this._settings = settings;
        this._popup = options.popup || null;
        this._historyStore = options.historyStore || null;
        this._extension = options.extension || null;
        this._storeChangedId = null;

        // Container box in the panel
        this._box = new St.BoxLayout({
            style_class: 'panel-status-menu-box clipboard-indicator-panel-box',
            orientation: Clutter.Orientation.HORIZONTAL,
        });

        // Panel icon
        this._icon = new St.Icon({
            icon_name: 'edit-paste-symbolic',
            style_class: 'system-status-icon clipboard-indicator-icon',
        });
        this._box.add_child(this._icon);

        // Optional count label
        this._label = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'clipboard-indicator-label',
            visible: false,
        });
        this._box.add_child(this._label);

        this.add_child(this._box);

        // Mount popup contents to this.menu
        if (this._popup && this.menu) {
            this._popup.mount(this.menu);
        }

        // Connect menu open/close events
        this.menu.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen && this._popup) {
                this._popup.refresh();
                GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    if (this.menu?.isOpen) {
                        this._popup?.focusSearch?.();
                    }
                    return GLib.SOURCE_REMOVE;
                });
            }
        });

        // Listen for history count changes
        if (this._historyStore) {
            this._storeChangedId = () => this.updateCount();
            this._historyStore.on('changed', this._storeChangedId);
        }

        this.updateLabelVisibility();
        this.updateCount();
    }

    /**
     * Update label visibility based on GSettings.
     */
    updateLabelVisibility() {
        if (!this._settings || !this._label) return;
        const show = this._settings.get_boolean('show-indicator-label');
        this._label.visible = show;
    }

    /**
     * Update count label text.
     */
    updateCount() {
        if (!this._historyStore || !this._label) return;
        const count = this._historyStore.length;
        if (count > 0) {
            this._label.text = `${count}`;
        } else {
            this._label.text = '';
        }
    }

    /**
     * Set icon visual state (active vs paused).
     */
    setMonitoringState(isActive) {
        if (!this._icon) return;
        this._icon.opacity = isActive ? 255 : 140;
    }

    destroy() {
        if (this._historyStore && this._storeChangedId) {
            this._historyStore.off('changed', this._storeChangedId);
            this._storeChangedId = null;
        }

        this._popup = null;
        this._historyStore = null;
        this._settings = null;
        this._extension = null;

        super.destroy();
    }
}

export default ClipboardIndicator;
