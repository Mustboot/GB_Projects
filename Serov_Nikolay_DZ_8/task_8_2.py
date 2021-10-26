#! /usr/bin/python3

import re

LOG = 'nginx_logs.txt'

def log_parse(src):
    re_list = [r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}',
               r'\[(.*?)\]',
               r'\"([A-Z]{3})',
               r'\s(\/[\w\/]+)',
               r'\s(\d{3})\s',
               r'\s\d{3}\s(\d+)']
    return tuple(re.findall(x, src)[0] for x in re_list)

if __name__ == '__main__':
    with open(LOG) as f:
        count, line = 1100, f.readline()
        while line and count:
            print(log_parse(line))
            count -= 1
            line = f.readline()


