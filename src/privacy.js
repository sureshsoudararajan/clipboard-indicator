/**
 * Clipboard Indicator - Privacy Module
 *
 * Handles sensitive content detection, source application exclusions,
 * data retention policy enforcement, and secure file handling.
 *
 * NOTE ON WAYLAND:
 * Under Wayland sessions, compositor client isolation prevents shell extensions
 * and client applications from reliably querying the source application ID of
 * clipboard selections. Unless GNOME Shell's internal focused-window lookup
 * succeeds (which may fail for background transfers, sandboxed Flatpaks, or
 * asynchronous clipboards), the application ID may be reported as null, empty,
 * or a generic shell ID. Consequently, application-based exclusions (shouldExcludeApp)
 * should always be complemented by content-based pattern detection (detectSensitive).
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

/**
 * Built-in sensitive content detection rules.
 * Confidence scores are ranked between 0.0 and 1.0.
 */
const SENSITIVE_PATTERNS = [
    {
        id: 'private_key',
        name: 'Private Cryptographic Key',
        regex: /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY(?: BLOCK)?-----/,
        confidence: 1.0,
    },
    {
        id: 'github_token',
        name: 'GitHub Access Token',
        regex: /\b(?:ghp_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9_]{82}|(?:gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,})\b/,
        confidence: 0.99,
    },
    {
        id: 'gitlab_token',
        name: 'GitLab Access Token',
        regex: /\b(?:glpat-[a-zA-Z0-9_\-]{20,}|(?:glptt|glfeed)-[a-zA-Z0-9_\-]{20,})\b/,
        confidence: 0.99,
    },
    {
        id: 'stripe_key',
        name: 'Stripe API Key',
        regex: /\b[spr]k_(?:live|test)_[0-9a-zA-Z]{24,}\b/,
        confidence: 0.98,
    },
    {
        id: 'aws_key',
        name: 'AWS Access Key ID',
        regex: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/,
        confidence: 0.95,
    },
    {
        id: 'jwt_token',
        name: 'JSON Web Token (JWT)',
        regex: /\beyJ[a-zA-Z0-9_\-]{10,}\.eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]+\b/,
        confidence: 0.95,
    },
    {
        id: 'url_password',
        name: 'Credentials in URL',
        regex: /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/\s:@]+:[^/\s:@]+@[^\s/]+/,
        confidence: 0.92,
    },
    {
        id: 'auth_header',
        name: 'Authorization Bearer Header',
        regex: /(?:Authorization:\s*Bearer\s+[a-zA-Z0-9_\-\.=:_+/]+|Bearer\s+[a-zA-Z0-9_\-\.=:_+/]{16,})/i,
        confidence: 0.92,
    },
    {
        id: 'generic_api_key',
        name: 'Generic API Key / Token',
        regex: /(?:api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{8,}['"]?/i,
        confidence: 0.90,
    },
    {
        id: 'generic_token_assignment',
        name: 'Token Assignment',
        regex: /(?:^|[&\s?])token\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{16,}['"]?/i,
        confidence: 0.88,
    },
    {
        id: 'env_secret',
        name: 'Environment Variable Secret Assignment',
        regex: /(?:^|\n|\s)(?:export\s+)?([A-Za-z0-9_]*(?:PASSWORD|PASSWD|SECRET|API_KEY|APIKEY|AUTH_TOKEN|PRIVATE_KEY|ACCESS_KEY|SECRET_KEY)[A-Za-z0-9_]*)\s*=\s*['"]?([^\s'"\n]{3,})/i,
        confidence: 0.88,
    },
    {
        id: 'password_manager_multiline',
        name: 'Password Manager Credential Format',
        regex: /(?:^|\n)\s*(?:Username|User|Login|Email):\s*.+\s*\n\s*(?:Password|Pass):\s*.+/i,
        confidence: 0.90,
    },
    {
        id: 'password_manager_field',
        name: 'Password Manager Field',
        regex: /(?:^|\n)\s*(?:Password|Master Password|Passphrase):\s*\S+/i,
        confidence: 0.88,
    },
    {
        id: 'otp_token',
        name: 'One-Time Password / 2FA Code',
        regex: /(?:^|\n)\s*(?:OTP|TOTP|Verification Code|Security Code|2FA Code):\s*\d{6,8}\b/i,
        confidence: 0.85,
    },
];

/**
 * Default list of known password manager app IDs to exclude.
 */
const KNOWN_EXCLUDED_APPS = [
    'org.keepassxc.KeePassXC',
    'org.gnome.seahorse.Application',
    'com.bitwarden.desktop',
    'org.gnome.Passwords',
    'org.gnome.World.Secrets',
];

export class PrivacyManager {
    /**
     * @param {Gio.Settings|null} [settings=null] Optional GSettings instance
     * @param {string|null} [dataDir=null] Path to extension data storage directory
     */
    constructor(settings = null, dataDir = null) {
        this._settings = settings;
        this._dataDir = dataDir;
        this._settingsChangedId = 0;

        this._excludedApps = new Set(KNOWN_EXCLUDED_APPS);

        this._loadSettings();
    }

    /**
     * Check if text looks like sensitive content.
     *
     * @param {string|null|undefined} text The text to inspect
     * @returns {{ isSensitive: boolean, reason: string, confidence: number }}
     */
    detectSensitive(text) {
        if (text === null || text === undefined || typeof text !== 'string') {
            return { isSensitive: false, reason: '', confidence: 0 };
        }

        const trimmed = text.trim();
        if (trimmed.length === 0) {
            return { isSensitive: false, reason: '', confidence: 0 };
        }

        let bestMatch = null;
        for (const pattern of SENSITIVE_PATTERNS) {
            if (pattern.regex.test(text)) {
                if (!bestMatch || pattern.confidence > bestMatch.confidence) {
                    bestMatch = {
                        isSensitive: true,
                        reason: pattern.name,
                        confidence: pattern.confidence,
                    };
                }
            }
        }

        return bestMatch || { isSensitive: false, reason: '', confidence: 0 };
    }

    /**
     * Check if an entry should be excluded based on source app.
     *
     * Note: Under Wayland, client isolation means source application detection
     * can be unreliable or unavailable. This method should be used in conjunction
     * with detectSensitive().
     *
     * @param {string|null|undefined} appId Application desktop ID or binary name
     * @returns {boolean} True if the app should be excluded from clipboard history
     */
    shouldExcludeApp(appId) {
        if (!appId || typeof appId !== 'string') {
            return false;
        }

        const cleaned = appId.trim();
        if (!cleaned) {
            return false;
        }

        // Normalize: strip trailing .desktop and lowercase
        const normalized = cleaned.replace(/\.desktop$/i, '').toLowerCase();

        for (const excluded of this._excludedApps) {
            if (!excluded || typeof excluded !== 'string') {
                continue;
            }
            const normExcluded = excluded.trim().replace(/\.desktop$/i, '').toLowerCase();
            if (!normExcluded) {
                continue;
            }

            if (normalized === normExcluded) {
                return true;
            }

            // Match base application name (e.g. 'keepassxc' matches 'org.keepassxc.KeePassXC')
            const lastSegment = normExcluded.split('.').pop();
            if (normalized === lastSegment || normalized.endsWith(`.${lastSegment}`)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Clean up entries older than the retention period.
     * Pinned entries are preserved regardless of age.
     *
     * @param {Array<object>} entries Array of clipboard entry objects
     * @param {number|null|undefined} retentionDays Maximum age in days. <= 0 or null retains all.
     * @returns {Array<object>} Filtered array of surviving entries
     */
    enforceRetention(entries, retentionDays) {
        if (!Array.isArray(entries)) {
            return [];
        }

        if (retentionDays === null || retentionDays === undefined) {
            return [...entries];
        }

        const days = Number(retentionDays);
        if (isNaN(days) || days <= 0) {
            return [...entries];
        }

        const now = Date.now();
        const cutoffMs = now - (days * 24 * 60 * 60 * 1000);

        return entries.filter(entry => {
            if (!entry || typeof entry !== 'object') {
                return false;
            }

            // Pinned entries are never auto-pruned
            if (entry.pinned === true || entry.isPinned === true) {
                return true;
            }

            // Extract timestamp from supported entry properties
            const rawTs = entry.timestamp ?? entry.createdAt ?? entry.time ?? entry.date;
            let entryTime = now;

            if (typeof rawTs === 'number') {
                // If timestamp is in seconds (< 10 billion), convert to milliseconds
                entryTime = rawTs < 10000000000 ? rawTs * 1000 : rawTs;
            } else if (rawTs instanceof Date) {
                entryTime = rawTs.getTime();
            } else if (typeof rawTs === 'string') {
                const parsed = Date.parse(rawTs);
                entryTime = isNaN(parsed) ? now : parsed;
            }

            return entryTime >= cutoffMs;
        });
    }

    /**
     * Delete all history data and associated cache files from disk.
     *
     * @param {string|Gio.File|null} [dataDir=null] Directory to clear. Defaults to this._dataDir.
     * @returns {boolean} True if clearing succeeded, false otherwise
     */
    clearAllData(dataDir = null) {
        const targetDir = dataDir || this._dataDir;
        if (!targetDir) {
            return false;
        }

        try {
            const dirFile = typeof targetDir === 'string'
                ? Gio.File.new_for_path(targetDir)
                : targetDir;

            if (!dirFile.query_exists(null)) {
                return true;
            }

            this._deleteDirectoryContents(dirFile, null);
            return true;
        } catch (error) {
            logError(error, `PrivacyManager: Failed to clear data directory ${targetDir}`);
            return false;
        }
    }

    /**
     * Set file or directory permissions to user-only access
     * (0o600 for files, 0o700 for directories).
     *
     * @param {string|Gio.File|null|undefined} filePath Path or Gio.File to secure
     * @returns {boolean} True on success, false on failure
     */
    hardenPermissions(filePath) {
        if (!filePath) {
            return false;
        }

        try {
            const path = typeof filePath === 'string'
                ? filePath
                : (filePath.get_path ? filePath.get_path() : null);

            if (!path || !GLib.file_test(path, GLib.FileTest.EXISTS)) {
                return false;
            }

            const isDir = GLib.file_test(path, GLib.FileTest.IS_DIR);
            const mode = isDir ? 0o700 : 0o600;
            const res = GLib.chmod(path, mode);
            return res === 0;
        } catch (error) {
            logError(error, `PrivacyManager: Failed to harden permissions for ${filePath}`);
            return false;
        }
    }

    /**
     * Clean up resources and disconnect listeners.
     */
    destroy() {
        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        this._settings = null;
        this._dataDir = null;
        this._excludedApps.clear();
    }

    /**
     * Recursively delete all children inside a directory while keeping the directory itself.
     *
     * @private
     * @param {Gio.File} dirFile Directory Gio.File
     * @param {Gio.Cancellable|null} cancellable Optional cancellable
     */
    _deleteDirectoryContents(dirFile, cancellable = null) {
        let enumerator = null;
        try {
            enumerator = dirFile.enumerate_children(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                cancellable
            );

            let fileInfo;
            while ((fileInfo = enumerator.next_file(cancellable)) !== null) {
                const child = dirFile.get_child(fileInfo.get_name());
                if (fileInfo.get_file_type() === Gio.FileType.DIRECTORY) {
                    this._deleteDirectoryContents(child, cancellable);
                    child.delete(cancellable);
                } else {
                    child.delete(cancellable);
                }
            }
        } finally {
            if (enumerator) {
                enumerator.close(cancellable);
            }
        }
    }

    /**
     * Load excluded apps from GSettings if available.
     * @private
     */
    _loadSettings() {
        if (!this._settings) {
            return;
        }

        try {
            const schema = this._settings.settings_schema;
            const keyName = 'excluded-apps';
            if (schema && schema.has_key(keyName)) {
                const customApps = this._settings.get_strv(keyName);
                for (const app of customApps) {
                    if (app) this._excludedApps.add(app);
                }

                this._settingsChangedId = this._settings.connect(`changed::${keyName}`, () => {
                    this._excludedApps = new Set(KNOWN_EXCLUDED_APPS);
                    const updated = this._settings.get_strv(keyName);
                    for (const app of updated) {
                        if (app) this._excludedApps.add(app);
                    }
                });
            }
        } catch {
            // Settings schema may not be installed or available in test environment
        }
    }
}
