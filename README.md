# Clipboard Indicator for GNOME

An advanced, production-quality **Clipboard Manager GNOME Shell Extension** with Wayland image caching, smart content classification, offline search, developer tools, and seamless Blur-my-Shell integration.

Works on **any Linux distribution running GNOME Desktop Environment** (GNOME 45, 46, 47, 48, 49, 50, 51+).

---

## Table of Contents

- [Features](#features)
- [System Requirements](#system-requirements)
- [Prerequisites by Linux Distribution](#prerequisites-by-linux-distribution)
  - [Ubuntu / Debian / Linux Mint / Pop!_OS](#1-ubuntu--debian--linux-mint--pop_os)
  - [Fedora / RHEL / CentOS Stream / Rocky Linux](#2-fedora--rhel--centos-stream--rocky-linux)
  - [openSUSE (Tumbleweed & Leap)](#3-opensuse-tumbleweed--leap)
  - [Arch Linux / Manjaro / EndeavourOS](#4-arch-linux--manjaro--endeavouros)
  - [Alpine Linux](#5-alpine-linux)
  - [Gentoo Linux](#6-gentoo-linux)
  - [Void Linux](#7-void-linux)
  - [NixOS](#8-nixos)
- [Installation Guide](#installation-guide)
  - [Method 1: Quick Install (Recommended)](#method-1-quick-install-recommended)
  - [Method 2: Manual Install from Source](#method-2-manual-install-from-source)
- [Enabling the Extension](#enabling-the-extension)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Preferences & Customization](#preferences--customization)
- [Running Automated Tests](#running-automated-tests)
- [Troubleshooting & FAQ](#troubleshooting--faq)
- [Uninstallation](#uninstallation)
- [License](#license)

---

## Features

- **Native Wayland & X11 Image Support**: Directly captures, previews, caches, and restores bitmap images (`PNG`, `JPEG`, etc.) using Mutter's `Meta.Selection` and `Meta.SelectionSourceMemory` APIs. Restored images paste into applications (GIMP, LibreOffice, Telegram, browser, Discord) as real bitmap data.
- **Event-Driven Architecture (Zero Polling)**: Listens to Mutter's native `owner-changed` signal. No aggressive background polling, no high CPU usage, and zero battery drain.
- **Smart Content Detection**: Automatically badges plain text, multiline text, URLs, email addresses, shell commands, source code (Python, JavaScript, Java, C++, Go, Rust, etc.), JSON, XML, YAML, UUIDs, IP addresses, and hashes with context-sensitive quick actions.
- **Pinning & Retention**: Pin important entries or snippets. Pinned entries survive history limit truncation, retention expirations, and manual "Clear History" actions.
- **Fast Local Search & Filters**: Real-time debounced search across text, metadata, URL hostnames, and OCR text. Filter chips for `All`, `Text`, `Links`, `Images`, and `Pinned`.
- **Developer Utilities**: Context-aware transformations: JSON formatting/minification, XML formatting, URL encode/decode, Base64 encode/decode with full Unicode/emoji support, whitespace normalization, and URL query parameter stripping.
- **Diff & Similarity Engine**: Built-in line-by-line diffing via Longest Common Subsequence (LCS) and similarity scoring to find near-duplicate clipboard entries.
- **Collections & Reusable Snippets**: Organize canned responses, terminal one-liners, and code blocks into named collections with JSON export and import.
- **Optional Offline OCR**: Image text recognition via Tesseract (`tesseract` CLI). Extracted text is indexed for search while preserving the original image.
- **Blur-my-Shell & Frosted Glass**: Built-in compatibility with the Blur-my-Shell extension with sleek dark mode styling, translucent surfaces, and no outer drop shadows.
- **Interactive Shortcut Recorder**: Interactive keyboard shortcut recording modal (supporting custom key combinations, `Backspace` to clear, and `Escape` to cancel).
- **Privacy & Security First**:
  - Local disk storage only in standard XDG directories (`~/.local/share/clipboard-indicator/`).
  - Hardened file permissions (`0600`).
  - Sensitive data heuristics for AWS keys, private SSH keys, tokens, and embedded credentials.
  - Known password manager exclusion checks (KeePassXC, Bitwarden, 1Password, GNOME Secrets).
  - One-click pause/resume monitoring and purge options.

---

## System Requirements

- **Desktop Environment**: GNOME Shell (Wayland or X11)
- **GJS**: 1.74+ (GNOME JavaScript runtime, standard on all modern GNOME systems)
- **GLib / GSettings Tools**: `glib-compile-schemas` (provided by `glib2` / `libglib2.0-bin`)

---

## Prerequisites by Linux Distribution

Before installing the extension, make sure your distribution has the required GNOME extension management tools installed.

### 1. Ubuntu / Debian / Linux Mint / Pop!_OS

```bash
# Core tools
sudo apt update
sudo apt install -y gnome-shell-extension-prefs gnome-shell-extensions libglib2.0-bin git

# Optional Wayland clipboard tool & Tesseract OCR:
sudo apt install -y wl-clipboard tesseract-ocr tesseract-ocr-eng
```

### 2. Fedora / RHEL / CentOS Stream / Rocky Linux

```bash
# Core tools
sudo dnf install -y gnome-extensions-app glib2-devel git

# Optional Wayland clipboard tool & Tesseract OCR:
sudo dnf install -y wl-clipboard tesseract tesseract-langpack-eng
```

### 3. openSUSE (Tumbleweed & Leap)

```bash
# Core tools
sudo zypper refresh
sudo zypper install -y gnome-shell-extension-prefs glib2-tools git

# Optional Wayland clipboard tool & Tesseract OCR:
sudo zypper install -y wl-clipboard tesseract-ocr tesseract-ocr-traineddata-english
```

### 4. Arch Linux / Manjaro / EndeavourOS

```bash
# Core tools
sudo pacman -S --needed gnome-shell gnome-shell-extensions glib2 git

# Optional Wayland clipboard tool & Tesseract OCR:
sudo pacman -S --needed wl-clipboard tesseract tesseract-data-eng
```

### 5. Alpine Linux

```bash
# Core tools (running GNOME)
sudo apk update
sudo apk add glib-dev git

# Optional Wayland clipboard tool & Tesseract OCR:
sudo apk add wl-clipboard tesseract-ocr tesseract-ocr-data-eng
```

### 6. Gentoo Linux

```bash
# Core tools
sudo emerge --ask dev-libs/glib dev-vcs/git

# Optional Wayland clipboard tool & Tesseract OCR:
sudo emerge --ask gui-apps/wl-clipboard app-text/tesseract
```

### 7. Void Linux

```bash
# Core tools
sudo xbps-install -S glib-devel git

# Optional Wayland clipboard tool & Tesseract OCR:
sudo xbps-install -S wl-clipboard tesseract-ocr
```

### 8. NixOS

Add the following to your `configuration.nix` or home-manager:
```nix
environment.systemPackages = with pkgs; [
  gnome-extension-manager
  glib
  wl-clipboard
  tesseract
];
```

---

## Installation Guide

### Method 1: Quick Install (Recommended)

Run this one-line command in your terminal on any Linux distribution:

```bash
git clone https://github.com/sureshsoudararajan/clipboard-indicator.git /tmp/clipboard-indicator && \
mkdir -p "$HOME/.local/share/gnome-shell/extensions/clipboard-indicator@suresh" && \
cp -r /tmp/clipboard-indicator/{metadata.json,extension.js,prefs.js,stylesheet.css,schemas,src} \
  "$HOME/.local/share/gnome-shell/extensions/clipboard-indicator@suresh/" && \
glib-compile-schemas "$HOME/.local/share/gnome-shell/extensions/clipboard-indicator@suresh/schemas/" && \
rm -rf /tmp/clipboard-indicator && \
echo "Installation complete!"
```

---

### Method 2: Manual Install from Source

#### Step 1: Clone or Download the Repository
```bash
git clone https://github.com/sureshsoudararajan/clipboard-indicator.git
cd clipboard-indicator
```

#### Step 2: Create Extension Directory and Copy Files
```bash
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/clipboard-indicator@suresh"
mkdir -p "$EXT_DIR"

cp -r metadata.json extension.js prefs.js stylesheet.css schemas src "$EXT_DIR/"
```

#### Step 3: Compile GSettings Schemas
```bash
glib-compile-schemas "$EXT_DIR/schemas/"
```

---

## Enabling the Extension

### Wayland Sessions (Default on Ubuntu, Fedora, Debian, Arch, openSUSE)
Under Wayland, GNOME Shell cannot restart in-place. You must **log out and log back in** once so GNOME Shell discovers the new extension.

After logging back in, enable the extension:
```bash
gnome-extensions enable clipboard-indicator@suresh
```

Or open the graphical **Extensions** app (or `gnome-extensions-app`) and toggle on **Clipboard Indicator**.

### X11 Sessions
If you are running GNOME on X11:
1. Press `Alt + F2`.
2. Type `r` and press `Enter` to restart GNOME Shell.
3. Enable the extension:
   ```bash
   gnome-extensions enable clipboard-indicator@suresh
   ```

---

## Keyboard Shortcuts

| Shortcut | Action | Notes |
|---|---|---|
| `Super + V` | Open / Close Clipboard Menu | Opens popup and immediately focuses the search field |
| `Down` / `Up` | Navigate history items | Moves selection through entries |
| `Enter` / `Return` | Copy & paste selected entry | Restores to clipboard and bumps to top of history |
| `Delete` | Delete selected entry | Permanently deletes the focused entry |
| `Escape` | Clear search / Close popup | If search text is present, clears text; otherwise closes menu |

Shortcuts can be customized in the extension Preferences (`Preferences > Shortcuts`).

---

## Preferences & Customization

Open preferences via terminal:
```bash
gnome-extensions prefs clipboard-indicator@suresh
```
Or right-click the Clipboard Indicator icon on your top bar and click **Preferences**.

### Available Options:
- **General**:
  - Maximum History Size (10 – 500 items).
  - Show Relative Timestamps (dynamically toggles timestamps on cards).
  - Auto-close popup after copying.
  - History deduplication & notification control.
  - Maximum Popup Height in pixels (dynamic resizing).
- **Appearance**:
  - Layout density (`Compact`, `Comfortable`).
  - Text preview lines (1 – 5 lines).
  - Show item count badge on panel indicator.
  - Native sleek dark mode interface by default.
- **Shortcuts**:
  - Interactive **Set Shortcut** button with key-recorder dialog.
  - `Backspace` to clear shortcut, `Escape` to cancel.
- **Privacy & Retention**:
  - History persistence across reboots.
  - Auto-retention days (1 – 365 days).
  - Save copied images to disk toggle.
  - Sensitive data pattern detection (AWS tokens, private keys, passwords).
  - Exclude clipboard updates from password managers.
- **Advanced**:
  - Developer utilities panel toggle.
  - Collections and canned snippets manager.
  - Offline image OCR text search.

---

## Running Automated Tests

The repository includes a comprehensive, standalone test suite run via `gjs`:

```bash
cd /path/to/clipboard-indicator
gjs -m tests/run_all_tests.js
```

### Test Suites Included:
- `test_contentDetector.js`: Tests classification for URLs, emails, JSON, shell scripts, Python/Java/Rust code, UUIDs, IP addresses, and Tamil/Unicode text.
- `test_search.js`: Real-time fuzzy search, metadata filtering, and pinned filters.
- `test_privacy.js`: AWS credentials, private keys, GitHub tokens, and password manager heuristics.
- `test_devTools.js`: JSON formatter/validator, URL encode/decode, Base64 with Unicode, whitespace cleaner.
- `test_diffEngine.js`: Longest Common Subsequence line diff and near-duplicate scoring.
- `test_collections.js`: Snippet management, JSON import and export.
- `test_historyStore.js`: Deduplication, persistence, LRU bumping, and disk recovery.

---

## Troubleshooting & FAQ

### 1. The extension does not appear after installation
Ensure you have compiled the schemas:
```bash
glib-compile-schemas ~/.local/share/gnome-shell/extensions/clipboard-indicator@suresh/schemas/
```
Then log out of your GNOME session and log back in. Check extension status:
```bash
gnome-extensions info clipboard-indicator@suresh
```

### 2. Can I use this with Blur-my-Shell?
Yes! The extension is specifically designed to work seamlessly with the **Blur-my-Shell** extension with sleek dark mode aesthetics, frosted glass transparency, and no drop shadows.

### 3. How do I clear or reset all stored clipboard history?
Click the trash icon in the popup header, or manually delete the storage folder:
```bash
rm -rf ~/.local/share/clipboard-indicator
```

---

## Uninstallation

```bash
# 1. Disable the extension
gnome-extensions disable clipboard-indicator@suresh

# 2. Remove extension files
rm -rf "$HOME/.local/share/gnome-shell/extensions/clipboard-indicator@suresh"

# 3. (Optional) Remove stored clipboard history and cached images
rm -rf "$HOME/.local/share/clipboard-indicator"
```

---

## License

Distributed under the **GNU General Public License v2.0 or later** (GPL-2.0-or-later). See [LICENSE](LICENSE) for details.
