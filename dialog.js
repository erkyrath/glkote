//### namespace

var root_el_id = 'windowport';
var dialog_el_id = 'dialog';

var is_open = false;
var will_save; /* is this a save dialog? */
var cur_usage; /* a string representing the file's category */
var cur_gameid; /* a string representing the game */
var cur_filelist; /* the files currently on display */

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
    var selel = $(dialog_el_id+'_select');
    if (!selel)
        return false;
    var pos = selel.selectedIndex;
    if (!cur_filelist || pos < 0 || pos >= cur_filelist.length)
        return false;
    var file = cur_filelist[pos];
    file = file_decode_stat(file.key);
    if (!file)
        return false;
    GlkOte.log('### selected ' + file.key);
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
    //### sort ls by date
    cur_filelist = ls;
    
    if (ls.length == 0) {
        remove_children(bodyel);
        set_caption('You have no save files for this game.', true);
        el = $(dialog_el_id+'_accept');
        el.disabled = true;
    }
    else {
        remove_children(bodyel);
        set_caption('Select a saved game to load.', true);
        el = $(dialog_el_id+'_accept');
        el.disabled = false;
        
        var selel = new Element('select', { id: dialog_el_id+'_select', name:'files', size:'5' });
        var ix, file, datestr;
        for (ix=0; ix<ls.length; ix++) {
            file = ls[ix];
            el = new Element('option', { name:'f'+ix } );
            if (ix == 0)
                el.selected = true;
            datestr = format_date(file.modified);
            insert_text(el, file.filename + ' -- ' + datestr);
            selel.insert(el);
        }
        bodyel.insert(selel);
    }
}

function file_create_ref(filename, usage, gameid) {
    if (!usage)
        useage = '';
    if (!gameid)
        gameid = '';
    var key = 'key:' + usage + ':' + gameid + ':' + filename;
    var file = { key:key, filename:filename, usage:usage, gameid:gameid };
    return file;
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

    var statstring = localStorage.getItem(file.key);
    if (!statstring)
        return null;

    var ix, pos, key, val;

    var ls = statstring.split(',');
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
        case 'contentid':
            file.contentid = val;
            break;
        }
    }

    //### binary
    //### game name?

    return file;
}

function file_ref_exists(file) {
    var statstring = localStorage.getItem(file.key);
    if (!statstring)
        return false;
    else
        return true;
}

function file_remove(file) {
    localStorage.removeItem(file.key);
}

function file_store(file) {
    var val, ls;

    if (!file.contentid) {
        if (!file_decode_stat(file)) {
            file.contentid = generate_guid();
            file.created = new Date();
        }
    }
    /* ### If there is a stored key, update this file? Or leave that until
       write time? */

    file.modified = new Date();

    ls = [];

    if (file.created)
        ls.push('created:' + file.created.getTime());
    if (file.modified)
        ls.push('modified:' + file.modified.getTime());
    if (file.contentid)
        ls.push('contentid:' + file.contentid);

    //### binary
    //### game name?

    val = ls.join(',');
    localStorage.setItem(file.key, val);

    return true;
}

function file_matches(file, usage, gameid) {
    if (usage != null) {
        if (file.usage != usage)
            return false;
    }

    if (gameid != null) {
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

var guid_counter = 1;

function generate_guid() {
    var timestamp = new Date().getTime();
    var guid = timestamp + '_' + Math.random() + '_' + guid_counter;
    guid_counter++;
    guid = guid.replace('.', '');
    return guid;
}

function format_date(date) {
    var day =  (date.getMonth()+1) + '/' + date.getDate();
    var time = date.getHours() + ':' + (date.getMinutes() < 10 ? '0' : '') + date.getMinutes();
    return day + ' ' + time;
}


/* Set up storage event handler at load time, but after all the handlers
   are defined. 
*/

window.addEventListener('storage', evhan_storage_changed, false);

//### namespace
Dialog = {
    open: dialog_open,

    file_create_ref: file_create_ref,
    file_ref_exists: file_ref_exists,
    file_remove: file_remove,
};
