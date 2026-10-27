// SPDX-License-Identifier: GPL-2.0-or-later
// Entry Card — Individual clipboard entry display component

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

/**
 * EntryCard displays a single text/URL clipboard entry.
 * Compact card with type icon, preview, timestamp, and action buttons.
 */
export class EntryCard {
    /**
     * @param {object} entry - History entry data
     * @param {number} previewLines - Number of preview lines
     * @param {object} callbacks - { onCopy, onDelete, onPin, onDevTool, onSaveToCollection }
     * @param {boolean} [showTimestamps=true] - Whether to display timestamp
     */
    constructor(entry, previewLines, callbacks, showTimestamps = true) {
        this._entry = entry;
        this._callbacks = callbacks;
        this._showTimestamps = showTimestamps;
        this._actionsBox = null;

        this.actor = new St.BoxLayout({
            style_class: 'clipboard-entry-card',
            orientation: Clutter.Orientation.HORIZONTAL,
            reactive: true,
            track_hover: true,
            x_expand: true,
            accessible_name: this._getAccessibleName(),
        });

        // Clickable content button (fills the card, sibling to action buttons)
        this._contentButton = new St.Button({
            style_class: 'clipboard-entry-content-btn',
            x_expand: true,
            can_focus: true,
            reactive: true,
            track_hover: true,
        });

        this._contentButton.connect('clicked', () => {
            this.activate();
        });

        // Keyboard activation
        this._contentButton.connect('key-press-event', (_actor, event) => {
            const symbol = event.get_key_symbol();
            if (symbol === Clutter.KEY_Delete) {
                this.deleteEntry();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._buildCard(previewLines);
    }

    _buildCard(previewLines) {
        const innerBox = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: true,
            style_class: 'clipboard-entry-inner',
        });

        // Type icon
        const typeIcon = new St.Icon({
            icon_name: this._getTypeIcon(),
            icon_size: 16,
            style_class: 'clipboard-entry-type-icon',
            y_align: Clutter.ActorAlign.START,
        });
        innerBox.add_child(typeIcon);

        // Content area (vertical: preview + metadata)
        const contentBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            style_class: 'clipboard-entry-content',
        });

        // Preview text
        this._previewLines = previewLines;
        this._truncatedPreview = this._getPreview(previewLines);
        this._fullContent = (this._entry.content || '').replace(/\t/g, '  ');

        this._previewLabel = new St.Label({
            text: this._truncatedPreview,
            style_class: 'clipboard-entry-preview',
            x_expand: true,
        });
        this._previewLabel.clutter_text.set_ellipsize(previewLines > 1 ? 0 : 3);
        this._previewLabel.clutter_text.set_line_wrap(previewLines > 1);
        this._previewLabel.clutter_text.set_line_wrap_mode(0); // PANGO_WRAP_WORD
        this._previewLabel.clutter_text.set_max_length(5000);
        contentBox.add_child(this._previewLabel);

        // Hover expand full content
        this.actor.connect('notify::hover', () => {
            const isHovered = this.actor.hover || this._contentButton.hover;
            this._updateHoverState(isHovered);
        });
        this._contentButton.connect('notify::hover', () => {
            const isHovered = this.actor.hover || this._contentButton.hover;
            this._updateHoverState(isHovered);
        });

        // Metadata row: type badge + timestamp
        const metaBox = new St.BoxLayout({
            style_class: 'clipboard-entry-meta',
        });

        // Content type badge
        if (this._entry.contentType && this._entry.contentType !== 'text') {
            const typeBadge = new St.Label({
                text: this._getTypeBadgeText(),
                style_class: `clipboard-entry-badge clipboard-entry-badge-${this._entry.contentType}`,
            });
            metaBox.add_child(typeBadge);
        }

        // URL hostname display
        if (this._entry.contentType === 'url' && this._entry.metadata?.hostname) {
            const hostLabel = new St.Label({
                text: this._entry.metadata.hostname,
                style_class: 'clipboard-entry-host',
            });
            metaBox.add_child(hostLabel);
        }

        // Timestamp
        const timeLabel = new St.Label({
            text: this._formatTimestamp(this._entry.createdAt),
            style_class: 'clipboard-entry-time',
            x_expand: true,
            visible: this._showTimestamps,
        });
        metaBox.add_child(timeLabel);

        contentBox.add_child(metaBox);
        innerBox.add_child(contentBox);

        this._contentButton.set_child(innerBox);
        this.actor.add_child(this._contentButton);

        // Action buttons container (sibling to content button)
        this._actionsBox = new St.BoxLayout({
            style_class: 'clipboard-entry-actions',
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Pin button
        this._pinButton = new St.Button({
            style_class: 'clipboard-entry-action-btn',
            child: new St.Icon({
                icon_name: 'view-pin-symbolic',
                icon_size: 14,
            }),
            can_focus: true,
            reactive: true,
            accessible_name: this._entry.pinned ? 'Unpin' : 'Pin',
        });
        if (this._entry.pinned)
            this._pinButton.add_style_class_name('pinned');

        this._pinButton.connect('clicked', () => {
            this.togglePin();
        });
        this._actionsBox.add_child(this._pinButton);

        // Delete button
        const deleteButton = new St.Button({
            style_class: 'clipboard-entry-action-btn clipboard-entry-delete-btn',
            child: new St.Icon({
                icon_name: 'edit-delete-symbolic',
                icon_size: 14,
            }),
            can_focus: true,
            reactive: true,
            accessible_name: 'Delete entry',
        });
        deleteButton.connect('clicked', () => {
            this.deleteEntry();
        });
        this._actionsBox.add_child(deleteButton);

        this.actor.add_child(this._actionsBox);
    }

    /**
     * Copy this entry to clipboard.
     */
    activate() {
        this._callbacks.onCopy?.();
    }

    /**
     * Delete this entry.
     */
    deleteEntry() {
        this._callbacks.onDelete?.();
    }

    /**
     * Toggle pin state.
     */
    togglePin() {
        this._callbacks.onPin?.();
    }

    /**
     * Set visual selection state.
     */
    setSelected(selected) {
        if (selected)
            this.actor.add_style_class_name('selected');
        else
            this.actor.remove_style_class_name('selected');
    }

    /**
     * Get the type icon name for this entry.
     */
    _getTypeIcon() {
        const icons = {
            'text': 'text-x-generic-symbolic',
            'multiline-text': 'text-x-generic-symbolic',
            'url': 'web-browser-symbolic',
            'email': 'mail-unread-symbolic',
            'phone': 'call-start-symbolic',
            'code': 'utilities-terminal-symbolic',
            'json': 'application-x-addon-symbolic',
            'xml': 'text-x-generic-symbolic',
            'yaml': 'application-x-addon-symbolic',
            'ip-address': 'network-server-symbolic',
            'mac-address': 'network-wired-symbolic',
            'file-path': 'folder-symbolic',
            'uuid': 'dialog-password-symbolic',
            'hex-hash': 'dialog-password-symbolic',
            'shell-command': 'utilities-terminal-symbolic',
        };
        return icons[this._entry.contentType] || 'text-x-generic-symbolic';
    }

    /**
     * Get the type badge text.
     */
    _getTypeBadgeText() {
        const labels = {
            'url': 'URL',
            'email': 'Email',
            'phone': 'Phone',
            'code': 'Code',
            'json': 'JSON',
            'xml': 'XML',
            'yaml': 'YAML',
            'ip-address': 'IP',
            'mac-address': 'MAC',
            'file-path': 'Path',
            'uuid': 'UUID',
            'hex-hash': 'Hash',
            'shell-command': 'Command',
        };
        return labels[this._entry.contentType] || '';
    }

    /**
     * Get preview text, truncated to the specified number of lines.
     */
    _getPreview(maxLines) {
        let content = this._entry.content || '';

        // Normalize whitespace for display
        content = content.replace(/\t/g, '  ').trim();

        // Approximate characters that fit on one line in the popup entry card (~42-45 chars)
        const approxCharsPerLine = 42;
        const rawLines = content.split(/\r?\n/);
        const visualLines = [];

        for (const line of rawLines) {
            if (visualLines.length >= maxLines) break;
            if (line.length <= approxCharsPerLine) {
                visualLines.push(line);
            } else {
                let remaining = line;
                while (remaining.length > 0 && visualLines.length < maxLines) {
                    if (remaining.length <= approxCharsPerLine) {
                        visualLines.push(remaining);
                        break;
                    }
                    let breakIdx = remaining.lastIndexOf(' ', approxCharsPerLine);
                    if (breakIdx <= 0) {
                        breakIdx = approxCharsPerLine;
                    }
                    visualLines.push(remaining.slice(0, breakIdx).trimEnd());
                    remaining = remaining.slice(breakIdx).trimStart();
                }
            }
        }

        let truncated = visualLines.slice(0, maxLines).join('\n');
        if (content.length > truncated.length) {
            truncated += '…';
        }
        return truncated;
    }

    /**
     * Updates preview label when hovering over the card.
     * Shows full content on hover, returns to truncated preview on unhover.
     * @private
     */
    _updateHoverState(isHovered) {
        if (!this._previewLabel || !this._previewLabel.clutter_text) return;

        if (isHovered) {
            // Expand to show all content
            this._previewLabel.clutter_text.set_line_wrap(true);
            this._previewLabel.clutter_text.set_ellipsize(0); // PANGO_ELLIPSIZE_NONE
            this._previewLabel.text = this._fullContent;
        } else {
            // Restore truncated preview
            this._previewLabel.clutter_text.set_line_wrap(this._previewLines > 1);
            this._previewLabel.clutter_text.set_ellipsize(this._previewLines > 1 ? 0 : 3);
            this._previewLabel.text = this._truncatedPreview;
        }
    }

    /**
     * Format a timestamp as relative time.
     */
    _formatTimestamp(isoString) {
        if (!isoString)
            return '';

        try {
            const date = new Date(isoString);
            const now = new Date();
            const diffMs = now - date;
            const diffSec = Math.floor(diffMs / 1000);
            const diffMin = Math.floor(diffSec / 60);
            const diffHour = Math.floor(diffMin / 60);
            const diffDay = Math.floor(diffHour / 24);

            if (diffSec < 60)
                return 'just now';
            if (diffMin < 60)
                return `${diffMin}m ago`;
            if (diffHour < 24)
                return `${diffHour}h ago`;
            if (diffDay < 7)
                return `${diffDay}d ago`;

            // Format as date
            return date.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
            });
        } catch (_e) {
            return '';
        }
    }

    /**
     * Get accessible name for screen readers.
     */
    _getAccessibleName() {
        const type = this._entry.contentType || 'text';
        const preview = (this._entry.content || '').substring(0, 50);
        const pinned = this._entry.pinned ? ', pinned' : '';
        return `${type} entry: ${preview}${pinned}`;
    }

    /**
     * Clean up.
     */
    destroy() {
        this.actor?.destroy();
        this.actor = null;
        this._entry = null;
        this._callbacks = null;
    }
}
