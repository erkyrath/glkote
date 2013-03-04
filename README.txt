GlkOte -- a Javascript display library for IF interfaces

GlkOte Library: version 1.3.1.
Designed by Andrew Plotkin <erkyrath@eblong.com>
<http://eblong.com/zarf/glk/glkote.html>


GlkOte is a tool for creating interactive fiction -- and other
text-based applications -- on a web page. It is a Javascript library
which handles the mechanics of displaying text, arranging panes of
text, and accepting text input from the user.

GlkOte has been tested on Safari 3 through 5, Firefox 2 and up, MSIE 6
and up, Opera 9.5, and Chrome 5.


* Contents

Documentation:

- README.txt   -- this file
- docs.html    -- how to use GlkOte in your game (or other application)

What you need:

- glkote.js    -- the GlkOte library
- glkapi.js    -- a Glk API layer
- dialog.js    -- a library for loading and saving game data
- prototype-1.6.1.js -- the Prototype library
- glkote.css   -- the GlkOte default stylesheet
- dialog.css   -- the stylesheet for the dialog library
- waiting.gif  -- an animated "loading" image

Example pages:

- sample-demo.html    -- a "fake game" that demonstrates library features
- sample-demo.js      -- source code for the fake game
- sample-demo2.html   -- same fake game with a different stylesheet
- glkote-demo2.css    -- the different stylesheet
- sample-help.html    -- pop-up help page for the fake game
- sample-minimal.html -- minimal, no-window use of the library


* Permissions

The GlkOte, GlkAPI, and Dialog Javascript libraries are copyright
2008-2013 by Andrew Plotkin. You may copy and distribute them freely, by
any means and under any conditions, as long as the code and
documentation is not changed. You may also incorporate this code into
your own program and distribute that, or modify this code and use and
distribute the modified version, as long as you retain a notice in
your program or documentation which mentions my name and the URL shown
above.

The GlkOte documentation is licensed under a Creative Commons
Attribution-Noncommercial-Share Alike 3.0 Unported License.
See <http://creativecommons.org/licenses/by-nc-sa/3.0>

This package includes the Prototype JavaScript framework, version 1.6.1
(c) 2005-2009 Sam Stephenson
Prototype is freely distributable under the terms of an MIT-style license.
For details, see the Prototype web site: <http://www.prototypejs.org/>

####

Prototype idioms to beware:
.map() -> $.map?
$ (anything)
.on...?
Hash (each, get, index, keys, values, set) -> $.each?
Event.extend
Event.observe
Object.keys
Object.is (isNumber, isString)
func.defer
func.delay
str.startsWith
str.strip  -> trim
str.times
(str.indexOf is safe)
el.childElements
el.getDimensions
el.getWidth
el.getHeight
el.insert
el.writeAttribute
el.remove
el.update
el.positionedOffset
el.scroll*
el.show, el.hide

### Things to test

scrolling
scrolling on ipad
scroll-buffer-trimming
attempt to open dialog throws exception
iOS: autocapitalization off
initial value for an input field
make sure input fields are disabled when in dialog mode

remove "prototype" from README and docs! and bump version number

