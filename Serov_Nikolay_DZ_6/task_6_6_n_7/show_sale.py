#! /usr/bin/python3

import sys

if __name__ == '__main__':
    with open('bakery_database.csv', 'r', encoding='utf-8') as f:
        if len(sys.argv[1:]) == 0:
            print(f.read())
        elif len(sys.argv[1:]) == 1:
            for line in (line.strip() for indx, line in enumerate(f.readlines()) if indx >= int(sys.argv[1]) - 1):
                print(line)
        elif len(sys.argv[1:]) == 2:
            for line in (line.strip() for indx, line in enumerate(f.readlines()) if int(sys.argv[2])-1 >= indx >= int(sys.argv[1]) - 1):
                print(line)
    exit()
