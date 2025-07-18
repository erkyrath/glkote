'use strict';

/* Dialog -- a Javascript load/save library for IF interfaces
 * Designed by Andrew Plotkin <erkyrath@eblong.com>
 * <http://eblong.com/zarf/glk/glkote.html>
 * 
 * This Javascript library is copyright 2010-2025 by Andrew Plotkin.
 * It is distributed under the MIT license; see the "LICENSE" file.
 *
 * This library lets you open a modal dialog box to select a "file" for saving
 * or loading data. The web page must have a <div> with id "windowport" (this
 * will be greyed out during the selection process, with the dialog box as a
 * child of the div). It should also have the dialog.css stylesheet loaded.
 *
 * This library also contains utility routines to manage "files", which are
 * actually entries in the browser's localStorage object.
 *
 * If you are in the Electron.io environment, you want to include electrofs.js
 * instead of this module. To distinguish this from electrofs.js, look at
 * Dialog.streaming, which will be true for electrofs.js and false for
 * dialog.js.
 *
 * The primary function to call:
 *
 * Dialog.open(tosave, usage, gameid, callback) -- open a file-choosing dialog
 *
 * The rest of the API concerns file reference objects. A fileref encodes a
 * usage and gameid (as above), along with a filename (which can be any string
 * at all). This trio specifies a "file", that is, a chunk of data in browser
 * local storage.
 *
 * (These fileref objects are not the same as the filerefs used in the Glk API.
 * A Glk fileref contains one of these filerefs, however.)
 *
 * Dialog.file_clean_fixed_name(filename, usage) -- clean up a filename
 * Dialog.file_construct_ref(filename, usage, gameid) -- create a fileref
 * Dialog.file_construct_temp_ref(usage) -- create a temporary fileref
 * Dialog.file_write(ref, content, israw) -- write data to the file
 * Dialog.file_read(ref, israw) -- read data from the file
 * Dialog.file_ref_exists(ref) -- returns whether the file exists
 * Dialog.file_remove_ref(ref) -- delete the file, if it exists
 *
 *
 * The localStorage format is as follows. Each file is represented as two
 * storage keys: "dirent:usage:gameid:filename" and
 * "content:usage:gameid:filename". (The filename is last so that it can
 * validly contain colons. Since this is a user-entered string, it can contain
 * *any* typeable character.)
 *
 * The "content:" key contains the file content, as a string. (The HTML5
 * browser storage spec says that you can store any serializable data, but the
 * browsers have not yet implemented this. Thus the "israw" option in the read
 * and write functions.)
 *
 * The "dirent:" key contains directory information. Currently this looks like
 * "created:TIMESTAMP,modified:TIMESTAMP". Future version of this library may
 * add a human-readable game name, a text/binary flag, or other data.
 */

//### accept "return" keystroke for load-select box (already works in Chrome)

/* All state is contained in DialogClass. */
var DialogClass = function() {

var GlkOte = null; /* imported API object -- for GlkOte.log, GlkOte.getdomid */

var dialog_el_id = 'dialog';
let localization_map = {};

var is_open = false;
var dialog_callback = null;
var will_save; /* is this a save dialog? */
var confirming; /* are we in a "confirm" sub-dialog? */
var editing; /* have we flipped to "edit" mode? */
var editing_dirent; /* null for the edit selection screen, or a dirent to
                       display */
var cur_usage; /* a string representing the file's category */
var cur_usage_name; /* the file's category as a human-readable string */
var cur_usage_names; /* the file's category (pluralized) as a human-readable string */
var cur_gameid; /* a string representing the game */
var cur_filelist; /* the files currently on display */

/* Dialog.init(iface) -- initialize the library */
function dialog_init(iface) {
    if (iface && iface.dom_prefix) {
        dialog_el_id = iface.dom_prefix;
    }
    if (iface && iface.localize) {
        localization_map = iface.localize;
    }
    
    if (iface && iface.GlkOte) {
        GlkOte = iface.GlkOte;
    }
    if (!GlkOte) {
        /* Look in the global environment. */
        GlkOte = window.GlkOte;
    }
    if (!GlkOte) {
        throw new Error('Dialog: no GlkOte interface!');
    }
}

/* Dialog.inited() -- returns whether the library is initialized */
function dialog_inited() {
    return (GlkOte != null);
}
    
/* Dialog.getlibrary() -- return the library interface object that we were passed or created.
*/
function dialog_get_library(val) {
    switch (val) {
        case 'GlkOte': return GlkOte;
    }
    /* Unrecognized library name. */
    return null;
}
    
/* Dialog.open(tosave, usage, gameid, callback) -- open a file-choosing dialog
 *
 * The "tosave" flag should be true for a save dialog, false for a load
 * dialog.
 *
 * The "usage" and "gameid" arguments are arbitrary strings which describe the
 * file. These filter the list of files displayed; the dialog will only list
 * files that match the arguments. Pass null to either argument (or both) to
 * skip filtering.
 *
 * The "callback" should be a function. This will be called with a fileref
 * argument (see below) when the user selects a file. If the user cancels the
 * selection, the callback will be called with a null argument.
*/
function dialog_open(tosave, usage, gameid, callback) {
    if (is_open)
        throw new Error('Dialog: dialog box is already open.');

    if (!Storage)
        throw new Error('Dialog: no storage API is available.');

    dialog_callback = callback;
    will_save = tosave;
    confirming = false;
    editing = false;
    editing_dirent = null;
    cur_usage = usage;
    cur_gameid = gameid;
    cur_usage_name = label_for_usage(cur_usage);
    cur_usage_names = label_for_usage(cur_usage, true);

    /* Figure out what the root div is called. The dialog box will be
       positioned in this div; also, the div will be greyed out by a 
       translucent rectangle. This is normally "windowport", but we
       check with GlkOte to see if that default has changed. */
    var root_el_id = 'windowport';
    if (window.GlkOte) 
        root_el_id = GlkOte.getdomid('windowport');

    var rootel = $('#'+root_el_id);
    if (!rootel.length)
        throw new Error('Dialog: unable to find root element #' + root_el_id + '.');

    /* Create the grey-out screen. */
    var screen = $('#'+dialog_el_id+'_screen');
    if (!screen.length) {
        screen = $('<div>',
            { id: dialog_el_id+'_screen', class: 'DialogScreen' });
        rootel.append(screen);
    }

    /* And now, a lot of DOM creation for the dialog box. */

    var frame = $('#'+dialog_el_id+'_frame');
    if (!frame.length) {
        frame = $('<div>',
            { id: dialog_el_id+'_frame', class: 'DialogFrame' });
        rootel.append(frame);
    }

    var dia = $('#'+dialog_el_id);
    if (dia.length)
        dia.remove();

    dia = $('<div>', { id: dialog_el_id, class: 'Dialog' });

    var form, el, row;

    form = $('<form>');
    form.on('submit', 
        (will_save ? evhan_accept_save_button : evhan_accept_load_button));
    dia.append(form);

    row = $('<div>', { 'class': 'DiaButtonsFloat' });
    el = $('<button>', { id: dialog_el_id+'_edit', type: 'button' });
    el.text(localize('dialog_edit'));
    el.on('click', evhan_edit_button);
    row.append(el);
    form.append(row);

    row = $('<div>', { id: dialog_el_id+'_cap', 'class': 'DiaCaption' });
    row.text('XXX'); // the caption will be replaced momentarily.
    form.append(row);

    if (will_save) {
        row = $('<div>', { id: dialog_el_id+'_input', 'class': 'DiaInput' });
        form.append(row);
        el = $('<input>', { id: dialog_el_id+'_infield', type: 'text', name: 'filename' });
        row.append(el);

        /* This was spurred by the Safari seven-day expiration policy (March 2020), but the general fragility of local storage has been a bother for years. */
        row = $('<div>', { id: dialog_el_id+'_warning', 'class': 'DiaWarning' });
        row.text(localize('dialog_cookiewarning'));
        form.append(row);
    }

    row = $('<div>', { id: dialog_el_id+'_body', 'class': 'DiaBody' });
    form.append(row);

    row = $('<div>', { id: dialog_el_id+'_cap2', 'class': 'DiaCaption' });
    row.hide();
    form.append(row);

    row = $('<div>', { id: dialog_el_id+'_buttonrow', 'class': 'DiaButtons' });
    {
        /* Row of buttons */
        el = $('<button>', { id: dialog_el_id+'_cancel', type: 'button' });
        el.text(localize('dialog_cancel'));
        el.on('click', evhan_cancel_button);
        row.append(el);

        el = $('<button>', { id: dialog_el_id+'_delete', type: 'button' });
        el.text(localize('dialog_delete'));
        el.on('click', evhan_delete_button);
        el.hide();
        row.append(el);

        el = $('<button>', { id: dialog_el_id+'_display', type: 'button' });
        el.text(localize('dialog_display'));
        el.on('click', evhan_display_button);
        el.hide();
        row.append(el);

        el = $('<button>', { id: dialog_el_id+'_accept', type: 'submit' });
        el.text(will_save ? localize('dialog_save') : localize('dialog_load'));
        el.on('click', 
            (will_save ? evhan_accept_save_button : evhan_accept_load_button));
        row.append(el);
    }
    form.append(row);

    frame.append(dia);
    is_open = true;

    evhan_storage_changed();

    /* Set the input focus to the input field or the selection box.

       MSIE is weird about when you can call focus(). The element has just been
       added to the DOM, and MSIE balks at giving it the focus right away. So
       we defer the call until after the javascript context has yielded control
       to the browser. 
    */
    var focusfunc;
    if (will_save) {
        focusfunc = function() {
            var el = $('#'+dialog_el_id+'_infield');
            if (el.length) 
                el.focus();
        };
    }
    else {
        focusfunc = function() {
            var el = $('#'+dialog_el_id+'_select');
            if (el.length) 
                el.focus();
        };
    }
    defer_func(focusfunc);
}

/* Close the dialog and remove the grey-out screen.
*/
function dialog_close() {
    var dia = $('#'+dialog_el_id);
    if (dia.length)
        dia.remove();
    var frame = $('#'+dialog_el_id+'_frame');
    if (frame.length)
        frame.remove();
    var screen = $('#'+dialog_el_id+'_screen');
    if (screen.length)
        screen.remove();

    is_open = false;
    dialog_callback = null;
    cur_filelist = null;
    editing = false;
    editing_dirent = null;
}

/* Set the text caption in the dialog. (There are two, actually, above
   and below the selection box.)
*/
function set_caption(msg, isupper) {
    var elid = (isupper ? dialog_el_id+'_cap' : dialog_el_id+'_cap2');
    var el = $('#'+elid);
    if (!el.length)
        return;

    if (!msg) {
        el.hide();
    }
    else {
        el.text(msg);
        el.show();
    }
}

/* Pick a human-readable label for the usage. This will be displayed in the
   dialog prompts.
*/
function label_for_usage(val, plural) {
    if (!plural)
        return localize('dialog_usage_'+val);
    else
        return localize('dialog_usagepl_'+val);
}

/* Decide whether a given file is likely to contain text data. 
   ### really this should rely on a text/binary metadata field.
*/
function usage_is_textual(val) {
    return (val == 'transcript' || val == 'command');
}

/* Run a function (no arguments) "soon". */
function defer_func(func)
{
    return window.setTimeout(func, 0.01*1000);
}

/* Event handler: The user has changed which entry in the selection box is
   highlighted. 

   This is used only in save dialogs; the highlighted filename is copied to the
   input field.
*/
function evhan_select_change() {
    if (!is_open)
        return false;
    if (confirming)
        return false;

    //GlkOte.log('### select changed');
    var selel = $('#'+dialog_el_id+'_select');
    if (!selel.length)
        return false;
    var pos = selel.prop('selectedIndex');
    if (!cur_filelist || pos < 0 || pos >= cur_filelist.length)
        return false;
    var file = cur_filelist[pos];
    var fel = $('#'+dialog_el_id+'_infield');
    if (!fel.length)
        return false;
    fel.val(file.dirent.filename);
    return false;
}

/* Event handler: The user has changed which entry in the selection box is
   highlighted. (Also called manually, when we enter edit mode.)

   This is only used in edit mode.
*/
function evhan_select_change_editing() {
    if (!is_open)
        return false;
    if (!editing || editing_dirent)
        return false;

    var butel = $('#'+dialog_el_id+'_delete');
    butel.prop('disabled', true);
    butel = $('#'+dialog_el_id+'_display');
    butel.prop('disabled', true);

    var selel = $('#'+dialog_el_id+'_select');
    if (!selel.length)
        return false;
    var pos = selel.prop('selectedIndex');
    if (!cur_filelist || pos < 0 || pos >= cur_filelist.length)
        return false;
    var file = cur_filelist[pos];
    if (!file || !file.dirent || !file_ref_exists(file.dirent))
        return false;

    butel = $('#'+dialog_el_id+'_delete');
    butel.prop('disabled', false);
    butel = $('#'+dialog_el_id+'_display');
    butel.prop('disabled', false);
}

/* Event handler: The "Load" button.
*/
function evhan_accept_load_button(ev) {
    ev.preventDefault();
    if (!is_open)
        return false;
    if (editing)
        return false;

    //GlkOte.log('### accept load');
    var selel = $('#'+dialog_el_id+'_select');
    if (!selel.length)
        return false;
    var pos = selel.prop('selectedIndex');
    if (!cur_filelist || pos < 0 || pos >= cur_filelist.length)
        return false;
    var file = cur_filelist[pos];
    if (!file || !file.dirent || !file_ref_exists(file.dirent))
        return false;

    var callback = dialog_callback;
    //GlkOte.log('### selected ' + file.dirent.dirent);
    dialog_close();
    if (callback)
        callback(file.dirent);

    return false;
}

/* Event handler: The "Save" or "Replace" button.
*/
function evhan_accept_save_button(ev) {
    ev.preventDefault();
    if (!is_open)
        return false;
    if (editing)
        return false;

    //GlkOte.log('### accept save');
    var fel = $('#'+dialog_el_id+'_infield');
    if (!fel.length)
        return false;
    var filename = fel.val();
    filename = jQuery.trim(filename);
    if (!filename.length)
        return false;
    var dirent = file_construct_ref(filename, cur_usage, cur_gameid);

    if (file_ref_exists(dirent) && !confirming) {
        /* If the file exists, and we are not already in confirm mode, go into
           confirm mode. Yes, this is logistically messy. We change the button
           label to "Replace"; if the user really meant it, we'll wind up back
           in this event handler. */
        confirming = true;
        let val = localize('dialog_confirmreplace');
        set_caption(val.replace('%1', cur_usage_name).replace('%2', dirent.filename), false);
        fel.prop('disabled', true);
        var butel = $('#'+dialog_el_id+'_accept');
        butel.text(localize('dialog_replace'));
        return false;
    }

    var callback = dialog_callback;
    //GlkOte.log('### selected ' + dirent.dirent);
    dialog_close();
    if (callback)
        callback(dirent);

    return false;
}

/* Event handler: The "Edit" (or "Done") button.

   This toggles edit mode.
*/
function evhan_edit_button(ev) {
    ev.preventDefault();
    if (!is_open)
        return false;

    if (!editing) {
        editing = true;
        editing_dirent = null;

        if (confirming) {
            /* Cancel the confirmation, first */
            confirming = false;
            set_caption(null, false);
            var fel = $('#'+dialog_el_id+'_infield');
            fel.prop('disabled', false);
            var butel = $('#'+dialog_el_id+'_accept');
            butel.prop('disabled', false);
            butel.text(localize('dialog_save'));
        }

        var fel = $('#'+dialog_el_id+'_input');
        if (fel.length) {
            fel.hide();
        }

        var butel = $('#'+dialog_el_id+'_edit');
        butel.text(localize('dialog_done'));

        butel = $('#'+dialog_el_id+'_delete');
        butel.show();
        butel = $('#'+dialog_el_id+'_display');
        butel.show();
        butel = $('#'+dialog_el_id+'_accept');
        butel.hide();

        evhan_storage_changed();
        return false;
    }
    else if (!editing_dirent) {
        editing = false;
        editing_dirent = null;

        var fel = $('#'+dialog_el_id+'_input');
        if (fel.length) {
            fel.show();
        }

        var butel = $('#'+dialog_el_id+'_edit');
        butel.text(localize('dialog_edit'));

        butel = $('#'+dialog_el_id+'_delete');
        butel.hide();
        butel = $('#'+dialog_el_id+'_display');
        butel.hide();
        butel = $('#'+dialog_el_id+'_accept');
        butel.show();

        evhan_storage_changed();
        return false;
    }
    else {
        /* Stop displaying a file, return to normal edit mode. */
        editing = true;
        editing_dirent = null;

        $('#'+dialog_el_id+'_buttonrow').show();

        var butel = $('#'+dialog_el_id+'_edit');
        butel.text(localize('dialog_done'));

        evhan_storage_changed();
        return false;
    }
}

/* Event handler: The "Delete" button (for edit mode).
*/
function evhan_delete_button(ev) {
    ev.preventDefault();
    if (!is_open)
        return false;
    if (!editing || editing_dirent)
        return false;

    //GlkOte.log('### delete');
    var selel = $('#'+dialog_el_id+'_select');
    if (!selel.length)
        return false;
    var pos = selel.prop('selectedIndex');
    if (!cur_filelist || pos < 0 || pos >= cur_filelist.length)
        return false;
    var file = cur_filelist[pos];
    if (!file || !file.dirent)
        return false;

    file_remove_ref(file.dirent);
    /* Force reload of display */
    evhan_storage_changed();

    return false;
}

/* Event handler: The "Display" button (for edit mode).
*/
function evhan_display_button(ev) {
    ev.preventDefault();
    if (!is_open)
        return false;
    if (!editing || editing_dirent)
        return false;

    //GlkOte.log('### display');
    var selel = $('#'+dialog_el_id+'_select');
    if (!selel.length)
        return false;
    var pos = selel.prop('selectedIndex');
    if (!cur_filelist || pos < 0 || pos >= cur_filelist.length)
        return false;
    var file = cur_filelist[pos];
    if (!file || !file.dirent || !file_ref_exists(file.dirent))
        return false;

    $('#'+dialog_el_id+'_buttonrow').hide();

    var butel = $('#'+dialog_el_id+'_edit');
    butel.text(localize('dialog_close'));

    editing_dirent = file.dirent;
    /* Force reload of display */
    evhan_storage_changed();

    return false;
}

/* Event handler: The "Cancel" button.

   This can mean either cancelling the dialog, or cancelling confirm mode on a
   "do you want to replace that?" query.
*/
function evhan_cancel_button(ev) {
    ev.preventDefault();
    if (!is_open)
        return false;

    if (confirming) {
        confirming = false;
        set_caption(null, false);
        var fel = $('#'+dialog_el_id+'_infield');
        fel.prop('disabled', false);
        var butel = $('#'+dialog_el_id+'_accept');
        butel.prop('disabled', false);
        butel.text(localize('dialog_save'));
        return false;
    }

    var callback = dialog_callback;
    //GlkOte.log('### cancel');
    dialog_close();
    if (callback)
        callback(null);

    return false;
}

/* Event handler: Browser local storage has been updated. When this happens, we
   re-check the list of files, because a new one might have been added from
   another browser window.

   This function is called manually when the dialog box is created,
   to set up the list of files in the first place. We also call it manually
   when switching in and out of edit mode -- it's the easiest way to redraw
   everything.
*/
function evhan_storage_changed(ev) {
    if (!is_open)
        return false;

    var el, bodyel, butel, ls, lastusage;

    var changedkey = null;
    if (ev)
        changedkey = ev.key;
    //GlkOte.log('### noticed storage: key ' + changedkey);
    /* We could use the changedkey to decide whether it's worth redrawing 
       the field here. */

    bodyel = $('#'+dialog_el_id+'_body');
    if (!bodyel.length)
        return false;

    if (editing && editing_dirent) {
        /* If the file was deleted out from under us, return to the editing
           display. */
        if (!file_ref_exists(editing_dirent)) {
            editing_dirent = null;
            $('#'+dialog_el_id+'_buttonrow').show();
            butel = $('#'+dialog_el_id+'_edit');
            butel.text(localize('dialog_done'));
        }
    }

    /* There are several editing modes, which means several things we might
       display here. */

    if (editing && editing_dirent) {
        /* We want to display the selected file's contents. */
        bodyel.empty();

        /* ### Make the unjustified assumption that this is an array of
           character values (as ints). */
        var dat = file_read(editing_dirent);
        /* ### This doesn't correctly handle Unicode characters outside the
           16-bit range. */
        dat = String.fromCharCode.apply(this, dat);
          
        //### use binary flag?
        if (usage_is_textual(editing_dirent.usage)) {
          var textel = $('<pre>', { 'class': 'DiaDisplayText' });
          textel.text(dat);
          bodyel.append(textel);
          set_caption(localize('dialog_displayingcontents'), true);
        }
        else {
          var b64dat = window.btoa(dat);
          /*### the download link should really be the filename, escaped
            for attribute safety, with the proper file suffix attached. */
          var linkel = $('<a>', { 'href': 'data:application/octet-stream;base64,'+b64dat, 'target': '_blank', 'download': 'data' });
          linkel.text(editing_dirent.filename);
          bodyel.append(linkel);
          set_caption(localize('dialog_usesaveas'), true);
        }

        return false;
    }

    if (editing) {
        /* We want to display both game-specific files and general ones (but
           not files specific to other games, i.e., save files for different
           games). 
        */
        ls = files_list(null, cur_gameid);
        if (cur_gameid != '') {
            ls = ls.concat(files_list(null, ''));
        }
        /* Sort by usage, then date modified */
        ls.sort(function(f1, f2) {
                if (f1.dirent.usage < f2.dirent.usage) 
                    return -1;
                else if (f1.dirent.usage > f2.dirent.usage) 
                    return 1;
                return f2.modified.getTime() - f1.modified.getTime(); 
            });

        if (ls.length == 0) {
            bodyel.empty();
            butel = $('#'+dialog_el_id+'_delete');
            butel.prop('disabled', true);
            butel = $('#'+dialog_el_id+'_display');
            butel.prop('disabled', true);
            set_caption(localize('dialog_nostoredfiles'), true);
            return false;
        }

        var ix, file;
        
        cur_filelist = [];
        lastusage = '';
        for (ix=0; ix<ls.length; ix++) {
            file = ls[ix];
            if (file.dirent.usage != lastusage) {
                lastusage = file.dirent.usage;
                cur_filelist.push({ label:lastusage });
            }
            cur_filelist.push(file);
        }
        ls = cur_filelist;

        bodyel.empty();
        
        var selel = $('<select>', { id: dialog_el_id+'_select', name:'files' });
        selel.prop('size', '5'); /* firefox doesn't like this being set in the constructor */
        var datestr;
        var anyselected = false;
        for (ix=0; ix<ls.length; ix++) {
            file = ls[ix];
            if (!file.dirent) {
                el = $('<option>', { name:'f'+ix } );
                el.prop('disabled', true);
                el.text('-- ' + label_for_usage(file.label, true) + ' --');
                selel.append(el);
                continue;
            }

            el = $('<option>', { name:'f'+ix } );
            if (!anyselected) {
                anyselected = true;
                el.selected = true;
            }
            datestr = format_date(file.modified);
            el.text(file.dirent.filename + ' -- ' + datestr);
            selel.append(el);
        }
        bodyel.append(selel);

        selel.on('change', evhan_select_change_editing);
        evhan_select_change_editing();

        set_caption(localize('dialog_allvisible'), true);
        return false;
    }

    /* Basic display mode: the list of available files, plus an input field
       if this is for saving. */

    ls = files_list(cur_usage, cur_gameid);
    /* Sort by date modified */
    ls.sort(function(f1, f2) { return f2.modified.getTime() - f1.modified.getTime(); });
    cur_filelist = ls;

    /* Adjust the contents of the selection box. */
    
    if (ls.length == 0) {
        bodyel.empty();
    }
    else {
        bodyel.empty();
        
        var selel = $('<select>', { id: dialog_el_id+'_select', name:'files' });
        selel.prop('size', '5'); /* firefox doesn't like this being set in the constructor */
        var ix, file, datestr;
        for (ix=0; ix<ls.length; ix++) {
            file = ls[ix];
            el = $('<option>', { name:'f'+ix } );
            if (ix == 0)
                el.selected = true;
            datestr = format_date(file.modified);
            el.text(file.dirent.filename + ' -- ' + datestr);
            selel.append(el);
        }
        bodyel.append(selel);

        if (will_save)
            selel.on('change', evhan_select_change);
    }

    if (will_save) {
        let val = localize('dialog_namethis');
        set_caption(val.replace('%1', cur_usage_name), true);
        el = $('#'+dialog_el_id+'_accept');
        el.prop('disabled', false);
    }
    else {
        if (ls.length == 0) {
            set_caption(localize('dialog_nousagefiles').replace('%1', cur_usage_names), true);
            el = $('#'+dialog_el_id+'_accept');
            el.prop('disabled', true);
        }
        else {
            set_caption(localize('dialog_selectafile').replace('%1', cur_usage_name), true);
            el = $('#'+dialog_el_id+'_accept');
            el.prop('disabled', false);
        }
    }
}

/* Dialog.file_clean_fixed_name(filename, usage) -- clean up a filename
 *
 * Take an arbitrary string and convert it into a filename that can
 * validly be stored in the user's directory. This is called for filenames
 * that come from the game file, but not for filenames selected directly
 * by the user (i.e. from a file selection dialog).
 *
 * Because we store everything in browser local storage, we have no
 * filename restrictions.
 */
function file_clean_fixed_name(filename, usage) {
    return filename;
}

/* Dialog.file_construct_ref(filename, usage, gameid) -- create a fileref
 *
 * Create a fileref. This does not create a file; it's just a thing you can use
 * to read an existing file or create a new one. Any unspecified arguments are
 * assumed to be the empty string.
 */
function file_construct_ref(filename, usage, gameid) {
    if (!filename)
        filename = '';
    if (!usage)
        usage = '';
    if (!gameid)
        gameid = '';
    var key = usage + ':' + gameid + ':' + filename;
    var ref = { dirent: 'dirent:'+key, content: 'content:'+key,
                filename: filename, usage: usage, gameid: gameid };
    return ref;
}

/* Dialog.file_construct_temp_ref(usage)
 *
 * Create a fileref in a temporary directory. Every time this is called
 * it should create a completely new fileref.
 */
function file_construct_temp_ref(usage) {
    var timestamp = new Date().getTime();
    var filename = "_temp_" + timestamp + "_" + Math.random();
    filename = filename.replace('.', '');
    return file_construct_ref(filename, usage);
}

/* Create a fileref from a browser storage key (string). If the key does not
   begin with "dirent:" (ie, this key does not represent a directory entry),
   this returns null.
*/
function file_decode_ref(dirkey) {
    if (dirkey.slice(0,7) != 'dirent:')
        return null;

    var oldpos = 7;
    var pos = dirkey.indexOf(':', oldpos);
    if (pos < 0)
        return null;
    var usage = dirkey.slice(oldpos, pos);
    oldpos = pos+1;
    
    pos = dirkey.indexOf(':', oldpos);
    if (pos < 0)
        return null;
    var gameid = dirkey.slice(oldpos, pos);
    oldpos = pos+1;

    var filename = dirkey.slice(oldpos);
    var conkey = 'cont'+dirkey.slice(3);

    var ref = { dirent: dirkey, content: conkey, 
                filename: filename, usage: usage, gameid: gameid };
    return ref;
}

/* Load directory entry information for a fileref (or key denoting a fileref).

   The dirent information includes when the file was created, and when it was
   last modified. It does not include the file content.
*/
function file_load_dirent(dirent) {
    if (typeof(dirent) != 'object') {
        dirent = file_decode_ref(dirent);
        if (!dirent)
            return null;
    }

    var statstring = Storage.getItem(dirent.dirent);
    if (!statstring)
        return null;

    var file = { dirent: dirent };

    var ix, pos, key, val;

    var ls = statstring.toString().split(',');
    for (ix=0; ix<ls.length; ix++) {
        val = ls[ix];
        pos = val.indexOf(':');
        if (pos < 0)
            continue;
        key = val.slice(0, pos);
        val = val.slice(pos+1);

        switch (key) {
        case 'created':
            file.created = new Date(Number(val));
            break;
        case 'modified':
            file.modified = new Date(Number(val));
            break;
        }
    }

    //### binary
    //### game name?

    return file;
}

/* Dialog.file_ref_exists(ref) -- returns whether the file exists
 */
function file_ref_exists(ref) {
    var statstring = Storage.getItem(ref.dirent);
    if (!statstring)
        return false;
    else
        return true;
}

/* Dialog.file_remove_ref(ref) -- delete the file, if it exists
 */
function file_remove_ref(ref) {
    Storage.removeItem(ref.dirent);
    Storage.removeItem(ref.content);
}

/* Dialog.file_write(dirent, content, israw) -- write data to the file
 *
 * The "content" argument is stored to the file. If "israw" is true, the
 * content must be a string. Otherwise, the content is converted to JSON (using
 * JSON.stringify) before being stored.
 *
 * HTML's localStorage mechanism has no incremental storage API; you have to
 * store the entire chunk of data at once. Therefore, the given content
 * replaces the existing contents of the file (if any).
 */
function file_write(dirent, content, israw) {
    var val, ls;
    var err1, err2;

    var file = file_load_dirent(dirent);
    if (!file) {
        /* Newly-created file. */
        file = { dirent: dirent, created: new Date() };
    }

    file.modified = new Date();

    if (!israw)
        content = JSON.stringify(content);

    ls = [];

    if (file.created)
        ls.push('created:' + file.created.getTime());
    if (file.modified)
        ls.push('modified:' + file.modified.getTime());

    //### binary
    //### game name?

    val = ls.join(',');
    err1 = Storage.setItem(file.dirent.dirent, val);
    err2 = Storage.setItem(file.dirent.content, content);

    if (err1 || err2)
        return false;

    return true;
}

/* Dialog.file_read(dirent, israw) -- read data from the file
 *
 * Read the (entire) content of the file. If "israw" is true, this returns the
 * string that was stored. Otherwise, the content is converted from JSON (using
 * JSON.parse) before being returned.
 *
 * As a special case, the empty string is converted to an empty array (when not
 * in israw mode).
 */
function file_read(dirent, israw) {
    var file = file_load_dirent(dirent);
    if (!file)
        return null;

    var content = Storage.getItem(dirent.content);
    if (content == null)
        return null;

    content = content.toString();
    if (!content) {
        if (israw)
            return '';
        else
            return [];
    }

    if (israw)
        return content;
    else
        return JSON.parse(content);
}

function file_notimplemented() {
    throw new Error('streaming function not implemented in Dialog');
}

/* Check whether a given fileref matches the given usage and gameid strings. If
   you don't want to check one attribute or the other, pass null for that
   argument.
*/
function file_ref_matches(ref, usage, gameid) {
    if (usage != null) {
        if (ref.usage != usage)
            return false;
    }

    if (gameid != null) {
        if (ref.gameid != gameid)
            return false;
    }

    return true;
}

/* Return the list of files (actually directory entries) matching the given
   given usage and gameid strings. If you don't want to check one attribute or
   the other, pass null for that argument.
*/
function files_list(usage, gameid) {
    var ix;
    var ls = [];

    if (!Storage)
        return ls;

    var keyls = Storage.getKeys();
    for (ix=0; ix<keyls.length; ix++) {
        var key = keyls[ix];
        if (!key)
            continue;
        var dirent = file_decode_ref(key.toString());
        if (!dirent)
            continue;
        if (!file_ref_matches(dirent, usage, gameid))
            continue;
        var file = file_load_dirent(dirent);
        ls.push(file);
    }

    //GlkOte.log('### files_list found ' + ls.length + ' files.');
    return ls;
}

/* Default localization strings (English).
   Note that keys are namespaced. A given map may be shared between
   GlkOte, Dialog, Quixe, etc. */
const localization_basemap = {
    /* Buttons... */
    dialog_cancel: 'Cancel',
    dialog_close: 'Close',
    dialog_done: 'Done',
    dialog_edit: 'Edit',
    dialog_delete: 'Delete',
    dialog_display: 'Display',
    dialog_load: 'Load',
    dialog_replace: 'Replace',
    dialog_save: 'Save',

    /* Labels... */
    dialog_namethis: 'Name this %1.',
    dialog_confirmreplace: 'You already have a %1 "%2". Do you want to replace it?',
    dialog_cookiewarning: 'Warning: data may be erased by clearing cookies or browser privacy policies.',
    dialog_allvisible: 'All stored files are now visible. You may delete them, and display files containing text. Press Done when finished.',
    dialog_displayingcontents: 'Displaying file contents...',
    dialog_usesaveas: 'Use "Save As" option in your browser to download this link.',
    dialog_nostoredfiles: 'You have no stored files. Press Done to continue.',
    dialog_nousagefiles: 'You have no %1 for this game.',
    dialog_selectafile: 'Select a %1 to load.',

    /* File usages (singular and plural)... */
    dialog_usage_data: 'data file',
    dialog_usage_save: 'save file',
    dialog_usage_transcript: 'transcript',
    dialog_usage_command: 'command script',
    dialog_usage_default: 'file',
    dialog_usagepl_data: 'data files',
    dialog_usagepl_save: 'save files',
    dialog_usagepl_transcript: 'transcripts',
    dialog_usagepl_command: 'command scripts',
    dialog_usagepl_default: 'files',
};

/* Localize a key using the provided localization map or the default
   value. */
function localize(key) {
    let val = localization_map[key];
    if (val)
        return val;
    val = localization_basemap[key];
    if (val)
        return val;
    return key;
}

/* Convert a date object to a (short) string.
*/
function format_date(date) {
    if (!date)
        return '???';
    //### display relative dates?
    var day = (date.getMonth()+1) + '/' + date.getDate();
    var time = date.getHours() + ':' + (date.getMinutes() < 10 ? '0' : '') + date.getMinutes();
    return day + ' ' + time;
}

/* Store a snapshot (a JSONable object) in a signature-dependent location.
   If snapshot is null, delete the snapshot instead.

   We rely on JSON.stringify() and JSON.parse(); autosave is primarily
   for the Electron environment.
*/
function autosave_write(signature, snapshot) {
    var key = 'autosave:' + signature;
    if (!snapshot) {
        Storage.removeItem(key);
    }
    else {
        Storage.setItem(key, JSON.stringify(snapshot));
    }
}

/* Load a snapshot (a JSONable object) from a signature-dependent location.
*/
function autosave_read(signature) {
    var key = 'autosave:' + signature;
    var val = Storage.getItem(key);
    if (val) {
        try {
            return JSON.parse(val);
        }
        catch (ex) { }
    }
    return null;
}

/* Locate the storage object, and set up the storage event handler, at load
   time (but after all the handlers are defined).

   We wrap the HTML localStorage object in a simplified wrapper (Storage),
   which supports just four calls: getItem, setItem, removeItem, and getKeys.
   This lets us catch storage-quota errors, which turns out to be a good
   idea. It also makes it easier to substitute a different storage back-end.
*/

var Storage = null;
try {
    var htmlLocalStorage = null;
    /* Accessing window.localStorage might throw a security exception. */
    if (window.localStorage != null) {
        /* This is the API object for HTML5 browser storage. */
        htmlLocalStorage = window.localStorage;
    }
    else if (window.globalStorage != null) {
        /* This is a non-standard API used in Firefox 3.0 (but not 3.5). */
        htmlLocalStorage = window.globalStorage[location.hostname];
    }

    if (htmlLocalStorage) {
        /* First, test to make sure we can write at all. (In a private
           window, localStorage quota may be zero.) */
        try {
            htmlLocalStorage.setItem('_dialogtest', 'xyzzy');
            if (htmlLocalStorage.getItem('_dialogtest') != 'xyzzy')
                throw new Error('localStorage test did not match');
            htmlLocalStorage.removeItem('_dialogtest');

            Storage = {
                getItem: function(key) {
                    try {
                        return htmlLocalStorage.getItem(key);
                    }
                    catch (ex) {
                        return null;
                    }
                },
                removeItem: function(key) {
                    try {
                        htmlLocalStorage.removeItem(key);
                    }
                    catch (ex) { }
                },
                setItem: function(key, val) {
                    try {
                        htmlLocalStorage.setItem(key, val);
                    }
                    catch (ex) {
                        GlkOte.log('Dialog: localStorage failed! ' + ex);
                        return true; /* error */
                    }
                },
                getKeys: function() {
                    var ls = [];
                    for (var ix=0; ix<htmlLocalStorage.length; ix++)
                        ls.push(htmlLocalStorage.key(ix));
                    return ls;
                }
            };
        }
        catch (ex) {
            GlkOte.log('Dialog: localStorage not available: ' + ex);
            GlkOte.log('Dialog: falling back to window memory');
        }
    }
}
catch (ex) { }

if (Storage == null) {
    /* This browser doesn't support storage at all. We'll whip up a
       simple implementation. It will only last as long as the window
       does, but that's good enough for a game. */
    Storage = {
        data: {},
        keys: [],
        getItem: function(key) {
            return Storage.data[key];
        },
        setItem: function(key, val) {
            if (Storage.keys.indexOf(key) < 0) {
                Storage.keys.push(key);
            }
            Storage.data[key] = val;
        },
        removeItem: function(key) {
            var pos = Storage.keys.indexOf(key);
            if (pos >= 0) {
                Storage.keys.splice(pos, 1);
                delete Storage.data[key];
            }
        },
        getKeys: function() {
            return Storage.keys.slice(0);
        }
    }
}

$(window).on('storage', evhan_storage_changed);

/* End of Dialog namespace function. Return the object which will
   become the Dialog global. */
return {
    classname: 'Dialog',
    version: '2.3.7', /* GlkOte/GlkApi version */
    streaming: false,
    init: dialog_init,
    inited: dialog_inited,
    getlibrary: dialog_get_library,
    
    open: dialog_open,

    file_clean_fixed_name: file_clean_fixed_name,
    file_construct_ref: file_construct_ref,
    file_construct_temp_ref: file_construct_temp_ref,
    file_ref_exists: file_ref_exists,
    file_remove_ref: file_remove_ref,
    file_write: file_write,
    file_read: file_read,

    /* stubs for not-implemented functions */
    file_fopen: file_notimplemented,

    /* support for the autosave hook */
    autosave_write: autosave_write,
    autosave_read: autosave_read
};

};

/* Dialog is an instance of DialogClass, ready to init. */
var Dialog = new DialogClass();

// Node-compatible behavior
try { exports.Dialog = Dialog; exports.DialogClass = DialogClass; } catch (ex) {};

/* End of Dialog library. */
