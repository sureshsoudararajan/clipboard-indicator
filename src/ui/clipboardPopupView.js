// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

/**
 * Clipboard Indicator - Main Popup UI View Component
 *
 * Implements the full-featured dropdown menu with:
 * - Search bar with debounce and clear button
 * - Filter toggles (All, Text, Links, Images, Pinned)
 * - Scrollable history list with compact cards
 * - DevTools transformation integration
 * - Dark theme with Blur-my-Shell support
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import { ensureActorVisibleInScrollView } from 'resource:///org/gnome/shell/misc/animationUtils.js';


import { EntryCard } from './entryCard.js';
import { ImagePreviewCard } from './imagePreview.js';
import { DevToolsPanel } from './devToolsPanel.js';
import { DiffPanel } from './diffPanel.js';

export class ClipboardPopup {
    /**
     * @param {Gio.Settings} settings
     * @param {Object} options - { historyStore, clipboardManager, searchEngine, collectionManager, imageHandler, extension }
     */
    constructor(settings, options = {}) {
        this._settings = settings;
        this._historyStore = options.historyStore || null;
        this._clipboardManager = options.clipboardManager || null;
        this._searchEngine = options.searchEngine || null;
        this._collectionManager = options.collectionManager || null;
        this._imageHandler = options.imageHandler || null;
        this._extension = options.extension || null;

        this._menu = null;
        this._mainSection = null;
        this._entryCards = [];
        this._selectedIndex = -1;
        this._activeFilter = 'all';
        this._searchQuery = '';
        this._searchTimeoutId = 0;
        this._storeChangedId = null;

        // Auto-refresh when history store changes
        if (this._historyStore) {
            this._storeChangedId = () => this.refresh();
            this._historyStore.on('changed', this._storeChangedId);
        }
    }

    /**
     * Attach popup contents to a GNOME Shell PopupMenu.
     * @param {PopupMenu.PopupMenu} menu
     */
    mount(menu) {
        this._menu = menu;

        this._mainSection = new PopupMenu.PopupMenuSection();
        this._menu.addMenuItem(this._mainSection);

        this._container = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'clipboard-popup-container',
        });
        this._mainSection.actor.add_child(this._container);

        // Header
        this._buildHeader();

        // DevTools inline panel
        this._devToolsPanel = new DevToolsPanel({
            onApply: (transformedText) => {
                this._clipboardManager?.restoreText(transformedText);
                if (this._settings.get_boolean('close-after-copy')) {
                    this._menu?.close();
                }
            },
            onClose: () => {
                this._scrollView.visible = true;
            },
        });
        this._container.add_child(this._devToolsPanel.actor);

        // Diff & Similarity inline panel
        this._diffPanel = new DiffPanel({
            onCopyText: (text) => {
                this._clipboardManager?.restoreText(text);
                if (this._settings?.get_boolean('close-after-copy')) {
                    this._menu?.close();
                }
            },
            onClose: () => {
                this._onDiffPanelClosed();
            },
        });
        this._container.add_child(this._diffPanel.actor);

        // Search Bar
        this._buildSearchBar();

        // Filters
        this._buildFilters();

        // Scrollable List
        this._buildEntryList();

        // Footer
        this._buildFooter();

        // Apply theme and density styles
        this.updateTheme();
        this.updateDensity();

        // Initial populate
        this.refresh();
    }

    _buildHeader() {
        const header = new St.BoxLayout({
            style_class: 'clipboard-popup-header',
            x_expand: true,
            orientation: Clutter.Orientation.HORIZONTAL,
        });

        const title = new St.Label({
            text: 'Clipboard',
            style_class: 'clipboard-popup-title',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        header.add_child(title);

        this._countLabel = new St.Label({
            text: '',
            style_class: 'clipboard-popup-count',
            y_align: Clutter.ActorAlign.CENTER,
        });
        header.add_child(this._countLabel);

        // Pause / Resume toggle button
        this._pauseButton = new St.Button({
            style_class: 'clipboard-popup-header-btn',
            child: new St.Icon({
                icon_name: 'media-playback-pause-symbolic',
                icon_size: 16,
            }),
            can_focus: true,
            accessible_name: 'Pause monitoring',
        });
        this._pauseButton.connect('clicked', () => {
            this._togglePause();
        });
        header.add_child(this._pauseButton);

        // Clear history button
        this._clearButton = new St.Button({
            style_class: 'clipboard-popup-header-btn clipboard-popup-clear-btn',
            child: new St.Icon({
                icon_name: 'user-trash-symbolic',
                icon_size: 16,
            }),
            can_focus: true,
            accessible_name: 'Clear history',
        });
        this._clearButton.connect('clicked', () => {
            this._showClearConfirmation();
        });
        header.add_child(this._clearButton);

        // Similarity & Diff Inspector button
        this._diffButton = new St.Button({
            style_class: 'clipboard-popup-header-btn clipboard-popup-diff-btn',
            child: new St.Icon({
                icon_name: 'view-dual-symbolic',
                icon_size: 16,
            }),
            can_focus: true,
            accessible_name: 'Similarity & Diff Inspector',
            visible: this._settings ? this._settings.get_boolean('enable-similarity') : false,
        });
        this._diffButton.connect('clicked', () => {
            this._toggleDiffPanel();
        });
        header.add_child(this._diffButton);

        // Settings button
        this._settingsButton = new St.Button({
            style_class: 'clipboard-popup-header-btn clipboard-popup-settings-btn',
            child: new St.Icon({
                icon_name: 'preferences-system-symbolic',
                icon_size: 16,
            }),
            can_focus: true,
            accessible_name: 'Settings',
        });
        this._settingsButton.connect('clicked', () => {
            this._openSettings();
        });
        header.add_child(this._settingsButton);

        this._container.add_child(header);
    }

    _buildSearchBar() {
        const searchBox = new St.BoxLayout({
            style_class: 'clipboard-popup-search-box',
            x_expand: true,
            orientation: Clutter.Orientation.HORIZONTAL,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const searchIcon = new St.Icon({
            icon_name: 'edit-find-symbolic',
            icon_size: 16,
            style_class: 'clipboard-popup-search-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        searchBox.add_child(searchIcon);

        this._searchEntry = new St.Entry({
            hint_text: 'Search clipboard...',
            style_class: 'clipboard-popup-search-entry',
            can_focus: true,
            x_expand: true,
            track_hover: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._searchEntry.clutter_text.connect('text-changed', () => {
            this._onSearchChanged();
        });

        const handleNavKey = (event) => {
            const symbol = event.get_key_symbol();
            if (symbol === Clutter.KEY_Escape) {
                if (this._searchEntry.get_text().length > 0) {
                    this._searchEntry.set_text('');
                    return Clutter.EVENT_STOP;
                }
                this._menu?.close();
                return Clutter.EVENT_STOP;
            } else if (symbol === Clutter.KEY_Down) {
                this._navigateEntries(1);
                return Clutter.EVENT_STOP;
            } else if (symbol === Clutter.KEY_Up) {
                this._navigateEntries(-1);
                return Clutter.EVENT_STOP;
            } else if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
                this._activateSelected();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        };

        this._searchEntry.clutter_text.connect('key-press-event', (_actor, event) => {
            return handleNavKey(event);
        });

        this._container.connect('key-press-event', (_actor, event) => {
            return handleNavKey(event);
        });
        searchBox.add_child(this._searchEntry);

        this._clearSearchButton = new St.Button({
            style_class: 'clipboard-popup-search-clear',
            child: new St.Icon({
                icon_name: 'edit-clear-symbolic',
                icon_size: 14,
            }),
            visible: false,
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._clearSearchButton.connect('clicked', () => {
            this._searchEntry.set_text('');
        });
        searchBox.add_child(this._clearSearchButton);

        this._container.add_child(searchBox);
    }

    _buildFilters() {
        const filterBox = new St.BoxLayout({
            style_class: 'clipboard-popup-filters',
            x_expand: true,
            orientation: Clutter.Orientation.HORIZONTAL,
        });

        const filters = [
            { id: 'all', label: 'All', icon: 'view-list-symbolic' },
            { id: 'text', label: 'Text', icon: 'text-x-generic-symbolic' },
            { id: 'url', label: 'Links', icon: 'web-browser-symbolic' },
            { id: 'image', label: 'Images', icon: 'image-x-generic-symbolic' },
            { id: 'pinned', label: 'Pinned', icon: 'view-pin-symbolic' },
        ];

        this._filterButtons = {};

        for (const filter of filters) {
            const btnBox = new St.BoxLayout({
                orientation: Clutter.Orientation.HORIZONTAL,
            });
            btnBox.add_child(new St.Icon({
                icon_name: filter.icon,
                icon_size: 14,
                style_class: 'clipboard-popup-filter-icon',
            }));
            btnBox.add_child(new St.Label({
                text: filter.label,
                style_class: 'clipboard-popup-filter-label',
                y_align: Clutter.ActorAlign.CENTER,
            }));

            const btn = new St.Button({
                style_class: 'clipboard-popup-filter-btn',
                child: btnBox,
                can_focus: true,
                toggle_mode: true,
                accessible_name: `Filter: ${filter.label}`,
            });

            if (filter.id === 'all')
                btn.add_style_class_name('active');

            btn.connect('clicked', () => {
                this._setActiveFilter(filter.id);
            });

            this._filterButtons[filter.id] = btn;
            filterBox.add_child(btn);
        }

        this._filterBox = filterBox;
        this._container.add_child(filterBox);
    }

    _buildEntryList() {
        const popupHeight = this._settings?.get_int('popup-height') || 420;

        this._scrollView = new St.ScrollView({
            style_class: 'clipboard-popup-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: false,
            style: `max-height: ${popupHeight}px;`,
        });

        this._entryListBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'clipboard-popup-entry-list',
        });

        this._scrollView.set_child(this._entryListBox);
        this._container.add_child(this._scrollView);

        // Empty state placeholder
        this._emptyState = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'clipboard-popup-empty',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });

        const emptyIcon = new St.Icon({
            icon_name: 'edit-paste-symbolic',
            icon_size: 48,
            style_class: 'clipboard-popup-empty-icon',
        });
        this._emptyState.add_child(emptyIcon);

        this._emptyLabel = new St.Label({
            text: 'Clipboard is empty',
            style_class: 'clipboard-popup-empty-label',
        });
        this._emptyState.add_child(this._emptyLabel);

        const emptyHint = new St.Label({
            text: 'Copy something to get started',
            style_class: 'clipboard-popup-empty-hint',
        });
        this._emptyState.add_child(emptyHint);

        this._entryListBox.add_child(this._emptyState);
    }

    _buildFooter() {
        const footer = new St.BoxLayout({
            style_class: 'clipboard-popup-footer',
            x_expand: true,
            orientation: Clutter.Orientation.HORIZONTAL,
        });

        const shortcutLabel = new St.Label({
            text: 'Super+V to toggle',
            style_class: 'clipboard-popup-footer-hint',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        footer.add_child(shortcutLabel);

        this._statsLabel = new St.Label({
            text: '',
            style_class: 'clipboard-popup-footer-stats',
            y_align: Clutter.ActorAlign.CENTER,
        });
        footer.add_child(this._statsLabel);

        this._container.add_child(footer);
    }

    refresh() {
        if (!this._historyStore) return;
        this.updateTheme();

        const allEntries = this._historyStore.getEntries();
        let filtered = allEntries;

        if (this._searchEngine) {
            filtered = this._searchEngine.search(allEntries, this._searchQuery, {
                type: this._activeFilter,
                pinnedOnly: this._activeFilter === 'pinned',
            });
        }

        this._renderEntries(filtered);
        this._updateCounts(allEntries);
    }

    _renderEntries(entries) {
        for (const card of this._entryCards) {
            card.destroy();
        }
        this._entryCards = [];
        this._selectedIndex = -1;

        const hasEntries = entries && entries.length > 0;
        this._emptyState.visible = !hasEntries;

        if (!hasEntries) {
            if (this._searchQuery)
                this._emptyLabel.text = 'No matching entries';
            else if (this._activeFilter !== 'all')
                this._emptyLabel.text = `No ${this._activeFilter} entries`;
            else
                this._emptyLabel.text = 'Clipboard is empty';
            return;
        }

        const previewLines = this._settings?.get_int('preview-lines') || 2;
        const showTimestamps = this._settings ? this._settings.get_boolean('show-timestamps') : true;

        for (const entry of entries) {
            let card;
            if (entry.type === 'image') {
                card = new ImagePreviewCard(entry, {
                    onCopy: () => this._copyEntry(entry),
                    onDelete: () => this._deleteEntry(entry),
                    onPin: () => this._togglePin(entry),
                    onCopyText: (text) => {
                        this._clipboardManager?.restoreText(text);
                        if (this._settings?.get_boolean('close-after-copy')) {
                            this._menu?.close();
                        }
                    },
                }, showTimestamps);
            } else {
                card = new EntryCard(entry, previewLines, {
                    onCopy: () => this._copyEntry(entry),
                    onDelete: () => this._deleteEntry(entry),
                    onPin: () => this._togglePin(entry),
                    onDevTool: () => {
                        this._devToolsPanel?.showForEntry(entry);
                    },
                    onSaveToCollection: () => {
                        this._collectionManager?.addEntryToCollection('general-notes', entry);
                    },
                }, showTimestamps);
            }

            const cardIndex = this._entryCards.length;
            card.actor.connect('motion-event', () => {
                if (this._selectedIndex !== cardIndex) {
                    if (this._selectedIndex >= 0 && this._selectedIndex < this._entryCards.length) {
                        this._entryCards[this._selectedIndex].setSelected(false);
                    }
                    this._selectedIndex = cardIndex;
                    card.setSelected(true);
                }
                return Clutter.EVENT_PROPAGATE;
            });

            this._entryCards.push(card);
            this._entryListBox.add_child(card.actor);
        }
    }

    _updateCounts(allEntries) {
        const total = allEntries.length;
        const pinned = allEntries.filter(e => e.pinned).length;

        if (total > 0) {
            this._countLabel.text = pinned > 0 ? `${total} (${pinned} pinned)` : `${total}`;
        } else {
            this._countLabel.text = '';
        }

        if (this._historyStore && this._statsLabel) {
            const stats = this._historyStore.getStats();
            const parts = [];
            if (stats.images > 0) parts.push(`${stats.images} img`);
            if (stats.links > 0) parts.push(`${stats.links} links`);
            if (stats.totalImageSize > 0) {
                parts.push(`${(stats.totalImageSize / (1024 * 1024)).toFixed(1)} MB`);
            }
            this._statsLabel.text = parts.join(' · ');
        }
    }

    _copyEntry(entry) {
        if (!entry) return;

        if (entry.type === 'image') {
            if (this._imageHandler && this._clipboardManager) {
                const bytes = this._imageHandler.loadImageBytes(entry.imagePath);
                if (bytes) {
                    this._clipboardManager.restoreImage(bytes, entry.mimeType || 'image/png');
                }
            }
        } else {
            this._clipboardManager?.restoreText(entry.content);
        }

        this._historyStore?.bumpEntry(entry.id);

        if (this._settings?.get_boolean('close-after-copy')) {
            this._menu?.close();
        }
    }

    _deleteEntry(entry) {
        if (!entry || !this._historyStore) return;
        const deleted = this._historyStore.deleteEntry(entry.id);
        if (deleted && deleted.type === 'image' && this._imageHandler) {
            this._imageHandler.deleteImage(deleted.imagePath, deleted.thumbnailPath);
        }
    }

    _togglePin(entry) {
        if (!entry || !this._historyStore) return;
        this._historyStore.togglePin(entry.id);
    }

    _togglePause() {
        if (!this._clipboardManager) return;
        if (this._clipboardManager.isPaused) {
            this._clipboardManager.resume();
            this._pauseButton.get_child().icon_name = 'media-playback-pause-symbolic';
            this._pauseButton.accessible_name = 'Pause monitoring';
        } else {
            this._clipboardManager.pause();
            this._pauseButton.get_child().icon_name = 'media-playback-start-symbolic';
            this._pauseButton.accessible_name = 'Resume monitoring';
        }
    }

    _openSettings() {
        this._menu?.close();
        if (this._extension && typeof this._extension.openPreferences === 'function') {
            try {
                this._extension.openPreferences();
                return;
            } catch (e) {
                console.warn('[ClipboardPopup] extension.openPreferences failed:', e);
            }
        }
        try {
            Gio.Subprocess.new(
                ['gnome-extensions', 'prefs', 'clipboard-indicator@suresh'],
                Gio.SubprocessFlags.NONE
            );
        } catch (err) {
            console.error('[ClipboardPopup] Failed to launch preferences:', err);
        }
    }

    _showClearConfirmation() {
        if (this._confirmBox) {
            this._confirmBox.destroy();
            this._confirmBox = null;
            return;
        }

        this._confirmBox = new St.BoxLayout({
            style_class: 'clipboard-popup-confirm',
            x_expand: true,
            orientation: Clutter.Orientation.HORIZONTAL,
        });

        const label = new St.Label({
            text: 'Clear non-pinned entries?',
            style_class: 'clipboard-popup-confirm-label',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._confirmBox.add_child(label);

        const yesBtn = new St.Button({
            label: 'Clear',
            style_class: 'clipboard-popup-confirm-yes',
            can_focus: true,
        });
        yesBtn.connect('clicked', () => {
            const deleted = this._historyStore?.clearNonPinned() || [];
            if (this._imageHandler) {
                for (const d of deleted) {
                    if (d.type === 'image') this._imageHandler.deleteImage(d.imagePath, d.thumbnailPath);
                }
            }
            this._hideConfirmation();
        });
        this._confirmBox.add_child(yesBtn);

        const noBtn = new St.Button({
            label: 'Cancel',
            style_class: 'clipboard-popup-confirm-no',
            can_focus: true,
        });
        noBtn.connect('clicked', () => this._hideConfirmation());
        this._confirmBox.add_child(noBtn);

        const headerIdx = this._container.get_children().indexOf(this._container.get_first_child());
        this._container.insert_child_at_index(this._confirmBox, headerIdx + 1);
    }

    _hideConfirmation() {
        if (this._confirmBox) {
            this._confirmBox.destroy();
            this._confirmBox = null;
        }
    }

    _onSearchChanged() {
        const text = this._searchEntry.get_text();
        this._clearSearchButton.visible = text.length > 0;

        if (this._searchTimeoutId > 0)
            GLib.source_remove(this._searchTimeoutId);

        this._searchTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            this._searchTimeoutId = 0;
            this._searchQuery = text;
            this.refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    _setActiveFilter(filterId) {
        if (this._activeFilter === filterId) return;

        for (const [id, btn] of Object.entries(this._filterButtons)) {
            if (id === filterId)
                btn.add_style_class_name('active');
            else
                btn.remove_style_class_name('active');
        }

        this._activeFilter = filterId;
        this.refresh();
    }

    _navigateEntries(direction) {
        if (this._entryCards.length === 0) return;

        if (this._selectedIndex >= 0 && this._selectedIndex < this._entryCards.length) {
            this._entryCards[this._selectedIndex].setSelected(false);
        }

        this._selectedIndex += direction;
        if (this._selectedIndex < 0) this._selectedIndex = this._entryCards.length - 1;
        else if (this._selectedIndex >= this._entryCards.length) this._selectedIndex = 0;

        const card = this._entryCards[this._selectedIndex];
        card.setSelected(true);
        this._scrollToCard(card);
    }

    _scrollToCard(card) {
        if (!this._scrollView || !card?.actor) return;
        try {
            ensureActorVisibleInScrollView(this._scrollView, card.actor);
        } catch (_err) {
            try {
                const adj = this._scrollView.vadjustment;
                if (adj) {
                    const [success, actorY] = card.actor.get_transformed_position();
                    const [, scrollY] = this._scrollView.get_transformed_position();
                    if (success) {
                        const scrollHeight = this._scrollView.get_height();
                        const actorHeight = card.actor.get_height();
                        const relY = actorY - scrollY;

                        if (relY < 0) {
                            adj.set_value(Math.max(0, adj.get_value() + relY));
                        } else if (relY + actorHeight > scrollHeight) {
                            adj.set_value(adj.get_value() + (relY + actorHeight - scrollHeight));
                        }
                    }
                }
            } catch {}
        }
    }

    _activateSelected() {
        if (this._selectedIndex >= 0 && this._selectedIndex < this._entryCards.length) {
            this._entryCards[this._selectedIndex].activate();
        } else if (this._entryCards.length > 0) {
            this._entryCards[0].activate();
        }
    }

    focusSearch() {
        this._searchEntry?.grab_key_focus();
    }

    filterPinnedOnly() {
        this._setActiveFilter('pinned');
    }

    updateDensity() {
        if (!this._container || !this._settings) return;
        const density = this._settings.get_string('display-density') || 'compact';
        if (density === 'comfortable') {
            this._container.add_style_class_name('density-comfortable');
            this._container.remove_style_class_name('density-compact');
        } else {
            this._container.add_style_class_name('density-compact');
            this._container.remove_style_class_name('density-comfortable');
        }
    }

    updateTheme() {
        if (!this._container) return;

        const targets = [
            this._container,
            this._mainSection?.actor,
            this._menu?.actor,
            this._menu?.box,
        ].filter(Boolean);

        for (const t of targets) {
            t.remove_style_class_name('theme-light');
            t.add_style_class_name('theme-dark');
        }
    }

    updateHeight() {
        if (!this._scrollView || !this._settings) return;
        const popupHeight = this._settings.get_int('popup-height') || 420;
        this._scrollView.style = `max-height: ${popupHeight}px;`;
    }

    _toggleDiffPanel() {
        if (!this._diffPanel) return;

        if (this._diffPanel.actor.visible) {
            this._diffPanel.hide();
        } else {
            this._devToolsPanel?.hide();
            this._searchEntry?.set_text('');
            if (this._filterBox) this._filterBox.visible = false;
            if (this._scrollView) this._scrollView.visible = false;
            const entries = this._historyStore ? this._historyStore.getEntries() : [];
            this._diffPanel.show(entries);
        }
    }

    _onDiffPanelClosed() {
        if (this._filterBox) this._filterBox.visible = true;
        if (this._scrollView) this._scrollView.visible = true;
    }

    updateSimilarityVisibility() {
        if (this._diffButton) {
            const enabled = this._settings ? this._settings.get_boolean('enable-similarity') : false;
            this._diffButton.visible = enabled;
            if (!enabled && this._diffPanel?.actor?.visible) {
                this._diffPanel.hide();
            }
        }
    }

    destroy() {
        if (this._searchTimeoutId > 0) {
            GLib.source_remove(this._searchTimeoutId);
            this._searchTimeoutId = 0;
        }

        if (this._historyStore && this._storeChangedId) {
            this._historyStore.off('changed', this._storeChangedId);
        }

        this._hideConfirmation();
        this._devToolsPanel?.destroy();
        this._diffPanel?.destroy();
        this._diffPanel = null;

        for (const card of this._entryCards) {
            card.destroy();
        }
        this._entryCards = [];

        this._mainSection?.destroy();
        this._mainSection = null;
        this._menu = null;
        this._settings = null;
    }
}

export default ClipboardPopup;
