# Integration Verification Checklist: Clipboard Indicator for GNOME 51

This checklist covers live session integration verification steps under GNOME 51 on Wayland (Arch Linux).

---

## 1. Extension Loading & Panel Indicator
- [x] Extension directory matches UUID: `~/.local/share/gnome-shell/extensions/clipboard-indicator@suresh`
- [x] GSettings schema compiled in `schemas/gschemas.compiled`
- [ ] Enable extension: `gnome-extensions enable clipboard-indicator@suresh`
- [ ] Confirm no fatal errors in system log: `journalctl -f /usr/bin/gnome-shell`
- [ ] Confirm clipboard icon (`edit-paste-symbolic`) appears in the GNOME top bar.

---

## 2. Text & Multiline Clipboard Operations
- [ ] Copy a short text string (e.g. `GNOME 51`).
  - Open popup (click indicator or press `Super+V`).
  - Verify the entry appears at the top of the history list with a text icon.
- [ ] Copy multiline text with indentations.
  - Verify preview shows limited lines with ellipsis without corrupting stored text.
  - Select entry (press `Enter` or click).
  - Paste into a text editor; verify newlines and whitespace are preserved exactly.
- [ ] Copy Tamil Unicode and emoji text: `வணக்கம் உலகம்! 🚀✨`.
  - Verify characters render crisply in the card preview.
  - Paste into terminal/editor to verify UTF-8 integrity.

---

## 3. URL and Link Handling
- [ ] Copy a URL: `https://archlinux.org/packages/?q=gnome`.
  - Verify the entry is badged with `URL` and shows domain `archlinux.org`.
  - Confirm no network requests are made automatically.
  - Verify the copy-link action restores the full original URL.

---

## 4. Image Clipboard Operations (Wayland / Mutter Selection)
- [ ] Take a screenshot with GNOME Shell's built-in screenshot tool (`PrintScreen` -> Copy to clipboard).
  - Open clipboard popup.
  - Verify an image entry card is created with a thumbnail preview.
  - Verify image dimensions (e.g. `1920×1080`), format (`PNG`), and size are shown in metadata badge.
  - Click or press Enter to restore image to clipboard.
  - Paste image into GIMP, Telegram, LibreOffice, or browser; verify image data pastes as a bitmap, not as text or a filename.

---

## 5. Pinning & History Clearing
- [ ] Click the pin icon on an entry.
  - Verify the pin turns gold/highlighted.
  - Click the Trash icon in header to trigger the clear confirmation.
  - Confirm "Clear".
  - Verify all unpinned entries are deleted, while the pinned entry remains.
- [ ] Toggle filter button "Pinned".
  - Verify only pinned items are shown.

---

## 6. Search & Filtering
- [ ] Type a keyword into the search bar.
  - Verify search results update responsively without lag.
  - Verify searching by URL domain finds the corresponding URL.
- [ ] Click "Clear Search" (`edit-clear-symbolic`) button.
  - Verify full history returns.
- [ ] Switch between filter chips (`All`, `Text`, `Links`, `Images`, `Pinned`).
  - Verify list filters accordingly.

---

## 7. Keyboard Navigation
- [ ] Press `Super+V`: verify popup toggles open and closed.
- [ ] When popup is open:
  - Press `Down` and `Up` arrows: verify visual selection moves up and down cards.
  - Press `Enter`: verify selected entry is copied and popup closes (if close-after-copy enabled).
  - Press `Escape`: verify popup closes.
  - Press `Ctrl+F`: verify search bar is focused.
  - Press `Delete`: verify selected entry is deleted.

---

## 8. Theme Modes & Density
- [ ] Open Preferences: `gnome-extensions prefs clipboard-indicator@suresh`
- [ ] Switch Color Scheme to "Light Theme": verify popup background becomes light.
- [ ] Switch Color Scheme to "Dark Theme": verify dark background.
- [ ] Switch Display Density to "Comfortable": verify card padding enlarges.
- [ ] Switch Display Density to "Compact": verify compact card layout.

---

## 9. Privacy & Exclusions
- [ ] Copy an API token or credentials pattern (`AKIAIOSFODNN7EXAMPLE` or `ghp_...`).
  - Verify sensitive content heuristic activates.
- [ ] Toggle "Enable Clipboard Monitoring" in preferences or header pause button.
  - Copy new text while paused; verify it is not captured.
  - Resume monitoring; verify subsequent copies are captured.

---

## 10. Persistence & Clean Lifecycle
- [ ] Copy several items and pin at least one.
- [ ] Restart GNOME Shell (or log out/in):
  - Check that history list and pinned entries are intact from `~/.local/share/clipboard-indicator/history.json`.
- [ ] Disable extension: `gnome-extensions disable clipboard-indicator@suresh`
  - Verify top panel icon is removed cleanly.
  - Verify no background timers or listeners remain in `journalctl`.
- [ ] Re-enable extension:
  - Verify it resumes normal operation immediately.
