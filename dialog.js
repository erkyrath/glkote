//### namespace

var root_el_id = 'windowport';
var dialog_el_id = 'dialog';

function dialog_open(towrite) {
    var rootel = $(root_el_id);
    if (!rootel)
        throw 'Dialog: unable to find root element #' + root_el_id + '.';

    var dia = $(dialog_el_id);
    if (dia)
        throw 'Dialog: dialog box is already open.';

    var screen = $(dialog_el_id+'_screen');
    if (!screen) {
        screen = new Element('div',
            { id: dialog_el_id+'_screen' });
        rootel.insert(screen);
    }

    dia = new Element('div', { id: dialog_el_id });
    var styledic = { left: 200+'px', top: 200+'px' };
    dia.setStyle(styledic);

    var form, el, row;

    form = new Element('form');
    dia.insert(form);

    row = new Element('div', { 'class': 'DiaCaption' });
    insert_text(row, 'Select a saved game to load.');
    form.insert(row);

    rootel.insert(dia);
}

function insert_text(el, val) {
  var nod = document.createTextNode(val);
  el.appendChild(nod);
}

//### namespace
Dialog = {
    open: dialog_open,
};
