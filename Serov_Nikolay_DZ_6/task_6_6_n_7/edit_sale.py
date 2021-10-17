import sys

if __name__ == '__main__':
    with open('bakery_database.csv', 'r+', encoding='utf-8') as f:
        for _ in range(int(sys.argv[1]) - 1):
            line = f.readline().strip()
            if not line:
                print(f'Нет такой позиции')
                exit()
        f.seek(f.tell())
        f.write(f'{sys.argv[2]}                  ')
    exit()