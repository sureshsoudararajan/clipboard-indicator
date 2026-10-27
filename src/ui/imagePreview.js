// SPDX-License-Identifier: GPL-2.0-or-later
// Image Preview Card — Display component for image clipboard entries

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import Cogl from 'gi://Cogl';

/**
 * ImagePreviewCard displays a clipboard image entry with thumbnail.
 */
export class ImagePreviewCard {
    /**
     * @param {object} entry - Image history entry
     * @param {object} callbacks - { onCopy, onDelete, onPin }
     * @param {boolean} [showTimestamps=true] - Whether to display timestamp
     */
    constructor(entry, callbacks, showTimestamps = true) {
        this._entry = entry;
        this._callbacks = callbacks;
        this._showTimestamps = showTimestamps;
        this._actionsBox = null;

        this.actor = new St.BoxLayout({
            style_class: 'clipboard-entry-card clipboard-entry-image-card',
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

        this._buildCard();
    }

    _buildCard() {
        const innerBox = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: true,
            style_class: 'clipboard-entry-inner',
        });

        // Thumbnail container
        const thumbContainer = new St.BoxLayout({
            style_class: 'clipboard-entry-thumb-container',
            y_align: Clutter.ActorAlign.START,
        });

        // Try to load thumbnail
        this._loadThumbnail(thumbContainer);
        innerBox.add_child(thumbContainer);

        // Info area
        const infoBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            style_class: 'clipboard-entry-content',
        });

        // Image type label
        const typeLabel = new St.Label({
            text: 'Image',
            style_class: 'clipboard-entry-preview clipboard-entry-image-label',
        });
        infoBox.add_child(typeLabel);

        // Image metadata row
        const metaBox = new St.BoxLayout({
            style_class: 'clipboard-entry-meta',
        });

        // Format and dimensions badge
        const details = [];
        if (this._entry.imageFormat)
            details.push(this._entry.imageFormat);
        if (this._entry.imageWidth && this._entry.imageHeight)
            details.push(`${this._entry.imageWidth}×${this._entry.imageHeight}`);
        if (this._entry.imageSize) {
            const sizeStr = this._formatSize(this._entry.imageSize);
            details.push(sizeStr);
        }

        if (details.length > 0) {
            const detailsLabel = new St.Label({
                text: details.join(' · '),
                style_class: 'clipboard-entry-badge clipboard-entry-badge-image',
            });
            metaBox.add_child(detailsLabel);
        }

        // OCR indicator
        if (this._entry.ocrText) {
            const ocrBadge = new St.Label({
                text: 'OCR',
                style_class: 'clipboard-entry-badge clipboard-entry-badge-ocr',
            });
            metaBox.add_child(ocrBadge);
        }

        // Timestamp
        const timeLabel = new St.Label({
            text: this._formatTimestamp(this._entry.createdAt),
            style_class: 'clipboard-entry-time',
            x_expand: true,
            visible: this._showTimestamps,
        });
        metaBox.add_child(timeLabel);

        infoBox.add_child(metaBox);

        // OCR text preview (if available)
        if (this._entry.ocrText) {
            this._truncatedOcr = this._entry.ocrText.substring(0, 100);
            this._fullOcr = this._entry.ocrText;

            this._ocrPreview = new St.Label({
                text: this._truncatedOcr,
                style_class: 'clipboard-entry-ocr-preview',
            });
            this._ocrPreview.clutter_text.set_ellipsize(3);
            this._ocrPreview.clutter_text.set_line_wrap(true);
            infoBox.add_child(this._ocrPreview);

            const updateOcrHover = () => {
                const isHovered = this.actor.hover || this._contentButton.hover;
                if (!this._ocrPreview || !this._ocrPreview.clutter_text) return;
                if (isHovered) {
                    this._ocrPreview.clutter_text.set_ellipsize(0);
                    this._ocrPreview.text = this._fullOcr;
                } else {
                    this._ocrPreview.clutter_text.set_ellipsize(3);
                    this._ocrPreview.text = this._truncatedOcr;
                }
            };
            this.actor.connect('notify::hover', updateOcrHover);
            this._contentButton.connect('notify::hover', updateOcrHover);
        }

        innerBox.add_child(infoBox);

        this._contentButton.set_child(innerBox);
        this.actor.add_child(this._contentButton);

        // Action buttons container (sibling to content button)
        this._actionsBox = new St.BoxLayout({
            style_class: 'clipboard-entry-actions',
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Copy extracted OCR text button (for images with extracted text)
        if (this._entry.ocrText) {
            const copyOcrBtn = new St.Button({
                style_class: 'clipboard-entry-action-btn clipboard-entry-copy-text-btn',
                child: new St.Icon({
                    icon_name: 'edit-copy-symbolic',
                    icon_size: 14,
                }),
                can_focus: true,
                reactive: true,
                accessible_name: 'Copy extracted text',
            });
            copyOcrBtn.connect('clicked', () => {
                this.copyExtractedText();
            });
            this._actionsBox.add_child(copyOcrBtn);
        }

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
     * Copy only the extracted OCR text to clipboard.
     */
    copyExtractedText() {
        if (!this._entry.ocrText) return;
        this._callbacks.onCopyText?.(this._entry.ocrText);
    }

    /**
     * Load and display the thumbnail image.
     */
    _loadThumbnail(container) {
        const thumbnailPath = this._entry.thumbnailPath || this._entry.imagePath;

        if (!thumbnailPath || !GLib.file_test(thumbnailPath, GLib.FileTest.EXISTS)) {
            // Show placeholder
            const placeholder = new St.Icon({
                icon_name: 'image-x-generic-symbolic',
                icon_size: 40,
                style_class: 'clipboard-entry-thumb-placeholder',
            });
            container.add_child(placeholder);
            return;
        }

        try {
            const file = Gio.File.new_for_path(thumbnailPath);
            const thumb = new St.Icon({
                gicon: new Gio.FileIcon({ file }),
                icon_size: 48,
                style_class: 'clipboard-entry-thumb',
            });
            container.add_child(thumb);
        } catch (e) {
            console.error('[ImagePreviewCard] Error loading thumbnail:', e);

            // Show fallback placeholder
            const placeholder = new St.Icon({
                icon_name: 'image-x-generic-symbolic',
                icon_size: 40,
                style_class: 'clipboard-entry-thumb-placeholder',
            });
            container.add_child(placeholder);
        }
    }

    /**
     * Format file size.
     */
    _formatSize(bytes) {
        if (bytes < 1024)
            return `${bytes} B`;
        if (bytes < 1024 * 1024)
            return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    /**
     * Format relative timestamp.
     */
    _formatTimestamp(isoString) {
        if (!isoString)
            return '';

        try {
            const date = new Date(isoString);
            const now = new Date();
            const diffMs = now - date;
            const diffMin = Math.floor(diffMs / 60000);
            const diffHour = Math.floor(diffMin / 60);
            const diffDay = Math.floor(diffHour / 24);

            if (diffMin < 1)
                return 'just now';
            if (diffMin < 60)
                return `${diffMin}m ago`;
            if (diffHour < 24)
                return `${diffHour}h ago`;
            if (diffDay < 7)
                return `${diffDay}d ago`;

            return date.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
            });
        } catch (_e) {
            return '';
        }
    }

    /**
     * Get accessible name.
     */
    _getAccessibleName() {
        const format = this._entry.imageFormat || 'Image';
        const dims = this._entry.imageWidth && this._entry.imageHeight
            ? ` ${this._entry.imageWidth}×${this._entry.imageHeight}`
            : '';
        const pinned = this._entry.pinned ? ', pinned' : '';
        return `${format} image${dims}${pinned}`;
    }

    activate() {
        this._callbacks.onCopy?.();
    }

    deleteEntry() {
        this._callbacks.onDelete?.();
    }

    togglePin() {
        this._callbacks.onPin?.();
    }

    setSelected(selected) {
        if (selected)
            this.actor.add_style_class_name('selected');
        else
            this.actor.remove_style_class_name('selected');
    }

    destroy() {
        this.actor?.destroy();
        this.actor = null;
        this._entry = null;
        this._callbacks = null;
    }
}
