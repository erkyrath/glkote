/* Put everything inside the GiDebug namespace. */

GiDebug = function() {

var debug_el_id = 'gidebug';

var is_open = false;
var use_touch_ui;
var drag_mode = null;
var min_width = 200;
var cmd_handler = null;

function debug_init(handler)
{
    cmd_handler = handler;
}

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

    subel = $('<div>', { class: 'GiDebugPrompt' });
    subel.text('>');
    el.append(subel);

    subel = $('<input>', { id: debug_el_id+'_input', type: 'text', class: 'GiDebugInput' });
    subel.attr({ autocapitalize:'off', 'aria-live':'off' });
    subel.on('keypress', function(ev) {
        if (ev.keyCode == 13) {
            evhan_input(ev);
        }
    });
    el.append(subel);

    rootel.append(dia);
    is_open = true;
}

function debug_output(ls)
{
    add_lines(ls);
}

function add_lines(ls)
{
    var textel = $('#'+debug_el_id+'_text');
    if (!textel.length)
        return;

    for (var ix=0; ix<ls.length; ix++) {
        var el = $('<div>');
        var val = ls[ix];
        val = val.replace(regex_long_whitespace, func_long_whitespace);
        el.text(val);
        textel.append(el);
    }

    textel.scrollTop(textel.height());
}

var regex_long_whitespace = new RegExp('  +', 'g'); /* two or more spaces */

/* Given a run of N spaces (N >= 2), return N-1 non-breaking spaces plus
   a normal one. */
function func_long_whitespace(match) {
  var len = match.length;
  if (len == 1)
    return ' ';
  /* Evil trick I picked up from Prototype. Gives len-1 copies of NBSP. */
  var res = new Array(len).join('\xa0');
  return res + ' ';
}

function evhan_input(ev)
{
    var inputel = $('#'+debug_el_id+'_input');
    if (!inputel.length)
        return;

    var val = inputel.val().trim();
    inputel.val('');

    if (!val.length)
        return;

    add_lines(['> '+val]);

    if (cmd_handler)
        cmd_handler(val);
    else
        add_lines(['There is no debug command handler.']);
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
    if (!dia.length)
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
    if (!dia.length)
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
    init: debug_init,
    open: debug_open,
    output: debug_output
};

}();

/* End of GiDebug library. */
