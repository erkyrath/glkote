/*
  Client-side code for Remote-IF demo.

  Written by Andrew Plotkin. This script is in the public domain.
 */

function accept(arg) {
    var data = {
        type:'update', gen:1
    };

    GlkOte.update(data);
};

Game = {
    accept: accept,
};

/* The page-ready handler. Like onload(), but better, I'm told. */
$(document).ready(function() {
    GlkOte.init();
});


