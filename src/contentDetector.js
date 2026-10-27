// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
/* exported ContentDetector */

/**
 * Clipboard Indicator - Content Detection Module
 *
 * Classifies clipboard content into semantic categories with confidence scoring
 * and provides context-sensitive actions, URL/email extractors, and code heuristics.
 *
 * Compatible with GNOME 51 / GJS 1.90.1 (ESM).
 */

import GLib from 'gi://GLib';

/**
 * Common CLI executables for shell command classification.
 */
const KNOWN_SHELL_COMMANDS = new Set([
    // Package managers & system tools
    'sudo', 'apt', 'apt-get', 'apt-cache', 'pacman', 'dnf', 'zypper', 'yum',
    'flatpak', 'snap', 'brew', 'systemctl', 'journalctl', 'service', 'crontab',
    // Developer tools & runtimes
    'git', 'docker', 'docker-compose', 'podman', 'kubectl', 'npm', 'npx',
    'yarn', 'pnpm', 'pip', 'pip3', 'cargo', 'rustup', 'go', 'python', 'python3',
    'node', 'ruby', 'perl', 'make', 'cmake', 'meson', 'ninja', 'gcc', 'g++',
    // Core unix utilities
    'cat', 'grep', 'egrep', 'fgrep', 'find', 'sed', 'awk', 'cut', 'sort',
    'uniq', 'tr', 'head', 'tail', 'wc', 'tee', 'ls', 'cd', 'pwd', 'mkdir',
    'rmdir', 'rm', 'cp', 'mv', 'touch', 'chmod', 'chown', 'chgrp', 'ln',
    // Network & transfer
    'ssh', 'scp', 'rsync', 'curl', 'wget', 'ping', 'traceroute', 'dig',
    'nslookup', 'netstat', 'ss', 'ip', 'ifconfig',
    // Archives & compression
    'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'bzip2', 'xz',
    // Process & system status
    'kill', 'killall', 'pkill', 'ps', 'top', 'htop', 'df', 'du', 'free',
    'uptime', 'uname', 'whoami', 'id', 'su',
    // Shell built-ins & environment
    'echo', 'printf', 'export', 'source', 'alias', 'unalias', 'set', 'unset',
    'bash', 'sh', 'zsh', 'fish', 'env', 'which', 'whereis',
    // Editors & desktop
    'nano', 'vim', 'vi', 'emacs', 'gsettings', 'dconf'
]);

/**
 * Known top-level domains for domain pattern matching without protocol.
 */
const COMMON_TLDS = new Set([
    'com', 'org', 'net', 'edu', 'gov', 'mil', 'int',
    'io', 'dev', 'app', 'ai', 'me', 'co', 'info', 'biz', 'tv', 'cc', 'xyz',
    'tech', 'online', 'site', 'cloud', 'security', 'design',
    'uk', 'de', 'fr', 'jp', 'cn', 'ru', 'br', 'in', 'au', 'ca', 'eu', 'ch',
    'it', 'nl', 'se', 'no', 'es', 'fi', 'dk', 'kr', 'tw', 'pl', 'za', 'nz'
]);

export class ContentDetector {
    constructor() {
        this._initPatterns();
    }

    /**
     * Initializes pre-compiled regular expressions.
     * @private
     */
    _initPatterns() {
        // Email pattern (RFC 5322 compatible simplification)
        this._emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
        this._emailExtractRegex = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;

        // URL protocol pattern
        this._urlProtocolRegex = /^(?:https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
        this._urlExtractRegex = /(?:(?:https?|ftp):\/\/|www\.)[^\s<>"'`{}|\\^\[\]]+/gi;

        // Domain pattern without protocol (e.g. www.google.com or github.com/user/repo)
        this._domainPattern = /^(?:www\.)?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)\.([a-zA-Z]{2,63})(?::\d{1,5})?(?:\/[^\s]*)?$/i;

        // UUID pattern (8-4-4-4-12 hex)
        this._uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

        // MAC address patterns (6-octet or 8-octet, colon or dash separated)
        this._macRegex = /^(?:(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}|(?:[0-9a-fA-F]{2}-){5}[0-9a-fA-F]{2}|(?:[0-9a-fA-F]{2}:){7}[0-9a-fA-F]{2}|(?:[0-9a-fA-F]{2}-){7}[0-9a-fA-F]{2})$/;

        // Hex hashes (MD5=32, SHA1=40, SHA256=64, SHA512=128)
        this._hexHashRegex = /^[0-9a-fA-F]{32}$|^[0-9a-fA-F]{40}$|^[0-9a-fA-F]{64}$|^[0-9a-fA-F]{128}$/;

        // IPv4 pattern with optional port
        this._ipv4Regex = /^((?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3})(?::(\d{1,5}))?$/;

        // Unix file paths (starting with / or ~/)
        this._unixPathRegex = /^(?:~|\/)(?:[^\0\n\r"'\t*?<>|]*)$/;
    }

    /**
     * Classifies clipboard text content into semantic categories.
     *
     * @param {string} text - The input text to classify
     * @returns {{ type: string, confidence: number, metadata: object }}
     */
    classify(text) {
        if (text === null || text === undefined || typeof text !== 'string') {
            return {
                type: 'text',
                confidence: 0.0,
                metadata: { charCount: 0, wordCount: 0, empty: true }
            };
        }

        const trimmed = text.trim();
        if (trimmed.length === 0) {
            return {
                type: 'text',
                confidence: 0.0,
                metadata: { charCount: text.length, wordCount: 0, empty: true }
            };
        }

        // Collect all potential matching candidates
        const candidates = [];

        // 1. JSON match (Definitive: 1.0)
        const jsonMatch = this._checkJson(trimmed);
        if (jsonMatch) candidates.push(jsonMatch);

        // 2. URL match (1.0 for protocol URLs, 0.85 for domain patterns)
        const urlMatch = this._checkUrl(trimmed);
        if (urlMatch) candidates.push(urlMatch);

        // 3. Email match (0.95)
        const emailMatch = this._checkEmail(trimmed);
        if (emailMatch) candidates.push(emailMatch);

        // 4. UUID match (0.95)
        const uuidMatch = this._checkUuid(trimmed);
        if (uuidMatch) candidates.push(uuidMatch);

        // 5. MAC address match (0.95)
        const macMatch = this._checkMacAddress(trimmed);
        if (macMatch) candidates.push(macMatch);

        // 6. IP address match (0.95)
        const ipMatch = this._checkIpAddress(trimmed);
        if (ipMatch) candidates.push(ipMatch);

        // 7. Hex hash match (0.90)
        const hexHashMatch = this._checkHexHash(trimmed);
        if (hexHashMatch) candidates.push(hexHashMatch);

        // 8. Phone number match (0.85 - 0.90)
        const phoneMatch = this._checkPhone(trimmed);
        if (phoneMatch) candidates.push(phoneMatch);

        // 9. Unix File Path match (0.85)
        const filePathMatch = this._checkFilePath(trimmed);
        if (filePathMatch) candidates.push(filePathMatch);

        // 10. Shell command match (0.80 - 0.90)
        const shellMatch = this._checkShellCommand(trimmed);
        if (shellMatch) candidates.push(shellMatch);

        // 11. XML / HTML match (0.85)
        const xmlMatch = this._checkXml(trimmed);
        if (xmlMatch) candidates.push(xmlMatch);

        // 12. YAML match (0.75 - 0.80)
        const yamlMatch = this._checkYaml(trimmed);
        if (yamlMatch) candidates.push(yamlMatch);

        // 13. Source code heuristic match (0.70 - 0.85)
        const codeMatch = this._checkCode(trimmed);
        if (codeMatch) candidates.push(codeMatch);

        // 14. Multiline text fallback (0.60)
        const multilineMatch = this._checkMultiline(trimmed);
        if (multilineMatch) candidates.push(multilineMatch);

        // 15. Plain text fallback (0.50)
        candidates.push(this._fallbackText(trimmed));

        // Sort candidates by confidence descending
        candidates.sort((a, b) => b.confidence - a.confidence);

        return candidates[0];
    }

    /**
     * Checks if the content is valid JSON starting with { or [.
     * @private
     * @param {string} text
     * @returns {object|null}
     */
    _checkJson(text) {
        const isObjectWrap = text.startsWith('{') && text.endsWith('}');
        const isArrayWrap = text.startsWith('[') && text.endsWith(']');

        if (!isObjectWrap && !isArrayWrap) {
            return null;
        }

        try {
            const parsed = JSON.parse(text);
            if (typeof parsed === 'object' && parsed !== null) {
                const isArray = Array.isArray(parsed);
                const keys = !isArray ? Object.keys(parsed) : [];
                return {
                    type: 'json',
                    confidence: 1.0,
                    metadata: {
                        isObject: !isArray,
                        isArray,
                        itemCount: isArray ? parsed.length : keys.length,
                        keys: !isArray ? keys.slice(0, 15) : undefined,
                    }
                };
            }
        } catch (_) {
            // Invalid JSON syntax
        }

        return null;
    }

    /**
     * Checks if the content is a URL or domain pattern.
     * @private
     * @param {string} text
     * @returns {object|null}
     */
    _checkUrl(text) {
        if (text.includes('\n') || text.includes('\r')) {
            return null;
        }

        // Starts with explicit protocol (http://, https://, ftp://)
        if (this._urlProtocolRegex.test(text)) {
            const parsed = this._parseUri(text);
            return {
                type: 'url',
                confidence: 1.0,
                metadata: {
                    url: text,
                    protocol: parsed?.scheme || (text.startsWith('https') ? 'https' : 'http'),
                    hostname: parsed?.host || this._extractHostnameManually(text),
                    pathname: parsed?.path || '/',
                    port: (parsed?.port && parsed.port !== -1) ? parsed.port : null,
                    isSecure: text.toLowerCase().startsWith('https://'),
                }
            };
        }

        // Domain pattern without protocol (e.g., www.example.com or github.com/test)
        const domainMatch = text.match(this._domainPattern);
        if (domainMatch) {
            const tld = domainMatch[2].toLowerCase();
            const startsWithWww = text.toLowerCase().startsWith('www.');

            // Avoid matching filenames like index.html or test.js as domain URLs
            const isKnownTld = COMMON_TLDS.has(tld);
            const isCodeExtension = ['js', 'ts', 'py', 'c', 'cpp', 'h', 'css', 'html', 'md', 'txt', 'sh', 'json', 'xml'].includes(tld);

            if (startsWithWww || (isKnownTld && !isCodeExtension)) {
                const normalizedUrl = `https://${text}`;
                const parsed = this._parseUri(normalizedUrl);
                return {
                    type: 'url',
                    confidence: 0.85,
                    metadata: {
                        url: normalizedUrl,
                        originalText: text,
                        protocol: null,
                        hostname: parsed?.host || this._extractHostnameManually(normalizedUrl),
                        pathname: parsed?.path || '/',
                        isSecure: null,
                    }
                };
            }
        }

        return null;
    }

    /**
     * Helper to parse URI safely via GLib.Uri with fallback.
     * @private
     * @param {string} uriString
     * @returns {object|null}
     */
    _parseUri(uriString) {
        try {
            if (typeof GLib !== 'undefined' && GLib?.Uri?.parse) {
                const uri = GLib.Uri.parse(uriString, GLib.UriFlags.NONE);
                return {
                    scheme: uri.get_scheme(),
                    host: uri.get_host(),
                    path: uri.get_path(),
                    port: uri.get_port(),
                };
            }
        } catch (_) {
            // Ignore GLib error and use manual extraction
        }

        const match = uriString.match(/^(?:([a-zA-Z][a-zA-Z0-9+.-]*):)?(?:\/\/([^/?#:]*)(?::(\d+))?)?([^?#]*)/);
        if (match) {
            return {
                scheme: match[1] || null,
                host: match[2] || null,
                port: match[3] ? parseInt(match[3], 10) : null,
                path: match[4] || null,
            };
        }
        return null;
    }

    /**
     * Manually extracts hostname from URL string.
     * @private
     * @param {string} urlStr
     * @returns {string}
     */
    _extractHostnameManually(urlStr) {
        const match = urlStr.match(/^(?:https?|ftp):\/\/([^/?#:]+)/i);
        return match ? match[1] : '';
    }

    /**
     * Checks if the content is an email address.
     * @private
     * @param {string} text
     * @returns {object|null}
     */
    _checkEmail(text) {
        if (text.includes('\n') || text.includes('\r') || text.includes(' ')) {
            return null;
        }

        if (this._emailRegex.test(text)) {
            const atIndex = text.indexOf('@');
            return {
                type: 'email',
                confidence: 0.95,
                metadata: {
                    email: text,
                    localPart: text.substring(0, atIndex),
                    domain: text.substring(atIndex + 1),
                }
            };
        }

        return null;
    }

    /**
     * Checks if the content is a phone number.
     * @private
     * @param {string} text
     * @returns {object|null}
     */
    _checkPhone(text) {
        if (text.includes('\n') || text.includes('\r')) {
            return null;
        }

        // Reject equations and common non-phone symbols
        if (/[=<>*]/.test(text)) {
            return null;
        }

        // Reject standard dates (YYYY-MM-DD or DD/MM/YYYY)
        if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(text) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(text)) {
            return null;
        }

        // Reject IPv4
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(text)) {
            return null;
        }

        const digits = text.replace(/\D/g, '');
        if (digits.length < 7 || digits.length > 15) {
            return null;
        }

        const isIntlWithPlus = /^\+(?:[0-9][-.\s]?|\([0-9]+\)[-.\s]?){6,14}[0-9]$/.test(text);
        const isIntlWithZeroZero = /^00(?:[0-9][-.\s]?|\([0-9]+\)[-.\s]?){6,14}[0-9]$/.test(text);
        const isFormattedNational = /^(?:\([0-9]{2,4}\)[-.\s]?|[0-9]{2,4}[-.\s])[0-9]{3,4}[-.\s]?[0-9]{3,4}$/.test(text);
        const isHyphenSeparated = /^[0-9]{3,4}[-.][0-9]{3,4}[-.][0-9]{3,4}$/.test(text);

        if (isIntlWithPlus || isIntlWithZeroZero) {
            return {
                type: 'phone',
                confidence: 0.90,
                metadata: {
                    phone: text,
                    normalized: text.startsWith('+') ? `+${digits}` : digits,
                    hasCountryCode: true,
                    digitsCount: digits.length,
                }
            };
        }

        if (isFormattedNational || isHyphenSeparated) {
            return {
                type: 'phone',
                confidence: 0.85,
                metadata: {
                    phone: text,
                    normalized: digits,
                    hasCountryCode: false,
                    digitsCount: digits.length,
                }
            };
        }

        return null;
    }

    /**
     * Checks if the content is a UUID.
     * @private
     * @param {string} text
     * @returns {object|null}
     */
    _checkUuid(text) {
        if (this._uuidRegex.test(text)) {
            const versionChar = text.charAt(14);
            const version = /^[1-8]$/.test(versionChar) ? parseInt(versionChar, 10) : null;
            const variantChar = text.charAt(19).toLowerCase();
            const variant = ['8', '9', 'a', 'b'].includes(variantChar) ? 'RFC 4122' : 'Reserved/Other';

            return {
                type: 'uuid',
                confidence: 0.95,
                metadata: {
                    uuid: text,
                    version,
                    variant,
                    urn: `urn:uuid:${text.toLowerCase()}`
                }
            };
        }

        return null;
    }

    /**
     * Checks if the content is a MAC address.
     * @private
     * @param {string} text
     * @returns {object|null}
     */
    _checkMacAddress(text) {
        if (this._macRegex.test(text)) {
            const separator = text.includes(':') ? ':' : '-';
            const octets = text.split(separator);

            return {
                type: 'mac-address',
                confidence: 0.95,
                metadata: {
                    mac: text,
                    separator,
                    isEUI64: octets.length === 8,
                    octetsCount: octets.length,
                }
            };
        }

        return null;
    }

    /**
     * Checks if the content is an IP address (IPv4 or IPv6).
     * @private
     * @param {string} text
     * @returns {object|null}
     */
    _checkIpAddress(text) {
        if (text.includes('\n') || text.includes('\r')) {
            return null;
        }

        // Test IPv4
        const ipv4Match = text.match(this._ipv4Regex);
        if (ipv4Match) {
            const ipStr = ipv4Match[1];
            const portStr = ipv4Match[2];
            const octets = ipStr.split('.').map(o => parseInt(o, 10));

            // Validate octet values
            if (octets.every(o => o >= 0 && o <= 255)) {
                let port = null;
                if (portStr) {
                    port = parseInt(portStr, 10);
                    if (port < 1 || port > 65535) return null;
                }

                const isLoopback = octets[0] === 127;
                const isPrivate = octets[0] === 10 ||
                    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
                    (octets[0] === 192 && octets[1] === 168) ||
                    (octets[0] === 169 && octets[1] === 254) ||
                    isLoopback;

                return {
                    type: 'ip-address',
                    confidence: 0.95,
                    metadata: {
                        ip: ipStr,
                        version: 4,
                        port,
                        isLoopback,
                        isPrivate,
                    }
                };
            }
        }

        // Test IPv6
        const ipv6Result = this._validateIPv6(text);
        if (ipv6Result) {
            const { ip, port } = ipv6Result;
            const isLoopback = ip === '::1' || ip === '0:0:0:0:0:0:0:1';
            const isPrivate = isLoopback || ip.toLowerCase().startsWith('fe80:') ||
                ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd');

            return {
                type: 'ip-address',
                confidence: 0.95,
                metadata: {
                    ip,
                    version: 6,
                    port,
                    isLoopback,
                    isPrivate,
                }
            };
        }

        return null;
    }

    /**
     * Validates IPv6 string with optional port or enclosing brackets.
     * @private
     * @param {string} str
     * @returns {{ ip: string, port: number|null }|null}
     */
    _validateIPv6(str) {
        let ip = str;
        let port = null;

        if (str.startsWith('[')) {
            const bracketEnd = str.indexOf(']');
            if (bracketEnd === -1) return null;
            ip = str.substring(1, bracketEnd);
            const remainder = str.substring(bracketEnd + 1);
            if (remainder.startsWith(':')) {
                port = parseInt(remainder.substring(1), 10);
                if (isNaN(port) || port < 1 || port > 65535) return null;
            } else if (remainder.length > 0) {
                return null;
            }
        }

        if (!ip.includes(':')) return null;
        if (ip.split('::').length > 2) return null;

        const isDoubleColon = ip.includes('::');
        const parts = ip.split(':');
        const lastPart = parts[parts.length - 1];
        let hasEmbeddedIPv4 = false;

        if (lastPart && lastPart.includes('.')) {
            hasEmbeddedIPv4 = true;
            const ipv4Parts = lastPart.split('.');
            if (ipv4Parts.length !== 4) return null;
            for (const p of ipv4Parts) {
                if (!/^\d{1,3}$/.test(p)) return null;
                const n = parseInt(p, 10);
                if (n < 0 || n > 255) return null;
            }
        }

        const hexParts = hasEmbeddedIPv4 ? parts.slice(0, -1) : parts;
        let nonEmpties = 0;
        for (const part of hexParts) {
            if (part === '') continue;
            if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
            nonEmpties++;
        }

        if (isDoubleColon) {
            if (hasEmbeddedIPv4 ? nonEmpties > 6 : nonEmpties > 7) return null;
        } else {
            if (hasEmbeddedIPv4 ? parts.length !== 7 : parts.length !== 8) return null;
        }

        return { ip, port };
    }

    /**
     * Checks if the content is a hexadecimal hash string.
     * @private
     * @param {string} text
     * @returns {object|null}
     */
    _checkHexHash(text) {
        if (this._hexHashRegex.test(text)) {
            let algorithm = 'MD5';
            if (text.length === 40) algorithm = 'SHA-1';
            else if (text.length === 64) algorithm = 'SHA-256';
            else if (text.length === 128) algorithm = 'SHA-512';

            return {
                type: 'hex-hash',
                confidence: 0.90,
                metadata: {
                    hash: text,
                    algorithm,
                    length: text.length,
                }
            };
        }

        return null;
    }

    /**
     * Checks if the content is a Unix file path.
     * @private
     * @param {string} text
     * @returns {object|null}
     */
    _checkFilePath(text) {
        if (text.includes('\n') || text.includes('\r')) {
            return null;
        }

        let pathCandidate = text;
        if ((pathCandidate.startsWith('"') && pathCandidate.endsWith('"')) ||
            (pathCandidate.startsWith("'") && pathCandidate.endsWith("'"))) {
            pathCandidate = pathCandidate.slice(1, -1);
        }

        if (!pathCandidate.startsWith('/') && !pathCandidate.startsWith('~/')) {
            return null;
        }

        // Avoid matching shell operators or command flags
        if (/[|&;><$]/.test(pathCandidate)) {
            return null;
        }

        // If it contains spaces, ensure it doesn't look like command invocations with flags
        if (pathCandidate.includes(' ') && /\s+-[a-zA-Z-]/.test(pathCandidate)) {
            return null;
        }

        if (this._unixPathRegex.test(pathCandidate)) {
            const isAbsolute = pathCandidate.startsWith('/');
            const isHomeRelative = pathCandidate.startsWith('~/');
            const lastSlash = pathCandidate.lastIndexOf('/');
            const filename = lastSlash !== -1 ? pathCandidate.substring(lastSlash + 1) : pathCandidate;
            const directory = lastSlash !== -1 ? (pathCandidate.substring(0, lastSlash) || '/') : '/';
            const lastDot = filename.lastIndexOf('.');
            const extension = (lastDot > 0 && lastDot < filename.length - 1) ? filename.substring(lastDot + 1) : null;

            return {
                type: 'file-path',
                confidence: 0.85,
                metadata: {
                    path: pathCandidate,
                    isAbsolute,
                    isHomeRelative,
                    filename,
                    directory,
                    extension,
                }
            };
        }

        return null;
    }

    /**
     * Checks if the content is a shell command.
     * @private
     * @param {string} text
     * @returns {object|null}
     */
    _checkShellCommand(text) {
        const trimmed = text.trim();

        // Check for shell script shebang
        if (trimmed.startsWith('#!/bin/') || trimmed.startsWith('#!/usr/bin/')) {
            return {
                type: 'shell-command',
                confidence: 0.90,
                metadata: {
                    command: trimmed.split('\n')[0].replace('#!', '').trim(),
                    isScript: true,
                    hasSudo: false,
                    hasPipes: trimmed.includes('|'),
                    hasRedirects: /[><]/.test(trimmed),
                }
            };
        }

        // Strip leading terminal prompts ($ or # or >)
        let cmd = trimmed;
        if (/^[$#>]\s+/.test(cmd)) {
            cmd = cmd.replace(/^[$#>]\s+/, '').trim();
        }

        const firstLine = cmd.split('\n')[0].trim();
        const tokens = firstLine.split(/\s+/);
        if (tokens.length === 0 || tokens[0] === '') return null;

        const hasSudo = tokens[0] === 'sudo';
        const primaryCommand = hasSudo && tokens.length > 1 ? tokens[1] : tokens[0];
        const isKnownCommand = KNOWN_SHELL_COMMANDS.has(primaryCommand);

        const hasPipes = cmd.includes('|');
        const hasRedirects = /[><]/.test(cmd);
        const hasChaining = cmd.includes('&&') || cmd.includes('||');
        const hasShellFlags = /\s+-[a-zA-Z0-9-]/.test(cmd);

        // Discard natural language that happens to start with command words like "cat", "git", "find", etc.
        if (isKnownCommand) {
            // Words like "git is awesome" or "cat was sleeping"
            const secondToken = (hasSudo ? tokens[2] : tokens[1]) || '';
            const englishStopWords = new Set(['is', 'was', 'are', 'were', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and']);
            if (englishStopWords.has(secondToken.toLowerCase()) && !hasShellFlags && !hasPipes && !hasRedirects) {
                return null;
            }

            return {
                type: 'shell-command',
                confidence: 0.85,
                metadata: {
                    command: primaryCommand,
                    hasSudo,
                    hasPipes,
                    hasRedirects,
                    hasChaining,
                    isScript: false,
                }
            };
        }

        // Command invoking local binary (e.g. ./build.sh or /usr/local/bin/mytool -v)
        if ((tokens[0].startsWith('./') || tokens[0].startsWith('../')) && (tokens.length > 1 || tokens[0].endsWith('.sh'))) {
            return {
                type: 'shell-command',
                confidence: 0.80,
                metadata: {
                    command: tokens[0],
                    hasSudo,
                    hasPipes,
                    hasRedirects,
                    hasChaining,
                    isScript: false,
                }
            };
        }

        // Contains command pipes or chaining with executable syntax
        if ((hasPipes || hasChaining) && (hasShellFlags || tokens.some(t => KNOWN_SHELL_COMMANDS.has(t)))) {
            return {
                type: 'shell-command',
                confidence: 0.80,
                metadata: {
                    command: tokens[0],
                    hasSudo,
                    hasPipes,
                    hasRedirects,
                    hasChaining,
                    isScript: false,
                }
            };
        }

        return null;
    }

    /**
     * Checks if the content is XML or HTML markup.
     * @private
     * @param {string} text
     * @returns {object|null}
     */
    _checkXml(text) {
        if (!text.startsWith('<')) {
            return null;
        }

        // XML declaration or DOCTYPE
        const isXmlDecl = text.startsWith('<?xml');
        const isDocType = /^<!DOCTYPE\s+[^>]+>/i.test(text);

        if (isXmlDecl || isDocType) {
            const rootMatch = text.match(/<([a-zA-Z][a-zA-Z0-9_:-]*)(?:\s[^>]*)?>/);
            const rootTag = rootMatch ? rootMatch[1] : (isXmlDecl ? 'xml' : 'html');
            return {
                type: 'xml',
                confidence: 0.90,
                metadata: {
                    rootTag,
                    isXmlDeclaration: isXmlDecl,
                    isHtml: isDocType || ['html', 'head', 'body'].includes(rootTag.toLowerCase()),
                    isSvg: rootTag.toLowerCase() === 'svg',
                }
            };
        }

        // Matching start and end tags: <tag ...>...</tag> or self-closing <tag ... />
        const tagMatch = text.match(/^<([a-zA-Z][a-zA-Z0-9_:-]*)(?:\s[^>]*)?(?:>(?:[\s\S]*)<\/\1>|\s*\/>)$/);
        if (tagMatch) {
            const rootTag = tagMatch[1];
            const lowerTag = rootTag.toLowerCase();
            return {
                type: 'xml',
                confidence: 0.85,
                metadata: {
                    rootTag,
                    isXmlDeclaration: false,
                    isHtml: ['html', 'head', 'body', 'div', 'span', 'p', 'table', 'form', 'section', 'button', 'ul', 'li'].includes(lowerTag),
                    isSvg: lowerTag === 'svg',
                }
            };
        }

        return null;
    }

    /**
     * Checks if the content is YAML formatted.
     * @private
     * @param {string} text
     * @returns {object|null}
     */
    _checkYaml(text) {
        const hasDocStart = text.startsWith('---');
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);

        if (lines.length < 2 && !hasDocStart) {
            return null;
        }

        // Reject if it looks like JavaScript code or CSS
        if (/;\s*$/.test(text) || /\bfunction\b|\bclass\b|\bconst\b|\blet\b/.test(text)) {
            return null;
        }

        let yamlMatches = 0;
        const topLevelKeys = [];

        for (const line of lines) {
            if (line.trim().startsWith('#') || line.trim() === '---' || line.trim() === '...') {
                yamlMatches++;
                continue;
            }

            // Key-value pair: "key: value" or "key:"
            const kvMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+):\s*(.*)$/);
            if (kvMatch) {
                yamlMatches++;
                if (kvMatch[1].length === 0) {
                    topLevelKeys.push(kvMatch[2]);
                }
                continue;
            }

            // List item: "- item" or "- key: value"
            if (/^\s*-\s+.*$/.test(line)) {
                yamlMatches++;
                continue;
            }
        }

        const matchRatio = yamlMatches / lines.length;
        if ((hasDocStart && matchRatio >= 0.5) || (matchRatio >= 0.7 && topLevelKeys.length >= 1)) {
            return {
                type: 'yaml',
                confidence: hasDocStart ? 0.80 : 0.75,
                metadata: {
                    lineCount: lines.length,
                    hasDocumentStart: hasDocStart,
                    topLevelKeys: topLevelKeys.slice(0, 10),
                    keyCount: topLevelKeys.length,
                }
            };
        }

        return null;
    }

    /**
     * Checks if the content is source code using heuristic analysis.
     * @private
     * @param {string} text
     * @returns {object|null}
     */
    _checkCode(text) {
        if (!this.isLikelyCode(text)) {
            return null;
        }

        const detectedLanguage = this._detectCodeLanguage(text);
        const lines = text.split(/\r?\n/);

        return {
            type: 'code',
            confidence: 0.85,
            metadata: {
                detectedLanguage,
                lineCount: lines.length,
                hasFunctions: /\b(?:function|def|fn|func)\b/.test(text),
                hasClasses: /\bclass\b/.test(text),
                hasImports: /\b(?:import|include|require|from)\b/.test(text),
            }
        };
    }

    /**
     * Checks if the content is generic multiline text.
     * @private
     * @param {string} text
     * @returns {object|null}
     */
    _checkMultiline(text) {
        if (text.includes('\n')) {
            const lines = text.split(/\r?\n/);
            const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

            return {
                type: 'multiline-text',
                confidence: 0.60,
                metadata: {
                    lineCount: lines.length,
                    charCount: text.length,
                    wordCount,
                }
            };
        }

        return null;
    }

    /**
     * Fallback classification for plain text.
     * @private
     * @param {string} text
     * @returns {object}
     */
    _fallbackText(text) {
        const words = text.trim().split(/\s+/).filter(Boolean);
        return {
            type: 'text',
            confidence: 0.50,
            metadata: {
                charCount: text.length,
                wordCount: words.length,
                isSingleWord: words.length === 1,
            }
        };
    }

    /**
     * Heuristically determines if the given text is likely source code.
     *
     * @param {string} text - The input text to evaluate
     * @returns {boolean} True if content has high likelihood of being code
     */
    isLikelyCode(text) {
        if (!text || typeof text !== 'string') {
            return false;
        }

        const trimmed = text.trim();
        if (trimmed.length < 6) {
            return false;
        }

        // Strong code definition patterns (3 points each)
        const highConfidencePatterns = [
            /\b(?:function\s+[a-zA-Z0-9_$]+\s*\(|function\s*\()/i,
            /\bdef\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*:/,
            /\bclass\s+[a-zA-Z0-9_$]+(?:\s+extends\s+[a-zA-Z0-9_$]+|\s*\([^)]*\))?\s*[{:]/,
            /\b(?:import\s+.*?\s+from\s+['"][^'"]+['"]|import\s+['"][^'"]+['"])/,
            /^\s*import\s+[a-zA-Z0-9_.]+(?:\s+as\s+[a-zA-Z0-9_]+)?(?:\s*,\s*[a-zA-Z0-9_.]+(?:\s+as\s+[a-zA-Z0-9_]+)?)*\s*(?:;|$)/m,
            /\bfrom\s+[a-zA-Z0-9_.]+\s+import\s+[a-zA-Z0-9_*, ]+/,
            /\bexport\s+(?:default\s+)?(?:class|function|const|let|var|type|interface)\b/,
            /#include\s+[<"][^>"]+[>"]/,
            /\bfn\s+[a-zA-Z0-9_]+\s*(?:<[^>]+>)?\s*\(/,
            /\bfunc\s+(?:\([^)]+\)\s*)?[a-zA-Z0-9_]+\s*\(/,
            /\b(?:public|private|protected)\s+(?:static\s+)?(?:void|class|int|String|bool)\b/,
            /\bpackage\s+[a-zA-Z0-9_.]+;/,
            /<\?php\b/,
            /\bSELECT\s+[\s\S]+?\s+FROM\s+[a-zA-Z0-9_`"']+/i,
            /\bCREATE\s+TABLE\s+[a-zA-Z0-9_`"']+\s*\(/i,
            /\bINSERT\s+INTO\s+[a-zA-Z0-9_`"']+/i,
            /^\s*print\s*\(.*?\)\s*$/m,
        ];

        // Medium code statement patterns (2 points each)
        const mediumConfidencePatterns = [
            /\b(?:const|let|var)\s+[a-zA-Z0-9_$]+\s*=[^=]/,
            /\bconsole\.(?:log|warn|error|info|debug|trace)\s*\(/,
            /\b(?:println!|print!|printf)\s*\(/,
            /(?:=>\s*\{|\)\s*=>)/,
            /\bif\s*\([^)]+\)\s*\{/,
            /\bfor\s*\([^)]+\)\s*\{/,
            /\bwhile\s*\([^)]+\)\s*\{/,
            /\btry\s*\{[\s\S]*\}\s*catch\b/,
            /\bswitch\s*\([^)]+\)\s*\{/,
            /\breturn\s+[^;]+;/,
            /\bthrow\s+new\s+[a-zA-Z0-9_$]+/,
            /\bstd::[a-zA-Z0-9_:]+/,
            /\binterface\s+[a-zA-Z0-9_$]+\s*\{/,
            /\btype\s+[a-zA-Z0-9_$]+\s*=/,
            /\/\/[^\n]*$|\/\*[\s\S]*?\*\//m,
            /\b(?:elif|except|finally)\b\s*:/,
            /^\s*if\s+.*?:$/m,
        ];

        let score = 0;
        for (const pattern of highConfidencePatterns) {
            if (pattern.test(trimmed)) score += 3;
        }

        for (const pattern of mediumConfidencePatterns) {
            if (pattern.test(trimmed)) score += 2;
        }

        // Structural syntax features
        if (/[;]\s*$/m.test(trimmed)) score += 1;
        if (/[=]{2,3}|[!][=]{1,2}/.test(trimmed)) score += 1;
        if (/[+][+]|--|[+][=]|[-][=]|[*][=]/.test(trimmed)) score += 1;
        if (/[&]{2}|[|]{2}/.test(trimmed)) score += 1;

        return score >= 3 || (score >= 2 && /[{};]/.test(trimmed));
    }

    /**
     * Infers programming language from heuristic keywords.
     * @private
     * @param {string} text
     * @returns {string}
     */
    _detectCodeLanguage(text) {
        if (/<\?php\b/.test(text)) return 'php';
        if (/#include\s+[<"]/.test(text) || /\bstd::/.test(text)) return 'c_cpp';
        if (/\bfn\s+[a-zA-Z0-9_]+|println!|let\s+mut\b/.test(text)) return 'rust';
        if (/\bfunc\s+|package\s+[a-zA-Z0-9_]+/.test(text)) return 'go';
        if (/\bdef\s+[a-zA-Z0-9_]+|\belif\b|:\s*$|\bimport\s+[a-zA-Z0-9_.]+|\bprint\s*\(/.test(text)) return 'python';
        if (/\bSELECT\b[\s\S]+\bFROM\b/i.test(text)) return 'sql';
        if (/\b(?:const|let|var)\s+|\bconsole\.log|\bfunction\b|=>|\bimport\s+.*?\s+from\b|\bexport\s+(?:default\s+)?(?:class|function|const|let|var)|\bclass\s+[a-zA-Z0-9_$]+\s*[{:]|\bconstructor\s*\(/.test(text)) return 'javascript';
        return 'generic';
    }

    /**
     * Extracts all unique URL strings found in the given text.
     *
     * @param {string} text - The input text containing URLs
     * @returns {string[]} Array of extracted URL strings
     */
    extractUrls(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        const matches = text.match(this._urlExtractRegex);
        if (!matches) {
            return [];
        }

        const seen = new Set();
        const urls = [];

        for (const rawUrl of matches) {
            let cleaned = this._cleanExtractedUrl(rawUrl);
            if (cleaned.length > 0 && !seen.has(cleaned)) {
                seen.add(cleaned);
                urls.push(cleaned);
            }
        }

        return urls;
    }

    /**
     * Cleans trailing punctuation from extracted URL string.
     * @private
     * @param {string} url
     * @returns {string}
     */
    _cleanExtractedUrl(url) {
        let cleaned = url.replace(/[.,;:!?]+$/, '');

        // Balance trailing parentheses (e.g. from markdown or surrounding text "(https://...)")
        const openParens = (cleaned.match(/\(/g) || []).length;
        const closeParens = (cleaned.match(/\)/g) || []).length;
        let excessClosing = closeParens - openParens;
        while (excessClosing > 0 && cleaned.endsWith(')')) {
            cleaned = cleaned.slice(0, -1);
            excessClosing--;
        }

        // Strip trailing quotes or brackets
        cleaned = cleaned.replace(/["'\]>]+$/, '');

        // Remove any newly exposed trailing punctuation
        cleaned = cleaned.replace(/[.,;:!?]+$/, '');

        return cleaned;
    }

    /**
     * Extracts all unique email address strings found in the given text.
     *
     * @param {string} text - The input text containing email addresses
     * @returns {string[]} Array of extracted email strings
     */
    extractEmails(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        const matches = text.match(this._emailExtractRegex);
        if (!matches) {
            return [];
        }

        const seen = new Set();
        const emails = [];

        for (const email of matches) {
            const cleaned = email.replace(/[.,;:!?]+$/, '');
            if (cleaned.length > 0 && !seen.has(cleaned)) {
                seen.add(cleaned);
                emails.push(cleaned);
            }
        }

        return emails;
    }

    /**
     * Returns an array of context-sensitive action descriptors for a given classification.
     *
     * @param {object|string} classification - Classification result object or category string
     * @returns {Array<{ id: string, label: string, icon: string }>}
     */
    getActions(classification) {
        const type = (typeof classification === 'string')
            ? classification
            : (classification?.type || 'text');

        switch (type) {
            case 'url':
                return [
                    { id: 'open-url', label: 'Open in Browser', icon: 'web-browser-symbolic' },
                    { id: 'copy-url', label: 'Copy URL', icon: 'edit-copy-symbolic' }
                ];

            case 'email':
                return [
                    { id: 'send-email', label: 'Compose Email', icon: 'mail-send-symbolic' },
                    { id: 'copy-email', label: 'Copy Email Address', icon: 'edit-copy-symbolic' }
                ];

            case 'phone':
                return [
                    { id: 'call-phone', label: 'Call Number', icon: 'call-start-symbolic' },
                    { id: 'copy-phone', label: 'Copy Phone Number', icon: 'edit-copy-symbolic' }
                ];

            case 'file-path':
                return [
                    { id: 'open-file', label: 'Open File', icon: 'document-open-symbolic' },
                    { id: 'open-directory', label: 'Open Folder', icon: 'folder-open-symbolic' },
                    { id: 'open-terminal', label: 'Open in Terminal', icon: 'utilities-terminal-symbolic' },
                    { id: 'copy-path', label: 'Copy Path', icon: 'edit-copy-symbolic' }
                ];

            case 'shell-command':
                return [
                    { id: 'run-terminal', label: 'Run in Terminal', icon: 'utilities-terminal-symbolic' },
                    { id: 'copy-command', label: 'Copy Command', icon: 'edit-copy-symbolic' }
                ];

            case 'json':
                return [
                    { id: 'format-json', label: 'Format JSON', icon: 'format-indent-more-symbolic' },
                    { id: 'minify-json', label: 'Minify JSON', icon: 'format-indent-less-symbolic' },
                    { id: 'copy-json', label: 'Copy JSON', icon: 'edit-copy-symbolic' }
                ];

            case 'xml':
                return [
                    { id: 'format-xml', label: 'Format XML', icon: 'format-indent-more-symbolic' },
                    { id: 'copy-xml', label: 'Copy XML', icon: 'edit-copy-symbolic' }
                ];

            case 'yaml':
                return [
                    { id: 'copy-yaml', label: 'Copy YAML', icon: 'edit-copy-symbolic' }
                ];

            case 'code':
                return [
                    { id: 'format-code', label: 'Format Code', icon: 'format-indent-more-symbolic' },
                    { id: 'copy-code', label: 'Copy Code', icon: 'edit-copy-symbolic' }
                ];

            case 'ip-address':
                return [
                    { id: 'ping-ip', label: 'Ping Address', icon: 'network-wired-symbolic' },
                    { id: 'open-browser', label: 'Open in Browser', icon: 'web-browser-symbolic' },
                    { id: 'copy-ip', label: 'Copy IP Address', icon: 'edit-copy-symbolic' }
                ];

            case 'mac-address':
                return [
                    { id: 'copy-mac', label: 'Copy MAC Address', icon: 'edit-copy-symbolic' }
                ];

            case 'uuid':
                return [
                    { id: 'copy-uuid', label: 'Copy UUID', icon: 'edit-copy-symbolic' },
                    { id: 'copy-uppercase', label: 'Copy Uppercase', icon: 'edit-copy-symbolic' }
                ];

            case 'hex-hash':
                return [
                    { id: 'copy-hash', label: 'Copy Hash', icon: 'edit-copy-symbolic' }
                ];

            case 'multiline-text':
                return [
                    { id: 'copy-text', label: 'Copy Text', icon: 'edit-copy-symbolic' }
                ];

            case 'text':
            default:
                return [
                    { id: 'search-web', label: 'Search Web', icon: 'system-search-symbolic' },
                    { id: 'copy-text', label: 'Copy Text', icon: 'edit-copy-symbolic' }
                ];
        }
    }

    destroy() {
        this._settings = null;
    }
}

export default ContentDetector;
