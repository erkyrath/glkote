/* GlkAPI -- a Javascript Glk API for IF interfaces
 * Designed by Andrew Plotkin <erkyrath@eblong.com>
 * <http://eblong.com/zarf/glk/glkote.html>
 * 
 * This Javascript library is copyright 2010 by Andrew Plotkin. You may
 * copy and distribute it freely, by any means and under any conditions,
 * as long as the code and documentation is not changed. You may also
 * incorporate this code into your own program and distribute that, or
 * modify this code and use and distribute the modified version, as long
 * as you retain a notice in your program or documentation which mentions
 * my name and the URL shown above.
 *
 * This file is a Glk API compatibility layer for glkote.js. It offers a 
 * set of Javascript calls which closely match the original C Glk API;
 * these work by means of glkote.js operations.
 *
 * This API was built for Quixe, which is a pure-Javascript Glulx
 * interpreter. Therefore, the API is a little strange. Notably, it
 * accepts string data in the form of an array of integers, not a 
 * Javascript string. There are a few extra calls (glk_put_jstring,
 * etc) which work in the more intuitive way.
 *
 * If you are writing an application in pure Javascript, you can use
 * this layer (along with glkote.js). If you are writing a web app which
 * is the front face of a server-side Glk app, ignore this file -- use
 * glkote.js directly.
 */


/* Known problems:

   Some places in the library get confused about Unicode characters
   beyond 0xFFFF. They are handled correctly by streams, but grid windows
   will think they occupy two characters rather than one, which will
   throw off the grid spacing. 

   Also, the glk_put_jstring() function can't handle them at all. Quixe
   printing operations that funnel through glk_put_jstring() -- meaning, 
   most native string printing -- will break up three-byte characters 
   into a UTF-16-encoded pair of two-byte characters. This will come
   out okay in a buffer window, but it will again mess up grid windows,
   and will also double the write-count in a stream.
*/

Glk = function() {

/* The VM interface object. */
var VM = null;

var has_exited = false;
var event_generation = 0;
var current_partial_inputs = null;
var current_partial_outputs = null;

/* Initialize the library, initialize the VM, and set it running. (It will 
   run until the first glk_select() or glk_exit() call.)

   The argument must be an appropriate VM interface object. (For example, 
   Quixe.) It must have init() and resume() methods. 
*/
function init(vm_api) {
    VM = vm_api;
    if (window.GiDispa)
        GiDispa.set_vm(VM);
    //### the 4 spacing here should come from somewhere else
    GlkOte.init({ accept: accept_ui_event, spacing: 4 });
}

function accept_ui_event(obj) {
    var box;

    qlog("### accept_ui_event: " + obj.type + ", gen " + obj.gen);
    if (has_exited) {
        /* We've hit glk_exit() or a VM fatal error. */
        return;
    }

    if (obj.gen != event_generation) {
      GlkOte.log('Input event had wrong generation number: got ' + obj.gen + ', currently at ' + event_generation);
      return;
    }
    event_generation += 1;

    /* Note any partial inputs; we'll need them if the game cancels a line
       input. This may be undef. */
    current_partial_inputs = obj.partial;

    switch (obj.type) {
    case 'init':
        content_metrics = obj.metrics;
        VM.init();
        break;

    case 'external':
        if (obj.value == 'timer') {
            handle_timer_input();
        }
        break;

    case 'hyperlink':
        handle_hyperlink_input(obj.window, obj.value);
        break;

    case 'char':
        handle_char_input(obj.window, obj.value);
        break;

    case 'line':
        handle_line_input(obj.window, obj.value);
        break;

    case 'arrange':
        content_metrics = obj.metrics;
        box = {
            left: content_metrics.outspacingx,
            top: content_metrics.outspacingy,
            right: content_metrics.width-content_metrics.outspacingx,
            bottom: content_metrics.height-content_metrics.outspacingy,
        };
        if (gli_rootwin)
            gli_window_rearrange(gli_rootwin, box);
        handle_arrange_input();
        break;
    }
}

function handle_arrange_input() {
    if (!gli_selectref)
        return;

    gli_selectref.set_field(0, Const.evtype_Arrange);
    gli_selectref.set_field(1, null);
    gli_selectref.set_field(2, 0);
    gli_selectref.set_field(3, 0);

    if (window.GiDispa)
        GiDispa.prepare_resume(gli_selectref);
    gli_selectref = null;
    VM.resume();
}

function handle_timer_input() {
    if (!gli_selectref)
        return;

    gli_selectref.set_field(0, Const.evtype_Timer);
    gli_selectref.set_field(1, null);
    gli_selectref.set_field(2, 0);
    gli_selectref.set_field(3, 0);

    if (window.GiDispa)
        GiDispa.prepare_resume(gli_selectref);
    gli_selectref = null;
    VM.resume();
}

function handle_hyperlink_input(disprock, val) {
    if (!gli_selectref)
        return;

    var win = null;
    for (win=gli_windowlist; win; win=win.next) {
        if (win.disprock == disprock) 
            break;
    }
    if (!win || !win.hyperlink_request)
        return;

    gli_selectref.set_field(0, Const.evtype_Hyperlink);
    gli_selectref.set_field(1, win);
    gli_selectref.set_field(2, val);
    gli_selectref.set_field(3, 0);

    win.hyperlink_request = false;

    if (window.GiDispa)
        GiDispa.prepare_resume(gli_selectref);
    gli_selectref = null;
    VM.resume();
}

function handle_char_input(disprock, input) {
    var charval;

    if (!gli_selectref)
        return;

    var win = null;
    for (win=gli_windowlist; win; win=win.next) {
        if (win.disprock == disprock) 
            break;
    }
    if (!win || !win.char_request)
        return;

    if (input.length == 1) {
        charval = input.charCodeAt(0);
        if (!win.char_request_uni)
            charval = charval & 0xFF;
    }
    else {
        charval = KeystrokeNameMap[input];
        if (!charval)
            charval = Const.keycode_Unknown;
    }

    gli_selectref.set_field(0, Const.evtype_CharInput);
    gli_selectref.set_field(1, win);
    gli_selectref.set_field(2, charval);
    gli_selectref.set_field(3, 0);

    win.char_request = false;
    win.char_request_uni = false;
    win.input_generation = null;

    if (window.GiDispa)
        GiDispa.prepare_resume(gli_selectref);
    gli_selectref = null;
    VM.resume();
}

function handle_line_input(disprock, input) {
    var ix;

    if (!gli_selectref)
        return;

    var win = null;
    for (win=gli_windowlist; win; win=win.next) {
        if (win.disprock == disprock) 
            break;
    }
    if (!win || !win.line_request)
        return;

    if (input.length > win.linebuf.length)
        input = input.slice(0, win.linebuf.length);

    ix = win.style;
    gli_set_style(win.str, Const.style_Input);
    gli_window_put_string(win, input+"\n");
    if (win.echostr)
        glk_put_jstring_stream(win.echostr, input+"\n");
    gli_set_style(win.str, ix);
    //### wrong for grid window?

    for (ix=0; ix<input.length; ix++)
        win.linebuf[ix] = input.charCodeAt(ix);

    gli_selectref.set_field(0, Const.evtype_LineInput);
    gli_selectref.set_field(1, win);
    gli_selectref.set_field(2, input.length);
    gli_selectref.set_field(3, 0);

    if (window.GiDispa)
        GiDispa.unretain_array(win.linebuf);
    win.line_request = false;
    win.line_request_uni = false;
    win.input_generation = null;
    win.linebuf = null;

    if (window.GiDispa)
        GiDispa.prepare_resume(gli_selectref);
    gli_selectref = null;
    VM.resume();
}

function update() {
    var dataobj = { type: 'update', gen: event_generation };
    var winarray = null;
    var contentarray = null;
    var inputarray = null;
    var win, obj, robj, useobj, lineobj, ls, val, ix, cx;
    var initial, lastpos, laststyle, lasthyperlink;

    if (geometry_changed) {
        geometry_changed = false;
        winarray = [];
        for (win=gli_windowlist; win; win=win.next) {
            if (win.type == Const.wintype_Pair)
                continue;

            obj = { id: win.disprock, rock: win.rock };
            winarray.push(obj);

            switch (win.type) {
            case Const.wintype_TextBuffer:
                obj.type = 'buffer';
                break;
            case Const.wintype_TextGrid:
                obj.type = 'grid';
                obj.gridwidth = win.gridwidth;
                obj.gridheight = win.gridheight;
                break;
            }

            obj.left = win.bbox.left;
            obj.top = win.bbox.top;
            obj.width = win.bbox.right - win.bbox.left;
            obj.height = win.bbox.bottom - win.bbox.top;
        }
    }

    for (win=gli_windowlist; win; win=win.next) {
        useobj = false;
        obj = { id: win.disprock };
        if (contentarray == null)
            contentarray = [];

        switch (win.type) {
        case Const.wintype_TextBuffer:
            gli_window_buffer_deaccumulate(win);
            if (win.content.length) {
                obj.text = win.content.slice(0);
                win.content.length = 0;
                useobj = true;
            }
            if (win.clearcontent) {
                obj.clear = true;
                win.clearcontent = false;
                useobj = true;
                if (!obj.text) {
                    obj.text = [];
                }
            }
            break;
        case Const.wintype_TextGrid:
            if (win.gridwidth == 0 || win.gridheight == 0)
                break;
            obj.lines = [];
            for (ix=0; ix<win.gridheight; ix++) {
                lineobj = win.lines[ix];
                if (!lineobj.dirty)
                    continue;
                lineobj.dirty = false;
                ls = [];
                lastpos = 0;
                for (cx=0; cx<win.gridwidth; ) {
                    laststyle = lineobj.styles[cx];
                    lasthyperlink = lineobj.hyperlinks[cx];
                    for (; cx<win.gridwidth 
                             && lineobj.styles[cx] == laststyle
                             && lineobj.hyperlinks[cx] == lasthyperlink; 
                         cx++) { }
                    if (lastpos < cx) {
                        if (!lasthyperlink) {
                            ls.push(StyleNameMap[laststyle]);
                            ls.push(lineobj.chars.slice(lastpos, cx).join(''));
                        }
                        else {
                            robj = { style:StyleNameMap[laststyle], text:lineobj.chars.slice(lastpos, cx).join(''), hyperlink:lasthyperlink };
                            ls.push(robj);
                        }
                        lastpos = cx;
                    }
                }
                obj.lines.push({ line:ix, content:ls });
            }
            useobj = obj.lines.length;
            break;
        }

        if (useobj)
            contentarray.push(obj);
    }

    inputarray = [];
    for (win=gli_windowlist; win; win=win.next) {
        obj = null;
        if (win.char_request) {
            obj = { id: win.disprock, type: 'char', gen: win.input_generation };
            if (win.type == Const.wintype_TextGrid) {
                gli_window_grid_canonicalize(win);
                obj.xpos = win.cursorx;
                obj.ypos = win.cursory;
            }
        }
        if (win.line_request) {
            initial = '';
            if (current_partial_outputs) {
                val = current_partial_outputs[win.disprock];
                if (val)
                    initial = val;
            }
            obj = { id: win.disprock, type: 'line', gen: win.input_generation,
                    maxlen: win.linebuf.length, initial: initial };
        }
        if (win.hyperlink_request) {
            if (!obj)
                obj = { id: win.disprock };
            obj.hyperlink = true;
        }
        if (obj)
            inputarray.push(obj);
    }

    dataobj.windows = winarray;
    dataobj.content = contentarray;
    dataobj.input = inputarray;

    /* Clean this up; it's only meaningful within one run/update cycle. */
    current_partial_outputs = null;

    GlkOte.update(dataobj);
}

/* This is the handler for a VM fatal error. (Not for an error in our own
   library!) We display the error message, and then push a final display
   update, which kills all input fields in all windows.
*/
function fatal_error(msg) {
    has_exited = true;
    GlkOte.error(msg);
    var dataobj = { type: 'update', gen: event_generation };
    dataobj.input = [];
    GlkOte.update(dataobj);
}

/* All the numeric constants used by the Glk interface. We push these into
   an object, for tidiness. */

var Const = {
    gestalt_Version : 0,
    gestalt_CharInput : 1,
    gestalt_LineInput : 2,
    gestalt_CharOutput : 3,
      gestalt_CharOutput_CannotPrint : 0,
      gestalt_CharOutput_ApproxPrint : 1,
      gestalt_CharOutput_ExactPrint : 2,
    gestalt_MouseInput : 4,
    gestalt_Timer : 5,
    gestalt_Graphics : 6,
    gestalt_DrawImage : 7,
    gestalt_Sound : 8,
    gestalt_SoundVolume : 9,
    gestalt_SoundNotify : 10,
    gestalt_Hyperlinks : 11,
    gestalt_HyperlinkInput : 12,
    gestalt_SoundMusic : 13,
    gestalt_GraphicsTransparency : 14,
    gestalt_Unicode : 15,

    keycode_Unknown  : 0xffffffff,
    keycode_Left     : 0xfffffffe,
    keycode_Right    : 0xfffffffd,
    keycode_Up       : 0xfffffffc,
    keycode_Down     : 0xfffffffb,
    keycode_Return   : 0xfffffffa,
    keycode_Delete   : 0xfffffff9,
    keycode_Escape   : 0xfffffff8,
    keycode_Tab      : 0xfffffff7,
    keycode_PageUp   : 0xfffffff6,
    keycode_PageDown : 0xfffffff5,
    keycode_Home     : 0xfffffff4,
    keycode_End      : 0xfffffff3,
    keycode_Func1    : 0xffffffef,
    keycode_Func2    : 0xffffffee,
    keycode_Func3    : 0xffffffed,
    keycode_Func4    : 0xffffffec,
    keycode_Func5    : 0xffffffeb,
    keycode_Func6    : 0xffffffea,
    keycode_Func7    : 0xffffffe9,
    keycode_Func8    : 0xffffffe8,
    keycode_Func9    : 0xffffffe7,
    keycode_Func10   : 0xffffffe6,
    keycode_Func11   : 0xffffffe5,
    keycode_Func12   : 0xffffffe4,
    /* The last keycode is always (0x100000000 - keycode_MAXVAL) */
    keycode_MAXVAL   : 28,

    evtype_None : 0,
    evtype_Timer : 1,
    evtype_CharInput : 2,
    evtype_LineInput : 3,
    evtype_MouseInput : 4,
    evtype_Arrange : 5,
    evtype_Redraw : 6,
    evtype_SoundNotify : 7,
    evtype_Hyperlink : 8,

    style_Normal : 0,
    style_Emphasized : 1,
    style_Preformatted : 2,
    style_Header : 3,
    style_Subheader : 4,
    style_Alert : 5,
    style_Note : 6,
    style_BlockQuote : 7,
    style_Input : 8,
    style_User1 : 9,
    style_User2 : 10,
    style_NUMSTYLES : 11,

    wintype_AllTypes : 0,
    wintype_Pair : 1,
    wintype_Blank : 2,
    wintype_TextBuffer : 3,
    wintype_TextGrid : 4,
    wintype_Graphics : 5,

    winmethod_Left  : 0x00,
    winmethod_Right : 0x01,
    winmethod_Above : 0x02,
    winmethod_Below : 0x03,
    winmethod_DirMask : 0x0f,

    winmethod_Fixed : 0x10,
    winmethod_Proportional : 0x20,
    winmethod_DivisionMask : 0xf0,

    fileusage_Data : 0x00,
    fileusage_SavedGame : 0x01,
    fileusage_Transcript : 0x02,
    fileusage_InputRecord : 0x03,
    fileusage_TypeMask : 0x0f,

    fileusage_TextMode   : 0x100,
    fileusage_BinaryMode : 0x000,

    filemode_Write : 0x01,
    filemode_Read : 0x02,
    filemode_ReadWrite : 0x03,
    filemode_WriteAppend : 0x05,

    seekmode_Start : 0,
    seekmode_Current : 1,
    seekmode_End : 2,

    stylehint_Indentation : 0,
    stylehint_ParaIndentation : 1,
    stylehint_Justification : 2,
    stylehint_Size : 3,
    stylehint_Weight : 4,
    stylehint_Oblique : 5,
    stylehint_Proportional : 6,
    stylehint_TextColor : 7,
    stylehint_BackColor : 8,
    stylehint_ReverseColor : 9,
    stylehint_NUMHINTS : 10,

      stylehint_just_LeftFlush : 0,
      stylehint_just_LeftRight : 1,
      stylehint_just_Centered : 2,
      stylehint_just_RightFlush : 3,
};

var KeystrokeNameMap = {
    /* The key values are taken from GlkOte's "char" event. A couple of them
       are Javascript keywords, so they're in quotes, but that doesn't affect
       the final structure. */
    left : Const.keycode_Left,
    right : Const.keycode_Right,
    up : Const.keycode_Up,
    down : Const.keycode_Down,
    'return' : Const.keycode_Return,
    'delete' : Const.keycode_Delete,
    escape : Const.keycode_Escape,
    tab : Const.keycode_Tab,
    pageup : Const.keycode_PageUp,
    pagedown : Const.keycode_PageDown,
    home : Const.keycode_Home,
    end : Const.keycode_End,
};

var StyleNameMap = {
    0 : 'normal',
    1 : 'emphasized',
    2 : 'preformatted',
    3 : 'header',
    4 : 'subheader',
    5 : 'alert',
    6 : 'note',
    7 : 'blockquote',
    8 : 'input',
    9 : 'user1',
    10 : 'user2',
};

/* These tables were generated by casemap.py. */

var unicode_upper_table = {
 0x61: 0x41,  0x62: 0x42,  0x63: 0x43,  0x64: 0x44,  0x65: 0x45,
 0x66: 0x46,  0x67: 0x47,  0x68: 0x48,  0x69: 0x49,  0x6a: 0x4a,
 0x6b: 0x4b,  0x6c: 0x4c,  0x6d: 0x4d,  0x6e: 0x4e,  0x6f: 0x4f,
 0x70: 0x50,  0x71: 0x51,  0x72: 0x52,  0x73: 0x53,  0x74: 0x54,
 0x75: 0x55,  0x76: 0x56,  0x77: 0x57,  0x78: 0x58,  0x79: 0x59,
 0x7a: 0x5a,  0xb5: 0x39c,  0xdf: [ 0x53,0x53 ],  0xe0: 0xc0,  0xe1: 0xc1,
 0xe2: 0xc2,  0xe3: 0xc3,  0xe4: 0xc4,  0xe5: 0xc5,  0xe6: 0xc6,
 0xe7: 0xc7,  0xe8: 0xc8,  0xe9: 0xc9,  0xea: 0xca,  0xeb: 0xcb,
 0xec: 0xcc,  0xed: 0xcd,  0xee: 0xce,  0xef: 0xcf,  0xf0: 0xd0,
 0xf1: 0xd1,  0xf2: 0xd2,  0xf3: 0xd3,  0xf4: 0xd4,  0xf5: 0xd5,
 0xf6: 0xd6,  0xf8: 0xd8,  0xf9: 0xd9,  0xfa: 0xda,  0xfb: 0xdb,
 0xfc: 0xdc,  0xfd: 0xdd,  0xfe: 0xde,  0xff: 0x178,  0x101: 0x100,
 0x103: 0x102,  0x105: 0x104,  0x107: 0x106,  0x109: 0x108,  0x10b: 0x10a,
 0x10d: 0x10c,  0x10f: 0x10e,  0x111: 0x110,  0x113: 0x112,  0x115: 0x114,
 0x117: 0x116,  0x119: 0x118,  0x11b: 0x11a,  0x11d: 0x11c,  0x11f: 0x11e,
 0x121: 0x120,  0x123: 0x122,  0x125: 0x124,  0x127: 0x126,  0x129: 0x128,
 0x12b: 0x12a,  0x12d: 0x12c,  0x12f: 0x12e,  0x131: 0x49,  0x133: 0x132,
 0x135: 0x134,  0x137: 0x136,  0x13a: 0x139,  0x13c: 0x13b,  0x13e: 0x13d,
 0x140: 0x13f,  0x142: 0x141,  0x144: 0x143,  0x146: 0x145,  0x148: 0x147,
 0x149: [ 0x2bc,0x4e ],  0x14b: 0x14a,  0x14d: 0x14c,  0x14f: 0x14e,  0x151: 0x150,
 0x153: 0x152,  0x155: 0x154,  0x157: 0x156,  0x159: 0x158,  0x15b: 0x15a,
 0x15d: 0x15c,  0x15f: 0x15e,  0x161: 0x160,  0x163: 0x162,  0x165: 0x164,
 0x167: 0x166,  0x169: 0x168,  0x16b: 0x16a,  0x16d: 0x16c,  0x16f: 0x16e,
 0x171: 0x170,  0x173: 0x172,  0x175: 0x174,  0x177: 0x176,  0x17a: 0x179,
 0x17c: 0x17b,  0x17e: 0x17d,  0x17f: 0x53,  0x183: 0x182,  0x185: 0x184,
 0x188: 0x187,  0x18c: 0x18b,  0x192: 0x191,  0x195: 0x1f6,  0x199: 0x198,
 0x19e: 0x220,  0x1a1: 0x1a0,  0x1a3: 0x1a2,  0x1a5: 0x1a4,  0x1a8: 0x1a7,
 0x1ad: 0x1ac,  0x1b0: 0x1af,  0x1b4: 0x1b3,  0x1b6: 0x1b5,  0x1b9: 0x1b8,
 0x1bd: 0x1bc,  0x1bf: 0x1f7,  0x1c5: 0x1c4,  0x1c6: 0x1c4,  0x1c8: 0x1c7,
 0x1c9: 0x1c7,  0x1cb: 0x1ca,  0x1cc: 0x1ca,  0x1ce: 0x1cd,  0x1d0: 0x1cf,
 0x1d2: 0x1d1,  0x1d4: 0x1d3,  0x1d6: 0x1d5,  0x1d8: 0x1d7,  0x1da: 0x1d9,
 0x1dc: 0x1db,  0x1dd: 0x18e,  0x1df: 0x1de,  0x1e1: 0x1e0,  0x1e3: 0x1e2,
 0x1e5: 0x1e4,  0x1e7: 0x1e6,  0x1e9: 0x1e8,  0x1eb: 0x1ea,  0x1ed: 0x1ec,
 0x1ef: 0x1ee,  0x1f0: [ 0x4a,0x30c ],  0x1f2: 0x1f1,  0x1f3: 0x1f1,  0x1f5: 0x1f4,
 0x1f9: 0x1f8,  0x1fb: 0x1fa,  0x1fd: 0x1fc,  0x1ff: 0x1fe,  0x201: 0x200,
 0x203: 0x202,  0x205: 0x204,  0x207: 0x206,  0x209: 0x208,  0x20b: 0x20a,
 0x20d: 0x20c,  0x20f: 0x20e,  0x211: 0x210,  0x213: 0x212,  0x215: 0x214,
 0x217: 0x216,  0x219: 0x218,  0x21b: 0x21a,  0x21d: 0x21c,  0x21f: 0x21e,
 0x223: 0x222,  0x225: 0x224,  0x227: 0x226,  0x229: 0x228,  0x22b: 0x22a,
 0x22d: 0x22c,  0x22f: 0x22e,  0x231: 0x230,  0x233: 0x232,  0x253: 0x181,
 0x254: 0x186,  0x256: 0x189,  0x257: 0x18a,  0x259: 0x18f,  0x25b: 0x190,
 0x260: 0x193,  0x263: 0x194,  0x268: 0x197,  0x269: 0x196,  0x26f: 0x19c,
 0x272: 0x19d,  0x275: 0x19f,  0x280: 0x1a6,  0x283: 0x1a9,  0x288: 0x1ae,
 0x28a: 0x1b1,  0x28b: 0x1b2,  0x292: 0x1b7,  0x345: 0x399,  0x390: [ 0x399,0x308,0x301 ],
 0x3ac: 0x386,  0x3ad: 0x388,  0x3ae: 0x389,  0x3af: 0x38a,  0x3b0: [ 0x3a5,0x308,0x301 ],
 0x3b1: 0x391,  0x3b2: 0x392,  0x3b3: 0x393,  0x3b4: 0x394,  0x3b5: 0x395,
 0x3b6: 0x396,  0x3b7: 0x397,  0x3b8: 0x398,  0x3b9: 0x399,  0x3ba: 0x39a,
 0x3bb: 0x39b,  0x3bc: 0x39c,  0x3bd: 0x39d,  0x3be: 0x39e,  0x3bf: 0x39f,
 0x3c0: 0x3a0,  0x3c1: 0x3a1,  0x3c2: 0x3a3,  0x3c3: 0x3a3,  0x3c4: 0x3a4,
 0x3c5: 0x3a5,  0x3c6: 0x3a6,  0x3c7: 0x3a7,  0x3c8: 0x3a8,  0x3c9: 0x3a9,
 0x3ca: 0x3aa,  0x3cb: 0x3ab,  0x3cc: 0x38c,  0x3cd: 0x38e,  0x3ce: 0x38f,
 0x3d0: 0x392,  0x3d1: 0x398,  0x3d5: 0x3a6,  0x3d6: 0x3a0,  0x3d9: 0x3d8,
 0x3db: 0x3da,  0x3dd: 0x3dc,  0x3df: 0x3de,  0x3e1: 0x3e0,  0x3e3: 0x3e2,
 0x3e5: 0x3e4,  0x3e7: 0x3e6,  0x3e9: 0x3e8,  0x3eb: 0x3ea,  0x3ed: 0x3ec,
 0x3ef: 0x3ee,  0x3f0: 0x39a,  0x3f1: 0x3a1,  0x3f2: 0x3f9,  0x3f5: 0x395,
 0x3f8: 0x3f7,  0x3fb: 0x3fa,  0x430: 0x410,  0x431: 0x411,  0x432: 0x412,
 0x433: 0x413,  0x434: 0x414,  0x435: 0x415,  0x436: 0x416,  0x437: 0x417,
 0x438: 0x418,  0x439: 0x419,  0x43a: 0x41a,  0x43b: 0x41b,  0x43c: 0x41c,
 0x43d: 0x41d,  0x43e: 0x41e,  0x43f: 0x41f,  0x440: 0x420,  0x441: 0x421,
 0x442: 0x422,  0x443: 0x423,  0x444: 0x424,  0x445: 0x425,  0x446: 0x426,
 0x447: 0x427,  0x448: 0x428,  0x449: 0x429,  0x44a: 0x42a,  0x44b: 0x42b,
 0x44c: 0x42c,  0x44d: 0x42d,  0x44e: 0x42e,  0x44f: 0x42f,  0x450: 0x400,
 0x451: 0x401,  0x452: 0x402,  0x453: 0x403,  0x454: 0x404,  0x455: 0x405,
 0x456: 0x406,  0x457: 0x407,  0x458: 0x408,  0x459: 0x409,  0x45a: 0x40a,
 0x45b: 0x40b,  0x45c: 0x40c,  0x45d: 0x40d,  0x45e: 0x40e,  0x45f: 0x40f,
 0x461: 0x460,  0x463: 0x462,  0x465: 0x464,  0x467: 0x466,  0x469: 0x468,
 0x46b: 0x46a,  0x46d: 0x46c,  0x46f: 0x46e,  0x471: 0x470,  0x473: 0x472,
 0x475: 0x474,  0x477: 0x476,  0x479: 0x478,  0x47b: 0x47a,  0x47d: 0x47c,
 0x47f: 0x47e,  0x481: 0x480,  0x48b: 0x48a,  0x48d: 0x48c,  0x48f: 0x48e,
 0x491: 0x490,  0x493: 0x492,  0x495: 0x494,  0x497: 0x496,  0x499: 0x498,
 0x49b: 0x49a,  0x49d: 0x49c,  0x49f: 0x49e,  0x4a1: 0x4a0,  0x4a3: 0x4a2,
 0x4a5: 0x4a4,  0x4a7: 0x4a6,  0x4a9: 0x4a8,  0x4ab: 0x4aa,  0x4ad: 0x4ac,
 0x4af: 0x4ae,  0x4b1: 0x4b0,  0x4b3: 0x4b2,  0x4b5: 0x4b4,  0x4b7: 0x4b6,
 0x4b9: 0x4b8,  0x4bb: 0x4ba,  0x4bd: 0x4bc,  0x4bf: 0x4be,  0x4c2: 0x4c1,
 0x4c4: 0x4c3,  0x4c6: 0x4c5,  0x4c8: 0x4c7,  0x4ca: 0x4c9,  0x4cc: 0x4cb,
 0x4ce: 0x4cd,  0x4d1: 0x4d0,  0x4d3: 0x4d2,  0x4d5: 0x4d4,  0x4d7: 0x4d6,
 0x4d9: 0x4d8,  0x4db: 0x4da,  0x4dd: 0x4dc,  0x4df: 0x4de,  0x4e1: 0x4e0,
 0x4e3: 0x4e2,  0x4e5: 0x4e4,  0x4e7: 0x4e6,  0x4e9: 0x4e8,  0x4eb: 0x4ea,
 0x4ed: 0x4ec,  0x4ef: 0x4ee,  0x4f1: 0x4f0,  0x4f3: 0x4f2,  0x4f5: 0x4f4,
 0x4f9: 0x4f8,  0x501: 0x500,  0x503: 0x502,  0x505: 0x504,  0x507: 0x506,
 0x509: 0x508,  0x50b: 0x50a,  0x50d: 0x50c,  0x50f: 0x50e,  0x561: 0x531,
 0x562: 0x532,  0x563: 0x533,  0x564: 0x534,  0x565: 0x535,  0x566: 0x536,
 0x567: 0x537,  0x568: 0x538,  0x569: 0x539,  0x56a: 0x53a,  0x56b: 0x53b,
 0x56c: 0x53c,  0x56d: 0x53d,  0x56e: 0x53e,  0x56f: 0x53f,  0x570: 0x540,
 0x571: 0x541,  0x572: 0x542,  0x573: 0x543,  0x574: 0x544,  0x575: 0x545,
 0x576: 0x546,  0x577: 0x547,  0x578: 0x548,  0x579: 0x549,  0x57a: 0x54a,
 0x57b: 0x54b,  0x57c: 0x54c,  0x57d: 0x54d,  0x57e: 0x54e,  0x57f: 0x54f,
 0x580: 0x550,  0x581: 0x551,  0x582: 0x552,  0x583: 0x553,  0x584: 0x554,
 0x585: 0x555,  0x586: 0x556,  0x587: [ 0x535,0x552 ],  0x1e01: 0x1e00,  0x1e03: 0x1e02,
 0x1e05: 0x1e04,  0x1e07: 0x1e06,  0x1e09: 0x1e08,  0x1e0b: 0x1e0a,  0x1e0d: 0x1e0c,
 0x1e0f: 0x1e0e,  0x1e11: 0x1e10,  0x1e13: 0x1e12,  0x1e15: 0x1e14,  0x1e17: 0x1e16,
 0x1e19: 0x1e18,  0x1e1b: 0x1e1a,  0x1e1d: 0x1e1c,  0x1e1f: 0x1e1e,  0x1e21: 0x1e20,
 0x1e23: 0x1e22,  0x1e25: 0x1e24,  0x1e27: 0x1e26,  0x1e29: 0x1e28,  0x1e2b: 0x1e2a,
 0x1e2d: 0x1e2c,  0x1e2f: 0x1e2e,  0x1e31: 0x1e30,  0x1e33: 0x1e32,  0x1e35: 0x1e34,
 0x1e37: 0x1e36,  0x1e39: 0x1e38,  0x1e3b: 0x1e3a,  0x1e3d: 0x1e3c,  0x1e3f: 0x1e3e,
 0x1e41: 0x1e40,  0x1e43: 0x1e42,  0x1e45: 0x1e44,  0x1e47: 0x1e46,  0x1e49: 0x1e48,
 0x1e4b: 0x1e4a,  0x1e4d: 0x1e4c,  0x1e4f: 0x1e4e,  0x1e51: 0x1e50,  0x1e53: 0x1e52,
 0x1e55: 0x1e54,  0x1e57: 0x1e56,  0x1e59: 0x1e58,  0x1e5b: 0x1e5a,  0x1e5d: 0x1e5c,
 0x1e5f: 0x1e5e,  0x1e61: 0x1e60,  0x1e63: 0x1e62,  0x1e65: 0x1e64,  0x1e67: 0x1e66,
 0x1e69: 0x1e68,  0x1e6b: 0x1e6a,  0x1e6d: 0x1e6c,  0x1e6f: 0x1e6e,  0x1e71: 0x1e70,
 0x1e73: 0x1e72,  0x1e75: 0x1e74,  0x1e77: 0x1e76,  0x1e79: 0x1e78,  0x1e7b: 0x1e7a,
 0x1e7d: 0x1e7c,  0x1e7f: 0x1e7e,  0x1e81: 0x1e80,  0x1e83: 0x1e82,  0x1e85: 0x1e84,
 0x1e87: 0x1e86,  0x1e89: 0x1e88,  0x1e8b: 0x1e8a,  0x1e8d: 0x1e8c,  0x1e8f: 0x1e8e,
 0x1e91: 0x1e90,  0x1e93: 0x1e92,  0x1e95: 0x1e94,  0x1e96: [ 0x48,0x331 ],  0x1e97: [ 0x54,0x308 ],
 0x1e98: [ 0x57,0x30a ],  0x1e99: [ 0x59,0x30a ],  0x1e9a: [ 0x41,0x2be ],  0x1e9b: 0x1e60,  0x1ea1: 0x1ea0,
 0x1ea3: 0x1ea2,  0x1ea5: 0x1ea4,  0x1ea7: 0x1ea6,  0x1ea9: 0x1ea8,  0x1eab: 0x1eaa,
 0x1ead: 0x1eac,  0x1eaf: 0x1eae,  0x1eb1: 0x1eb0,  0x1eb3: 0x1eb2,  0x1eb5: 0x1eb4,
 0x1eb7: 0x1eb6,  0x1eb9: 0x1eb8,  0x1ebb: 0x1eba,  0x1ebd: 0x1ebc,  0x1ebf: 0x1ebe,
 0x1ec1: 0x1ec0,  0x1ec3: 0x1ec2,  0x1ec5: 0x1ec4,  0x1ec7: 0x1ec6,  0x1ec9: 0x1ec8,
 0x1ecb: 0x1eca,  0x1ecd: 0x1ecc,  0x1ecf: 0x1ece,  0x1ed1: 0x1ed0,  0x1ed3: 0x1ed2,
 0x1ed5: 0x1ed4,  0x1ed7: 0x1ed6,  0x1ed9: 0x1ed8,  0x1edb: 0x1eda,  0x1edd: 0x1edc,
 0x1edf: 0x1ede,  0x1ee1: 0x1ee0,  0x1ee3: 0x1ee2,  0x1ee5: 0x1ee4,  0x1ee7: 0x1ee6,
 0x1ee9: 0x1ee8,  0x1eeb: 0x1eea,  0x1eed: 0x1eec,  0x1eef: 0x1eee,  0x1ef1: 0x1ef0,
 0x1ef3: 0x1ef2,  0x1ef5: 0x1ef4,  0x1ef7: 0x1ef6,  0x1ef9: 0x1ef8,  0x1f00: 0x1f08,
 0x1f01: 0x1f09,  0x1f02: 0x1f0a,  0x1f03: 0x1f0b,  0x1f04: 0x1f0c,  0x1f05: 0x1f0d,
 0x1f06: 0x1f0e,  0x1f07: 0x1f0f,  0x1f10: 0x1f18,  0x1f11: 0x1f19,  0x1f12: 0x1f1a,
 0x1f13: 0x1f1b,  0x1f14: 0x1f1c,  0x1f15: 0x1f1d,  0x1f20: 0x1f28,  0x1f21: 0x1f29,
 0x1f22: 0x1f2a,  0x1f23: 0x1f2b,  0x1f24: 0x1f2c,  0x1f25: 0x1f2d,  0x1f26: 0x1f2e,
 0x1f27: 0x1f2f,  0x1f30: 0x1f38,  0x1f31: 0x1f39,  0x1f32: 0x1f3a,  0x1f33: 0x1f3b,
 0x1f34: 0x1f3c,  0x1f35: 0x1f3d,  0x1f36: 0x1f3e,  0x1f37: 0x1f3f,  0x1f40: 0x1f48,
 0x1f41: 0x1f49,  0x1f42: 0x1f4a,  0x1f43: 0x1f4b,  0x1f44: 0x1f4c,  0x1f45: 0x1f4d,
 0x1f50: [ 0x3a5,0x313 ],  0x1f51: 0x1f59,  0x1f52: [ 0x3a5,0x313,0x300 ],  0x1f53: 0x1f5b,  0x1f54: [ 0x3a5,0x313,0x301 ],
 0x1f55: 0x1f5d,  0x1f56: [ 0x3a5,0x313,0x342 ],  0x1f57: 0x1f5f,  0x1f60: 0x1f68,  0x1f61: 0x1f69,
 0x1f62: 0x1f6a,  0x1f63: 0x1f6b,  0x1f64: 0x1f6c,  0x1f65: 0x1f6d,  0x1f66: 0x1f6e,
 0x1f67: 0x1f6f,  0x1f70: 0x1fba,  0x1f71: 0x1fbb,  0x1f72: 0x1fc8,  0x1f73: 0x1fc9,
 0x1f74: 0x1fca,  0x1f75: 0x1fcb,  0x1f76: 0x1fda,  0x1f77: 0x1fdb,  0x1f78: 0x1ff8,
 0x1f79: 0x1ff9,  0x1f7a: 0x1fea,  0x1f7b: 0x1feb,  0x1f7c: 0x1ffa,  0x1f7d: 0x1ffb,
 0x1f80: [ 0x1f08,0x399 ],  0x1f81: [ 0x1f09,0x399 ],  0x1f82: [ 0x1f0a,0x399 ],  0x1f83: [ 0x1f0b,0x399 ],  0x1f84: [ 0x1f0c,0x399 ],
 0x1f85: [ 0x1f0d,0x399 ],  0x1f86: [ 0x1f0e,0x399 ],  0x1f87: [ 0x1f0f,0x399 ],  0x1f88: [ 0x1f08,0x399 ],  0x1f89: [ 0x1f09,0x399 ],
 0x1f8a: [ 0x1f0a,0x399 ],  0x1f8b: [ 0x1f0b,0x399 ],  0x1f8c: [ 0x1f0c,0x399 ],  0x1f8d: [ 0x1f0d,0x399 ],  0x1f8e: [ 0x1f0e,0x399 ],
 0x1f8f: [ 0x1f0f,0x399 ],  0x1f90: [ 0x1f28,0x399 ],  0x1f91: [ 0x1f29,0x399 ],  0x1f92: [ 0x1f2a,0x399 ],  0x1f93: [ 0x1f2b,0x399 ],
 0x1f94: [ 0x1f2c,0x399 ],  0x1f95: [ 0x1f2d,0x399 ],  0x1f96: [ 0x1f2e,0x399 ],  0x1f97: [ 0x1f2f,0x399 ],  0x1f98: [ 0x1f28,0x399 ],
 0x1f99: [ 0x1f29,0x399 ],  0x1f9a: [ 0x1f2a,0x399 ],  0x1f9b: [ 0x1f2b,0x399 ],  0x1f9c: [ 0x1f2c,0x399 ],  0x1f9d: [ 0x1f2d,0x399 ],
 0x1f9e: [ 0x1f2e,0x399 ],  0x1f9f: [ 0x1f2f,0x399 ],  0x1fa0: [ 0x1f68,0x399 ],  0x1fa1: [ 0x1f69,0x399 ],  0x1fa2: [ 0x1f6a,0x399 ],
 0x1fa3: [ 0x1f6b,0x399 ],  0x1fa4: [ 0x1f6c,0x399 ],  0x1fa5: [ 0x1f6d,0x399 ],  0x1fa6: [ 0x1f6e,0x399 ],  0x1fa7: [ 0x1f6f,0x399 ],
 0x1fa8: [ 0x1f68,0x399 ],  0x1fa9: [ 0x1f69,0x399 ],  0x1faa: [ 0x1f6a,0x399 ],  0x1fab: [ 0x1f6b,0x399 ],  0x1fac: [ 0x1f6c,0x399 ],
 0x1fad: [ 0x1f6d,0x399 ],  0x1fae: [ 0x1f6e,0x399 ],  0x1faf: [ 0x1f6f,0x399 ],  0x1fb0: 0x1fb8,  0x1fb1: 0x1fb9,
 0x1fb2: [ 0x1fba,0x399 ],  0x1fb3: [ 0x391,0x399 ],  0x1fb4: [ 0x386,0x399 ],  0x1fb6: [ 0x391,0x342 ],  0x1fb7: [ 0x391,0x342,0x399 ],
 0x1fbc: [ 0x391,0x399 ],  0x1fbe: 0x399,  0x1fc2: [ 0x1fca,0x399 ],  0x1fc3: [ 0x397,0x399 ],  0x1fc4: [ 0x389,0x399 ],
 0x1fc6: [ 0x397,0x342 ],  0x1fc7: [ 0x397,0x342,0x399 ],  0x1fcc: [ 0x397,0x399 ],  0x1fd0: 0x1fd8,  0x1fd1: 0x1fd9,
 0x1fd2: [ 0x399,0x308,0x300 ],  0x1fd3: [ 0x399,0x308,0x301 ],  0x1fd6: [ 0x399,0x342 ],  0x1fd7: [ 0x399,0x308,0x342 ],  0x1fe0: 0x1fe8,
 0x1fe1: 0x1fe9,  0x1fe2: [ 0x3a5,0x308,0x300 ],  0x1fe3: [ 0x3a5,0x308,0x301 ],  0x1fe4: [ 0x3a1,0x313 ],  0x1fe5: 0x1fec,
 0x1fe6: [ 0x3a5,0x342 ],  0x1fe7: [ 0x3a5,0x308,0x342 ],  0x1ff2: [ 0x1ffa,0x399 ],  0x1ff3: [ 0x3a9,0x399 ],  0x1ff4: [ 0x38f,0x399 ],
 0x1ff6: [ 0x3a9,0x342 ],  0x1ff7: [ 0x3a9,0x342,0x399 ],  0x1ffc: [ 0x3a9,0x399 ],  0x2170: 0x2160,  0x2171: 0x2161,
 0x2172: 0x2162,  0x2173: 0x2163,  0x2174: 0x2164,  0x2175: 0x2165,  0x2176: 0x2166,
 0x2177: 0x2167,  0x2178: 0x2168,  0x2179: 0x2169,  0x217a: 0x216a,  0x217b: 0x216b,
 0x217c: 0x216c,  0x217d: 0x216d,  0x217e: 0x216e,  0x217f: 0x216f,  0x24d0: 0x24b6,
 0x24d1: 0x24b7,  0x24d2: 0x24b8,  0x24d3: 0x24b9,  0x24d4: 0x24ba,  0x24d5: 0x24bb,
 0x24d6: 0x24bc,  0x24d7: 0x24bd,  0x24d8: 0x24be,  0x24d9: 0x24bf,  0x24da: 0x24c0,
 0x24db: 0x24c1,  0x24dc: 0x24c2,  0x24dd: 0x24c3,  0x24de: 0x24c4,  0x24df: 0x24c5,
 0x24e0: 0x24c6,  0x24e1: 0x24c7,  0x24e2: 0x24c8,  0x24e3: 0x24c9,  0x24e4: 0x24ca,
 0x24e5: 0x24cb,  0x24e6: 0x24cc,  0x24e7: 0x24cd,  0x24e8: 0x24ce,  0x24e9: 0x24cf,
 0xfb00: [ 0x46,0x46 ],  0xfb01: [ 0x46,0x49 ],  0xfb02: [ 0x46,0x4c ],  0xfb03: [ 0x46,0x46,0x49 ],  0xfb04: [ 0x46,0x46,0x4c ],
 0xfb05: [ 0x53,0x54 ],  0xfb06: [ 0x53,0x54 ],  0xfb13: [ 0x544,0x546 ],  0xfb14: [ 0x544,0x535 ],  0xfb15: [ 0x544,0x53b ],
 0xfb16: [ 0x54e,0x546 ],  0xfb17: [ 0x544,0x53d ],  0xff41: 0xff21,  0xff42: 0xff22,  0xff43: 0xff23,
 0xff44: 0xff24,  0xff45: 0xff25,  0xff46: 0xff26,  0xff47: 0xff27,  0xff48: 0xff28,
 0xff49: 0xff29,  0xff4a: 0xff2a,  0xff4b: 0xff2b,  0xff4c: 0xff2c,  0xff4d: 0xff2d,
 0xff4e: 0xff2e,  0xff4f: 0xff2f,  0xff50: 0xff30,  0xff51: 0xff31,  0xff52: 0xff32,
 0xff53: 0xff33,  0xff54: 0xff34,  0xff55: 0xff35,  0xff56: 0xff36,  0xff57: 0xff37,
 0xff58: 0xff38,  0xff59: 0xff39,  0xff5a: 0xff3a,  0x10428: 0x10400,  0x10429: 0x10401,
 0x1042a: 0x10402,  0x1042b: 0x10403,  0x1042c: 0x10404,  0x1042d: 0x10405,  0x1042e: 0x10406,
 0x1042f: 0x10407,  0x10430: 0x10408,  0x10431: 0x10409,  0x10432: 0x1040a,  0x10433: 0x1040b,
 0x10434: 0x1040c,  0x10435: 0x1040d,  0x10436: 0x1040e,  0x10437: 0x1040f,  0x10438: 0x10410,
 0x10439: 0x10411,  0x1043a: 0x10412,  0x1043b: 0x10413,  0x1043c: 0x10414,  0x1043d: 0x10415,
 0x1043e: 0x10416,  0x1043f: 0x10417,  0x10440: 0x10418,  0x10441: 0x10419,  0x10442: 0x1041a,
 0x10443: 0x1041b,  0x10444: 0x1041c,  0x10445: 0x1041d,  0x10446: 0x1041e,  0x10447: 0x1041f,
 0x10448: 0x10420,  0x10449: 0x10421,  0x1044a: 0x10422,  0x1044b: 0x10423,  0x1044c: 0x10424,
 0x1044d: 0x10425,  0x1044e: 0x10426,  0x1044f: 0x10427,
};
var unicode_lower_table = {
 0x41: 0x61,  0x42: 0x62,  0x43: 0x63,  0x44: 0x64,  0x45: 0x65,
 0x46: 0x66,  0x47: 0x67,  0x48: 0x68,  0x49: 0x69,  0x4a: 0x6a,
 0x4b: 0x6b,  0x4c: 0x6c,  0x4d: 0x6d,  0x4e: 0x6e,  0x4f: 0x6f,
 0x50: 0x70,  0x51: 0x71,  0x52: 0x72,  0x53: 0x73,  0x54: 0x74,
 0x55: 0x75,  0x56: 0x76,  0x57: 0x77,  0x58: 0x78,  0x59: 0x79,
 0x5a: 0x7a,  0xc0: 0xe0,  0xc1: 0xe1,  0xc2: 0xe2,  0xc3: 0xe3,
 0xc4: 0xe4,  0xc5: 0xe5,  0xc6: 0xe6,  0xc7: 0xe7,  0xc8: 0xe8,
 0xc9: 0xe9,  0xca: 0xea,  0xcb: 0xeb,  0xcc: 0xec,  0xcd: 0xed,
 0xce: 0xee,  0xcf: 0xef,  0xd0: 0xf0,  0xd1: 0xf1,  0xd2: 0xf2,
 0xd3: 0xf3,  0xd4: 0xf4,  0xd5: 0xf5,  0xd6: 0xf6,  0xd8: 0xf8,
 0xd9: 0xf9,  0xda: 0xfa,  0xdb: 0xfb,  0xdc: 0xfc,  0xdd: 0xfd,
 0xde: 0xfe,  0x100: 0x101,  0x102: 0x103,  0x104: 0x105,  0x106: 0x107,
 0x108: 0x109,  0x10a: 0x10b,  0x10c: 0x10d,  0x10e: 0x10f,  0x110: 0x111,
 0x112: 0x113,  0x114: 0x115,  0x116: 0x117,  0x118: 0x119,  0x11a: 0x11b,
 0x11c: 0x11d,  0x11e: 0x11f,  0x120: 0x121,  0x122: 0x123,  0x124: 0x125,
 0x126: 0x127,  0x128: 0x129,  0x12a: 0x12b,  0x12c: 0x12d,  0x12e: 0x12f,
 0x130: [ 0x69,0x307 ],  0x132: 0x133,  0x134: 0x135,  0x136: 0x137,  0x139: 0x13a,
 0x13b: 0x13c,  0x13d: 0x13e,  0x13f: 0x140,  0x141: 0x142,  0x143: 0x144,
 0x145: 0x146,  0x147: 0x148,  0x14a: 0x14b,  0x14c: 0x14d,  0x14e: 0x14f,
 0x150: 0x151,  0x152: 0x153,  0x154: 0x155,  0x156: 0x157,  0x158: 0x159,
 0x15a: 0x15b,  0x15c: 0x15d,  0x15e: 0x15f,  0x160: 0x161,  0x162: 0x163,
 0x164: 0x165,  0x166: 0x167,  0x168: 0x169,  0x16a: 0x16b,  0x16c: 0x16d,
 0x16e: 0x16f,  0x170: 0x171,  0x172: 0x173,  0x174: 0x175,  0x176: 0x177,
 0x178: 0xff,  0x179: 0x17a,  0x17b: 0x17c,  0x17d: 0x17e,  0x181: 0x253,
 0x182: 0x183,  0x184: 0x185,  0x186: 0x254,  0x187: 0x188,  0x189: 0x256,
 0x18a: 0x257,  0x18b: 0x18c,  0x18e: 0x1dd,  0x18f: 0x259,  0x190: 0x25b,
 0x191: 0x192,  0x193: 0x260,  0x194: 0x263,  0x196: 0x269,  0x197: 0x268,
 0x198: 0x199,  0x19c: 0x26f,  0x19d: 0x272,  0x19f: 0x275,  0x1a0: 0x1a1,
 0x1a2: 0x1a3,  0x1a4: 0x1a5,  0x1a6: 0x280,  0x1a7: 0x1a8,  0x1a9: 0x283,
 0x1ac: 0x1ad,  0x1ae: 0x288,  0x1af: 0x1b0,  0x1b1: 0x28a,  0x1b2: 0x28b,
 0x1b3: 0x1b4,  0x1b5: 0x1b6,  0x1b7: 0x292,  0x1b8: 0x1b9,  0x1bc: 0x1bd,
 0x1c4: 0x1c6,  0x1c5: 0x1c6,  0x1c7: 0x1c9,  0x1c8: 0x1c9,  0x1ca: 0x1cc,
 0x1cb: 0x1cc,  0x1cd: 0x1ce,  0x1cf: 0x1d0,  0x1d1: 0x1d2,  0x1d3: 0x1d4,
 0x1d5: 0x1d6,  0x1d7: 0x1d8,  0x1d9: 0x1da,  0x1db: 0x1dc,  0x1de: 0x1df,
 0x1e0: 0x1e1,  0x1e2: 0x1e3,  0x1e4: 0x1e5,  0x1e6: 0x1e7,  0x1e8: 0x1e9,
 0x1ea: 0x1eb,  0x1ec: 0x1ed,  0x1ee: 0x1ef,  0x1f1: 0x1f3,  0x1f2: 0x1f3,
 0x1f4: 0x1f5,  0x1f6: 0x195,  0x1f7: 0x1bf,  0x1f8: 0x1f9,  0x1fa: 0x1fb,
 0x1fc: 0x1fd,  0x1fe: 0x1ff,  0x200: 0x201,  0x202: 0x203,  0x204: 0x205,
 0x206: 0x207,  0x208: 0x209,  0x20a: 0x20b,  0x20c: 0x20d,  0x20e: 0x20f,
 0x210: 0x211,  0x212: 0x213,  0x214: 0x215,  0x216: 0x217,  0x218: 0x219,
 0x21a: 0x21b,  0x21c: 0x21d,  0x21e: 0x21f,  0x220: 0x19e,  0x222: 0x223,
 0x224: 0x225,  0x226: 0x227,  0x228: 0x229,  0x22a: 0x22b,  0x22c: 0x22d,
 0x22e: 0x22f,  0x230: 0x231,  0x232: 0x233,  0x386: 0x3ac,  0x388: 0x3ad,
 0x389: 0x3ae,  0x38a: 0x3af,  0x38c: 0x3cc,  0x38e: 0x3cd,  0x38f: 0x3ce,
 0x391: 0x3b1,  0x392: 0x3b2,  0x393: 0x3b3,  0x394: 0x3b4,  0x395: 0x3b5,
 0x396: 0x3b6,  0x397: 0x3b7,  0x398: 0x3b8,  0x399: 0x3b9,  0x39a: 0x3ba,
 0x39b: 0x3bb,  0x39c: 0x3bc,  0x39d: 0x3bd,  0x39e: 0x3be,  0x39f: 0x3bf,
 0x3a0: 0x3c0,  0x3a1: 0x3c1,  0x3a3: 0x3c3,  0x3a4: 0x3c4,  0x3a5: 0x3c5,
 0x3a6: 0x3c6,  0x3a7: 0x3c7,  0x3a8: 0x3c8,  0x3a9: 0x3c9,  0x3aa: 0x3ca,
 0x3ab: 0x3cb,  0x3d8: 0x3d9,  0x3da: 0x3db,  0x3dc: 0x3dd,  0x3de: 0x3df,
 0x3e0: 0x3e1,  0x3e2: 0x3e3,  0x3e4: 0x3e5,  0x3e6: 0x3e7,  0x3e8: 0x3e9,
 0x3ea: 0x3eb,  0x3ec: 0x3ed,  0x3ee: 0x3ef,  0x3f4: 0x3b8,  0x3f7: 0x3f8,
 0x3f9: 0x3f2,  0x3fa: 0x3fb,  0x400: 0x450,  0x401: 0x451,  0x402: 0x452,
 0x403: 0x453,  0x404: 0x454,  0x405: 0x455,  0x406: 0x456,  0x407: 0x457,
 0x408: 0x458,  0x409: 0x459,  0x40a: 0x45a,  0x40b: 0x45b,  0x40c: 0x45c,
 0x40d: 0x45d,  0x40e: 0x45e,  0x40f: 0x45f,  0x410: 0x430,  0x411: 0x431,
 0x412: 0x432,  0x413: 0x433,  0x414: 0x434,  0x415: 0x435,  0x416: 0x436,
 0x417: 0x437,  0x418: 0x438,  0x419: 0x439,  0x41a: 0x43a,  0x41b: 0x43b,
 0x41c: 0x43c,  0x41d: 0x43d,  0x41e: 0x43e,  0x41f: 0x43f,  0x420: 0x440,
 0x421: 0x441,  0x422: 0x442,  0x423: 0x443,  0x424: 0x444,  0x425: 0x445,
 0x426: 0x446,  0x427: 0x447,  0x428: 0x448,  0x429: 0x449,  0x42a: 0x44a,
 0x42b: 0x44b,  0x42c: 0x44c,  0x42d: 0x44d,  0x42e: 0x44e,  0x42f: 0x44f,
 0x460: 0x461,  0x462: 0x463,  0x464: 0x465,  0x466: 0x467,  0x468: 0x469,
 0x46a: 0x46b,  0x46c: 0x46d,  0x46e: 0x46f,  0x470: 0x471,  0x472: 0x473,
 0x474: 0x475,  0x476: 0x477,  0x478: 0x479,  0x47a: 0x47b,  0x47c: 0x47d,
 0x47e: 0x47f,  0x480: 0x481,  0x48a: 0x48b,  0x48c: 0x48d,  0x48e: 0x48f,
 0x490: 0x491,  0x492: 0x493,  0x494: 0x495,  0x496: 0x497,  0x498: 0x499,
 0x49a: 0x49b,  0x49c: 0x49d,  0x49e: 0x49f,  0x4a0: 0x4a1,  0x4a2: 0x4a3,
 0x4a4: 0x4a5,  0x4a6: 0x4a7,  0x4a8: 0x4a9,  0x4aa: 0x4ab,  0x4ac: 0x4ad,
 0x4ae: 0x4af,  0x4b0: 0x4b1,  0x4b2: 0x4b3,  0x4b4: 0x4b5,  0x4b6: 0x4b7,
 0x4b8: 0x4b9,  0x4ba: 0x4bb,  0x4bc: 0x4bd,  0x4be: 0x4bf,  0x4c1: 0x4c2,
 0x4c3: 0x4c4,  0x4c5: 0x4c6,  0x4c7: 0x4c8,  0x4c9: 0x4ca,  0x4cb: 0x4cc,
 0x4cd: 0x4ce,  0x4d0: 0x4d1,  0x4d2: 0x4d3,  0x4d4: 0x4d5,  0x4d6: 0x4d7,
 0x4d8: 0x4d9,  0x4da: 0x4db,  0x4dc: 0x4dd,  0x4de: 0x4df,  0x4e0: 0x4e1,
 0x4e2: 0x4e3,  0x4e4: 0x4e5,  0x4e6: 0x4e7,  0x4e8: 0x4e9,  0x4ea: 0x4eb,
 0x4ec: 0x4ed,  0x4ee: 0x4ef,  0x4f0: 0x4f1,  0x4f2: 0x4f3,  0x4f4: 0x4f5,
 0x4f8: 0x4f9,  0x500: 0x501,  0x502: 0x503,  0x504: 0x505,  0x506: 0x507,
 0x508: 0x509,  0x50a: 0x50b,  0x50c: 0x50d,  0x50e: 0x50f,  0x531: 0x561,
 0x532: 0x562,  0x533: 0x563,  0x534: 0x564,  0x535: 0x565,  0x536: 0x566,
 0x537: 0x567,  0x538: 0x568,  0x539: 0x569,  0x53a: 0x56a,  0x53b: 0x56b,
 0x53c: 0x56c,  0x53d: 0x56d,  0x53e: 0x56e,  0x53f: 0x56f,  0x540: 0x570,
 0x541: 0x571,  0x542: 0x572,  0x543: 0x573,  0x544: 0x574,  0x545: 0x575,
 0x546: 0x576,  0x547: 0x577,  0x548: 0x578,  0x549: 0x579,  0x54a: 0x57a,
 0x54b: 0x57b,  0x54c: 0x57c,  0x54d: 0x57d,  0x54e: 0x57e,  0x54f: 0x57f,
 0x550: 0x580,  0x551: 0x581,  0x552: 0x582,  0x553: 0x583,  0x554: 0x584,
 0x555: 0x585,  0x556: 0x586,  0x1e00: 0x1e01,  0x1e02: 0x1e03,  0x1e04: 0x1e05,
 0x1e06: 0x1e07,  0x1e08: 0x1e09,  0x1e0a: 0x1e0b,  0x1e0c: 0x1e0d,  0x1e0e: 0x1e0f,
 0x1e10: 0x1e11,  0x1e12: 0x1e13,  0x1e14: 0x1e15,  0x1e16: 0x1e17,  0x1e18: 0x1e19,
 0x1e1a: 0x1e1b,  0x1e1c: 0x1e1d,  0x1e1e: 0x1e1f,  0x1e20: 0x1e21,  0x1e22: 0x1e23,
 0x1e24: 0x1e25,  0x1e26: 0x1e27,  0x1e28: 0x1e29,  0x1e2a: 0x1e2b,  0x1e2c: 0x1e2d,
 0x1e2e: 0x1e2f,  0x1e30: 0x1e31,  0x1e32: 0x1e33,  0x1e34: 0x1e35,  0x1e36: 0x1e37,
 0x1e38: 0x1e39,  0x1e3a: 0x1e3b,  0x1e3c: 0x1e3d,  0x1e3e: 0x1e3f,  0x1e40: 0x1e41,
 0x1e42: 0x1e43,  0x1e44: 0x1e45,  0x1e46: 0x1e47,  0x1e48: 0x1e49,  0x1e4a: 0x1e4b,
 0x1e4c: 0x1e4d,  0x1e4e: 0x1e4f,  0x1e50: 0x1e51,  0x1e52: 0x1e53,  0x1e54: 0x1e55,
 0x1e56: 0x1e57,  0x1e58: 0x1e59,  0x1e5a: 0x1e5b,  0x1e5c: 0x1e5d,  0x1e5e: 0x1e5f,
 0x1e60: 0x1e61,  0x1e62: 0x1e63,  0x1e64: 0x1e65,  0x1e66: 0x1e67,  0x1e68: 0x1e69,
 0x1e6a: 0x1e6b,  0x1e6c: 0x1e6d,  0x1e6e: 0x1e6f,  0x1e70: 0x1e71,  0x1e72: 0x1e73,
 0x1e74: 0x1e75,  0x1e76: 0x1e77,  0x1e78: 0x1e79,  0x1e7a: 0x1e7b,  0x1e7c: 0x1e7d,
 0x1e7e: 0x1e7f,  0x1e80: 0x1e81,  0x1e82: 0x1e83,  0x1e84: 0x1e85,  0x1e86: 0x1e87,
 0x1e88: 0x1e89,  0x1e8a: 0x1e8b,  0x1e8c: 0x1e8d,  0x1e8e: 0x1e8f,  0x1e90: 0x1e91,
 0x1e92: 0x1e93,  0x1e94: 0x1e95,  0x1ea0: 0x1ea1,  0x1ea2: 0x1ea3,  0x1ea4: 0x1ea5,
 0x1ea6: 0x1ea7,  0x1ea8: 0x1ea9,  0x1eaa: 0x1eab,  0x1eac: 0x1ead,  0x1eae: 0x1eaf,
 0x1eb0: 0x1eb1,  0x1eb2: 0x1eb3,  0x1eb4: 0x1eb5,  0x1eb6: 0x1eb7,  0x1eb8: 0x1eb9,
 0x1eba: 0x1ebb,  0x1ebc: 0x1ebd,  0x1ebe: 0x1ebf,  0x1ec0: 0x1ec1,  0x1ec2: 0x1ec3,
 0x1ec4: 0x1ec5,  0x1ec6: 0x1ec7,  0x1ec8: 0x1ec9,  0x1eca: 0x1ecb,  0x1ecc: 0x1ecd,
 0x1ece: 0x1ecf,  0x1ed0: 0x1ed1,  0x1ed2: 0x1ed3,  0x1ed4: 0x1ed5,  0x1ed6: 0x1ed7,
 0x1ed8: 0x1ed9,  0x1eda: 0x1edb,  0x1edc: 0x1edd,  0x1ede: 0x1edf,  0x1ee0: 0x1ee1,
 0x1ee2: 0x1ee3,  0x1ee4: 0x1ee5,  0x1ee6: 0x1ee7,  0x1ee8: 0x1ee9,  0x1eea: 0x1eeb,
 0x1eec: 0x1eed,  0x1eee: 0x1eef,  0x1ef0: 0x1ef1,  0x1ef2: 0x1ef3,  0x1ef4: 0x1ef5,
 0x1ef6: 0x1ef7,  0x1ef8: 0x1ef9,  0x1f08: 0x1f00,  0x1f09: 0x1f01,  0x1f0a: 0x1f02,
 0x1f0b: 0x1f03,  0x1f0c: 0x1f04,  0x1f0d: 0x1f05,  0x1f0e: 0x1f06,  0x1f0f: 0x1f07,
 0x1f18: 0x1f10,  0x1f19: 0x1f11,  0x1f1a: 0x1f12,  0x1f1b: 0x1f13,  0x1f1c: 0x1f14,
 0x1f1d: 0x1f15,  0x1f28: 0x1f20,  0x1f29: 0x1f21,  0x1f2a: 0x1f22,  0x1f2b: 0x1f23,
 0x1f2c: 0x1f24,  0x1f2d: 0x1f25,  0x1f2e: 0x1f26,  0x1f2f: 0x1f27,  0x1f38: 0x1f30,
 0x1f39: 0x1f31,  0x1f3a: 0x1f32,  0x1f3b: 0x1f33,  0x1f3c: 0x1f34,  0x1f3d: 0x1f35,
 0x1f3e: 0x1f36,  0x1f3f: 0x1f37,  0x1f48: 0x1f40,  0x1f49: 0x1f41,  0x1f4a: 0x1f42,
 0x1f4b: 0x1f43,  0x1f4c: 0x1f44,  0x1f4d: 0x1f45,  0x1f59: 0x1f51,  0x1f5b: 0x1f53,
 0x1f5d: 0x1f55,  0x1f5f: 0x1f57,  0x1f68: 0x1f60,  0x1f69: 0x1f61,  0x1f6a: 0x1f62,
 0x1f6b: 0x1f63,  0x1f6c: 0x1f64,  0x1f6d: 0x1f65,  0x1f6e: 0x1f66,  0x1f6f: 0x1f67,
 0x1f88: 0x1f80,  0x1f89: 0x1f81,  0x1f8a: 0x1f82,  0x1f8b: 0x1f83,  0x1f8c: 0x1f84,
 0x1f8d: 0x1f85,  0x1f8e: 0x1f86,  0x1f8f: 0x1f87,  0x1f98: 0x1f90,  0x1f99: 0x1f91,
 0x1f9a: 0x1f92,  0x1f9b: 0x1f93,  0x1f9c: 0x1f94,  0x1f9d: 0x1f95,  0x1f9e: 0x1f96,
 0x1f9f: 0x1f97,  0x1fa8: 0x1fa0,  0x1fa9: 0x1fa1,  0x1faa: 0x1fa2,  0x1fab: 0x1fa3,
 0x1fac: 0x1fa4,  0x1fad: 0x1fa5,  0x1fae: 0x1fa6,  0x1faf: 0x1fa7,  0x1fb8: 0x1fb0,
 0x1fb9: 0x1fb1,  0x1fba: 0x1f70,  0x1fbb: 0x1f71,  0x1fbc: 0x1fb3,  0x1fc8: 0x1f72,
 0x1fc9: 0x1f73,  0x1fca: 0x1f74,  0x1fcb: 0x1f75,  0x1fcc: 0x1fc3,  0x1fd8: 0x1fd0,
 0x1fd9: 0x1fd1,  0x1fda: 0x1f76,  0x1fdb: 0x1f77,  0x1fe8: 0x1fe0,  0x1fe9: 0x1fe1,
 0x1fea: 0x1f7a,  0x1feb: 0x1f7b,  0x1fec: 0x1fe5,  0x1ff8: 0x1f78,  0x1ff9: 0x1f79,
 0x1ffa: 0x1f7c,  0x1ffb: 0x1f7d,  0x1ffc: 0x1ff3,  0x2126: 0x3c9,  0x212a: 0x6b,
 0x212b: 0xe5,  0x2160: 0x2170,  0x2161: 0x2171,  0x2162: 0x2172,  0x2163: 0x2173,
 0x2164: 0x2174,  0x2165: 0x2175,  0x2166: 0x2176,  0x2167: 0x2177,  0x2168: 0x2178,
 0x2169: 0x2179,  0x216a: 0x217a,  0x216b: 0x217b,  0x216c: 0x217c,  0x216d: 0x217d,
 0x216e: 0x217e,  0x216f: 0x217f,  0x24b6: 0x24d0,  0x24b7: 0x24d1,  0x24b8: 0x24d2,
 0x24b9: 0x24d3,  0x24ba: 0x24d4,  0x24bb: 0x24d5,  0x24bc: 0x24d6,  0x24bd: 0x24d7,
 0x24be: 0x24d8,  0x24bf: 0x24d9,  0x24c0: 0x24da,  0x24c1: 0x24db,  0x24c2: 0x24dc,
 0x24c3: 0x24dd,  0x24c4: 0x24de,  0x24c5: 0x24df,  0x24c6: 0x24e0,  0x24c7: 0x24e1,
 0x24c8: 0x24e2,  0x24c9: 0x24e3,  0x24ca: 0x24e4,  0x24cb: 0x24e5,  0x24cc: 0x24e6,
 0x24cd: 0x24e7,  0x24ce: 0x24e8,  0x24cf: 0x24e9,  0xff21: 0xff41,  0xff22: 0xff42,
 0xff23: 0xff43,  0xff24: 0xff44,  0xff25: 0xff45,  0xff26: 0xff46,  0xff27: 0xff47,
 0xff28: 0xff48,  0xff29: 0xff49,  0xff2a: 0xff4a,  0xff2b: 0xff4b,  0xff2c: 0xff4c,
 0xff2d: 0xff4d,  0xff2e: 0xff4e,  0xff2f: 0xff4f,  0xff30: 0xff50,  0xff31: 0xff51,
 0xff32: 0xff52,  0xff33: 0xff53,  0xff34: 0xff54,  0xff35: 0xff55,  0xff36: 0xff56,
 0xff37: 0xff57,  0xff38: 0xff58,  0xff39: 0xff59,  0xff3a: 0xff5a,  0x10400: 0x10428,
 0x10401: 0x10429,  0x10402: 0x1042a,  0x10403: 0x1042b,  0x10404: 0x1042c,  0x10405: 0x1042d,
 0x10406: 0x1042e,  0x10407: 0x1042f,  0x10408: 0x10430,  0x10409: 0x10431,  0x1040a: 0x10432,
 0x1040b: 0x10433,  0x1040c: 0x10434,  0x1040d: 0x10435,  0x1040e: 0x10436,  0x1040f: 0x10437,
 0x10410: 0x10438,  0x10411: 0x10439,  0x10412: 0x1043a,  0x10413: 0x1043b,  0x10414: 0x1043c,
 0x10415: 0x1043d,  0x10416: 0x1043e,  0x10417: 0x1043f,  0x10418: 0x10440,  0x10419: 0x10441,
 0x1041a: 0x10442,  0x1041b: 0x10443,  0x1041c: 0x10444,  0x1041d: 0x10445,  0x1041e: 0x10446,
 0x1041f: 0x10447,  0x10420: 0x10448,  0x10421: 0x10449,  0x10422: 0x1044a,  0x10423: 0x1044b,
 0x10424: 0x1044c,  0x10425: 0x1044d,  0x10426: 0x1044e,  0x10427: 0x1044f,
};
var unicode_title_table = {
 0x61: 0x41,  0x62: 0x42,  0x63: 0x43,  0x64: 0x44,  0x65: 0x45,
 0x66: 0x46,  0x67: 0x47,  0x68: 0x48,  0x69: 0x49,  0x6a: 0x4a,
 0x6b: 0x4b,  0x6c: 0x4c,  0x6d: 0x4d,  0x6e: 0x4e,  0x6f: 0x4f,
 0x70: 0x50,  0x71: 0x51,  0x72: 0x52,  0x73: 0x53,  0x74: 0x54,
 0x75: 0x55,  0x76: 0x56,  0x77: 0x57,  0x78: 0x58,  0x79: 0x59,
 0x7a: 0x5a,  0xb5: 0x39c,  0xdf: [ 0x53,0x73 ],  0xe0: 0xc0,  0xe1: 0xc1,
 0xe2: 0xc2,  0xe3: 0xc3,  0xe4: 0xc4,  0xe5: 0xc5,  0xe6: 0xc6,
 0xe7: 0xc7,  0xe8: 0xc8,  0xe9: 0xc9,  0xea: 0xca,  0xeb: 0xcb,
 0xec: 0xcc,  0xed: 0xcd,  0xee: 0xce,  0xef: 0xcf,  0xf0: 0xd0,
 0xf1: 0xd1,  0xf2: 0xd2,  0xf3: 0xd3,  0xf4: 0xd4,  0xf5: 0xd5,
 0xf6: 0xd6,  0xf8: 0xd8,  0xf9: 0xd9,  0xfa: 0xda,  0xfb: 0xdb,
 0xfc: 0xdc,  0xfd: 0xdd,  0xfe: 0xde,  0xff: 0x178,  0x101: 0x100,
 0x103: 0x102,  0x105: 0x104,  0x107: 0x106,  0x109: 0x108,  0x10b: 0x10a,
 0x10d: 0x10c,  0x10f: 0x10e,  0x111: 0x110,  0x113: 0x112,  0x115: 0x114,
 0x117: 0x116,  0x119: 0x118,  0x11b: 0x11a,  0x11d: 0x11c,  0x11f: 0x11e,
 0x121: 0x120,  0x123: 0x122,  0x125: 0x124,  0x127: 0x126,  0x129: 0x128,
 0x12b: 0x12a,  0x12d: 0x12c,  0x12f: 0x12e,  0x131: 0x49,  0x133: 0x132,
 0x135: 0x134,  0x137: 0x136,  0x13a: 0x139,  0x13c: 0x13b,  0x13e: 0x13d,
 0x140: 0x13f,  0x142: 0x141,  0x144: 0x143,  0x146: 0x145,  0x148: 0x147,
 0x149: [ 0x2bc,0x4e ],  0x14b: 0x14a,  0x14d: 0x14c,  0x14f: 0x14e,  0x151: 0x150,
 0x153: 0x152,  0x155: 0x154,  0x157: 0x156,  0x159: 0x158,  0x15b: 0x15a,
 0x15d: 0x15c,  0x15f: 0x15e,  0x161: 0x160,  0x163: 0x162,  0x165: 0x164,
 0x167: 0x166,  0x169: 0x168,  0x16b: 0x16a,  0x16d: 0x16c,  0x16f: 0x16e,
 0x171: 0x170,  0x173: 0x172,  0x175: 0x174,  0x177: 0x176,  0x17a: 0x179,
 0x17c: 0x17b,  0x17e: 0x17d,  0x17f: 0x53,  0x183: 0x182,  0x185: 0x184,
 0x188: 0x187,  0x18c: 0x18b,  0x192: 0x191,  0x195: 0x1f6,  0x199: 0x198,
 0x19e: 0x220,  0x1a1: 0x1a0,  0x1a3: 0x1a2,  0x1a5: 0x1a4,  0x1a8: 0x1a7,
 0x1ad: 0x1ac,  0x1b0: 0x1af,  0x1b4: 0x1b3,  0x1b6: 0x1b5,  0x1b9: 0x1b8,
 0x1bd: 0x1bc,  0x1bf: 0x1f7,  0x1c4: 0x1c5,  0x1c6: 0x1c5,  0x1c7: 0x1c8,
 0x1c9: 0x1c8,  0x1ca: 0x1cb,  0x1cc: 0x1cb,  0x1ce: 0x1cd,  0x1d0: 0x1cf,
 0x1d2: 0x1d1,  0x1d4: 0x1d3,  0x1d6: 0x1d5,  0x1d8: 0x1d7,  0x1da: 0x1d9,
 0x1dc: 0x1db,  0x1dd: 0x18e,  0x1df: 0x1de,  0x1e1: 0x1e0,  0x1e3: 0x1e2,
 0x1e5: 0x1e4,  0x1e7: 0x1e6,  0x1e9: 0x1e8,  0x1eb: 0x1ea,  0x1ed: 0x1ec,
 0x1ef: 0x1ee,  0x1f0: [ 0x4a,0x30c ],  0x1f1: 0x1f2,  0x1f3: 0x1f2,  0x1f5: 0x1f4,
 0x1f9: 0x1f8,  0x1fb: 0x1fa,  0x1fd: 0x1fc,  0x1ff: 0x1fe,  0x201: 0x200,
 0x203: 0x202,  0x205: 0x204,  0x207: 0x206,  0x209: 0x208,  0x20b: 0x20a,
 0x20d: 0x20c,  0x20f: 0x20e,  0x211: 0x210,  0x213: 0x212,  0x215: 0x214,
 0x217: 0x216,  0x219: 0x218,  0x21b: 0x21a,  0x21d: 0x21c,  0x21f: 0x21e,
 0x223: 0x222,  0x225: 0x224,  0x227: 0x226,  0x229: 0x228,  0x22b: 0x22a,
 0x22d: 0x22c,  0x22f: 0x22e,  0x231: 0x230,  0x233: 0x232,  0x253: 0x181,
 0x254: 0x186,  0x256: 0x189,  0x257: 0x18a,  0x259: 0x18f,  0x25b: 0x190,
 0x260: 0x193,  0x263: 0x194,  0x268: 0x197,  0x269: 0x196,  0x26f: 0x19c,
 0x272: 0x19d,  0x275: 0x19f,  0x280: 0x1a6,  0x283: 0x1a9,  0x288: 0x1ae,
 0x28a: 0x1b1,  0x28b: 0x1b2,  0x292: 0x1b7,  0x345: 0x399,  0x390: [ 0x399,0x308,0x301 ],
 0x3ac: 0x386,  0x3ad: 0x388,  0x3ae: 0x389,  0x3af: 0x38a,  0x3b0: [ 0x3a5,0x308,0x301 ],
 0x3b1: 0x391,  0x3b2: 0x392,  0x3b3: 0x393,  0x3b4: 0x394,  0x3b5: 0x395,
 0x3b6: 0x396,  0x3b7: 0x397,  0x3b8: 0x398,  0x3b9: 0x399,  0x3ba: 0x39a,
 0x3bb: 0x39b,  0x3bc: 0x39c,  0x3bd: 0x39d,  0x3be: 0x39e,  0x3bf: 0x39f,
 0x3c0: 0x3a0,  0x3c1: 0x3a1,  0x3c2: 0x3a3,  0x3c3: 0x3a3,  0x3c4: 0x3a4,
 0x3c5: 0x3a5,  0x3c6: 0x3a6,  0x3c7: 0x3a7,  0x3c8: 0x3a8,  0x3c9: 0x3a9,
 0x3ca: 0x3aa,  0x3cb: 0x3ab,  0x3cc: 0x38c,  0x3cd: 0x38e,  0x3ce: 0x38f,
 0x3d0: 0x392,  0x3d1: 0x398,  0x3d5: 0x3a6,  0x3d6: 0x3a0,  0x3d9: 0x3d8,
 0x3db: 0x3da,  0x3dd: 0x3dc,  0x3df: 0x3de,  0x3e1: 0x3e0,  0x3e3: 0x3e2,
 0x3e5: 0x3e4,  0x3e7: 0x3e6,  0x3e9: 0x3e8,  0x3eb: 0x3ea,  0x3ed: 0x3ec,
 0x3ef: 0x3ee,  0x3f0: 0x39a,  0x3f1: 0x3a1,  0x3f2: 0x3f9,  0x3f5: 0x395,
 0x3f8: 0x3f7,  0x3fb: 0x3fa,  0x430: 0x410,  0x431: 0x411,  0x432: 0x412,
 0x433: 0x413,  0x434: 0x414,  0x435: 0x415,  0x436: 0x416,  0x437: 0x417,
 0x438: 0x418,  0x439: 0x419,  0x43a: 0x41a,  0x43b: 0x41b,  0x43c: 0x41c,
 0x43d: 0x41d,  0x43e: 0x41e,  0x43f: 0x41f,  0x440: 0x420,  0x441: 0x421,
 0x442: 0x422,  0x443: 0x423,  0x444: 0x424,  0x445: 0x425,  0x446: 0x426,
 0x447: 0x427,  0x448: 0x428,  0x449: 0x429,  0x44a: 0x42a,  0x44b: 0x42b,
 0x44c: 0x42c,  0x44d: 0x42d,  0x44e: 0x42e,  0x44f: 0x42f,  0x450: 0x400,
 0x451: 0x401,  0x452: 0x402,  0x453: 0x403,  0x454: 0x404,  0x455: 0x405,
 0x456: 0x406,  0x457: 0x407,  0x458: 0x408,  0x459: 0x409,  0x45a: 0x40a,
 0x45b: 0x40b,  0x45c: 0x40c,  0x45d: 0x40d,  0x45e: 0x40e,  0x45f: 0x40f,
 0x461: 0x460,  0x463: 0x462,  0x465: 0x464,  0x467: 0x466,  0x469: 0x468,
 0x46b: 0x46a,  0x46d: 0x46c,  0x46f: 0x46e,  0x471: 0x470,  0x473: 0x472,
 0x475: 0x474,  0x477: 0x476,  0x479: 0x478,  0x47b: 0x47a,  0x47d: 0x47c,
 0x47f: 0x47e,  0x481: 0x480,  0x48b: 0x48a,  0x48d: 0x48c,  0x48f: 0x48e,
 0x491: 0x490,  0x493: 0x492,  0x495: 0x494,  0x497: 0x496,  0x499: 0x498,
 0x49b: 0x49a,  0x49d: 0x49c,  0x49f: 0x49e,  0x4a1: 0x4a0,  0x4a3: 0x4a2,
 0x4a5: 0x4a4,  0x4a7: 0x4a6,  0x4a9: 0x4a8,  0x4ab: 0x4aa,  0x4ad: 0x4ac,
 0x4af: 0x4ae,  0x4b1: 0x4b0,  0x4b3: 0x4b2,  0x4b5: 0x4b4,  0x4b7: 0x4b6,
 0x4b9: 0x4b8,  0x4bb: 0x4ba,  0x4bd: 0x4bc,  0x4bf: 0x4be,  0x4c2: 0x4c1,
 0x4c4: 0x4c3,  0x4c6: 0x4c5,  0x4c8: 0x4c7,  0x4ca: 0x4c9,  0x4cc: 0x4cb,
 0x4ce: 0x4cd,  0x4d1: 0x4d0,  0x4d3: 0x4d2,  0x4d5: 0x4d4,  0x4d7: 0x4d6,
 0x4d9: 0x4d8,  0x4db: 0x4da,  0x4dd: 0x4dc,  0x4df: 0x4de,  0x4e1: 0x4e0,
 0x4e3: 0x4e2,  0x4e5: 0x4e4,  0x4e7: 0x4e6,  0x4e9: 0x4e8,  0x4eb: 0x4ea,
 0x4ed: 0x4ec,  0x4ef: 0x4ee,  0x4f1: 0x4f0,  0x4f3: 0x4f2,  0x4f5: 0x4f4,
 0x4f9: 0x4f8,  0x501: 0x500,  0x503: 0x502,  0x505: 0x504,  0x507: 0x506,
 0x509: 0x508,  0x50b: 0x50a,  0x50d: 0x50c,  0x50f: 0x50e,  0x561: 0x531,
 0x562: 0x532,  0x563: 0x533,  0x564: 0x534,  0x565: 0x535,  0x566: 0x536,
 0x567: 0x537,  0x568: 0x538,  0x569: 0x539,  0x56a: 0x53a,  0x56b: 0x53b,
 0x56c: 0x53c,  0x56d: 0x53d,  0x56e: 0x53e,  0x56f: 0x53f,  0x570: 0x540,
 0x571: 0x541,  0x572: 0x542,  0x573: 0x543,  0x574: 0x544,  0x575: 0x545,
 0x576: 0x546,  0x577: 0x547,  0x578: 0x548,  0x579: 0x549,  0x57a: 0x54a,
 0x57b: 0x54b,  0x57c: 0x54c,  0x57d: 0x54d,  0x57e: 0x54e,  0x57f: 0x54f,
 0x580: 0x550,  0x581: 0x551,  0x582: 0x552,  0x583: 0x553,  0x584: 0x554,
 0x585: 0x555,  0x586: 0x556,  0x587: [ 0x535,0x582 ],  0x1e01: 0x1e00,  0x1e03: 0x1e02,
 0x1e05: 0x1e04,  0x1e07: 0x1e06,  0x1e09: 0x1e08,  0x1e0b: 0x1e0a,  0x1e0d: 0x1e0c,
 0x1e0f: 0x1e0e,  0x1e11: 0x1e10,  0x1e13: 0x1e12,  0x1e15: 0x1e14,  0x1e17: 0x1e16,
 0x1e19: 0x1e18,  0x1e1b: 0x1e1a,  0x1e1d: 0x1e1c,  0x1e1f: 0x1e1e,  0x1e21: 0x1e20,
 0x1e23: 0x1e22,  0x1e25: 0x1e24,  0x1e27: 0x1e26,  0x1e29: 0x1e28,  0x1e2b: 0x1e2a,
 0x1e2d: 0x1e2c,  0x1e2f: 0x1e2e,  0x1e31: 0x1e30,  0x1e33: 0x1e32,  0x1e35: 0x1e34,
 0x1e37: 0x1e36,  0x1e39: 0x1e38,  0x1e3b: 0x1e3a,  0x1e3d: 0x1e3c,  0x1e3f: 0x1e3e,
 0x1e41: 0x1e40,  0x1e43: 0x1e42,  0x1e45: 0x1e44,  0x1e47: 0x1e46,  0x1e49: 0x1e48,
 0x1e4b: 0x1e4a,  0x1e4d: 0x1e4c,  0x1e4f: 0x1e4e,  0x1e51: 0x1e50,  0x1e53: 0x1e52,
 0x1e55: 0x1e54,  0x1e57: 0x1e56,  0x1e59: 0x1e58,  0x1e5b: 0x1e5a,  0x1e5d: 0x1e5c,
 0x1e5f: 0x1e5e,  0x1e61: 0x1e60,  0x1e63: 0x1e62,  0x1e65: 0x1e64,  0x1e67: 0x1e66,
 0x1e69: 0x1e68,  0x1e6b: 0x1e6a,  0x1e6d: 0x1e6c,  0x1e6f: 0x1e6e,  0x1e71: 0x1e70,
 0x1e73: 0x1e72,  0x1e75: 0x1e74,  0x1e77: 0x1e76,  0x1e79: 0x1e78,  0x1e7b: 0x1e7a,
 0x1e7d: 0x1e7c,  0x1e7f: 0x1e7e,  0x1e81: 0x1e80,  0x1e83: 0x1e82,  0x1e85: 0x1e84,
 0x1e87: 0x1e86,  0x1e89: 0x1e88,  0x1e8b: 0x1e8a,  0x1e8d: 0x1e8c,  0x1e8f: 0x1e8e,
 0x1e91: 0x1e90,  0x1e93: 0x1e92,  0x1e95: 0x1e94,  0x1e96: [ 0x48,0x331 ],  0x1e97: [ 0x54,0x308 ],
 0x1e98: [ 0x57,0x30a ],  0x1e99: [ 0x59,0x30a ],  0x1e9a: [ 0x41,0x2be ],  0x1e9b: 0x1e60,  0x1ea1: 0x1ea0,
 0x1ea3: 0x1ea2,  0x1ea5: 0x1ea4,  0x1ea7: 0x1ea6,  0x1ea9: 0x1ea8,  0x1eab: 0x1eaa,
 0x1ead: 0x1eac,  0x1eaf: 0x1eae,  0x1eb1: 0x1eb0,  0x1eb3: 0x1eb2,  0x1eb5: 0x1eb4,
 0x1eb7: 0x1eb6,  0x1eb9: 0x1eb8,  0x1ebb: 0x1eba,  0x1ebd: 0x1ebc,  0x1ebf: 0x1ebe,
 0x1ec1: 0x1ec0,  0x1ec3: 0x1ec2,  0x1ec5: 0x1ec4,  0x1ec7: 0x1ec6,  0x1ec9: 0x1ec8,
 0x1ecb: 0x1eca,  0x1ecd: 0x1ecc,  0x1ecf: 0x1ece,  0x1ed1: 0x1ed0,  0x1ed3: 0x1ed2,
 0x1ed5: 0x1ed4,  0x1ed7: 0x1ed6,  0x1ed9: 0x1ed8,  0x1edb: 0x1eda,  0x1edd: 0x1edc,
 0x1edf: 0x1ede,  0x1ee1: 0x1ee0,  0x1ee3: 0x1ee2,  0x1ee5: 0x1ee4,  0x1ee7: 0x1ee6,
 0x1ee9: 0x1ee8,  0x1eeb: 0x1eea,  0x1eed: 0x1eec,  0x1eef: 0x1eee,  0x1ef1: 0x1ef0,
 0x1ef3: 0x1ef2,  0x1ef5: 0x1ef4,  0x1ef7: 0x1ef6,  0x1ef9: 0x1ef8,  0x1f00: 0x1f08,
 0x1f01: 0x1f09,  0x1f02: 0x1f0a,  0x1f03: 0x1f0b,  0x1f04: 0x1f0c,  0x1f05: 0x1f0d,
 0x1f06: 0x1f0e,  0x1f07: 0x1f0f,  0x1f10: 0x1f18,  0x1f11: 0x1f19,  0x1f12: 0x1f1a,
 0x1f13: 0x1f1b,  0x1f14: 0x1f1c,  0x1f15: 0x1f1d,  0x1f20: 0x1f28,  0x1f21: 0x1f29,
 0x1f22: 0x1f2a,  0x1f23: 0x1f2b,  0x1f24: 0x1f2c,  0x1f25: 0x1f2d,  0x1f26: 0x1f2e,
 0x1f27: 0x1f2f,  0x1f30: 0x1f38,  0x1f31: 0x1f39,  0x1f32: 0x1f3a,  0x1f33: 0x1f3b,
 0x1f34: 0x1f3c,  0x1f35: 0x1f3d,  0x1f36: 0x1f3e,  0x1f37: 0x1f3f,  0x1f40: 0x1f48,
 0x1f41: 0x1f49,  0x1f42: 0x1f4a,  0x1f43: 0x1f4b,  0x1f44: 0x1f4c,  0x1f45: 0x1f4d,
 0x1f50: [ 0x3a5,0x313 ],  0x1f51: 0x1f59,  0x1f52: [ 0x3a5,0x313,0x300 ],  0x1f53: 0x1f5b,  0x1f54: [ 0x3a5,0x313,0x301 ],
 0x1f55: 0x1f5d,  0x1f56: [ 0x3a5,0x313,0x342 ],  0x1f57: 0x1f5f,  0x1f60: 0x1f68,  0x1f61: 0x1f69,
 0x1f62: 0x1f6a,  0x1f63: 0x1f6b,  0x1f64: 0x1f6c,  0x1f65: 0x1f6d,  0x1f66: 0x1f6e,
 0x1f67: 0x1f6f,  0x1f70: 0x1fba,  0x1f71: 0x1fbb,  0x1f72: 0x1fc8,  0x1f73: 0x1fc9,
 0x1f74: 0x1fca,  0x1f75: 0x1fcb,  0x1f76: 0x1fda,  0x1f77: 0x1fdb,  0x1f78: 0x1ff8,
 0x1f79: 0x1ff9,  0x1f7a: 0x1fea,  0x1f7b: 0x1feb,  0x1f7c: 0x1ffa,  0x1f7d: 0x1ffb,
 0x1f80: 0x1f88,  0x1f81: 0x1f89,  0x1f82: 0x1f8a,  0x1f83: 0x1f8b,  0x1f84: 0x1f8c,
 0x1f85: 0x1f8d,  0x1f86: 0x1f8e,  0x1f87: 0x1f8f,  0x1f90: 0x1f98,  0x1f91: 0x1f99,
 0x1f92: 0x1f9a,  0x1f93: 0x1f9b,  0x1f94: 0x1f9c,  0x1f95: 0x1f9d,  0x1f96: 0x1f9e,
 0x1f97: 0x1f9f,  0x1fa0: 0x1fa8,  0x1fa1: 0x1fa9,  0x1fa2: 0x1faa,  0x1fa3: 0x1fab,
 0x1fa4: 0x1fac,  0x1fa5: 0x1fad,  0x1fa6: 0x1fae,  0x1fa7: 0x1faf,  0x1fb0: 0x1fb8,
 0x1fb1: 0x1fb9,  0x1fb2: [ 0x1fba,0x345 ],  0x1fb3: 0x1fbc,  0x1fb4: [ 0x386,0x345 ],  0x1fb6: [ 0x391,0x342 ],
 0x1fb7: [ 0x391,0x342,0x345 ],  0x1fbe: 0x399,  0x1fc2: [ 0x1fca,0x345 ],  0x1fc3: 0x1fcc,  0x1fc4: [ 0x389,0x345 ],
 0x1fc6: [ 0x397,0x342 ],  0x1fc7: [ 0x397,0x342,0x345 ],  0x1fd0: 0x1fd8,  0x1fd1: 0x1fd9,  0x1fd2: [ 0x399,0x308,0x300 ],
 0x1fd3: [ 0x399,0x308,0x301 ],  0x1fd6: [ 0x399,0x342 ],  0x1fd7: [ 0x399,0x308,0x342 ],  0x1fe0: 0x1fe8,  0x1fe1: 0x1fe9,
 0x1fe2: [ 0x3a5,0x308,0x300 ],  0x1fe3: [ 0x3a5,0x308,0x301 ],  0x1fe4: [ 0x3a1,0x313 ],  0x1fe5: 0x1fec,  0x1fe6: [ 0x3a5,0x342 ],
 0x1fe7: [ 0x3a5,0x308,0x342 ],  0x1ff2: [ 0x1ffa,0x345 ],  0x1ff3: 0x1ffc,  0x1ff4: [ 0x38f,0x345 ],  0x1ff6: [ 0x3a9,0x342 ],
 0x1ff7: [ 0x3a9,0x342,0x345 ],  0x2170: 0x2160,  0x2171: 0x2161,  0x2172: 0x2162,  0x2173: 0x2163,
 0x2174: 0x2164,  0x2175: 0x2165,  0x2176: 0x2166,  0x2177: 0x2167,  0x2178: 0x2168,
 0x2179: 0x2169,  0x217a: 0x216a,  0x217b: 0x216b,  0x217c: 0x216c,  0x217d: 0x216d,
 0x217e: 0x216e,  0x217f: 0x216f,  0x24d0: 0x24b6,  0x24d1: 0x24b7,  0x24d2: 0x24b8,
 0x24d3: 0x24b9,  0x24d4: 0x24ba,  0x24d5: 0x24bb,  0x24d6: 0x24bc,  0x24d7: 0x24bd,
 0x24d8: 0x24be,  0x24d9: 0x24bf,  0x24da: 0x24c0,  0x24db: 0x24c1,  0x24dc: 0x24c2,
 0x24dd: 0x24c3,  0x24de: 0x24c4,  0x24df: 0x24c5,  0x24e0: 0x24c6,  0x24e1: 0x24c7,
 0x24e2: 0x24c8,  0x24e3: 0x24c9,  0x24e4: 0x24ca,  0x24e5: 0x24cb,  0x24e6: 0x24cc,
 0x24e7: 0x24cd,  0x24e8: 0x24ce,  0x24e9: 0x24cf,  0xfb00: [ 0x46,0x66 ],  0xfb01: [ 0x46,0x69 ],
 0xfb02: [ 0x46,0x6c ],  0xfb03: [ 0x46,0x66,0x69 ],  0xfb04: [ 0x46,0x66,0x6c ],  0xfb05: [ 0x53,0x74 ],  0xfb06: [ 0x53,0x74 ],
 0xfb13: [ 0x544,0x576 ],  0xfb14: [ 0x544,0x565 ],  0xfb15: [ 0x544,0x56b ],  0xfb16: [ 0x54e,0x576 ],  0xfb17: [ 0x544,0x56d ],
 0xff41: 0xff21,  0xff42: 0xff22,  0xff43: 0xff23,  0xff44: 0xff24,  0xff45: 0xff25,
 0xff46: 0xff26,  0xff47: 0xff27,  0xff48: 0xff28,  0xff49: 0xff29,  0xff4a: 0xff2a,
 0xff4b: 0xff2b,  0xff4c: 0xff2c,  0xff4d: 0xff2d,  0xff4e: 0xff2e,  0xff4f: 0xff2f,
 0xff50: 0xff30,  0xff51: 0xff31,  0xff52: 0xff32,  0xff53: 0xff33,  0xff54: 0xff34,
 0xff55: 0xff35,  0xff56: 0xff36,  0xff57: 0xff37,  0xff58: 0xff38,  0xff59: 0xff39,
 0xff5a: 0xff3a,  0x10428: 0x10400,  0x10429: 0x10401,  0x1042a: 0x10402,  0x1042b: 0x10403,
 0x1042c: 0x10404,  0x1042d: 0x10405,  0x1042e: 0x10406,  0x1042f: 0x10407,  0x10430: 0x10408,
 0x10431: 0x10409,  0x10432: 0x1040a,  0x10433: 0x1040b,  0x10434: 0x1040c,  0x10435: 0x1040d,
 0x10436: 0x1040e,  0x10437: 0x1040f,  0x10438: 0x10410,  0x10439: 0x10411,  0x1043a: 0x10412,
 0x1043b: 0x10413,  0x1043c: 0x10414,  0x1043d: 0x10415,  0x1043e: 0x10416,  0x1043f: 0x10417,
 0x10440: 0x10418,  0x10441: 0x10419,  0x10442: 0x1041a,  0x10443: 0x1041b,  0x10444: 0x1041c,
 0x10445: 0x1041d,  0x10446: 0x1041e,  0x10447: 0x1041f,  0x10448: 0x10420,  0x10449: 0x10421,
 0x1044a: 0x10422,  0x1044b: 0x10423,  0x1044c: 0x10424,  0x1044d: 0x10425,  0x1044e: 0x10426,
 0x1044f: 0x10427,
};

/* End of autogenerated tables. */

/* Convert a 32-bit Unicode value to a JS string. */
function CharToString(val) {
    if (val < 0x10000) {
        return String.fromCharCode(val);
    }
    else {
        val -= 0x10000;
        return String.fromCharCode(0xD800 + (val >> 10), 0xDC00 + (val & 0x3FF));
    }
}

/* Given an array, return an array of the same length with all the values
   trimmed to the range 0-255. This may be the same array. */
function TrimArrayToBytes(arr) {
    var ix, newarr;
    var len = arr.length;
    for (ix=0; ix<len; ix++) {
        if (arr[ix] < 0 || arr[ix] >= 0x100) 
            break;
    }
    if (ix == len) {
        return arr;
    }
    newarr = Array(len);
    for (ix=0; ix<len; ix++) {
        newarr[ix] = (arr[ix] & 0xFF);
    }
    return newarr;
}

/* Convert an array of 8-bit values to a JS string, trimming if
   necessary. */
function ByteArrayToString(arr) {
    var ix, newarr;
    var len = arr.length;
    if (len == 0)
        return '';
    for (ix=0; ix<len; ix++) {
        if (arr[ix] < 0 || arr[ix] >= 0x100) 
            break;
    }
    if (ix == len) {
        return String.fromCharCode.apply(this, arr);
    }
    newarr = Array(len);
    for (ix=0; ix<len; ix++) {
        newarr[ix] = String.fromCharCode(arr[ix] & 0xFF);
    }
    return newarr.join('');
}

/* Convert an array of 32-bit Unicode values to a JS string. If they're
   all in the 16-bit range, this is easy; otherwise we have to do
   some munging. */
function UniArrayToString(arr) {
    var ix, val, newarr;
    var len = arr.length;
    if (len == 0)
        return '';
    for (ix=0; ix<len; ix++) {
        if (arr[ix] >= 0x10000) 
            break;
    }
    if (ix == len) {
        return String.fromCharCode.apply(this, arr);
    }
    newarr = Array(len);
    for (ix=0; ix<len; ix++) {
        val = arr[ix];
        if (val < 0x10000) {
            newarr[ix] = String.fromCharCode(val);
        }
        else {
            val -= 0x10000;
            newarr[ix] = String.fromCharCode(0xD800 + (val >> 10), 0xDC00 + (val & 0x3FF));
        }
    }
    return newarr.join('');
}

/* Log the message in the browser's error log, if it has one. (This shows
   up in Safari, in Opera, and in Firefox if you have Firebug installed.)
*/
function qlog(msg) {
    if (window.console && console.log)
        console.log(msg);
    else if (window.opera && opera.postError)
        opera.postError(msg);
}

//### debugging
function qobjdump(obj, depth) {
    var key, proplist;

    if (obj instanceof Array) {
        if (depth)
            depth--;
        var ls = obj.map(function(v) {return qobjdump(v, depth);});
        return ("[" + ls.join(",") + "]");
    }
    if (!(obj instanceof Object))
        return (""+obj);

    proplist = [ ];
    for (key in obj) {
        var val = obj[key];
        if (depth && val instanceof Object)
            val = qobjdump(val, depth-1);
        proplist.push(key + ":" + val);
    }
    return "{ " + proplist.join(", ") + " }";
}

//### debugging
function qbusyspin(msec) {
    var start = Date.now();
    qlog("### busyspin begin: " + msec + " msec");
    while (true) {
        var now = Date.now();
        if (now - start > msec)
            break;
    }
    qlog("### busyspin end");
}

/* RefBox: Simple class used for "call-by-reference" Glk arguments. The object
   is just a box containing a single value, which can be written and read.
*/
function RefBox() {
    this.value = undefined;
    this.set_value = function(val) {
        this.value = val;
    }
    this.get_value = function() {
        return this.value;
    }
}

/* RefStruct: Used for struct-type Glk arguments. After creating the
   object, you should call push_field() the appropriate number of times,
   to set the initial field values. Then set_field() can be used to
   change them, and get_fields() retrieves the list of all fields.

   (The usage here is loose, since Javascript is forgiving about arrays.
   Really the caller could call set_field() instead of push_field() --
   or skip that step entirely, as long as the Glk function later calls
   set_field() for each field. Which it should.)
*/
function RefStruct(numels) {
    this.fields = [];
    this.push_field = function(val) {
        this.fields.push(val);
    }
    this.set_field = function(pos, val) {
        this.fields[pos] = val;
    }
    this.get_field = function(pos) {
        return this.fields[pos];
    }
    this.get_fields = function() {
        return this.fields;
    }
}

/* Dummy return value, which means that the Glk call is still in progress,
   or will never return at all. This is used by glk_exit() and glk_select().
*/
var DidNotReturn = { dummy: 'Glk call has not yet returned' };

/* This returns a hint for whether the Glk call (by selector number)
   might block or never return. True for glk_exit() and glk_select().
*/
function call_may_not_return(id) {
    if (id == 1 || id == 192)
        return true;
    else
        return false;
}

var strtype_File = 1;
var strtype_Window = 2;
var strtype_Memory = 3;

/* Beginning of linked list of windows. */
var gli_windowlist = null;
var gli_rootwin = null;
/* Set when any window is created, destroyed, or resized. */
var geometry_changed = true; 
/* Received from GlkOte; describes the window size. */
var content_metrics = null;

/* Beginning of linked list of streams. */
var gli_streamlist = null;
/* Beginning of linked list of filerefs. */
var gli_filereflist = null;
/* Beginning of linked list of schannels. */
var gli_schannellist = null;

/* The current output stream. */
var gli_currentstr = null;

/* During a glk_select() block, this is the RefStruct which will contain
   the result. */
var gli_selectref = null;

/* This is used to assigned disprock values to windows, when there is
   no GiDispa layer to provide them. */
var gli_api_display_rocks = 1;

//### kill timer when library exits?
/* A positive number if the timer is set. */
var gli_timer_interval = null; 
var gli_timer_id = null; /* Currently active setTimeout ID */
var gli_timer_started = null; /* When the setTimeout began */

function gli_new_window(type, rock) {
    var win = {};
    win.type = type;
    win.rock = rock;
    win.disprock = undefined;

    win.parent = null;
    win.str = gli_stream_open_window(win);
    win.echostr = null;
    win.style = Const.style_Normal;
    win.hyperlink = 0;

    win.input_generation = null;
    win.linebuf = null;
    win.char_request = false;
    win.line_request = false;
    win.char_request_uni = false;
    win.line_request_uni = false;
    win.hyperlink_request = false;

    /* window-type-specific info is set up in glk_window_open */

    win.prev = null;
    win.next = gli_windowlist;
    gli_windowlist = win;
    if (win.next)
        win.next.prev = win;

    if (window.GiDispa)
        GiDispa.class_register('window', win);
    else
        win.disprock = gli_api_display_rocks++;
    /* We need to assign a disprock even if there's no GiDispa layer,
       because GlkOte differentiates windows by their disprock. */
    geometry_changed = true;

    return win;
}

function gli_delete_window(win) {
    var prev, next;

    if (window.GiDispa)
        GiDispa.class_unregister('window', win);
    geometry_changed = true;
    
    win.echostr = null;
    if (win.str) {
        gli_delete_stream(win.str);
        win.str = null;
    }

    prev = win.prev;
    next = win.next;
    win.prev = null;
    win.next = null;

    if (prev)
        prev.next = next;
    else
        gli_windowlist = next;
    if (next)
        next.prev = prev;

    win.parent = null;
}

function gli_windows_unechostream(str) {
    var win;
    
    for (win=gli_windowlist; win; win=win.next) {
        if (win.echostr === str)
            win.echostr = null;
    }
}

/* Add a (Javascript) string to the given window's display. */
function gli_window_put_string(win, val) {
    var ix, ch;

    //### might be efficient to split the implementation up into
    //### gli_window_buffer_put_string(), etc, since many functions
    //### know the window type when they call this
    switch (win.type) {
    case Const.wintype_TextBuffer:
        if (win.style != win.accumstyle
            || win.hyperlink != win.accumhyperlink)
            gli_window_buffer_deaccumulate(win);
        win.accum.push(val);
        break;
    case Const.wintype_TextGrid:
        for (ix=0; ix<val.length; ix++) {
            ch = val[ix];

            /* Canonicalize the cursor position. This is like calling
               gli_window_grid_canonicalize(), but I've inlined it. */
            if (win.cursorx < 0)
                win.cursorx = 0;
            else if (win.cursorx >= win.gridwidth) {
                win.cursorx = 0;
                win.cursory++;
            }
            if (win.cursory < 0)
                win.cursory = 0;
            else if (win.cursory >= win.gridheight)
                break; /* outside the window */

            if (ch == "\n") {
                /* a newline just moves the cursor. */
                win.cursory++;
                win.cursorx = 0;
                continue;
            }

            lineobj = win.lines[win.cursory];
            lineobj.dirty = true;
            lineobj.chars[win.cursorx] = ch;
            lineobj.styles[win.cursorx] = win.style;
            lineobj.hyperlinks[win.cursorx] = win.hyperlink;

            win.cursorx++;
            /* We can leave the cursor outside the window, since it will be
               canonicalized next time a character is printed. */
        }
        break;
    }
}

/* Canonicalize the cursor position. That is, the cursor may have
   been left outside the window area; wrap it if necessary.
*/
function gli_window_grid_canonicalize(win) {
    if (win.cursorx < 0)
        win.cursorx = 0;
    else if (win.cursorx >= win.gridwidth) {
        win.cursorx = 0;
        win.cursory++;
    }
    if (win.cursory < 0)
        win.cursory = 0;
    else if (win.cursory >= win.gridheight)
        return; /* outside the window */
}

/* Take the accumulation of strings (since the last style change) and
   assemble them into a buffer window update. This must be called
   after each style change; it must also be called right before 
   GlkOte.update(). (Actually we call it right before win.accum.push
   if the style has changed -- there's no need to call for *every* style
   change if no text is being pushed out in between.)
*/
function gli_window_buffer_deaccumulate(win) {
    var conta = win.content;
    var stylename = StyleNameMap[win.accumstyle];
    var text, ls, ix, obj, arr;

    if (win.accum.length) {
        text = win.accum.join('');
        ls = text.split('\n');
        for (ix=0; ix<ls.length; ix++) {
            arr = undefined;
            if (ix == 0) {
                if (ls[ix]) {
                    if (conta.length == 0) {
                        arr = [];
                        conta.push({ content: arr, append: true });
                    }
                    else {
                        obj = conta[conta.length-1];
                        if (!obj.content) {
                            arr = [];
                            obj.content = arr;
                        }
                        else {
                            arr = obj.content;
                        }
                    }
                }
            }
            else {
                if (ls[ix]) {
                    arr = [];
                    conta.push({ content: arr });
                }
                else {
                    conta.push({ });
                }
            }
            if (arr !== undefined) {
                if (!win.accumhyperlink) {
                    arr.push(stylename);
                    arr.push(ls[ix]);
                }
                else {
                    arr.push({ style:stylename, text:ls[ix], hyperlink:win.accumhyperlink });
                }
            }
        }
    }

    win.accum.length = 0;
    win.accumstyle = win.style;
    win.accumhyperlink = win.hyperlink;
}

function gli_window_close(win, recurse) {
    var wx;
    
    for (wx=win.parent; wx; wx=wx.parent) {
        if (wx.type == Const.wintype_Pair) {
            if (wx.pair_key === win) {
                wx.pair_key = null;
                wx.pair_keydamage = true;
            }
        }
    }
    
    switch (win.type) {
        case Const.wintype_Pair: 
            if (recurse) {
                if (win.child1)
                    gli_window_close(win.child1, true);
                if (win.child2)
                    gli_window_close(win.child2, true);
            }
            win.child1 = null;
            win.child2 = null;
            win.pair_key = null;
            break;
        case Const.wintype_TextBuffer: 
            win.accum = null;
            win.content = null;
            break;
        case Const.wintype_TextGrid: 
            win.lines = null;
            break;
    }
    
    gli_delete_window(win);
}

function gli_window_rearrange(win, box) {
    var width, height, oldwidth, oldheight;
    var min, max, diff, splitwid, ix, cx, lineobj;
    var box1, box2, ch1, ch2;

    geometry_changed = true;
    win.bbox = box;

    switch (win.type) {

    case Const.wintype_TextGrid:
        /* Compute the new grid size. */
        width = box.right - box.left;
        height = box.bottom - box.top;
        oldheight = win.gridheight;
        win.gridwidth = Math.max(0, Math.floor((width-content_metrics.gridmarginx) / content_metrics.gridcharwidth));
        win.gridheight = Math.max(0, Math.floor((height-content_metrics.gridmarginy) / content_metrics.gridcharheight));

        /* Now we have to resize the win.lines array, in two dimensions. */
        if (oldheight > win.gridheight) {
            win.lines.length = win.gridheight;
        }
        else if (oldheight < win.gridheight) {
            for (ix=oldheight; ix<win.gridheight; ix++) {
                win.lines[ix] = { chars:[], styles:[], hyperlinks:[], 
                                  dirty:true };
            }
        }
        for (ix=0; ix<win.gridheight; ix++) {
            lineobj = win.lines[ix];
            oldwidth = lineobj.chars.length;
            if (oldwidth > win.gridwidth) {
                lineobj.dirty = true;
                lineobj.chars.length = win.gridwidth;
                lineobj.styles.length = win.gridwidth;
                lineobj.hyperlinks.length = win.gridwidth;
            }
            else if (oldwidth < win.gridwidth) {
                lineobj.dirty = true;
                for (cx=oldwidth; cx<win.gridwidth; cx++) {
                    lineobj.chars[cx] = ' ';
                    lineobj.styles[cx] = Const.style_Normal;
                    lineobj.hyperlinks[cx] = 0;
                }
            }
        }
        break;

    case Const.wintype_Pair:
        if (win.pair_vertical) {
            min = win.bbox.left;
            max = win.bbox.right;
            splitwid = content_metrics.inspacingx;
        }
        else {
            min = win.bbox.top;
            max = win.bbox.bottom;
            splitwid = content_metrics.inspacingy;
        }
        diff = max - min;

        if (win.pair_division == Const.winmethod_Proportional) {
            split = Math.floor((diff * win.pair_size) / 100);
        }
        else if (win.pair_division == Const.winmethod_Fixed) {
            split = 0;
            if (win.pair_key && win.pair_key.type == Const.wintype_TextBuffer) {
                if (!win.pair_vertical) 
                    split = (win.pair_size * content_metrics.buffercharheight + content_metrics.buffermarginy);
                else
                    split = (win.pair_size * content_metrics.buffercharwidth + content_metrics.buffermarginx);
            }
            if (win.pair_key && win.pair_key.type == Const.wintype_TextGrid) {
                if (!win.pair_vertical) 
                    split = (win.pair_size * content_metrics.gridcharheight + content_metrics.gridmarginy);
                else
                    split = (win.pair_size * content_metrics.gridcharwidth + content_metrics.gridmarginx);
            }
            split = Math.ceil(split);
        }
        else {
            /* default behavior for unknown division method */
            split = Math.floor(diff / 2);
        }

        /* Split is now a number between 0 and diff. Convert that to a number
           between min and max; also apply upside-down-ness. */
        if (!win.pair_backward) {
            split = max-split-splitwid;
        }
        else {
            split = min+split;
        }

        /* Make sure it's really between min and max. */
        if (min >= max) {
            split = min;
        }
        else {
            split = Math.min(Math.max(split, min), max-splitwid);
        }

        win.pair_splitpos = split;
        win.pair_splitwidth = splitwid;
        if (win.pair_vertical) {
            box1 = {
                left: win.bbox.left,
                right: win.pair_splitpos,
                top: win.bbox.top,
                bottom: win.bbox.bottom,
            };
            box2 = {
                left: box1.right + win.pair_splitwidth,
                right: win.bbox.right,
                top: win.bbox.top,
                bottom: win.bbox.bottom,
            };
        }
        else {
            box1 = {
                top: win.bbox.top,
                bottom: win.pair_splitpos,
                left: win.bbox.left,
                right: win.bbox.right,
            };
            box2 = {
                top: box1.bottom + win.pair_splitwidth,
                bottom: win.bbox.bottom,
                left: win.bbox.left,
                right: win.bbox.right,
            };
        }
        if (!win.pair_backward) {
            ch1 = win.child1;
            ch2 = win.child2;
        }
        else {
            ch1 = win.child2;
            ch2 = win.child1;
        }

        gli_window_rearrange(ch1, box1);
        gli_window_rearrange(ch2, box2);
        break;

    }
}

function gli_new_stream(type, readable, writable, rock) {
    var str = {};
    str.type = type;
    str.rock = rock;
    str.disprock = undefined;

    str.unicode = false;
    str.win = null;
    str.file = null;
    str.buf = null;
    str.bufpos = 0;
    str.buflen = 0;
    str.bufeof = 0;

    str.readcount = 0;
    str.writecount = 0;
    str.readable = readable;
    str.writable = writable;

    str.prev = null;
    str.next = gli_streamlist;
    gli_streamlist = str;
    if (str.next)
        str.next.prev = str;

    if (window.GiDispa)
        GiDispa.class_register('stream', str);

    return str;
}

function gli_delete_stream(str) {
    var prev, next;
    
    if (str === gli_currentstr) {
        gli_currentstr = null;
    }

    gli_windows_unechostream(str);

    if (str.type == strtype_Memory) {
        if (window.GiDispa)
            GiDispa.unretain_array(str.buf);
    }

    if (window.GiDispa)
        GiDispa.class_unregister('stream', str);

    prev = str.prev;
    next = str.next;
    str.prev = null;
    str.next = null;

    if (prev)
        prev.next = next;
    else
        gli_streamlist = next;
    if (next)
        next.prev = prev;

    str.buf = null;
    str.readable = false;
    str.writable = false;
    str.win = null;
    str.file = null;
}

function gli_stream_open_window(win) {
    var str;
    str = gli_new_stream(strtype_Window, false, true, 0);
    str.unicode = true;
    str.win = win;
    return str;
}

function gli_new_fileref(filename, usage, rock) {
    var fref = {};
    fref.filename = filename;
    fref.rock = rock;
    fref.disprock = undefined;

    fref.textmode = ((usage & Const.fileusage_TextMode) != 0);
    fref.filetype = (usage & Const.fileusage_TypeMask);

    fref.prev = null;
    fref.next = gli_filereflist;
    gli_filereflist = fref;
    if (fref.next)
        fref.next.prev = fref;

    if (window.GiDispa)
        GiDispa.class_register('fileref', fref);

    return fref;
}

function gli_delete_fileref(fref) {
    var prev, next;
    
    if (window.GiDispa)
        GiDispa.class_unregister('fileref', fref);

    prev = fref.prev;
    next = fref.next;
    fref.prev = null;
    fref.next = null;

    if (prev)
        prev.next = next;
    else
        gli_filereflist = next;
    if (next)
        next.prev = prev;

    fref.filename = null;
}

/* Write one character (given as a Unicode value) to a stream.
   This is called by both the one-byte and four-byte character APIs.
*/
function gli_put_char(str, ch) {
    if (!str || !str.writable)
        throw('gli_put_char: invalid stream');

    if (!str.unicode)
        ch = ch & 0xFF;

    str.writecount += 1;
    
    switch (str.type) {
    case strtype_Memory:
        if (str.bufpos < str.buflen) {
            str.buf[str.bufpos] = ch;
            str.bufpos += 1;
            if (str.bufpos > str.bufeof)
                str.bufeof = str.bufpos;
        }
        break;
    case strtype_Window:
        if (str.win.line_request)
            throw('gli_put_char: window has pending line request');
        gli_window_put_string(str.win, CharToString(ch));
        if (str.win.echostr)
            gli_put_char(str.win.echostr, ch);
        break;
    case strtype_File:
        throw('gli_put_char: file streams not supported');
    }
}

/* Write characters (given as an array of Unicode values) to a stream.
   This is called by both the one-byte and four-byte character APIs.
   The "allbytes" argument is a hint that all the array values are
   already in the range 0-255.
*/
function gli_put_array(str, arr, allbytes) {
    var ix, len, val;

    if (!str || !str.writable)
        throw('gli_put_array: invalid stream');

    if (!str.unicode && !allbytes) {
        arr = TrimArrayToBytes(arr);
        allbytes = true;
    }

    str.writecount += arr.length;
    
    switch (str.type) {
    case strtype_Memory:
        len = arr.length;
        if (len > str.buflen-str.bufpos)
            len = str.buflen-str.bufpos;
        for (ix=0; ix<len; ix++)
            str.buf[str.bufpos+ix] = arr[ix];
        str.bufpos += len;
        if (str.bufpos > str.bufeof)
            str.bufeof = str.bufpos;
        break;
    case strtype_Window:
        if (str.win.line_request)
            throw('gli_put_array: window has pending line request');
        if (allbytes)
            val = String.fromCharCode.apply(this, arr);
        else
            val = UniArrayToString(arr);
        gli_window_put_string(str.win, val);
        if (str.win.echostr)
            gli_put_array(str.win.echostr, arr, allbytes);
        break;
    case strtype_File:
        throw('gli_put_array: file streams not supported');
    }
}

function gli_get_char(str, want_unicode) {
    var ch;

    if (!str || !str.readable)
        return -1;
    
    switch (str.type) {
    case strtype_Memory:
        if (str.bufpos < str.bufeof) {
            ch = str.buf[str.bufpos];
            str.bufpos++;
            str.readcount++;
            if (!want_unicode && ch >= 0x100)
                return 63; // return '?'
            return ch;
        }
        else {
            return -1; // end of stream 
        }
    default:
        return -1;
    }
}

function gli_get_line(str, buf, want_unicode) {
    if (!str || !str.readable)
        return 0;

    var len = buf.length;
    var gotnewline;

    switch (str.type) {
    case strtype_Memory:
        if (len == 0)
            return 0;
        len -= 1; /* for the terminal null */
        if (str.bufpos >= str.bufeof) {
            len = 0;
        }
        else {
            if (str.bufpos + len > str.bufeof) {
                len = str.bufeof - str.bufpos;
            }
        }
        gotnewline = false;
        if (!want_unicode) {
            for (lx=0; lx<len && !gotnewline; lx++) {
                ch = str.buf[str.bufpos++];
                if (!want_unicode && ch >= 0x100)
                    ch = 63; // ch = '?'
                buf[lx] = ch;
                gotnewline = (ch == 10);
            }
        }
        else {
            for (lx=0; lx<len && !gotnewline; lx++) {
                ch = str.buf[str.bufpos++];
                buf[lx] = ch;
                gotnewline = (ch == 10);
            }
        }
        str.readcount += lx;
        return lx;
    default:
        return 0;
    }
}

function gli_get_buffer(str, buf, want_unicode) {
    if (!str || !str.readable)
        return 0;

    var len = buf.length;
    var lx, ch;
    
    switch (str.type) {
    case strtype_Memory:
        if (str.bufpos >= str.bufeof) {
            len = 0;
        }
        else {
            if (str.bufpos + len > str.bufeof) {
                len = str.bufeof - str.bufpos;
            }
        }
        if (!want_unicode) {
            for (lx=0; lx<len; lx++) {
                ch = str.buf[str.bufpos++];
                if (!want_unicode && ch >= 0x100)
                    ch = 63; // ch = '?'
                buf[lx] = ch;
            }
        }
        else {
            for (lx=0; lx<len; lx++) {
                buf[lx] = str.buf[str.bufpos++];
            }
        }
        str.readcount += len;
        return len;
    default:
        return 0;
    }
}

function gli_stream_fill_result(str, result) {
    if (!result)
        return;
    result.set_field(0, str.readcount);
    result.set_field(1, str.writecount);
}

function glk_put_jstring(val) {
    glk_put_jstring_stream(gli_currentstr, val);
}

function glk_put_jstring_stream(str, val) {
    var ix, len;

    if (!str || !str.writable)
        throw('gli_put_jstring: invalid stream');

    str.writecount += val.length;
    
    switch (str.type) {
    case strtype_Memory:
        len = val.length;
        if (len > str.buflen-str.bufpos)
            len = str.buflen-str.bufpos;
        if (str.unicode) {
            for (ix=0; ix<len; ix++)
                str.buf[str.bufpos+ix] = val.charCodeAt(ix);
        }
        else {
            for (ix=0; ix<len; ix++)
                str.buf[str.bufpos+ix] = val.charCodeAt(ix) & 0xFF;
        }
        str.bufpos += len;
        if (str.bufpos > str.bufeof)
            str.bufeof = str.bufpos;
        break;
    case strtype_Window:
        if (str.win.line_request)
            throw('gli_put_jstring: window has pending line request');
        gli_window_put_string(str.win, val);
        if (str.win.echostr)
            glk_put_jstring_stream(str.win.echostr, val);
        break;
    case strtype_File:
        throw('gli_put_jstring: file streams not supported');
    }
}

function gli_set_style(str, val) {
    if (!str || !str.writable)
        throw('gli_set_style: invalid stream');

    if (val >= Const.style_NUMSTYLES)
        val = 0;

    if (str.type == strtype_Window) {
        str.win.style = val;
        if (str.win.echostr)
            gli_set_style(str.win.echostr, val);
    }
}

function gli_set_hyperlink(str, val) {
    if (!str || !str.writable)
        throw('gli_set_hyperlink: invalid stream');

    if (str.type == strtype_Window) {
        str.win.hyperlink = val;
        if (str.win.echostr)
            gli_set_hyperlink(str.win.echostr, val);
    }
}

function gli_timer_callback() {
    gli_timer_id = setTimeout(gli_timer_callback, gli_timer_interval);
    gli_timer_started = Date.now();
    GlkOte.extevent('timer');
}

/* The catalog of Glk API functions. */

function glk_exit() {
    /* For safety, this is fast and idempotent. */
    has_exited = true;
    gli_selectref = null;
    return DidNotReturn;
}

function glk_tick() {
    /* Do nothing. */
}

function glk_gestalt(sel, val) {
    return glk_gestalt_ext(sel, val, null);
}

function glk_gestalt_ext(sel, val, arr) {
    //### more selectors
    switch (sel) {
    case 5: // gestalt_Timer
        return 1;
    case 11: // gestalt_Hyperlinks
        return 1;
    case 12: // gestalt_HyperlinkInput
        if (val == 3 || val == 4) // TextBuffer or TextGrid
            return 1;
        else
            return 0;
    }

    return 0;
}

function glk_window_iterate(win, rockref) {
    if (!win)
        win = gli_windowlist;
    else
        win = win.next;

    if (win) {
        if (rockref)
            rockref.set_value(win.rock);
        return win;
    }

    if (rockref)
        rockref.set_value(0);
    return null;
}

function glk_window_get_rock(win) {
    if (!win)
        throw('glk_window_get_rock: invalid window');
    return win.rock;
}

function glk_window_get_root() {
    return gli_rootwin;
}

function glk_window_open(splitwin, method, size, wintype, rock) {
    var oldparent, box, val;
    var pairwin, newwin;

    if (!gli_rootwin) {
        if (splitwin)
            throw('glk_window_open: splitwin must be null for first window');

        oldparent = null;
        box = {
            left: content_metrics.outspacingx,
            top: content_metrics.outspacingy,
            right: content_metrics.width-content_metrics.outspacingx,
            bottom: content_metrics.height-content_metrics.outspacingy,
        };
    }
    else {
        if (!splitwin)
            throw('glk_window_open: splitwin must not be null');

        val = (method & Const.winmethod_DivisionMask);
        if (val != Const.winmethod_Fixed && val != Const.winmethod_Proportional)
            throw('glk_window_open: invalid method (not fixed or proportional)');

        val = (method & Const.winmethod_DirMask);
        if (val != Const.winmethod_Above && val != Const.winmethod_Below 
            && val != Const.winmethod_Left && val != Const.winmethod_Right) 
            throw('glk_window_open: invalid method (bad direction)');
        
        box = splitwin.bbox;

        oldparent = splitwin.parent;
        if (oldparent && oldparent.type != Const.wintype_Pair) 
            throw('glk_window_open: parent window is not Pair');
    }

    newwin = gli_new_window(wintype, rock);

    switch (newwin.type) {
    case Const.wintype_TextBuffer:
        /* accum is a list of strings of a given style; newly-printed text
           is pushed onto the list. accumstyle is the style of that text.
           Anything printed in a different style (or hyperlink value)
           triggers a call to gli_window_buffer_deaccumulate, which cleans
           out accum and adds the results to the content array. The content
           is in GlkOte format.
        */
        newwin.accum = [];
        newwin.accumstyle = null;
        newwin.accumhyperlink = 0;
        newwin.content = [];
        newwin.clearcontent = false;
        break;
    case Const.wintype_TextGrid:
        /* lines is a list of line objects. A line looks like
           { chars: [...], styles: [...], hyperlinks: [...], dirty: bool }.
        */
        newwin.gridwidth = 0;
        newwin.gridheight = 0;
        newwin.lines = [];
        newwin.cursorx = 0;
        newwin.cursory = 0;
        break;
    case Const.wintype_Blank:
        break;
    case Const.wintype_Pair:
        throw('glk_window_open: cannot open pair window directly')
    default:
        /* Silently return null */
        gli_delete_window(newwin);
        return null;
    }

    if (!splitwin) {
        gli_rootwin = newwin;
        gli_window_rearrange(newwin, box);
    }
    else {
        /* create pairwin, with newwin as the key */
        pairwin = gli_new_window(Const.wintype_Pair, 0);
        pairwin.pair_dir = method & Const.winmethod_DirMask;
        pairwin.pair_division = method & Const.winmethod_DivisionMask;
        pairwin.pair_key = newwin;
        pairwin.pair_keydamage = false;
        pairwin.pair_size = size;
        pairwin.pair_vertical = (pairwin.pair_dir == Const.winmethod_Left || pairwin.pair_dir == Const.winmethod_Right);
        pairwin.pair_backward = (pairwin.pair_dir == Const.winmethod_Left || pairwin.pair_dir == Const.winmethod_Above);

        pairwin.child1 = splitwin;
        pairwin.child2 = newwin;
        splitwin.parent = pairwin;
        newwin.parent = pairwin;
        pairwin.parent = oldparent;

        if (oldparent) {
            if (oldparent.child1 == splitwin)
                oldparent.child1 = pairwin;
            else
                oldparent.child2 = pairwin;
        }
        else {
            gli_rootwin = pairwin;
        }

        gli_window_rearrange(pairwin, box);
    }

    return newwin;
}

function glk_window_close(win, statsref) {
    if (!win)
        throw('glk_window_close: invalid window');

    if (win === gli_rootwin || !win.parent) {
        /* close the root window, which means all windows. */
        
        gli_rootwin = null;
        
        /* begin (simpler) closation */
        
        gli_stream_fill_result(win.str, statsref);
        gli_window_close(win, true); 
    }
    else {
        /* have to jigger parent */
        var pairwin, grandparwin, sibwin, box, wx, keydamage_flag;

        pairwin = win.parent;
        if (win === pairwin.child1)
            sibwin = pairwin.child2;
        else if (win === pairwin.child2)
            sibwin = pairwin.child1;
        else
            throw('glk_window_close: window tree is corrupted');

        box = pairwin.bbox;

        grandparwin = pairwin.parent;
        if (!grandparwin) {
            gli_rootwin = sibwin;
            sibwin.parent = null;
        }
        else {
            if (grandparwin.child1 === pairwin)
                grandparwin.child1 = sibwin;
            else
                grandparwin.child2 = sibwin;
            sibwin.parent = grandparwin;
        }
        
        /* Begin closation */
        
        gli_stream_fill_result(win.str, statsref);

        /* Close the child window (and descendants), so that key-deletion can
            crawl up the tree to the root window. */
        gli_window_close(win, true); 

        /* This probably isn't necessary, but the child *is* gone, so just
            in case. */
        if (win === pairwin.child1) {
            pairwin.child1 = null;
        }
        else if (win === pairwin.child2) {
            pairwin.child2 = null;
        }
        
        /* Now we can delete the parent pair. */
        gli_window_close(pairwin, false);

        keydamage_flag = false;
        for (wx=sibwin; wx; wx=wx.parent) {
            if (wx.type == Const.wintype_Pair) {
                if (wx.pair_keydamage) {
                    keydamage_flag = true;
                    wx.pair_keydamage = false;
                }
            }
        }
        
        if (keydamage_flag) {
            box = content_box;
            gli_window_rearrange(gli_rootwin, box);
        }
        else {
            gli_window_rearrange(sibwin, box);
        }
    }
}

function glk_window_get_size(win, widthref, heightref) {
    if (!win)
        throw('glk_window_get_size: invalid window');

    var wid = 0;
    var hgt = 0;
    var boxwidth, boxheight;

    switch (win.type) {

    case Const.wintype_TextGrid:
        boxwidth = win.bbox.right - win.bbox.left;
        boxheight = win.bbox.bottom - win.bbox.top;
        wid = Math.max(0, Math.floor((boxwidth-content_metrics.gridmarginx) / content_metrics.gridcharwidth));
        hgt = Math.max(0, Math.floor((boxheight-content_metrics.gridmarginy) / content_metrics.gridcharheight));        
        break;

    case Const.wintype_TextBuffer:
        boxwidth = win.bbox.right - win.bbox.left;
        boxheight = win.bbox.bottom - win.bbox.top;
        wid = Math.max(0, Math.floor((boxwidth-content_metrics.buffermarginx) / content_metrics.buffercharwidth));
        hgt = Math.max(0, Math.floor((boxheight-content_metrics.buffermarginy) / content_metrics.buffercharheight));        
        break;

    }

    if (widthref)
        widthref.set_value(wid);
    if (heightref)
        heightref.set_value(hgt);
}

function glk_window_set_arrangement(win, method, size, keywin) {
    var wx, newdir, newvertical, newbackward;

    if (!win)
        throw('glk_window_set_arrangement: invalid window');
    if (win.type != Const.wintype_Pair) 
        throw('glk_window_set_arrangement: not a pair window');

    if (keywin) {
        if (keywin.type == Const.wintype_Pair)
            throw('glk_window_set_arrangement: keywin cannot be a pair window');
        for (wx=keywin; wx; wx=wx.parent) {
            if (wx == win)
                break;
        }
        if (!wx)
            throw('glk_window_set_arrangement: keywin must be a descendant');
    }

    newdir = method & Const.winmethod_DirMask;
    newvertical = (newdir == Const.winmethod_Left || newdir == Const.winmethod_Right);
    newbackward = (newdir == Const.winmethod_Left || newdir == Const.winmethod_Above);
    if (!keywin)
        keywin = win.pair_key;

    if (newvertical && !win.pair_vertical)
        throw('glk_window_set_arrangement: split must stay horizontal');
    if (!newvertical && win.pair_vertical)
        throw('glk_window_set_arrangement: split must stay vertical');

    if (keywin && keywin.type == Const.wintype_Blank
        && (method & Const.winmethod_DivisionMask) == Const.winmethod_Fixed) 
        throw('glk_window_set_arrangement: a blank window cannot have a fixed size');

    if ((newbackward && !win.pair_backward) || (!newbackward && win.pair_backward)) {
        /* switch the children */
        wx = win.child1;
        win.child1 = win.child2;
        win.child2 = wx;
    }

    /* set up everything else */
    win.pair_dir = newdir;
    win.pair_division = (method & Const.winmethod_DivisionMask);
    win.pair_key = keywin;
    win.pair_size = size;

    win.pair_vertical = (win.pair_dir == Const.winmethod_Left || win.pair_dir == Const.winmethod_Right);
    win.pair_backward = (win.pair_dir == Const.winmethod_Left || win.pair_dir == Const.winmethod_Above);

    gli_window_rearrange(win, win.bbox);
}

function glk_window_get_arrangement(win, methodref, sizeref, keywinref) {
    if (!win)
        throw('glk_window_get_arrangement: invalid window');
    if (win.type != Const.wintype_Pair) 
        throw('glk_window_get_arrangement: not a pair window');

    if (sizeref)
        sizeref.set_value(win.pair_size);
    if (keywinref)
        keywinref.set_value(win.pair_key);
    if (methodref)
        methodref.set_value(win.pair_dir | win.pair_division);
}

function glk_window_get_type(win) {
    if (!win)
        throw('glk_window_get_type: invalid window');
    return win.type;
}

function glk_window_get_parent(win) {
    if (!win)
        throw('glk_window_get_parent: invalid window');
    return win.parent;
}

function glk_window_clear(win) {
    var ix, cx, lineobj;

    if (!win)
        throw('glk_window_clear: invalid window');
    
    if (win.line_request) {
        throw('glk_window_clear: window has pending line request');
    }

    switch (win.type) {
    case Const.wintype_TextBuffer:
        win.accum.length = 0;
        win.accumstyle = null;
        win.accumhyperlink = 0;
        win.content.length = 0;
        win.clearcontent = true;
        break;
    case Const.wintype_TextGrid:
        win.cursorx = 0;
        win.cursory = 0;
        for (ix=0; ix<win.gridheight; ix++) {
            lineobj = win.lines[ix];
            lineobj.dirty = true;
            for (cx=0; cx<win.gridwidth; cx++) {
                lineobj.chars[cx] = ' ';
                lineobj.styles[cx] = Const.style_Normal;
                lineobj.hyperlinks[cx] = 0;
            }
        }
        break;
    }
}

function glk_window_move_cursor(win, xpos, ypos) {
    if (!win)
        throw('glk_window_move_cursor: invalid window');
    
    if (win.type == Const.wintype_TextGrid) {
        /* No bounds-checking; we canonicalize when we print. */
        win.cursorx = xpos;
        win.cursory = ypos;
    }
    else {
        throw('glk_window_move_cursor: not a grid window');
    }
}

function glk_window_get_stream(win) {
    if (!win)
        throw('glk_window_get_stream: invalid window');
    return win.str;
}

function glk_window_set_echo_stream(win, str) {
    if (!win)
        throw('glk_window_set_echo_stream: invalid window');
    win.echostr = str;
}

function glk_window_get_echo_stream(win) {
    if (!win)
        throw('glk_window_get_echo_stream: invalid window');
    return win.echostr;
}

function glk_set_window(win) {
    if (!win)
        gli_currentstr = null;
    else
        gli_currentstr = win.str;
}

function glk_window_get_sibling(win) {
    var parent, sib;
    if (!win)
        throw('glk_window_get_sibling: invalid window');
    parent = win.parent;
    if (!parent)
        return null;
    if (win === parent.child1)
        return parent.child2;
    else if (win === parent.child2)
        return parent.child1;
    else
        throw('glk_window_get_sibling: window tree is corrupted');
}

function glk_stream_iterate(str, rockref) {
    if (!str)
        str = gli_streamlist;
    else
        str = str.next;

    if (str) {
        if (rockref)
            rockref.set_value(str.rock);
        return str;
    }

    if (rockref)
        rockref.set_value(0);
    return null;
}

function glk_stream_get_rock(str) {
    if (!str)
        throw('glk_stream_get_rock: invalid stream');
    return str.rock;
}

function glk_stream_open_file(fref, fmode, rock) {
    throw('glk_stream_open_file: file streams not supported');
}

function glk_stream_open_memory(buf, fmode, rock) {
    var str;

    if (fmode != Const.filemode_Read 
        && fmode != Const.filemode_Write 
        && fmode != Const.filemode_ReadWrite) 
        throw('glk_stream_open_memory: illegal filemode');

    str = gli_new_stream(strtype_Memory, 
        (fmode != Const.filemode_Write), 
        (fmode != Const.filemode_Read), 
        rock);
    str.unicode = false;

    if (buf) {
        str.buf = buf;
        str.buflen = buf.length;
        str.bufpos = 0;
        if (fmode == Const.filemode_Write)
            str.bufeof = 0;
        else
            str.bufeof = str.buflen;
        if (window.GiDispa)
            GiDispa.retain_array(buf);
    }

    return str;
}

function glk_stream_close(str, result) {
    if (!str)
        throw('glk_stream_close: invalid stream');

    if (str.type == strtype_Window)
        throw('glk_stream_close: cannot close window stream');

    gli_stream_fill_result(str, result);
    gli_delete_stream(str);
}

function glk_stream_set_position(str, pos, seekmode) {
    if (!str)
        throw('glk_stream_set_position: invalid stream');

    switch (str.type) {
    case strtype_Memory:
        if (seekmode == Const.seekmode_Current) {
            pos = str.bufpos + pos;
        }
        else if (seekmode == Const.seekmode_End) {
            pos = str.bufeof + pos;
        }
        else {
            /* pos = pos */
        }
        if (pos < 0)
            pos = 0;
        if (pos > str.bufeof)
            pos = str.bufeof;
        str.bufpos = pos;
    }
}

function glk_stream_get_position(str) {
    if (!str)
        throw('glk_stream_get_position: invalid stream');

    switch (str.type) {
    case strtype_Memory:
        return str.bufpos;
    default:
        return 0;
    }
}

function glk_stream_set_current(str) {
    gli_currentstr = str;
}

function glk_stream_get_current() {
    return gli_currentstr;
}

function glk_fileref_create_temp(usage, rock) {
    var filename = "####temporary";
    fref = gli_new_fileref(filename, usage, rock);
    return fref;
}

function glk_fileref_create_by_name(usage, arr, rock) {
    /* The filename is provided as an array of character codes. This will only
       be used as a Storage key, so the caller can't do much to mess with the
       user. But let's limit the filename to a sane length limit anyhow. */
    if (arr.length > 256)
        arr.length = 256;
    arr = TrimArrayToBytes(arr);
    var filename = String.fromCharCode.apply(this, arr);
    fref = gli_new_fileref(filename, usage, rock);
    return fref;
}

function glk_fileref_create_by_prompt(usage, fmode, rock) {
    /* #### prompt */
}

function glk_fileref_destroy(fref) {
    if (!fref)
        throw('glk_fileref_destroy: invalid fileref');
    gli_delete_fileref(fref);
}

function glk_fileref_iterate(fref, rockref) {
    if (!fref)
        fref = gli_filereflist;
    else
        fref = fref.next;

    if (fref) {
        if (rockref)
            rockref.set_value(fref.rock);
        return fref;
    }

    if (rockref)
        rockref.set_value(0);
    return null;
}

function glk_fileref_get_rock(fref) {
    if (!fref)
        throw('glk_fileref_get_rock: invalid fileref');
    return fref.rock;
}

function glk_fileref_delete_file(a1) { /*###*/ }
function glk_fileref_does_file_exist(a1) { /*###*/ }
function glk_fileref_create_from_fileref(a1, a2, a3) { /*###*/ }

function glk_put_char(ch) {
    gli_put_char(gli_currentstr, ch & 0xFF);
}

function glk_put_char_stream(str, ch) {
    gli_put_char(str, ch & 0xFF);
}

function glk_put_string(arr) {
    arr = TrimArrayToBytes(arr);
    gli_put_array(gli_currentstr, arr, true);
}

function glk_put_string_stream(str, arr) {
    arr = TrimArrayToBytes(arr);
    gli_put_array(str, arr, true);
}

// function glk_put_buffer(arr) { }
glk_put_buffer = glk_put_string;
// function glk_put_buffer_stream(str, arr) { }
glk_put_buffer_stream = glk_put_string_stream;

function glk_set_style(val) {
    gli_set_style(gli_currentstr, val);
}

function glk_set_style_stream(str, val) {
    gli_set_style(str, val);
}

function glk_get_char_stream(str) {
    if (!str)
        throw('glk_get_char_stream: invalid stream');
    return gli_get_char(str, false);
}

function glk_get_line_stream(str, buf) {
    if (!str)
        throw('glk_get_line_stream: invalid stream');
    return gli_get_line(str, buf, false);
}

function glk_get_buffer_stream(str, buf) {
    if (!str)
        throw('glk_get_buffer_stream: invalid stream');
    return gli_get_buffer(str, buf, false);
}

function glk_char_to_lower(val) {
    if (val >= 0x41 && val <= 0x5A)
        return val + 0x20;
    if (val >= 0xC0 && val <= 0xDE && val != 0xD7)
        return val + 0x20;
    return val;
}

function glk_char_to_upper(val) {
    if (val >= 0x61 && val <= 0x7A)
        return val - 0x20;
    if (val >= 0xE0 && val <= 0xFE && val != 0xF7)
        return val - 0x20;
    return val;
}

/* Style hints are not supported. We will use the new style system. */
function glk_stylehint_set(wintype, styl, hint, value) { }
function glk_stylehint_clear(wintype, styl, hint) { }
function glk_style_distinguish(win, styl1, styl2) {
    return 0;
}
function glk_style_measure(win, styl, hint, resultref) {
    if (resultref)
        resultref.set_value(0);
    return 0;
}

function glk_select(eventref) {
    gli_selectref = eventref;
    return DidNotReturn;
}

function glk_select_poll(eventref) {
    /* Because the Javascript interpreter is single-threaded, the
       gli_timer_callback function cannot have run since the last
       glk_select call. */

    eventref.set_field(0, Const.evtype_None);
    eventref.set_field(1, null);
    eventref.set_field(2, 0);
    eventref.set_field(3, 0);

    if (gli_timer_interval && !(gli_timer_id === null)) {
        var now = Date.now();
        if (now - gli_timer_started > gli_timer_interval) {
            /* We're past the timer interval, even though the callback
               hasn't run. Let's pretend it has, reset it, and return
               a timer event. */
            clearTimeout(gli_timer_id);
            gli_timer_id = setTimeout(gli_timer_callback, gli_timer_interval);
            gli_timer_started = Date.now();

            eventref.set_field(0, Const.evtype_Timer);
        }
    }
}

function glk_request_line_event(win, buf, initlen) {
    if (!win)
        throw('glk_request_line_event: invalid window');
    if (win.char_request || win.line_request)
        throw('glk_request_line_event: window already has keyboard request');

    if (win.type == Const.wintype_TextBuffer 
        || win.type == Const.wintype_TextGrid) {
        if (initlen) {
            /* This will be copied into the next update. */
            var ls = buf.slice(0, initlen);
            if (!current_partial_outputs)
                current_partial_outputs = {};
            current_partial_outputs[win.disprock] = ByteArrayToString(ls);
        }
        win.line_request = true;
        win.line_request_uni = false;
        win.input_generation = event_generation;
        win.linebuf = buf;
        if (window.GiDispa)
            GiDispa.retain_array(buf);
    }
    else {
        throw('glk_request_line_event: window does not support keyboard input');
    }
}

function glk_cancel_line_event(win, eventref) {
    if (!win)
        throw('glk_cancel_line_event: invalid window');

    if (!win.line_request) {
        if (eventref) {
            eventref.set_field(0, Const.evtype_None);
            eventref.set_field(1, null);
            eventref.set_field(2, 0);
            eventref.set_field(3, 0);
        }
        return;
    }

    var input = "";
    var ix, val;

    if (current_partial_inputs) {
        val = current_partial_inputs[win.disprock];
        if (val) 
            input = val;
    }

    if (input.length > win.linebuf.length)
        input = input.slice(0, win.linebuf.length);

    ix = win.style;
    gli_set_style(win.str, Const.style_Input);
    gli_window_put_string(win, input+"\n");
    if (win.echostr)
        glk_put_jstring_stream(win.echostr, input+"\n");
    gli_set_style(win.str, ix);
    //### wrong for grid window?

    for (ix=0; ix<input.length; ix++)
        win.linebuf[ix] = input.charCodeAt(ix);

    if (eventref) {
        eventref.set_field(0, Const.evtype_LineInput);
        eventref.set_field(1, win);
        eventref.set_field(2, input.length);
        eventref.set_field(3, 0);
    }

    if (window.GiDispa)
        GiDispa.unretain_array(win.linebuf);
    win.line_request = false;
    win.line_request_uni = false;
    win.input_generation = null;
    win.linebuf = null;
}

function glk_request_char_event(win) {
    if (!win)
        throw('glk_request_char_event: invalid window');
    if (win.char_request || win.line_request)
        throw('glk_request_char_event: window already has keyboard request');

    if (win.type == Const.wintype_TextBuffer 
        || win.type == Const.wintype_TextGrid) {
        win.char_request = true;
        win.char_request_uni = false;
        win.input_generation = event_generation;
    }
    else {
        throw('glk_request_char_event: window does not support keyboard input');
    }
}

function glk_cancel_char_event(win) {
    if (!win)
        throw('glk_cancel_char_event: invalid window');

    win.char_request = false;
    win.char_request_uni = false;
}

function glk_request_mouse_event(win) {
   if (!win)
        throw('glk_request_mouse_event: invalid window');
   /* Not supported. */
}

function glk_cancel_mouse_event(win) {
   if (!win)
        throw('glk_cancel_mouse_event: invalid window');
   /* Not supported. */
}

function glk_request_timer_events(msec) {
    if (!(gli_timer_id === null)) {
        clearTimeout(gli_timer_id);
        gli_timer_id = null;
        gli_timer_started = null;
    }

    if (!msec) {
        gli_timer_interval = null;
    }
    else {
        gli_timer_interval = msec;
        gli_timer_id = setTimeout(gli_timer_callback, gli_timer_interval);
        gli_timer_started = Date.now();
    }
}

/* Graphics functions are not currently supported. */

function glk_image_get_info(imgid, widthref, heightref) {
    if (widthref)
        widthref.set_value(0);
    if (heightref)
        heightref.set_value(0);
    return 0;
}

function glk_image_draw(win, imgid, val1, val2) {
    if (!win)
        throw('glk_image_draw: invalid window');
    return 0;
}

function glk_image_draw_scaled(win, imgid, val1, val2, width, height) {
    if (!win)
        throw('glk_image_draw_scaled: invalid window');
    return 0;
}

function glk_window_flow_break(win) {
    if (!win)
        throw('glk_window_flow_break: invalid window');
}

function glk_window_erase_rect(win, left, top, width, height) {
    if (!win)
        throw('glk_window_erase_rect: invalid window');
}

function glk_window_fill_rect(win, color, left, top, width, height) {
    if (!win)
        throw('glk_window_fill_rect: invalid window');
}

function glk_window_set_background_color(win, color) {
    if (!win)
        throw('glk_window_set_background_color: invalid window');
}


function glk_schannel_iterate(schan, rockref) {
    if (!schan)
        schan = gli_schannellist;
    else
        schan = schan.next;

    if (schan) {
        if (rockref)
            rockref.set_value(schan.rock);
        return schan;
    }

    if (rockref)
        rockref.set_value(0);
    return null;
}

function glk_schannel_get_rock(schan) {
    if (!schan)
        throw('glk_schannel_get_rock: invalid schannel');
    return schan.rock;
}

function glk_schannel_create(rock) {
    return null;
}

function glk_schannel_destroy(schan) {
    throw('glk_schannel_destroy: invalid schannel');
}

function glk_schannel_play(schan, sndid) {
    throw('glk_schannel_play: invalid schannel');
}

function glk_schannel_play_ext(schan, sndid, repeats, notify) {
    throw('glk_schannel_play_ext: invalid schannel');
}

function glk_schannel_stop(schan) {
    throw('glk_schannel_stop: invalid schannel');
}

function glk_schannel_set_volume(schan, vol) {
    throw('glk_schannel_set_volume: invalid schannel');
}

function glk_sound_load_hint(sndid, flag) {
}

function glk_set_hyperlink(val) {
    gli_set_hyperlink(gli_currentstr, val);
}

function glk_set_hyperlink_stream(str, val) {
    gli_set_hyperlink(str, val);
}

function glk_request_hyperlink_event(win) {
    if (!win)
        throw('glk_request_hyperlink_event: invalid window');
    if (win.type == Const.wintype_TextBuffer 
        || win.type == Const.wintype_TextGrid) {
        win.hyperlink_request = true;
    }
}

function glk_cancel_hyperlink_event(win) {
    if (!win)
        throw('glk_cancel_hyperlink_event: invalid window');
    if (win.type == Const.wintype_TextBuffer 
        || win.type == Const.wintype_TextGrid) {
        win.hyperlink_request = true;
    }
}

function glk_buffer_to_lower_case_uni(arr, numchars) {
    var ix, jx, pos, val, origval;
    var arrlen = arr.length;
    var src = arr.slice(0, numchars);

    if (arrlen < numchars)
        throw('buffer_to_lower_case_uni: numchars exceeds array length');

    pos = 0;
    for (ix=0; ix<numchars; ix++) {
        origval = src[ix];
        val = unicode_lower_table[origval];
        if (val === undefined) {
            arr[pos] = origval;
            pos++;
        }
        else if (!(val instanceof Array)) {
            arr[pos] = val;
            pos++;
        }
        else {
            for (jx=0; jx<val.length; jx++) {
                arr[pos] = val[jx];
                pos++;
            }
        }
    }

    /* in case we stretched the array */
    arr.length = arrlen;

    return pos;
}

function glk_buffer_to_upper_case_uni(arr, numchars) {
    var ix, jx, pos, val, origval;
    var arrlen = arr.length;
    var src = arr.slice(0, numchars);

    if (arrlen < numchars)
        throw('buffer_to_upper_case_uni: numchars exceeds array length');

    pos = 0;
    for (ix=0; ix<numchars; ix++) {
        origval = src[ix];
        val = unicode_upper_table[origval];
        if (val === undefined) {
            arr[pos] = origval;
            pos++;
        }
        else if (!(val instanceof Array)) {
            arr[pos] = val;
            pos++;
        }
        else {
            for (jx=0; jx<val.length; jx++) {
                arr[pos] = val[jx];
                pos++;
            }
        }
    }

    /* in case we stretched the array */
    arr.length = arrlen;

    return pos;
}

function glk_buffer_to_title_case_uni(arr, numchars, lowerrest) {
    var ix, jx, pos, val, origval;
    var arrlen = arr.length;
    var src = arr.slice(0, numchars);

    if (arrlen < numchars)
        throw('buffer_to_title_case_uni: numchars exceeds array length');

    pos = 0;

    if (numchars == 0)
        return 0;

    ix = 0;
    {
        origval = src[ix];
        val = unicode_title_table[origval];
        if (val === undefined) {
            arr[pos] = origval;
            pos++;
        }
        else if (!(val instanceof Array)) {
            arr[pos] = val;
            pos++;
        }
        else {
            for (jx=0; jx<val.length; jx++) {
                arr[pos] = val[jx];
                pos++;
            }
        }
    }
    
    if (!lowerrest) {
        for (ix=1; ix<numchars; ix++) {
            origval = src[ix];
            arr[pos] = origval;
            pos++;
        }
    }
    else {
        for (ix=1; ix<numchars; ix++) {
            origval = src[ix];
            val = unicode_lower_table[origval];
            if (val === undefined) {
                arr[pos] = origval;
                pos++;
            }
            else if (!(val instanceof Array)) {
                arr[pos] = val;
                pos++;
            }
            else {
                for (jx=0; jx<val.length; jx++) {
                    arr[pos] = val[jx];
                    pos++;
                }
            }
        }
    }

    /* in case we stretched the array */
    arr.length = arrlen;

    return pos;
}

function glk_put_char_uni(ch) {
    gli_put_char(gli_currentstr, ch);
}

function glk_put_string_uni(arr) {
    gli_put_array(gli_currentstr, arr, false);
}

// function glk_put_buffer_uni(a1) { }
glk_put_buffer_uni = glk_put_string_uni;

function glk_put_char_stream_uni(str, ch) {
    gli_put_char(str, ch);
}

function glk_put_string_stream_uni(str, arr) {
    gli_put_array(str, arr, false);
}

// function glk_put_buffer_stream_uni(str, arr) { }
glk_put_buffer_stream_uni = glk_put_string_stream_uni;

function glk_get_char_stream_uni(str) {
    if (!str)
        throw('glk_get_char_stream_uni: invalid stream');
    return gli_get_char(str, true);
}

function glk_get_buffer_stream_uni(str, buf) {
    if (!str)
        throw('glk_get_buffer_stream_uni: invalid stream');
    return gli_get_buffer(str, buf, true);
}

function glk_get_line_stream_uni(str, buf) {
    if (!str)
        throw('glk_get_line_stream_uni: invalid stream');
    return gli_get_line(str, buf, true);
}

function glk_stream_open_file_uni(fref, fmode, rock) {
    throw('glk_stream_open_file_uni: file streams not supported');
}

function glk_stream_open_memory_uni(buf, fmode, rock) {
    var str;

    if (fmode != Const.filemode_Read 
        && fmode != Const.filemode_Write 
        && fmode != Const.filemode_ReadWrite) 
        throw('glk_stream_open_memory: illegal filemode');

    str = gli_new_stream(strtype_Memory, 
        (fmode != Const.filemode_Write), 
        (fmode != Const.filemode_Read), 
        rock);
    str.unicode = true;

    if (buf) {
        str.buf = buf;
        str.buflen = buf.length;
        str.bufpos = 0;
        if (fmode == Const.filemode_Write)
            str.bufeof = 0;
        else
            str.bufeof = str.buflen;
        if (window.GiDispa)
            GiDispa.retain_array(buf);
    }

    return str;
}

function glk_request_char_event_uni(win) {
    if (!win)
        throw('glk_request_char_event: invalid window');
    if (win.char_request || win.line_request)
        throw('glk_request_char_event: window already has keyboard request');

    if (win.type == Const.wintype_TextBuffer 
        || win.type == Const.wintype_TextGrid) {
        win.char_request = true;
        win.char_request_uni = true;
    }
    else {
        throw('glk_request_char_event: window does not support keyboard input');
    }
}

function glk_request_line_event_uni(win, buf, initlen) {
    if (!win)
        throw('glk_request_line_event: invalid window');
    if (win.char_request || win.line_request)
        throw('glk_request_line_event: window already has keyboard request');

    if (win.type == Const.wintype_TextBuffer 
        || win.type == Const.wintype_TextGrid) {
        if (initlen) {
            /* This will be copied into the next update. */
            var ls = buf.slice(0, initlen);
            if (!current_partial_outputs)
                current_partial_outputs = {};
            current_partial_outputs[win.disprock] = UniArrayToString(ls);
        }
        win.line_request = true;
        win.line_request_uni = true;
        win.input_generation = event_generation;
        win.linebuf = buf;
        if (window.GiDispa)
            GiDispa.retain_array(buf);
    }
    else {
        throw('glk_request_line_event: window does not support keyboard input');
    }
}

return {
    init : init,
    update : update,
    fatal_error : fatal_error,
    Const : Const,
    RefBox : RefBox,
    RefStruct : RefStruct,
    DidNotReturn : DidNotReturn,
    call_may_not_return : call_may_not_return,

    glk_put_jstring : glk_put_jstring,
    glk_put_jstring_stream : glk_put_jstring_stream,

    glk_exit : glk_exit,
    glk_tick : glk_tick,
    glk_gestalt : glk_gestalt,
    glk_gestalt_ext : glk_gestalt_ext,
    glk_window_iterate : glk_window_iterate,
    glk_window_get_rock : glk_window_get_rock,
    glk_window_get_root : glk_window_get_root,
    glk_window_open : glk_window_open,
    glk_window_close : glk_window_close,
    glk_window_get_size : glk_window_get_size,
    glk_window_set_arrangement : glk_window_set_arrangement,
    glk_window_get_arrangement : glk_window_get_arrangement,
    glk_window_get_type : glk_window_get_type,
    glk_window_get_parent : glk_window_get_parent,
    glk_window_clear : glk_window_clear,
    glk_window_move_cursor : glk_window_move_cursor,
    glk_window_get_stream : glk_window_get_stream,
    glk_window_set_echo_stream : glk_window_set_echo_stream,
    glk_window_get_echo_stream : glk_window_get_echo_stream,
    glk_set_window : glk_set_window,
    glk_window_get_sibling : glk_window_get_sibling,
    glk_stream_iterate : glk_stream_iterate,
    glk_stream_get_rock : glk_stream_get_rock,
    glk_stream_open_file : glk_stream_open_file,
    glk_stream_open_memory : glk_stream_open_memory,
    glk_stream_close : glk_stream_close,
    glk_stream_set_position : glk_stream_set_position,
    glk_stream_get_position : glk_stream_get_position,
    glk_stream_set_current : glk_stream_set_current,
    glk_stream_get_current : glk_stream_get_current,
    glk_fileref_create_temp : glk_fileref_create_temp,
    glk_fileref_create_by_name : glk_fileref_create_by_name,
    glk_fileref_create_by_prompt : glk_fileref_create_by_prompt,
    glk_fileref_destroy : glk_fileref_destroy,
    glk_fileref_iterate : glk_fileref_iterate,
    glk_fileref_get_rock : glk_fileref_get_rock,
    glk_fileref_delete_file : glk_fileref_delete_file,
    glk_fileref_does_file_exist : glk_fileref_does_file_exist,
    glk_fileref_create_from_fileref : glk_fileref_create_from_fileref,
    glk_put_char : glk_put_char,
    glk_put_char_stream : glk_put_char_stream,
    glk_put_string : glk_put_string,
    glk_put_string_stream : glk_put_string_stream,
    glk_put_buffer : glk_put_buffer,
    glk_put_buffer_stream : glk_put_buffer_stream,
    glk_set_style : glk_set_style,
    glk_set_style_stream : glk_set_style_stream,
    glk_get_char_stream : glk_get_char_stream,
    glk_get_line_stream : glk_get_line_stream,
    glk_get_buffer_stream : glk_get_buffer_stream,
    glk_char_to_lower : glk_char_to_lower,
    glk_char_to_upper : glk_char_to_upper,
    glk_stylehint_set : glk_stylehint_set,
    glk_stylehint_clear : glk_stylehint_clear,
    glk_style_distinguish : glk_style_distinguish,
    glk_style_measure : glk_style_measure,
    glk_select : glk_select,
    glk_select_poll : glk_select_poll,
    glk_request_line_event : glk_request_line_event,
    glk_cancel_line_event : glk_cancel_line_event,
    glk_request_char_event : glk_request_char_event,
    glk_cancel_char_event : glk_cancel_char_event,
    glk_request_mouse_event : glk_request_mouse_event,
    glk_cancel_mouse_event : glk_cancel_mouse_event,
    glk_request_timer_events : glk_request_timer_events,
    glk_image_get_info : glk_image_get_info,
    glk_image_draw : glk_image_draw,
    glk_image_draw_scaled : glk_image_draw_scaled,
    glk_window_flow_break : glk_window_flow_break,
    glk_window_erase_rect : glk_window_erase_rect,
    glk_window_fill_rect : glk_window_fill_rect,
    glk_window_set_background_color : glk_window_set_background_color,
    glk_schannel_iterate : glk_schannel_iterate,
    glk_schannel_get_rock : glk_schannel_get_rock,
    glk_schannel_create : glk_schannel_create,
    glk_schannel_destroy : glk_schannel_destroy,
    glk_schannel_play : glk_schannel_play,
    glk_schannel_play_ext : glk_schannel_play_ext,
    glk_schannel_stop : glk_schannel_stop,
    glk_schannel_set_volume : glk_schannel_set_volume,
    glk_sound_load_hint : glk_sound_load_hint,
    glk_set_hyperlink : glk_set_hyperlink,
    glk_set_hyperlink_stream : glk_set_hyperlink_stream,
    glk_request_hyperlink_event : glk_request_hyperlink_event,
    glk_cancel_hyperlink_event : glk_cancel_hyperlink_event,
    glk_buffer_to_lower_case_uni : glk_buffer_to_lower_case_uni,
    glk_buffer_to_upper_case_uni : glk_buffer_to_upper_case_uni,
    glk_buffer_to_title_case_uni : glk_buffer_to_title_case_uni,
    glk_put_char_uni : glk_put_char_uni,
    glk_put_string_uni : glk_put_string_uni,
    glk_put_buffer_uni : glk_put_buffer_uni,
    glk_put_char_stream_uni : glk_put_char_stream_uni,
    glk_put_string_stream_uni : glk_put_string_stream_uni,
    glk_put_buffer_stream_uni : glk_put_buffer_stream_uni,
    glk_get_char_stream_uni : glk_get_char_stream_uni,
    glk_get_buffer_stream_uni : glk_get_buffer_stream_uni,
    glk_get_line_stream_uni : glk_get_line_stream_uni,
    glk_stream_open_file_uni : glk_stream_open_file_uni,
    glk_stream_open_memory_uni : glk_stream_open_memory_uni,
    glk_request_char_event_uni : glk_request_char_event_uni,
    glk_request_line_event_uni : glk_request_line_event_uni,
};

}();
