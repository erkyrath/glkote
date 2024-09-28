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

metadata_keylist = [
    'title', 'author', 'headline', 'firstpublished',
    'ifid', 'format', 'tuid'
]

def add_stanza(obj, outfile):
    if 'metadata' in obj:
        anylines = False
        for key in metadata_keylist:
            if key in obj['metadata']:
                if not anylines:
                    anylines = True
                    outfile.write('--'*36 + '-\n')
                val = key + ': ' + obj['metadata'][key] + '\n'
                outfile.write(val)
        if anylines:
            outfile.write('--'*36 + '-\n')
    if 'output' in obj:
        if 'content' in obj['output']:
            for dat in obj['output']['content']:
                if 'text' in dat:
                    if 'clear' in dat:
                        outfile.write('- '*36 + '-\n')
                    if 'text' in dat:
                        add_stanza_linedata(dat['text'], outfile)

def add_stanza_linedata(text, outfile):
    ix = 0
    while ix < len(text):
        textarg = text[ix]
        content = None
        if textarg:
            content = textarg.get('content')
        if textarg and 'append' in textarg:
            if not content:
                ix += 1
                continue
        else:
            outfile.write('\n')
            
        # skip textarg.flowbreak for now
        if not content:
            ix += 1
            continue
        
        sx = 0
        while sx < len(content):
            rdesc = content[sx]
            if type(rdesc) is not str:
                if 'special' in rdesc:
                    # skip specials for now
                    sx += 1
                    continue
                rstyle = rdesc.get('style')
                rtext = rdesc.get('text')
                rlink = rdesc.get('hyperlink')
            else:
                rstyle = rdesc
                sx += 1
                rtext = content[sx]
                rline = None
            # ignore rlink
            outfile.write(rtext)
            sx += 1

        ix += 1

def stanzas_write_text(path, outfile=sys.stdout):
    for obj in stanza_reader(path):
        add_stanza(obj, outfile)
    outfile.write('\n')
    
for path in args:
    stanzas_write_text(path)
    
