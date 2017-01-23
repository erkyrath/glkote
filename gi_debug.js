/* GiDebug -- a debug overlay interface for GlkOte
 * Designed by Andrew Plotkin <erkyrath@eblong.com>
 * <http://eblong.com/zarf/glk/glkote.html>
 * 
 * This Javascript library is copyright 2017 by Andrew Plotkin.
 * It is distributed under the MIT license; see the "LICENSE" file.
 *
 * This library adds a simple debug console, overlaid onto the GlkOte
 * UI. Or it can be used with any HTML interface, really. GlkOte is set
 * up to activate the debug console if you set the "debug_commands" option
 * in the GlkOte game interface object.
 *
 * The library has these APIs:
 *
 * GiDebug.init(handler) -- activate the console
 *
 * Call this during initialization to set up the debug console. The
 * handler should be a function that accepts debug command strings.
 *
 * GiDebug.open() -- make the console visible
 *
 * The console is not initially visible, unless it generates output
 * on startup. Call this to make it visible.
 *
 * GiDebug.input(ls) -- perform a debugger command
 *
 * Perform a command as if it had been typed in the console.
 *
 * GiDebug.output(ls) -- display a list of text lines in the console
 *
 * Your command handler (and perhaps other parts of the game) calls this
 * to display output in the console. The argument is a *list* of lines of
 * text. (Don't call this with a bare string!)
 */

/* Put everything inside the GiDebug namespace. */

GiDebug = function() {

var debug_el_id = 'gidebug';

var is_open = false;
var use_touch_ui;
var drag_mode = null;
var drag_context = null;
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
    subel.css({ cursor:'ne-resize' });
    el.append(subel);
    set_drag_effect(subel, 'size-ne');

    subel = $('<div>', { class: 'GiDebugLeftButton GiDebugRoundNW' });
    subel.css({ cursor:'nw-resize' });
    el.append(subel);
    set_drag_effect(subel, 'size-nw');

    el = $('<div>', { class: 'GiDebugFooter GiDebugRoundSE GiDebugRoundSW' });
    dia.append(el);
    el.css({ cursor:'s-resize' });
    set_drag_effect(el, 'height');

    subel = $('<div>', { class: 'GiDebugRightButton GiDebugRoundSE' });
    subel.css({ cursor:'se-resize' });
    el.append(subel);
    set_drag_effect(subel, 'size');

    subel = $('<div>', { class: 'GiDebugLeftButton GiDebugRoundSW' });
    subel.css({ cursor:'sw-resize' });
    el.append(subel);
    set_drag_effect(subel, 'size-sw');

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
    if (!is_open)
        debug_open();

    add_lines(ls);
}

function debug_input(val)
{
    add_lines(['> '+val], 'GiDebugTextLineBold');

    if (cmd_handler)
        cmd_handler(val);
    else
        add_lines(['There is no debug command handler.']);
}

function add_lines(ls, style)
{
    var textel = $('#'+debug_el_id+'_text');
    if (!textel.length)
        return;

    var cla = 'GiDebugTextLine';
    if (style)
        cla = cla + ' ' + style;

    for (var ix=0; ix<ls.length; ix++) {
        var el = $('<div>', { class:cla });
        var val = ls[ix];
        val = val.replace(regex_long_whitespace, func_long_whitespace);
        el.text(val);
        textel.append(el);
    }

    textel.scrollTop(textel.get(0).scrollHeight);
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

    debug_input(val);
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
        drag_context = dia.offset();
        break;
    case 'size':
    case 'width':
    case 'height':
        drag_context = { width:dia.width(), height:dia.height() };
        break;
    case 'size-ne':
    case 'size-sw':
    case 'size-nw':
        drag_context = dia.offset();
        drag_context.width = dia.width();
        drag_context.height = dia.height();
        drag_context.xmax = drag_context.left + drag_context.width;
        drag_context.ymax = drag_context.top + drag_context.height;
        break;
    default:
        drag_context = {};
        break;
    }

    drag_context.basepos = event_pos(ev);
    drag_context.porttop = $('#gidebug').parent().offset().top + 4;

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
    var deltax = pos.left - drag_context.basepos.left;
    var deltay = pos.top - drag_context.basepos.top;

    switch (drag_mode) {
    case 'position':
        pos.left = drag_context.left + deltax;
        pos.top = Math.max(drag_context.porttop, drag_context.top + deltay);
        dia.offset(pos);
        break;
    case 'size':
        dia.width(Math.max(min_width, drag_context.width + deltax));
        dia.height(Math.max(min_width, drag_context.height + deltay));
        break;
    case 'width':
        dia.width(Math.max(min_width, drag_context.width + deltax));
        break;
    case 'height':
        dia.height(Math.max(min_width, drag_context.height + deltay));
        break;
    case 'size-ne':
        var ypos = Math.max(drag_context.porttop, drag_context.top + deltay);
        pos.left = drag_context.left;
        pos.top = Math.min(drag_context.ymax-min_width, ypos);
        dia.offset(pos);
        dia.width(Math.max(min_width, drag_context.width + deltax));
        dia.height(drag_context.ymax - pos.top);
        break;
    case 'size-sw':
        var xpos = drag_context.left + deltax;
        pos.top = drag_context.top;
        pos.left = Math.min(drag_context.xmax-min_width, xpos);
        dia.offset(pos);
        dia.height(Math.max(min_width, drag_context.height + deltay));
        dia.width(drag_context.xmax - pos.left);
        break;
    case 'size-nw':
        var xpos = drag_context.left + deltax;
        var ypos = Math.max(drag_context.porttop, drag_context.top + deltay);
        pos.left = Math.min(drag_context.xmax-min_width, xpos);
        pos.top = Math.min(drag_context.ymax-min_width, ypos);
        dia.offset(pos);
        dia.width(drag_context.xmax - pos.left);
        dia.height(drag_context.ymax - pos.top);
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
    drag_context = null;
}

/* End of GiDebug namespace function. Return the object which will
   become the GiDebug global. */
return {
    init: debug_init,
    open: debug_open,
    input: debug_input,
    output: debug_output
};

}();

/* End of GiDebug library. */
