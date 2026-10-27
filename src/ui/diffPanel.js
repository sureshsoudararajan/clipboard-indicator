// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

/**
 * Clipboard Indicator - Similarity Detection & Diff Inspector Panel
 *
 * Provides an interactive UI sub-panel for scanning near-duplicate clipboard entries,
 * calculating similarity scores (Levenshtein & Jaccard), and displaying line-by-line diffs.
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import { DiffEngine } from '../diffEngine.js';

export class DiffPanel {
    /**
     * @param {Object} options - { onClose: () => void, onCopyText: (text) => void }
     */
    constructor(options = {}) {
        this._options = options;
        this._entries = [];
        this._currentView = 'overview';

        this.actor = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'clipboard-diff-panel',
            x_expand: true,
            visible: false,
        });

        this._buildUI();
    }

    _buildUI() {
        // Header
        const header = new St.BoxLayout({
            style_class: 'clipboard-diff-header',
            x_expand: true,
            orientation: Clutter.Orientation.HORIZONTAL,
        });

        this._backBtn = new St.Button({
            style_class: 'clipboard-popup-header-btn clipboard-diff-back-btn',
            child: new St.Icon({
                icon_name: 'go-previous-symbolic',
                icon_size: 14,
            }),
            can_focus: true,
            visible: false,
            accessible_name: 'Back to similarity list',
        });
        this._backBtn.connect('clicked', () => {
            this._renderOverview();
        });
        header.add_child(this._backBtn);

        this._titleLabel = new St.Label({
            text: 'Similarity & Diff Inspector',
            style_class: 'clipboard-diff-title',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        header.add_child(this._titleLabel);

        const closeBtn = new St.Button({
            style_class: 'clipboard-popup-header-btn',
            child: new St.Icon({
                icon_name: 'window-close-symbolic',
                icon_size: 14,
            }),
            can_focus: true,
            accessible_name: 'Close Inspector',
        });
        closeBtn.connect('clicked', () => this.hide());
        header.add_child(closeBtn);

        this.actor.add_child(header);

        // Scrollable content area
        this._scrollView = new St.ScrollView({
            style_class: 'clipboard-diff-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: false,
            style: 'max-height: 380px;',
        });

        this._contentBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'clipboard-diff-content',
            x_expand: true,
        });

        this._scrollView.set_child(this._contentBox);
        this.actor.add_child(this._scrollView);
    }

    /**
     * Show inspector for given clipboard entries.
     * @param {Array<Object>} entries
     */
    show(entries = []) {
        this._entries = entries;
        this._renderOverview();
        this.actor.visible = true;
    }

    /**
     * Render the overview listing similar pairs and quick actions.
     */
    _renderOverview() {
        this._currentView = 'overview';
        this._titleLabel.text = 'Similarity & Diff Inspector';
        this._backBtn.visible = false;
        this._contentBox.destroy_all_children();

        const validEntries = this._entries.filter(e => e && e.type !== 'image' && e.content);

        // 1. Quick Action: Compare 2 Most Recent Copies
        if (validEntries.length >= 2) {
            const quickBox = new St.BoxLayout({
                style_class: 'clipboard-diff-quick-card',
                orientation: Clutter.Orientation.HORIZONTAL,
                x_expand: true,
            });

            const quickInfo = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                x_expand: true,
            });

            const quickTitle = new St.Label({
                text: '⚡ Compare 2 Most Recent Copies',
                style_class: 'clipboard-diff-quick-title',
            });
            quickInfo.add_child(quickTitle);

            const score = DiffEngine.similarityScore(validEntries[0].content, validEntries[1].content);
            const scorePercent = Math.round(score * 100);
            const quickSubtitle = new St.Label({
                text: `${scorePercent}% Match between newest and previous entry`,
                style_class: 'clipboard-diff-quick-sub',
            });
            quickInfo.add_child(quickSubtitle);

            quickBox.add_child(quickInfo);

            const compareBtn = new St.Button({
                label: 'Compare',
                style_class: 'clipboard-diff-action-btn',
                can_focus: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            compareBtn.connect('clicked', () => {
                this._renderDiff(validEntries[1], validEntries[0], score);
            });
            quickBox.add_child(compareBtn);

            this._contentBox.add_child(quickBox);
        }

        // 2. Scan for near-duplicate pairs
        const pairs = DiffEngine.findSimilar(validEntries, 0.45);

        if (pairs.length === 0) {
            const emptyCard = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                style_class: 'clipboard-diff-empty-card',
                x_expand: true,
            });

            const emptyIcon = new St.Icon({
                icon_name: 'view-dual-symbolic',
                icon_size: 24,
                style_class: 'clipboard-diff-empty-icon',
            });
            emptyCard.add_child(emptyIcon);

            const emptyTitle = new St.Label({
                text: 'No Near-Duplicate Pairs Found',
                style_class: 'clipboard-diff-empty-title',
            });
            emptyCard.add_child(emptyTitle);

            const emptyDesc = new St.Label({
                text: 'Similarity detection analyzes clipboard entries using Levenshtein edit distance and word Jaccard index to detect modified versions (>= 45% match).\n\nCopy slightly modified texts to see automatic pair matching and line-by-line diffs.',
                style_class: 'clipboard-diff-empty-desc',
            });
            emptyDesc.clutter_text.set_line_wrap(true);
            emptyCard.add_child(emptyDesc);

            this._contentBox.add_child(emptyCard);
            return;
        }

        // Section header
        const sectionTitle = new St.Label({
            text: `Detected Near-Duplicates (${pairs.length} pairs):`,
            style_class: 'clipboard-diff-section-title',
        });
        this._contentBox.add_child(sectionTitle);

        for (const pair of pairs) {
            const card = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                style_class: 'clipboard-diff-pair-card',
                x_expand: true,
            });

            const topRow = new St.BoxLayout({
                orientation: Clutter.Orientation.HORIZONTAL,
                x_expand: true,
            });

            const badge = new St.Label({
                text: `${Math.round(pair.similarity * 100)}% Match`,
                style_class: 'clipboard-diff-badge',
                y_align: Clutter.ActorAlign.CENTER,
            });
            topRow.add_child(badge);

            const spacer = new St.Widget({ x_expand: true });
            topRow.add_child(spacer);

            const diffBtn = new St.Button({
                label: 'View Diff',
                style_class: 'clipboard-diff-action-btn',
                can_focus: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            diffBtn.connect('clicked', () => {
                this._renderDiff(pair.entryB, pair.entryA, pair.similarity);
            });
            topRow.add_child(diffBtn);

            card.add_child(topRow);

            // Preview snippets
            const previewA = pair.entryA.content.replace(/\r?\n/g, ' ').substring(0, 70);
            const previewB = pair.entryB.content.replace(/\r?\n/g, ' ').substring(0, 70);

            const textA = new St.Label({
                text: `• New: ${previewA}${pair.entryA.content.length > 70 ? '…' : ''}`,
                style_class: 'clipboard-diff-preview-text',
            });
            textA.clutter_text.set_ellipsize(3);
            card.add_child(textA);

            const textB = new St.Label({
                text: `• Old: ${previewB}${pair.entryB.content.length > 70 ? '…' : ''}`,
                style_class: 'clipboard-diff-preview-text clipboard-diff-preview-old',
            });
            textB.clutter_text.set_ellipsize(3);
            card.add_child(textB);

            this._contentBox.add_child(card);
        }
    }

    /**
     * Render line-by-line diff comparison between entryA (base) and entryB (modified).
     */
    _renderDiff(entryA, entryB, similarity = null) {
        this._currentView = 'diff';
        this._backBtn.visible = true;
        this._titleLabel.text = similarity !== null
            ? `Diff (${Math.round(similarity * 100)}% Match)`
            : 'Line Diff Comparison';

        this._contentBox.destroy_all_children();

        const diffLines = DiffEngine.computeDiff(entryA.content || '', entryB.content || '');
        const addedCount = diffLines.filter(l => l.type === 'added').length;
        const removedCount = diffLines.filter(l => l.type === 'removed').length;

        // Stats summary bar
        const statsBar = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'clipboard-diff-stats-bar',
            x_expand: true,
        });

        const addedLabel = new St.Label({
            text: `+${addedCount} added`,
            style_class: 'clipboard-diff-stat-added',
            y_align: Clutter.ActorAlign.CENTER,
        });
        statsBar.add_child(addedLabel);

        const removedLabel = new St.Label({
            text: `-${removedCount} removed`,
            style_class: 'clipboard-diff-stat-removed',
            y_align: Clutter.ActorAlign.CENTER,
        });
        statsBar.add_child(removedLabel);

        const spacer = new St.Widget({ x_expand: true });
        statsBar.add_child(spacer);

        // Copy button for modified text
        const copyBtn = new St.Button({
            label: 'Copy Latest',
            style_class: 'clipboard-diff-action-btn',
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        copyBtn.connect('clicked', () => {
            this._options.onCopyText?.(entryB.content || '');
        });
        statsBar.add_child(copyBtn);

        this._contentBox.add_child(statsBar);

        // Code diff container
        const codeBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'clipboard-diff-code-box',
            x_expand: true,
        });

        for (const line of diffLines) {
            let lineText = '';
            let lineStyle = 'clipboard-diff-line';

            if (line.type === 'added') {
                lineText = `+ ${line.content}`;
                lineStyle += ' clipboard-diff-line-added';
            } else if (line.type === 'removed') {
                lineText = `- ${line.content}`;
                lineStyle += ' clipboard-diff-line-removed';
            } else {
                lineText = `  ${line.content}`;
                lineStyle += ' clipboard-diff-line-equal';
            }

            const label = new St.Label({
                text: lineText,
                style_class: lineStyle,
                x_expand: true,
            });
            label.clutter_text.set_line_wrap(true);
            label.clutter_text.set_line_wrap_mode(0); // PANGO_WRAP_WORD
            codeBox.add_child(label);
        }

        this._contentBox.add_child(codeBox);
    }

    hide() {
        this.actor.visible = false;
        this._currentView = 'overview';
        this._options.onClose?.();
    }

    destroy() {
        this.actor?.destroy();
        this.actor = null;
        this._options = null;
        this._entries = [];
    }
}

export default DiffPanel;
