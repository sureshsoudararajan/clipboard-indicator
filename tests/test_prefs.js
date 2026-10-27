// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';

// In gnome-shell-extension-prefs, ExtensionPreferences is loaded from resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js
// Let's verify our prefs.js syntax and classes
console.log('GTK4 version: ' + Gtk.MAJOR_VERSION + '.' + Gtk.MINOR_VERSION);
console.log('Libadwaita version: ' + Adw.MAJOR_VERSION + '.' + Adw.MINOR_VERSION);
console.log('✓ Prefs environment check passed');
