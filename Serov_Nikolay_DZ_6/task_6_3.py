#! /usr/bin/python3

from itertools import zip_longest

if __name__ == '__main__':

    with open('hobby.csv', 'r', encoding='utf-8') as hobby_f, open('users.csv', 'r', encoding='utf-8') as users_f:
        hobby_data = [line.strip() for line in hobby_f.readlines()]
        users_data = [line.strip() for line in users_f.readlines()]
        if len(hobby_data) <= len(users_data):
            combined_list = dict(zip_longest(users_data, hobby_data))
        else:
            exit(1)

    # если все прошло успешно в предыдущем пункте, открываем файл для записи получившегося словаря
    with open('combined_file.csv', 'w+', encoding='utf-8') as combo_f:
        combo_f.write(combined_list.__str__())
        combo_f.seek(0)  # возвращаем каретку в начало файла
        print(combo_f.read())  # проверка сохраненных данных


