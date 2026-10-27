// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
// SPDX-License-Identifier: GPL-2.0-or-later

/**
 * Clipboard Indicator - Developer Utilities
 *
 * Provides context-aware local transformations for clipboard text:
 * - JSON formatting & validation
 * - XML formatting
 * - URL encode / decode
 * - Base64 encode / decode
 * - Whitespace normalization
 * - URL components & query param stripping
 */

import GLib from 'gi://GLib';

export class DevTools {
    /**
     * Format and validate JSON string.
     * @param {string} text
     * @param {number} [indent=2]
     * @returns {{ success: boolean, result: string, error: string|null }}
     */
    static formatJSON(text, indent = 2) {
        if (!text || typeof text !== 'string') {
            return { success: false, result: '', error: 'Input is empty' };
        }

        try {
            const parsed = JSON.parse(text);
            const formatted = JSON.stringify(parsed, null, indent);
            return { success: true, result: formatted, error: null };
        } catch (err) {
            return { success: false, result: text, error: err.message };
        }
    }

    /**
     * Format XML string with consistent indentation.
     * @param {string} xml
     * @param {number} [indent=2]
     * @returns {{ success: boolean, result: string, error: string|null }}
     */
    static formatXML(xml, indent = 2) {
        if (!xml || typeof xml !== 'string') {
            return { success: false, result: '', error: 'Input is empty' };
        }

        try {
            const pad = ' '.repeat(indent);
            let formatted = '';
            let depth = 0;

            // Strip existing redundant formatting between tags
            const cleanXml = xml.replace(/>\s*</g, '><').trim();
            const tagRegex = /(<\/?[^>]+>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|[^<]+)/g;
            const matches = cleanXml.match(tagRegex);

            if (!matches) {
                return { success: false, result: xml, error: 'Invalid XML structure' };
            }

            for (let i = 0; i < matches.length; i++) {
                const node = matches[i].trim();
                if (!node) continue;

                // Closing tag
                if (/^<\/[^>]+>/.test(node)) {
                    depth = Math.max(0, depth - 1);
                    formatted += (depth > 0 ? pad.repeat(depth) : '') + node + '\n';
                }
                // Self-closing or declaration
                else if (/^<[^>]+\/>$/.test(node) || /^<\?xml[^>]*\?>/i.test(node) || /^<!DOCTYPE/i.test(node)) {
                    formatted += pad.repeat(depth) + node + '\n';
                }
                // Opening tag
                else if (/^<[^\/!][^>]*>/.test(node)) {
                    formatted += pad.repeat(depth) + node + '\n';
                    depth++;
                }
                // Text node or comment or CDATA
                else {
                    formatted += pad.repeat(depth) + node + '\n';
                }
            }

            return { success: true, result: formatted.trimEnd(), error: null };
        } catch (err) {
            return { success: false, result: xml, error: err.message };
        }
    }

    /**
     * URL encode string.
     */
    static urlEncode(text) {
        if (!text) return '';
        try {
            return encodeURIComponent(text);
        } catch (err) {
            return text;
        }
    }

    /**
     * URL decode string.
     */
    static urlDecode(text) {
        if (!text) return { success: false, result: '', error: 'Input is empty' };
        try {
            const decoded = decodeURIComponent(text.replace(/\+/g, '%20'));
            return { success: true, result: decoded, error: null };
        } catch (err) {
            return { success: false, result: text, error: err.message };
        }
    }

    /**
     * Base64 encode string.
     */
    static base64Encode(text) {
        if (!text) return '';
        try {
            const encoder = new TextEncoder();
            const bytes = encoder.encode(text);
            return GLib.base64_encode(bytes);
        } catch (err) {
            // Fallback
            try {
                return btoa(unescape(encodeURIComponent(text)));
            } catch {
                return '';
            }
        }
    }

    /**
     * Base64 decode string.
     */
    static base64Decode(text) {
        if (!text) return { success: false, result: '', error: 'Input is empty' };
        try {
            const clean = text.trim();
            const bytes = GLib.base64_decode(clean);
            if (!bytes) {
                return { success: false, result: text, error: 'Base64 decoding failed' };
            }
            const decoder = new TextDecoder('utf-8');
            return { success: true, result: decoder.decode(bytes), error: null };
        } catch (err) {
            return { success: false, result: text, error: err.message };
        }
    }

    /**
     * Normalize whitespace: trims ends, collapses multiple spaces, normalizes line breaks.
     */
    static normalizeWhitespace(text) {
        if (!text) return '';
        return text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n')
            .map(line => line.replace(/[ \t]+/g, ' ').trim())
            .join('\n')
            .trim();
    }

    /**
     * Extract hostname from a URL.
     */
    static extractHostname(url) {
        if (!url) return null;
        try {
            const match = url.match(/^(?:https?|ftp):\/\/([^/:?#]+)/i);
            return match ? match[1] : null;
        } catch {
            return null;
        }
    }

    /**
     * Strip query parameters and fragments from a URL.
     */
    static stripQueryParams(url) {
        if (!url) return null;
        try {
            return url.split('?')[0].split('#')[0];
        } catch {
            return url;
        }
    }

    /**
     * Return list of available transformation actions appropriate for a given contentType.
     * @param {string} contentType
     * @returns {Array<{ id: string, label: string, icon: string }>}
     */
    static getAvailableTools(contentType) {
        const commonTools = [
            { id: 'normalize-whitespace', label: 'Trim Whitespace', icon: 'edit-clear-symbolic' },
            { id: 'base64-encode', label: 'Base64 Encode', icon: 'security-high-symbolic' },
            { id: 'url-encode', label: 'URL Encode', icon: 'web-browser-symbolic' },
        ];

        switch (contentType) {
            case 'json':
                return [
                    { id: 'format-json', label: 'Format JSON', icon: 'application-x-addon-symbolic' },
                    { id: 'minify-json', label: 'Minify JSON', icon: 'edit-clear-symbolic' },
                    ...commonTools,
                ];

            case 'xml':
                return [
                    { id: 'format-xml', label: 'Format XML', icon: 'application-xml-symbolic' },
                    ...commonTools,
                ];

            case 'url':
                return [
                    { id: 'copy-hostname', label: 'Copy Hostname', icon: 'network-server-symbolic' },
                    { id: 'strip-params', label: 'Strip Query Params', icon: 'edit-clear-symbolic' },
                    { id: 'url-decode', label: 'URL Decode', icon: 'web-browser-symbolic' },
                    ...commonTools,
                ];

            default:
                return [
                    ...commonTools,
                    { id: 'base64-decode', label: 'Base64 Decode', icon: 'security-medium-symbolic' },
                    { id: 'url-decode', label: 'URL Decode', icon: 'web-browser-symbolic' },
                ];
        }
    }

    /**
     * Execute a transformation by ID.
     */
    static transform(actionId, text) {
        switch (actionId) {
            case 'format-json': {
                const res = this.formatJSON(text);
                return res.success ? res.result : text;
            }
            case 'minify-json': {
                try {
                    return JSON.stringify(JSON.parse(text));
                } catch {
                    return text;
                }
            }
            case 'format-xml': {
                const res = this.formatXML(text);
                return res.success ? res.result : text;
            }
            case 'url-encode':
                return this.urlEncode(text);
            case 'url-decode': {
                const res = this.urlDecode(text);
                return res.success ? res.result : text;
            }
            case 'base64-encode':
                return this.base64Encode(text);
            case 'base64-decode': {
                const res = this.base64Decode(text);
                return res.success ? res.result : text;
            }
            case 'normalize-whitespace':
                return this.normalizeWhitespace(text);
            case 'copy-hostname':
                return this.extractHostname(text) || text;
            case 'strip-params':
                return this.stripQueryParams(text) || text;
            default:
                return text;
        }
    }
}

export default DevTools;
