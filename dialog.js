//### namespace

var root_el_id = 'windowport';
var dialog_el_id = 'dialog';

var is_open = false;
var will_save; /* is this a save dialog? */
var cur_usage; /* a string representing the file's category */
var cur_gameid; /* a string representing the game */

function dialog_open(tosave, usage, gameid) {
    if (is_open)
        throw 'Dialog: dialog box is already open.';

    if (!window.localStorage)
        throw 'Dialog: your browser does not support local storage.';

    will_save = tosave;
    cur_usage = usage;
    cur_gameid = gameid;

    var rootel = $(root_el_id);
    if (!rootel)
        throw 'Dialog: unable to find root element #' + root_el_id + '.';

    var screen = $(dialog_el_id+'_screen');
    if (!screen) {
        screen = new Element('div',
            { id: dialog_el_id+'_screen' });
        rootel.insert(screen);
    }

    var dia = $(dialog_el_id);
    if (dia)
        dia.remove();

    dia = new Element('div', { id: dialog_el_id });
    var styledic = { left: 200+'px', top: 200+'px' };
    dia.setStyle(styledic);

    var form, el, row;

    form = new Element('form');
    form.onsubmit = evhan_accept_button;
    dia.insert(form);

    row = new Element('div', { id: dialog_el_id+'_cap', 'class': 'DiaCaption' });
    insert_text(row, 'XXX');
    form.insert(row);

    row = new Element('div', { id: dialog_el_id+'_body', 'class': 'DiaBody' });
    form.insert(row);

    row = new Element('div', { id: dialog_el_id+'_cap2', 'class': 'DiaCaption' });
    row.hide();
    form.insert(row);

    row = new Element('div', { 'class': 'DiaButtons' });
    el = new Element('button', { id: dialog_el_id+'_cancel', type: 'button' });
    insert_text(el, 'Cancel');
    el.onclick = evhan_cancel_button;
    row.insert(el);
    el = new Element('button', { id: dialog_el_id+'_accept', type: 'submit' });
    insert_text(el, 'Load');
    row.insert(el);
    form.insert(row);

    rootel.insert(dia);
    is_open = true;

    evhan_storage_changed();
}

function set_caption(msg, isupper) {
    var elid = (isupper ? dialog_el_id+'_cap' : dialog_el_id+'_cap2');
    var el = $(elid);
    if (!el)
        return;

    if (!msg) {
        el.hide();
    }
    else {
        remove_children(el);
        insert_text(el, msg);
        el.show();
    }
}

function insert_text(el, val) {
    var nod = document.createTextNode(val);
    el.appendChild(nod);
}

function remove_children(parent) {
    var obj, ls;
    ls = parent.childNodes;
    while (ls.length > 0) {
        obj = ls.item(0);
        parent.removeChild(obj);
    }
}

function evhan_accept_button() {
    GlkOte.log('### accept');
    return false;
}

function evhan_cancel_button() {
    GlkOte.log('### cancel');
    return false;
}

function evhan_storage_changed(ev) {
    var el, bodyel, ls;

    if (!is_open)
        return false;

    var changedkey = null;
    if (ev)
        changedkey = ev.key;
    GlkOte.log('### noticed storage: key ' + changedkey);
    /* We could use the changedkey to decide whether it's worth redrawing 
       the field here. */

    bodyel = $(dialog_el_id+'_body');
    if (!bodyel)
        return false;

    ls = files_list(cur_usage, cur_gameid);
    
    if (ls.length == 0) {
        remove_children(bodyel);
        set_caption('You have no save files for this game.', true);
        el = $(dialog_el_id+'_accept');
        el.disabled = true;
    }
    else {
        //### sort ls by date

        remove_children(bodyel);
        set_caption('Select a saved game to load.', true);
        el = $(dialog_el_id+'_accept');
        el.disabled = false;
        
        var selel = new Element('select', { name:'files', size:'5' });
        var ix, file;
        for (ix=0; ix<ls.length; ix++) {
            file = ls[ix];
            el = new Element('option', { name:'f'+ix } );
            if (ix == 0)
                el.selected = true;
            insert_text(el, file.filename);
            selel.insert(el);
        }
        bodyel.insert(selel);
    }
}

function file_decode_key(key) {
    if (!key.startsWith('key:'))
        return null;

    var oldpos = 4;
    var pos = key.indexOf(':', oldpos);
    if (pos < 0)
        return null;
    var usage = key.slice(oldpos, pos);
    oldpos = pos+1;
    
    pos = key.indexOf(':', oldpos);
    if (pos < 0)
        return null;
    var gameid = key.slice(oldpos, pos);
    oldpos = pos+1;
    
    var filename = key.slice(oldpos);
    return { key:key, filename:filename, usage:usage, gameid:gameid };
}

function file_decode_stat(file) {
    if (typeof(file) != 'object') {
        file = file_decode_key(file);
        if (!file)
            return null;
    }

    var val = localStorage.getItem(file.key);
    if (!val)
        return null;

    //### date, binary
    //### game name?

    return file;
}

function file_encode(filename, usage, gameid) {
    var key = 'key:' + usage + ':' + gameid + ':' + filename;
    return { key:key, filename:filename, usage:usage, gameid:gameid };
}

function file_store(file) {
    var val = '';

    //### date, binary
    //### game name?

    localStorage.setItem(file.key, val);
}

function file_matches(file, usage, gameid) {
    if (!usage) {
        if (file.usage)
            return false;
    }
    else {
        if (file.usage != usage)
            return false;
    }

    if (!gameid) {
        if (file.gameid)
            return false;
    }
    else {
        if (file.gameid != gameid)
            return false;
    }

    return true;
}

function files_list(usage, gameid) {
    var key;
    var ls = [];

    if (!window.localStorage)
        return ls;

    for (key in localStorage) {
        file = file_decode_key(key);
        if (!file)
            continue;
        if (!file_matches(file, usage, gameid))
            continue;
        file_decode_stat(file);
        ls.push(file);
    }

    GlkOte.log('### files_list found ' + ls.length + ' files.');
    return ls;
}

/* Set up storage event handler at load time, but after all the handlers
   are defined. 
*/

window.addEventListener('storage', evhan_storage_changed, false);

//### namespace
Dialog = {
    open: dialog_open,
};
