/* Put everything inside the GiDebug namespace. */

GiDebug = function() {

var debug_el_id = 'gidebug';

var is_open = false;
var use_touch_ui;
var drag_mode = null;
var min_width = 200;

function debug_open()
{
    if (is_open)
        return;

    use_touch_ui = (window.TouchEvent != undefined);

    /* Figure out what the root div is called. The dialog box will be
       positioned in this div. We use the same default as GlkOte: 
       "gameport". We also try to interrogate GlkOte to see if that
       default has been changed. */
    var root_el_id = 'gameport';
    var iface = window.Game;
    if (window.GlkOte) 
        iface = window.GlkOte.getinterface();
    if (iface && iface.gameport)
        root_el_id = iface.gameport;

    var rootel = $('#'+root_el_id);
    if (!rootel.length)
        throw new Error('GiDebug: unable to find root element #' + root_el_id + '.');

    dia = $('<div>', { id: debug_el_id });
    var el, subel;

    function set_drag_effect(el, tag) {
        if (!use_touch_ui)
            el.on('mousedown', { tag:tag }, evhan_dragstart);
        else
            el.on('touchstart', { tag:tag }, evhan_dragstart);
    };

    el = $('<div>', { class: 'GiDebugHeader GiDebugRoundNE GiDebugRoundNW' });
    el.text('Debugging');
    dia.append(el);
    el.css({ cursor:'move' });
    set_drag_effect(el, 'position');

    subel = $('<div>', { class: 'GiDebugRightButton GiDebugRoundNE' });
    subel.css({ cursor:'e-resize' });
    el.append(subel);
    set_drag_effect(subel, 'width');

    el = $('<div>', { class: 'GiDebugFooter GiDebugRoundSE GiDebugRoundSW' });
    dia.append(el);
    el.css({ cursor:'s-resize' });
    set_drag_effect(el, 'height');

    subel = $('<div>', { class: 'GiDebugRightButton GiDebugRoundSE' });
    subel.css({ cursor:'se-resize' });
    el.append(subel);
    set_drag_effect(subel, 'size');

    el = $('<div>', { id: debug_el_id+'_body', class: 'GiDebugBody' });
    dia.append(el);

    subel = $('<div>', { id: debug_el_id+'_text', class: 'GiDebugText' });
    el.append(subel);
    subel.append($('<div>').text('### This is a line of text.'));
    subel.append($('<div>').text('### This is a very long line of line of line of text.'));
    subel.append($('<div>').text('### This is a line of text.'));
    subel.append($('<div>').text('### This is a very long line of line of line of text.'));
    subel.append($('<div>').text('### This is a line of text.'));
    subel.append($('<div>').text('### This is a very long line of line of line of text.'));

    subel = $('<div>', { class: 'GiDebugPrompt' });
    subel.text('>');
    el.append(subel);

    subel = $('<input>', { id: debug_el_id+'_input', type: 'text', class: 'GiDebugInput' });
    subel.attr({ autocapitalize:'off', 'aria-live':'off' });
    el.append(subel);

    rootel.append(dia);
    is_open = true;
}

function event_pos(ev)
{
    if (!use_touch_ui)
        return { left:ev.clientX, top:ev.clientY };
    else
        return { left:ev.originalEvent.pageX, top:ev.originalEvent.pageY };
}

function evhan_dragstart(ev)
{
    if (drag_mode)
        return;

    var dia = $('#'+debug_el_id);
    if (!dia)
        return;

    drag_mode = ev.data.tag;

    ev.preventDefault(); 
    ev.stopPropagation();

    switch (drag_mode) {
    case 'position':
        drag_offset = dia.offset();
        break;
    case 'size':
    case 'width':
    case 'height':
        drag_offset = { left:dia.width(), top:dia.height() };
        break;
    }

    var pos = event_pos(ev);
    drag_offset.left = pos.left - drag_offset.left;
    drag_offset.top = pos.top - drag_offset.top;

    if (!use_touch_ui) {
        $('body').on('mousemove', evhan_dragdrag);
        $('body').on('mouseup', evhan_dragstop);
    }
    else {
        $('body').on('touchmove', evhan_dragdrag);
        $('body').on('touchend', evhan_dragstop);
        $('body').on('touchcancel', evhan_dragstop);
    }
}

function evhan_dragdrag(ev, ui)
{
    if (!drag_mode)
        return;

    var dia = $('#'+debug_el_id);
    if (!dia)
        return;

    var pos = event_pos(ev);
    pos.left -= drag_offset.left;
    pos.top -= drag_offset.top;

    switch (drag_mode) {
    case 'position':
        pos.top = Math.max(0, pos.top);
        dia.offset(pos);
        break;
    case 'size':
        dia.width(Math.max(min_width, pos.left));
        dia.height(Math.max(min_width, pos.top));
        break;
    case 'width':
        dia.width(Math.max(min_width, pos.left));
        break;
    case 'height':
        dia.height(Math.max(min_width, pos.top));
        break;
    }
}

function evhan_dragstop(ev, ui)
{
    if (!use_touch_ui) {
        $('body').off('mousemove');
        $('body').off('mouseup');
    }
    else {
        $('body').off('touchmove');
        $('body').off('touchend');
        $('body').off('touchcancel');
    }

    drag_mode = null;
}

/* End of GiDebug namespace function. Return the object which will
   become the GiDebug global. */
return {
    open: debug_open
};

}();

/* End of GiDebug library. */
