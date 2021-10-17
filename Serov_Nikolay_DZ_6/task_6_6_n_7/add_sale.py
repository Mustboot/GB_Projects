#! /usr/bin/python3

import sys

if __name__ == '__main__':
    with open('bakery_database.csv', 'a', encoding='utf-8') as f:
        f.writelines(f'{sys.argv[1]}\n')
