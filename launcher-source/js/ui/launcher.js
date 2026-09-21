// SPDX-License-Identifier: GPL-2.0-or-later

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as AppDisplay from './appDisplay.js';
import * as Layout from './layout.js';
import * as Main from './main.js';
import * as Search from './search.js';
import * as SystemActions from '../misc/systemActions.js';

// AppSearchProvider normally supplies AppIcons which activate the overview.
// Keep its discovery/ranking/parental controls, but activate plain list rows.
function createAppProvider(getMode) {
    const provider = new AppDisplay.AppSearchProvider();
    const getInitialResultSet = provider.getInitialResultSet.bind(provider);
    provider.getInitialResultSet = async (terms, cancellable) => {
        const mode = getMode();
        const results = await getInitialResultSet(terms, cancellable);
        return mode === 'apps'
            ? results.filter(id => id.endsWith('.desktop')) : results;
    };
    provider.activateResult = id => {
        if (id.endsWith('.desktop'))
            Shell.AppSystem.get_default().lookup_app(id)?.activate();
        else
            SystemActions.getDefault().activateAction(id);
    };
    return provider;
}

const LauncherResults = GObject.registerClass(
class LauncherResults extends Search.SearchResultsView {
    async _updateResults(provider, terms, results) {
        await super._updateResults(provider, terms, results);

        // Handle keys on each focus target before St.Button's default handler.
        this._keyTargets ??= new WeakSet();
        for (const row of Object.values(provider.display._resultDisplays)) {
            if (this._keyTargets.has(row))
                continue;
            row.connectObject('key-press-event',
                (actor, event) => this.onKeyPress(actor, event), this);
            this._keyTargets.add(row);
        }
    }

    async _doProviderSearch(provider, previousResults) {
        const enabled = this.mode === 'apps'
            ? provider.id === 'applications'
            : this.mode === 'settings'
                ? provider.appInfo?.get_id() === 'org.gnome.Settings.desktop'
                : true;
        if (enabled)
            return super._doProviderSearch(provider, previousResults);

        provider.searchInProgress = false;
        this._results[provider.id] = [];
        await this._updateResults(provider, this._terms, []);
    }
});

export const Launcher = GObject.registerClass(
class Launcher extends St.Widget {
    _init() {
        super._init({
            visible: false,
        });
        this._monitor = new Layout.MonitorConstraint({work_area: true});
        this.add_constraint(this._monitor);
        Main.uiGroup.add_child(this);

        this._panel = new St.BoxLayout({
            style_class: 'launcher modal-dialog',
            accessible_role: Atk.Role.DIALOG,
            accessible_name: _('Launch'),
            orientation: Clutter.Orientation.VERTICAL,
            reactive: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
        });
        this.add_child(this._panel);
        this._entry = new St.Entry({
            style_class: 'search-entry',
            hint_text: _('Launch'),
            can_focus: true,
            x_expand: true,
        });
        this._entry.set_primary_icon(new St.Icon({
            icon_name: 'edit-find-symbolic',
            style_class: 'search-entry-icon',
        }));
        this._panel.add_child(this._entry);
        this._results = new LauncherResults({
            appProvider: createAppProvider(() => this._results.mode),
            listResults: true,
            onActivated: () => this.close(),
        });
        this._panel.add_child(this._results);
        this._results.onKeyPress = this._onKeyPress.bind(this);
        this._entry.clutter_text.connect('key-press-event',
            this._onKeyPress.bind(this));
        this._panel.connect('key-press-event', this._onKeyPress.bind(this));
        this._entry.clutter_text.connect('text-changed', () => {
            let query = this._entry.text.trim();
            const mode = query.startsWith('.') ? 'apps'
                : query.startsWith('$') ? 'settings' : 'all';
            if (mode !== 'all')
                query = query.slice(1).trim();
            if (mode !== this._results.mode) {
                this._results.setTerms([]);
                this._results.mode = mode;
            }
            this._results.setTerms(query ? query.split(/\s+/) : []);
            this._results.visible = query.length > 0;
        });
        this._entry.clutter_text.connect('key-focus-in',
            () => this._results.highlightDefault(true));
        this._entry.clutter_text.connect('key-focus-out',
            () => this._results.highlightDefault(false));
        global.focus_manager.add_group(this._panel);

        // Observe outside presses without competing with panel click gestures.
        this._outsideClick = new Clutter.ClickGesture({recognize_on_press: true});
        this._outsideClick.connect('may-recognize', () => {
            const event = this._outsideClick.get_point_event(0);
            const target = global.stage.get_event_actor(event);
            if (!this._panel.contains(target) &&
                !Main.layoutManager.keyboardBox.contains(target))
                this.close();
            return false;
        });
        Main.overview.connectObject('showing', () => this.close(), this);
        Main.sessionMode.connectObject('updated', () => this.close(), this);
        Main.layoutManager.connectObject('monitors-changed', () => this.close(), this);
        global.display.connectObject('notify::focus-window', () => this.close(), this);
        global.workspace_manager.connectObject('active-workspace-changed',
            () => this.close(), this);
        this.connect('destroy', () => this.close());
    }

    toggle() {
        if (this.visible || this._pendingOpen || this._openLaterId)
            this.close();
        else
            this.open();
    }

    open() {
        if (this.visible || this._pendingOpen || this._openLaterId || !Main.sessionMode.hasOverview ||
            Main.sessionMode.isLocked ||
            !(Main.actionMode & (Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW)))
            return;

        // Wait until overview has released its grab before taking ours.
        if (Main.overview.visible) {
            this._pendingOpen = Main.overview.connect('hidden', () => {
                Main.overview.disconnect(this._pendingOpen);
                this._pendingOpen = 0;
                // Overview emits hidden before _syncGrab() releases input.
                this._openLaterId = GLib.idle_add_once(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    this._openLaterId = 0;
                    this.open();
                });
            });
            Main.overview.hide();
            return;
        }
        if (Main.modalCount > 0)
            return;

        this._entry.text = '';
        this._results.setTerms([]);
        this._results.hide();
        this._monitor.index = global.display.get_current_monitor();
        this.show();
        try {
            // NORMAL keeps Mutter's built-in and Shell's Super shortcuts.
            // uiGroup also leaves Shell actors such as the panel usable.
            this._grab = Main.pushModal(Main.uiGroup, {actionMode: Shell.ActionMode.NORMAL});
            global.stage.add_action_full(
                'launcher-outside-click', Clutter.EventPhase.CAPTURE, this._outsideClick);
            this._clickAttached = true;
            this._entry.clutter_text.grab_key_focus();
        } catch (error) {
            this.close();
            console.error(error);
        }
    }

    close() {
        if (this._openLaterId) {
            GLib.source_remove(this._openLaterId);
            this._openLaterId = 0;
        }
        if (this._pendingOpen) {
            Main.overview.disconnect(this._pendingOpen);
            this._pendingOpen = 0;
        }
        // Release input before resetting search or hiding any actors.
        if (this._grab) {
            const grab = this._grab;
            this._grab = null;
            Main.popModal(grab);
        }
        if (this._clickAttached) {
            global.stage.remove_action(this._outsideClick);
            this._clickAttached = false;
        }
        this.hide();
        this._entry.text = '';
        this._results.setTerms([]);
    }

    vfunc_allocate(box) {
        this.set_allocation(box);
        const width = Math.min(box.get_width(), this._panel.get_preferred_width(-1)[1]);
        const top = Math.round(box.get_height() * 0.2);
        const height = Math.min(box.get_height() - top, this._panel.get_preferred_height(width)[1]);
        const panelBox = new Clutter.ActorBox();
        panelBox.set_origin((box.get_width() - width) / 2, top);
        panelBox.set_size(width, height);
        this._panel.allocate(panelBox);
    }

    _getResultRows() {
        const rows = [];
        const collect = actor => {
            if (!actor.visible)
                return;
            if (actor instanceof Search.ListSearchResult)
                rows.push(actor);
            else
                actor.get_children().forEach(collect);
        };
        collect(this._results);
        return rows;
    }

    _onKeyPress(_actor, event) {
        if (!this.visible)
            return Clutter.EVENT_PROPAGATE;
        const symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Escape) {
            this.close();
            return Clutter.EVENT_STOP;
        }
        if (event.get_state() & (Clutter.ModifierType.CONTROL_MASK |
            Clutter.ModifierType.MOD1_MASK | Clutter.ModifierType.SUPER_MASK))
            return Clutter.EVENT_PROPAGATE;

        const focus = global.stage.key_focus;
        if (!focus || !this._panel.contains(focus))
            return Clutter.EVENT_PROPAGATE;
        const inEntry = focus && this._entry.contains(focus);
        if (symbol === Clutter.KEY_Down || symbol === Clutter.KEY_Up) {
            const rows = this._getResultRows();
            if (rows.length === 0)
                return Clutter.EVENT_STOP;
            // The first row is already selected while typing in the entry.
            const current = inEntry ? 0 : rows.findIndex(row => row.contains(focus));
            const next = current < 0 ? 0 : Math.max(0, Math.min(rows.length - 1,
                current + (symbol === Clutter.KEY_Down ? 1 : -1)));
            rows[next].grab_key_focus();
            return Clutter.EVENT_STOP;
        }
        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter ||
            symbol === Clutter.KEY_ISO_Enter) {
            if (inEntry) {
                this._results.activateDefault();
                return Clutter.EVENT_STOP;
            }
            const selected = this._getResultRows().find(row => row.contains(focus));
            if (selected) {
                selected.activate();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }
        if (!inEntry && (symbol === Clutter.KEY_BackSpace ||
            Clutter.keysym_to_unicode(symbol) >= 0x20)) {
            this._entry.grab_key_focus();
            this._entry.clutter_text.event(event, false);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }
});
