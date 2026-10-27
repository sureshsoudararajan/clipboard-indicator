// SPDX-License-Identifier: GPL-2.0-or-later
// Image Handler — Image storage, thumbnail generation, and OCR

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';

// Promisify async operations
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');

/**
 * ImageHandler manages image storage, thumbnails, and optional OCR.
 * Images are stored as files in the data directory.
 * Thumbnails are generated using GdkPixbuf for display in the popup.
 */
export class ImageHandler {
    /**
     * @param {string|Gio.Settings} arg1 - Base data directory or settings
     * @param {Gio.Settings|Object} [arg2={}] - Extension settings or options
     */
    constructor(arg1, arg2 = {}) {
        let dataDir;
        if (typeof arg1 === 'string') {
            dataDir = arg1;
            this._settings = arg2;
        } else {
            this._settings = arg1;
            dataDir = arg2.dataDir || GLib.build_filenamev([GLib.get_user_data_dir(), 'clipboard-indicator']);
        }

        this._imagesDir = (arg2 && arg2.imagesDir) || GLib.build_filenamev([dataDir, 'images']);
        this._thumbnailsDir = GLib.build_filenamev([dataDir, 'thumbnails']);
        this._activeCancellables = new Set();

        // Ensure directories exist
        GLib.mkdir_with_parents(this._imagesDir, 0o755);
        GLib.mkdir_with_parents(this._thumbnailsDir, 0o755);
    }

    /**
     * Store image data to disk.
     * @param {string} id - Unique entry ID
     * @param {GLib.Bytes} bytes - Raw image data
     * @param {string} mimeType - MIME type (image/png, image/jpeg, etc.)
     * @returns {{ imagePath: string, thumbnailPath: string, width: number, height: number, format: string, size: number }|null}
     */
    storeImage(id, bytes, mimeType) {
        try {
            const ext = this._getExtension(mimeType);
            const imagePath = GLib.build_filenamev([this._imagesDir, `${id}.${ext}`]);

            // Write image data to file
            const file = Gio.File.new_for_path(imagePath);
            const data = bytes.get_data();

            if (!data || data.length === 0) {
                console.error('[ImageHandler] Empty image data');
                return null;
            }

            file.replace_contents(
                data,
                null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );

            // Harden file permissions (user-only read/write)
            try {
                GLib.chmod(imagePath, 0o600);
            } catch (_e) {
                // chmod may not be available in all environments
            }

            // Get image dimensions
            const pixbuf = GdkPixbuf.Pixbuf.new_from_file(imagePath);
            const width = pixbuf.get_width();
            const height = pixbuf.get_height();

            // Generate thumbnail
            const thumbnailPath = this._generateThumbnail(id, pixbuf, ext);

            return {
                imagePath,
                thumbnailPath,
                width,
                height,
                format: ext.toUpperCase(),
                size: data.length,
            };
        } catch (e) {
            console.error(`[ImageHandler] Error storing image ${id}:`, e);
            return null;
        }
    }

    /**
     * Generate a thumbnail from a pixbuf.
     * @param {string} id - Entry ID
     * @param {GdkPixbuf.Pixbuf} pixbuf - Source image
     * @param {string} ext - File extension
     * @returns {string|null} Thumbnail file path
     */
    _generateThumbnail(id, pixbuf, ext) {
        try {
            const maxSize = 128; // thumbnail max dimension
            const width = pixbuf.get_width();
            const height = pixbuf.get_height();

            let thumbPixbuf;
            if (width > maxSize || height > maxSize) {
                const scale = Math.min(maxSize / width, maxSize / height);
                const newWidth = Math.round(width * scale);
                const newHeight = Math.round(height * scale);
                thumbPixbuf = pixbuf.scale_simple(
                    newWidth, newHeight,
                    GdkPixbuf.InterpType.BILINEAR
                );
            } else {
                thumbPixbuf = pixbuf;
            }

            const thumbnailPath = GLib.build_filenamev([
                this._thumbnailsDir, `${id}_thumb.png`,
            ]);

            thumbPixbuf.savev(thumbnailPath, 'png', [], []);

            try {
                GLib.chmod(thumbnailPath, 0o600);
            } catch (_e) {
                // Ignore
            }

            return thumbnailPath;
        } catch (e) {
            console.error(`[ImageHandler] Error generating thumbnail for ${id}:`, e);
            return null;
        }
    }

    /**
     * Load image bytes from disk.
     * @param {string} imagePath - Path to image file
     * @returns {GLib.Bytes|null}
     */
    loadImageBytes(imagePath) {
        try {
            const file = Gio.File.new_for_path(imagePath);
            if (!file.query_exists(null))
                return null;

            const [success, contents] = file.load_contents(null);
            if (!success)
                return null;

            return new GLib.Bytes(contents);
        } catch (e) {
            console.error(`[ImageHandler] Error loading image ${imagePath}:`, e);
            return null;
        }
    }

    /**
     * Load a thumbnail pixbuf for display.
     * @param {string} thumbnailPath - Path to thumbnail file
     * @returns {GdkPixbuf.Pixbuf|null}
     */
    loadThumbnailPixbuf(thumbnailPath) {
        try {
            if (!thumbnailPath || !GLib.file_test(thumbnailPath, GLib.FileTest.EXISTS))
                return null;
            return GdkPixbuf.Pixbuf.new_from_file(thumbnailPath);
        } catch (e) {
            console.error(`[ImageHandler] Error loading thumbnail:`, e);
            return null;
        }
    }

    /**
     * Delete an image and its thumbnail from disk.
     * @param {string} imagePath - Path to original image
     * @param {string} thumbnailPath - Path to thumbnail
     */
    deleteImage(imagePath, thumbnailPath) {
        this._deleteFile(imagePath);
        this._deleteFile(thumbnailPath);
    }

    /**
     * Safely delete a file.
     */
    _deleteFile(filePath) {
        if (!filePath)
            return;
        try {
            const file = Gio.File.new_for_path(filePath);
            if (file.query_exists(null))
                file.delete(null);
        } catch (e) {
            console.error(`[ImageHandler] Error deleting ${filePath}:`, e);
        }
    }

    /**
     * Clean up orphaned image/thumbnail files not referenced by any entry.
     * @param {Set<string>} validIds - Set of valid entry IDs
     */
    cleanupOrphans(validIds) {
        this._cleanupDir(this._imagesDir, validIds);
        this._cleanupDir(this._thumbnailsDir, validIds);
    }

    /**
     * Clean up files in a directory whose names don't match valid IDs.
     */
    _cleanupDir(dirPath, validIds) {
        try {
            const dir = Gio.File.new_for_path(dirPath);
            if (!dir.query_exists(null))
                return;

            const enumerator = dir.enumerate_children(
                'standard::name',
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                const name = info.get_name();
                const id = name.replace(/(_thumb)?\.[^.]+$/, '');
                if (!validIds.has(id)) {
                    const file = dir.get_child(name);
                    try {
                        file.delete(null);
                    } catch (_e) {
                        // Ignore deletion errors
                    }
                }
            }
            enumerator.close(null);
        } catch (e) {
            console.error(`[ImageHandler] Error cleaning up ${dirPath}:`, e);
        }
    }

    /**
     * Calculate total storage used by images.
     * @returns {{ totalBytes: number, imageCount: number }}
     */
    getStorageStats() {
        let totalBytes = 0;
        let imageCount = 0;

        try {
            const dir = Gio.File.new_for_path(this._imagesDir);
            if (!dir.query_exists(null))
                return { totalBytes, imageCount };

            const enumerator = dir.enumerate_children(
                'standard::size',
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                totalBytes += info.get_size();
                imageCount++;
            }
            enumerator.close(null);
        } catch (e) {
            console.error('[ImageHandler] Error calculating storage:', e);
        }

        return { totalBytes, imageCount };
    }

    /**
     * Run OCR on an image file using Tesseract (if available).
     * @param {string} imagePath - Path to image file
     * @param {Gio.Cancellable|null} cancellable - Optional cancellable
     * @returns {Promise<string|null>} Extracted text or null
     */
    async runOCR(imagePath, cancellable = null) {
        if (!this._settings?.get_boolean('enable-ocr'))
            return null;

        const tesseractPath = GLib.find_program_in_path('tesseract');
        if (!tesseractPath) {
            return null;
        }

        if (!GLib.file_test(imagePath, GLib.FileTest.EXISTS))
            return null;

        try {
            const subprocess = new Gio.Subprocess({
                argv: ['tesseract', imagePath, 'stdout', '-l', 'eng'],
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            });
            subprocess.init(cancellable);

            const [stdout, _stderr] = await subprocess.communicate_utf8_async(
                null, cancellable
            );

            if (subprocess.get_successful() && stdout) {
                const text = stdout.trim();
                return text.length > 0 ? text : null;
            }

            return null;
        } catch (e) {
            if (e.matches && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return null;
            console.error('[ImageHandler] OCR error:', e);
            return null;
        }
    }

    _getExtension(mimeType) {
        const map = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/bmp': 'bmp',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'image/tiff': 'tiff',
            'image/svg+xml': 'svg',
        };
        return map[mimeType] || 'png';
    }

    getMimeType(ext) {
        const map = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'bmp': 'image/bmp',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'tiff': 'image/tiff',
            'svg': 'image/svg+xml',
        };
        return map[ext?.toLowerCase()] || 'image/png';
    }

    destroy() {
        for (const c of this._activeCancellables)
            c.cancel();
        this._activeCancellables.clear();
        this._settings = null;
    }
}

export default ImageHandler;
