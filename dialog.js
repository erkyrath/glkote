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
    //### center better?
    var styledic = { left: 150+'px', top: 150+'px' };
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
    if (!file_ref_exists(file.dirent))
        return false;
    GlkOte.log('### selected ' + file.dirent.dirent);
    //### callback
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
            insert_text(el, file.dirent.filename + ' -- ' + datestr);
            selel.insert(el);
        }
        bodyel.insert(selel);
    }
}

function file_construct_ref(filename, usage, gameid) {
    if (!usage)
        useage = '';
    if (!gameid)
        gameid = '';
    var key = usage + ':' + gameid + ':' + filename;
    var ref = { dirent: 'dirent:'+key, content: 'content:'+key,
                filename: filename, usage: usage, gameid: gameid };
    return ref;
}

function file_decode_ref(dirkey) {
    if (!dirkey.startsWith('dirent:'))
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

function file_load_dirent(dirent) {
    if (typeof(dirent) != 'object') {
        dirent = file_decode_ref(dirent);
        if (!dirent)
            return null;
    }

    var statstring = localStorage.getItem(dirent.dirent);
    if (!statstring)
        return null;

    var file = { dirent: dirent };

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
        }
    }

    //### binary
    //### game name?

    return file;
}

function file_ref_exists(ref) {
    var statstring = localStorage.getItem(ref.dirent);
    if (!statstring)
        return false;
    else
        return true;
}

function file_remove_ref(ref) {
    localStorage.removeItem(ref.dirent);
    localStorage.removeItem(ref.content);
}

function file_write(dirent, content, israw) {
    var val, ls;

    var file = file_load_dirent(dirent);
    if (!file) {
        file = { dirent: dirent, created: new Date() };
    }

    file.modified = new Date();

    if (!israw)
        content = btoa(content);

    ls = [];

    if (file.created)
        ls.push('created:' + file.created.getTime());
    if (file.modified)
        ls.push('modified:' + file.modified.getTime());

    //### binary
    //### game name?

    val = ls.join(',');
    localStorage.setItem(file.dirent.dirent, val);
    localStorage.setItem(file.dirent.content, content);

    return true;
}

function file_read(dirent, israw) {
    //###
    //### return null if no such file
    //### make sure '' maps to either '' or []
    return [];
}

function file_dirent_matches(dirent, usage, gameid) {
    if (usage != null) {
        if (dirent.usage != usage)
            return false;
    }

    if (gameid != null) {
        if (dirent.gameid != gameid)
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
        var dirent = file_decode_ref(key);
        if (!dirent)
            continue;
        if (!file_dirent_matches(dirent, usage, gameid))
            continue;
        var file = file_load_dirent(dirent);
        ls.push(file);
    }

    GlkOte.log('### files_list found ' + ls.length + ' files.');
    return ls;
}

var guid_counter = 1;
/*### delete this? */
function generate_guid() {
    var timestamp = new Date().getTime();
    var guid = timestamp + '_' + Math.random() + '_' + guid_counter;
    guid_counter++;
    guid = guid.replace('.', '');
    return guid;
}

function format_date(date) {
    if (!date)
        return '???';
    //### display relative dates?
    var day = (date.getMonth()+1) + '/' + date.getDate();
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

    file_construct_ref: file_construct_ref,
    file_ref_exists: file_ref_exists,
    file_remove_ref: file_remove_ref,
    file_write: file_write,
    file_read: file_read,
};
