#!/usr/bin/env python3

import sys
import os, os.path
import optparse
import json

popt = optparse.OptionParser()

(opts, args) = popt.parse_args()


if not args:
    print('usage: read-glktra.py transcript.glktra')
    sys.exit(-1)

def stanza_reader(path):
    with open(path, 'r') as fl:
        buf = ''
        while True:
            ln = fl.readline()
            if not ln:
                # End of file.
                # We may have an incomplete stanza in the buffer, but we
                # ignore that.
                break
            if not buf:
                buf = ln.lstrip()
                if buf and not buf.startswith('{'):
                    raise Exception('non-JSON encountered')
            else:
                buf = buf + ln
            try:
                obj = json.loads(buf)
            except:
                continue
            yield obj
            buf = ''
    
    
def read_transcript(path):
    for obj in stanza_reader(path):
        print('###', obj)
    
for path in args:
    read_transcript(path)
    
