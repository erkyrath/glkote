#!/usr/bin/env python3

"""
When run, this brings up a Tornado web server which accepts transcript
recording from the GlkOte library.

To use this, install Tornado (version 3) and "python3 transcript-demo.py".
Then add
  recording_url: 'http://localhost:4000/'
to the Game object fields in sample-demo.html. Commands in the demo game
will be send to the server, which will print them out.

Written by Andrew Plotkin. This script is in the public domain.
"""

import logging
import os
import json

import tornado.web
import tornado.gen
import tornado.ioloop
import tornado.options

tornado.options.define(
    'port', type=int, default=4000,
    help='port number to listen on')

tornado.options.define(
    'debug', type=bool,
    help='application debugging (see Tornado docs)')

tornado.options.define(
    'command', type=str,
    help='shell command to run a RemGlk game')

# Parse 'em up.
tornado.options.parse_command_line()
opts = tornado.options.options

# Define application options which are always set.
appoptions = {
    'xsrf_cookies': True,
    'cookie_secret': '__FILL_IN_RANDOM_DATA_HERE__',
    }

# Pull out some of the config-file options to pass along to the application.
for key in [ 'debug' ]:
    val = getattr(opts, key)
    if val is not None:
        appoptions[key] = val

class MainHandler(tornado.web.RequestHandler):
    @tornado.gen.coroutine
    def get(self):
        self.write('This is transcript-demo.py.')

class RecordHandler(tornado.web.RequestHandler):
    def check_xsrf_cookie(self):
        # All the form input on this page is GlkOte AJAX requests,
        # so we'll skip XSRF checking.
        pass
    
    @tornado.gen.coroutine
    def get(self):
        self.write('This is transcript-demo.py.')
        
    @tornado.gen.coroutine
    def post(self):
        state = json.loads(self.request.body.decode())
        # We use json.dumps as an easy way to pretty-print the object
        # we just parsed.
        print(json.dumps(state, indent=1, sort_keys=True))
        self.write('Ok')

# Core handlers.
handlers = [
    (r'/', MainHandler),
    (r'/record', RecordHandler),
]

class MyApplication(tornado.web.Application):
    """MyApplication is a customization of the generic Tornado web app
    class.
    """
    def init_app(self):
        # Grab the same logger that tornado uses.
        self.log = logging.getLogger("tornado.general")

application = MyApplication(
    handlers,
    **appoptions)

application.init_app()
application.listen(opts.port)
tornado.ioloop.IOLoop.instance().start()


    
