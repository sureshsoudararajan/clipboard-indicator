// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

/**
 * Clipboard Indicator - Developer Tools Dialog / Sub-Panel
 *
 * Provides a UI modal or inline section for transforming text
 * (JSON formatting, URL encode/decode, Base64, whitespace, etc.)
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import { DevTools } from '../devTools.js';

export class DevToolsPanel {
    /**
     * @param {Object} options - { onApply: (transformedText) => void, onClose: () => void }
     */
    constructor(options = {}) {
        this._options = options;
        this.actor = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'clipboard-devtools-panel',
            x_expand: true,
            visible: false,
        });

        this._entry = null;
        this._buildUI();
    }

    _buildUI() {
        // Header
        const header = new St.BoxLayout({
            style_class: 'clipboard-devtools-header',
            x_expand: true,
        });

        const title = new St.Label({
            text: 'Developer Tools',
            style_class: 'clipboard-devtools-title',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        header.add_child(title);

        const closeBtn = new St.Button({
            style_class: 'clipboard-popup-header-btn',
            child: new St.Icon({
                icon_name: 'window-close-symbolic',
                icon_size: 14,
            }),
            can_focus: true,
            accessible_name: 'Close DevTools',
        });
        closeBtn.connect('clicked', () => this.hide());
        header.add_child(closeBtn);

        this.actor.add_child(header);

        // Buttons row
        this._toolsBox = new St.BoxLayout({
            style_class: 'clipboard-devtools-actions',
            x_expand: true,
        });
        this.actor.add_child(this._toolsBox);

        // Result preview label
        this._resultLabel = new St.Label({
            text: '',
            style_class: 'clipboard-devtools-result',
            x_expand: true,
            visible: false,
        });
        this._resultLabel.clutter_text.set_ellipsize(3);
        this._resultLabel.clutter_text.set_line_wrap(true);
        this.actor.add_child(this._resultLabel);
    }

    /**
     * Show tools for a given entry.
     * @param {Object} entry
     */
    showForEntry(entry) {
        if (!entry || !entry.content) return;
        this._entry = entry;

        // Clear existing tool buttons
        this._toolsBox.destroy_all_children();

        const tools = DevTools.getAvailableTools(entry.contentType || 'text');
        for (const tool of tools) {
            const btn = new St.Button({
                style_class: 'clipboard-devtools-btn',
                label: tool.label,
                can_focus: true,
            });

            btn.connect('clicked', () => {
                this._executeTool(tool.id);
            });

            this._toolsBox.add_child(btn);
        }

        this._resultLabel.visible = false;
        this.actor.visible = true;
    }

    _executeTool(toolId) {
        if (!this._entry || !this._entry.content) return;

        const transformed = DevTools.transform(toolId, this._entry.content);
        if (transformed && transformed !== this._entry.content) {
            this._resultLabel.text = `Transformed: ${transformed.substring(0, 150)}...`;
            this._resultLabel.visible = true;
            this._options.onApply?.(transformed);
        }
    }

    hide() {
        this.actor.visible = false;
        this._entry = null;
        this._options.onClose?.();
    }

    destroy() {
        this.actor?.destroy();
        this.actor = null;
        this._entry = null;
        this._options = null;
    }
}

export default DevToolsPanel;
