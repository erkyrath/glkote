GlkOte -- a Javascript display library for IF interfaces

GlkOte Library: version 2.0.0.
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

- README.txt      -- this file
- docs.html       -- how to use GlkOte in your game (or other application)

What you need:

- glkote.js       -- the GlkOte library
- glkapi.js       -- a Glk API layer
- dialog.js       -- a library for loading and saving game data
- jquery-1.11.2.js     -- the jQuery library
- jquery-1.11.2.min.js -- the jQuery library, compressed
- glkote.css      -- the GlkOte default stylesheet
- dialog.css      -- the stylesheet for the dialog library
- waiting.gif     -- an animated "loading" image

Example pages:

- sample-demo.html     -- a "fake game" that demonstrates library features
- sample-demo.js       -- source code for the fake game
- sample-demo2.html    -- same fake game with a different stylesheet
- glkote-demo2.css     -- the different stylesheet
- sample-help.html     -- pop-up help page for the fake game
- sample-demobase.html -- a simpler, one-window use of the library
- sample-minimal.html  -- minimal, no-window use of the library


* Permissions

The GlkOte, GlkAPI, and Dialog Javascript libraries are copyright
2008-2015 by Andrew Plotkin. They are distributed under the MIT
license; see the "LICENSE" file.

The GlkOte documentation is licensed under a Creative Commons
Attribution-Noncommercial-Share Alike 3.0 Unported License.
See <http://creativecommons.org/licenses/by-nc-sa/3.0>

This package includes the jQuery JavaScript framework, version 1.11.2
Copyright 2005, 2014 jQuery Foundation, Inc. and other contributors
Released under the MIT license <http://jquery.org/license>
For details, see the jQuery web site: <http://jquery.com/>

####

Prototype idioms to beware:
.map() -> $.map?
$ (anything)
.on...?
new Element
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

scrolling on ipad
iOS: autocapitalization off
