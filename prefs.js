// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

/**
 * Clipboard Indicator - Preferences Window
 *
 * Implements modern GTK4 / Libadwaita preferences tabs:
 * - General settings
 * - Appearance & Layout
 * - Keyboard Shortcuts
 * - Privacy & Retention
 * - Advanced features (Collections, DevTools, Diff)
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ClipboardIndicatorPreferences extends ExtensionPreferences {
    /**
     * Fills the Adw.PreferencesWindow with pages and groups.
     * @param {Adw.PreferencesWindow} window
     */
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.set_default_size(680, 720);

        // =====================================================================
        // Page 1: General
        // =====================================================================
        const generalPage = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-other-symbolic',
        });
        window.add(generalPage);

        // Group: Monitoring & Behavior
        const behaviorGroup = new Adw.PreferencesGroup({
            title: _('Clipboard Behavior'),
            description: _('Manage how clipboard contents are monitored and restored'),
        });
        generalPage.add(behaviorGroup);

        // Enable monitoring switch
        const monitoringRow = new Adw.SwitchRow({
            title: _('Enable Clipboard Monitoring'),
            subtitle: _('Record text, links, and images when copied to the clipboard'),
        });
        settings.bind('enable-monitoring', monitoringRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behaviorGroup.add(monitoringRow);

        // Close popup after copy
        const closeAfterCopyRow = new Adw.SwitchRow({
            title: _('Close Popup After Selecting'),
            subtitle: _('Automatically close the clipboard popup when an entry is selected'),
        });
        settings.bind('close-after-copy', closeAfterCopyRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behaviorGroup.add(closeAfterCopyRow);

        // Deduplication
        const dedupRow = new Adw.SwitchRow({
            title: _('Filter Duplicate Entries'),
            subtitle: _('Move identical copied items to the top instead of creating duplicates'),
        });
        settings.bind('enable-deduplication', dedupRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behaviorGroup.add(dedupRow);

        // Group: Limits
        const limitsGroup = new Adw.PreferencesGroup({
            title: _('History Limits'),
        });
        generalPage.add(limitsGroup);

        // History size spin row
        const historySizeRow = new Adw.SpinRow({
            title: _('Maximum History Size'),
            subtitle: _('Maximum number of unpinned entries to retain (pinned entries are preserved)'),
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 500,
                step_increment: 5,
                page_increment: 25,
            }),
        });
        settings.bind('history-size', historySizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        limitsGroup.add(historySizeRow);

        // Popup height spin row
        const popupHeightRow = new Adw.SpinRow({
            title: _('Popup Maximum Height (px)'),
            subtitle: _('Maximum vertical height of the scrollable entry list'),
            adjustment: new Gtk.Adjustment({
                lower: 200,
                upper: 800,
                step_increment: 20,
                page_increment: 50,
            }),
        });
        settings.bind('popup-height', popupHeightRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        limitsGroup.add(popupHeightRow);

        // =====================================================================
        // Page 2: Appearance
        // =====================================================================
        const appearancePage = new Adw.PreferencesPage({
            title: _('Appearance'),
            icon_name: 'preferences-desktop-appearance-symbolic',
        });
        window.add(appearancePage);

        const themeGroup = new Adw.PreferencesGroup({
            title: _('Appearance & Layout'),
            description: _('Customize the layout and density of the indicator and popup'),
        });
        appearancePage.add(themeGroup);

        // Force dark mode
        const styleManager = Adw.StyleManager.get_default();
        styleManager.color_scheme = Adw.ColorScheme.FORCE_DARK;


        // Display density combo
        const densityModel = new Gtk.StringList();
        densityModel.append(_('Compact (Standard)'));
        densityModel.append(_('Comfortable (Spacious)'));

        const densityRow = new Adw.ComboRow({
            title: _('Display Density'),
            subtitle: _('Adjust card spacing and padding for smaller or larger screens'),
            model: densityModel,
        });

        const densityValues = ['compact', 'comfortable'];
        const currentDensity = settings.get_string('display-density');
        const densityIndex = densityValues.indexOf(currentDensity);
        densityRow.selected = densityIndex >= 0 ? densityIndex : 0;

        densityRow.connect('notify::selected', () => {
            settings.set_string('display-density', densityValues[densityRow.selected] || 'compact');
        });
        themeGroup.add(densityRow);

        // Show panel label switch
        const showLabelRow = new Adw.SwitchRow({
            title: _('Show History Count in Top Bar'),
            subtitle: _('Display the number of clipboard items next to the panel icon'),
        });
        settings.bind('show-indicator-label', showLabelRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        themeGroup.add(showLabelRow);

        // Show timestamps switch
        const timestampsRow = new Adw.SwitchRow({
            title: _('Show Relative Timestamps'),
            subtitle: _('Display relative copy time (e.g. "5m ago") on entry cards'),
        });
        settings.bind('show-timestamps', timestampsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        themeGroup.add(timestampsRow);

        // Preview lines spin row
        const previewLinesRow = new Adw.SpinRow({
            title: _('Text Preview Lines'),
            subtitle: _('Maximum lines of text visible per card before truncation'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 5,
                step_increment: 1,
                page_increment: 1,
            }),
        });
        settings.bind('preview-lines', previewLinesRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        previewLinesRow.connect('notify::value', () => {
            settings.set_int('preview-lines', Math.round(previewLinesRow.value));
        });
        themeGroup.add(previewLinesRow);

        // =====================================================================
        // Page 3: Keyboard Shortcuts
        // =====================================================================
        const shortcutsPage = new Adw.PreferencesPage({
            title: _('Shortcuts'),
            icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
        });
        window.add(shortcutsPage);

        const shortcutsGroup = new Adw.PreferencesGroup({
            title: _('Global Keyboard Shortcuts'),
            description: _('Default shortcuts for controlling the clipboard history from anywhere'),
        });
        shortcutsPage.add(shortcutsGroup);

        // Helper to record and set shortcuts with interactive modal dialog
        const createShortcutRow = (keyName, title, subtitle, defaultShortcut) => {
            const row = new Adw.ActionRow({
                title,
                subtitle,
            });

            const current = settings.get_strv(keyName);
            const currentStr = current.length > 0 ? current[0] : (defaultShortcut || '');

            const shortcutLabel = new Gtk.ShortcutLabel({
                accelerator: currentStr,
                valign: Gtk.Align.CENTER,
            });

            const setBtn = new Gtk.Button({
                label: _('Set Shortcut'),
                valign: Gtk.Align.CENTER,
            });

            setBtn.connect('clicked', () => {
                let dialog;
                if (typeof Adw.AlertDialog !== 'undefined') {
                    dialog = new Adw.AlertDialog({
                        heading: _('Set Shortcut'),
                        body: _('Press the desired keyboard combination, or press Backspace to clear.'),
                    });
                    dialog.add_response('cancel', _('Cancel'));
                } else {
                    dialog = new Adw.MessageDialog({
                        transient_for: window,
                        modal: true,
                        heading: _('Set Shortcut'),
                        body: _('Press the desired keyboard combination, or press Backspace to clear.'),
                    });
                    dialog.add_response('cancel', _('Cancel'));
                }

                const controller = new Gtk.EventControllerKey();
                controller.connect('key-pressed', (_ctrl, keyval, keycode, state) => {
                    const mask = state & Gtk.accelerator_get_default_mod_mask();
                    const keyvalLower = Gdk.keyval_to_lower(keyval);

                    // Check for modifier only keys
                    if (keyvalLower === Gdk.KEY_Control_L || keyvalLower === Gdk.KEY_Control_R ||
                        keyvalLower === Gdk.KEY_Alt_L || keyvalLower === Gdk.KEY_Alt_R ||
                        keyvalLower === Gdk.KEY_Shift_L || keyvalLower === Gdk.KEY_Shift_R ||
                        keyvalLower === Gdk.KEY_Super_L || keyvalLower === Gdk.KEY_Super_R ||
                        keyvalLower === Gdk.KEY_Meta_L || keyvalLower === Gdk.KEY_Meta_R) {
                        return Gdk.EVENT_PROPAGATE;
                    }

                    // Backspace without modifiers clears the shortcut
                    if (keyvalLower === Gdk.KEY_BackSpace && mask === 0) {
                        settings.set_strv(keyName, []);
                        shortcutLabel.set_accelerator('');
                        dialog.close();
                        return Gdk.EVENT_STOP;
                    }

                    // Escape cancels without changing
                    if (keyvalLower === Gdk.KEY_Escape && mask === 0) {
                        dialog.close();
                        return Gdk.EVENT_STOP;
                    }

                    const accel = Gtk.accelerator_name(keyvalLower, mask);
                    if (accel) {
                        settings.set_strv(keyName, [accel]);
                        shortcutLabel.set_accelerator(accel);
                        dialog.close();
                        return Gdk.EVENT_STOP;
                    }

                    return Gdk.EVENT_PROPAGATE;
                });

                dialog.add_controller(controller);
                if (typeof dialog.present === 'function') {
                    dialog.present(window);
                } else {
                    dialog.show();
                }
            });

            const resetBtn = new Gtk.Button({
                icon_name: 'edit-undo-symbolic',
                valign: Gtk.Align.CENTER,
                tooltip_text: _('Reset to Default'),
            });
            resetBtn.connect('clicked', () => {
                shortcutLabel.set_accelerator(defaultShortcut || '');
                settings.set_strv(keyName, defaultShortcut ? [defaultShortcut] : []);
            });

            row.add_suffix(shortcutLabel);
            row.add_suffix(setBtn);
            row.add_suffix(resetBtn);
            shortcutsGroup.add(row);
        };

        createShortcutRow('toggle-popup', _('Toggle Clipboard Menu'), _('Global shortcut to open and close clipboard history'), '<Super>v');
        createShortcutRow('toggle-pinned', _('Filter Pinned Items'), _('Quickly display pinned items only'), '');
        createShortcutRow('clear-history', _('Clear History'), _('Shortcut to clear all unpinned entries'), '');

        // =====================================================================
        // Page 4: Privacy & Retention
        // =====================================================================
        const privacyPage = new Adw.PreferencesPage({
            title: _('Privacy'),
            icon_name: 'security-high-symbolic',
        });
        window.add(privacyPage);

        const privacyGroup = new Adw.PreferencesGroup({
            title: _('Data Retention & Storage'),
            description: _('Manage how long data is kept and handle sensitive credentials locally'),
        });
        privacyPage.add(privacyGroup);

        // Persistence switch
        const persistRow = new Adw.SwitchRow({
            title: _('Persist History Across Sessions'),
            subtitle: _('Save clipboard history to disk so items survive reboots and logouts'),
        });
        settings.bind('enable-persistence', persistRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        privacyGroup.add(persistRow);

        // Retention days
        const retentionRow = new Adw.SpinRow({
            title: _('Retention Period (Days)'),
            subtitle: _('Automatically delete unpinned entries older than this number of days'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 365,
                step_increment: 1,
                page_increment: 7,
            }),
        });
        settings.bind('retention-days', retentionRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        privacyGroup.add(retentionRow);

        // Persist images switch
        const persistImagesRow = new Adw.SwitchRow({
            title: _('Save Images to Disk'),
            subtitle: _('Store captured clipboard images in user cache directory'),
        });
        settings.bind('persist-images', persistImagesRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        privacyGroup.add(persistImagesRow);

        // Max image storage
        const maxImageStorageRow = new Adw.SpinRow({
            title: _('Max Image Cache Storage (MB)'),
            subtitle: _('Upper limit for image and thumbnail disk usage'),
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 500,
                step_increment: 10,
                page_increment: 50,
            }),
        });
        settings.bind('max-image-storage-mb', maxImageStorageRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        privacyGroup.add(maxImageStorageRow);

        // Detect sensitive switch
        const sensitiveRow = new Adw.SwitchRow({
            title: _('Detect Sensitive Content (API keys, passwords)'),
            subtitle: _('Heuristically flag or exclude suspected credentials and secrets'),
        });
        settings.bind('detect-sensitive', sensitiveRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        privacyGroup.add(sensitiveRow);

        // OCR switch
        const ocrRow = new Adw.SwitchRow({
            title: _('Enable Image Text Recognition (OCR)'),
            subtitle: _('Requires "tesseract" and "tesseract-data-eng" packages installed'),
        });
        settings.bind('enable-ocr', ocrRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        privacyGroup.add(ocrRow);

        // =====================================================================
        // Page 5: Advanced Features
        // =====================================================================
        const advancedPage = new Adw.PreferencesPage({
            title: _('Advanced'),
            icon_name: 'applications-engineering-symbolic',
        });
        window.add(advancedPage);

        const advancedGroup = new Adw.PreferencesGroup({
            title: _('Power-User Features'),
            description: _('Enable or disable extra developer utilities and modular components'),
        });
        advancedPage.add(advancedGroup);

        const collectionsRow = new Adw.SwitchRow({
            title: _('Enable Reusable Snippets and Collections'),
            subtitle: _('Organize items into named collections and manage canned responses'),
        });
        settings.bind('enable-collections', collectionsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        advancedGroup.add(collectionsRow);

        const devToolsRow = new Adw.SwitchRow({
            title: _('Enable Developer Utilities'),
            subtitle: _('Provide inline JSON, XML, Base64, and URL transformations'),
        });
        settings.bind('enable-dev-tools', devToolsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        advancedGroup.add(devToolsRow);

        const similarityRow = new Adw.SwitchRow({
            title: _('Enable Similarity Detection and Diffing'),
            subtitle: _('Analyze near-duplicate entries and compute line diffs'),
        });
        settings.bind('enable-similarity', similarityRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        advancedGroup.add(similarityRow);
    }
}
