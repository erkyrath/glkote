'use strict';

/* Blorb -- a Blorb file decoder for GlkOte
 * Designed by Andrew Plotkin <erkyrath@eblong.com>
 * <http://eblong.com/zarf/glk/glkote.html>
 *
 * Blorb.init(image, opts) -- ###
 *
 * Blorb.get_exec_chunk() -- ###
 *
 * Blorb.find_data_chunk(NUM) -- this finds the Data chunk of the
 *   given number from the Blorb file. The returned object looks like
 *   { data:[...], type:"..." } (where the type is TEXT or BINA).
 *   If there was no such chunk, or if the game was loaded from a non-
 *   Blorb file, this returns undefined.
 *
 * Blorb.get_metadata(FIELD) -- this returns a metadata field (a
 *   string) from the iFiction <bibliographic> section. If there is
 *   no such field, or if the game was loaded from a non-Blorb
 *   file, this returns undefined.
 *
 * Blorb.get_cover_pict() -- this returns the number of the image
 *   resource which contains the cover art. If there is no cover art,
 *   this returns undefined.
 *
 * Blorb.get_image_info(NUM) -- returns an object describing an image,
 *   or undefined.
 *
 * Blorb.get_debug_info() -- returns an array containing debug info,
 *   or null.
 *
 * Blorb.get_image_url(NUM) -- returns a URL describing an image, or
 *   undefined.
 */

/* All state is contained in BlorbClass. */
var BlorbClass = function() {

var inited = false;
var metadata = {}; /* Title, author, etc -- loaded from Blorb */
var coverimageres = undefined; /* Image resource number of the cover art */
var exec_chunk = null; /* Exec chunk (0) -- loaded from Blorb */
var debug_info = null; /* gameinfo.dbg file -- loaded from Blorb */
var blorbchunks = {}; /* Indexed by "USE:NUMBER" -- loaded from Blorb */
var alttexts = {}; /* Indexed by "USE:NUMBER" -- loaded from Blorb */

/* Look through a Blorb file (provided as a byte array) and return the
   game file chunk (ditto). If no such chunk is found, returns null.
   The gamechunktype option should be 'ZCOD' or 'GLUL'.

   This also loads the IFID metadata into the metadata object, and
   caches DATA chunks where we can reach them later.
*/
function blorb_init(image, opts) {
    var format = null;
    var gamechunktype = null;
    if (opts) {
        format = opts.format;
        gamechunktype = opts.gamechunktype;
    }

    if (!format) {
        /* An array of resources. */
        inited = true;
        //###
        return;
    }

    if (format != 'array') {
        throw new Error('Blorb: unrecognized format');
    }

    /* Blorb data in an array of bytes. */
    
    var len = image.length;
    var ix;
    var rindex = [];
    var pos = 12;

    while (pos < len) {
        var chunktype = String.fromCharCode(image[pos+0], image[pos+1], image[pos+2], image[pos+3]);
        pos += 4;
        var chunklen = (image[pos+0] << 24) | (image[pos+1] << 16) | (image[pos+2] << 8) | (image[pos+3]);
        pos += 4;

        if (chunktype == "RIdx") {
            var npos = pos;
            var numchunks = (image[npos+0] << 24) | (image[npos+1] << 16) | (image[npos+2] << 8) | (image[npos+3]);
            npos += 4;
            for (ix=0; ix<numchunks; ix++) {
                var chunkusage = String.fromCharCode(image[npos+0], image[npos+1], image[npos+2], image[npos+3]);
                npos += 4;
                var chunknum = (image[npos+0] << 24) | (image[npos+1] << 16) | (image[npos+2] << 8) | (image[npos+3]);
                npos += 4;
                var chunkpos = (image[npos+0] << 24) | (image[npos+1] << 16) | (image[npos+2] << 8) | (image[npos+3]);
                npos += 4;
                rindex.push( { usage:chunkusage, num:chunknum, pos:chunkpos } );
            }
        }
        if (chunktype == "IFmd") {
            var arr = image.slice(pos, pos+chunklen);
            var dat = encode_utf8_text(arr);
            var met = $('<metadata>').html(dat);
            var bibels = met.find('bibliographic').children();
            if (bibels.length) {
                var el;
                for (ix=0; ix<bibels.length; ix++) {
                    el = bibels[ix];
                    metadata[el.tagName.toLowerCase()] = el.textContent;
                }
            }
        }
        if (chunktype == "Dbug") {
            /* Because this is enormous, we only save it if the option
               is set to use it. */
            if (all_options.debug_info_chunk) {
                var arr = image.slice(pos, pos+chunklen);
                debug_info = arr;
            }
        }
        if (chunktype == "Fspc") {
            var npos = pos;
            coverimageres = (image[npos+0] << 24) | (image[npos+1] << 16) | (image[npos+2] << 8) | (image[npos+3]);
        }
        if (chunktype == "RDes") {
            var npos = pos;
            var numentries = (image[npos+0] << 24) | (image[npos+1] << 16) | (image[npos+2] << 8) | (image[npos+3]);
            npos += 4;
            for (ix=0; ix<numentries; ix++) {
                var rdusage = String.fromCharCode.apply(this, image.slice(npos, npos+4));
                npos += 4;
                var rdnumber = (image[npos+0] << 24) | (image[npos+1] << 16) | (image[npos+2] << 8) | (image[npos+3]);
                npos += 4;
                var rdlen = (image[npos+0] << 24) | (image[npos+1] << 16) | (image[npos+2] << 8) | (image[npos+3]);
                npos += 4;
                var rdtext = encode_utf8_text(image.slice(npos, npos+rdlen));
                npos += rdlen;
                alttexts[rdusage+':'+rdnumber] = rdtext;
            }
        }

        pos += chunklen;
        if (pos & 1)
            pos++;
    }

    /* We don't want to retain the original Blorb image in memory; it's
       enormous. We'll split out the addressable chunks (those with
       usages) and retain those individually. Still enormous, but less
       so.

       (It's probably a waste to save the cover image -- that probably
       won't ever be used by the game. But it might be.) 
    */

    for (ix=0; ix<rindex.length; ix++) {
        var el = rindex[ix];
        pos = el.pos;
        var chunktype = String.fromCharCode(image[pos+0], image[pos+1], image[pos+2], image[pos+3]);
        pos += 4;
        var chunklen = (image[pos+0] << 24) | (image[pos+1] << 16) | (image[pos+2] << 8) | (image[pos+3]);
        pos += 4;

        el.type = chunktype;
        el.len = chunklen;
        el.content = null;

        if (el.usage == "Exec" && el.num == 0 && chunktype == gamechunktype) {
            exec_chunk = image.slice(pos, pos+chunklen);
        }
        else {
            if (chunktype == "FORM") {
                el.content = image.slice(pos-8, pos+chunklen);
            }
            else {
                el.content = image.slice(pos, pos+chunklen);
            }
            blorbchunks[el.usage+':'+el.num] = el;
        }
    }

    inited = true;
}

function is_inited()
{
    return inited;
}

function get_library(val)
{
    /* This module doesn't rely on any others. */
    return null;
}
    
function get_exec_chunk()
{
    return exec_chunk;
}
    
/* End of Blorb namespace function. Return the object which will
   become the Blorb global. */
return {
    classname: 'Blorb',
    init: blorb_init,
    inited: is_inited,
    getlibrary: get_library,

    get_exec_chunk: get_exec_chunk,
    /*###
    find_data_chunk: find_data_chunk,
    get_metadata: get_metadata,
    get_cover_pict: get_cover_pict,
    get_debug_info: get_debug_info,
    get_image_info: get_image_info,
    get_image_url: get_image_url
    ###*/
};

};

/* I'm breaking the rule about creating a predefined instance. This is
   only used by GiLoad, which always creates a new instance.
*/
// var Blorb = new BlorbClass();

// Node-compatible behavior
try { exports.BlorbClass = BlorbClass; } catch (ex) {};

/* End of Blorb library. */
