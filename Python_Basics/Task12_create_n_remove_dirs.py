# : Создайте модуль (модуль - программа на Python, т.е. файл с расширением .py).
# В нем создайте функцию создающую директории от dir_1 до dir_9 в папке из которой запущен данный код.
# Затем создайте вторую функцию удаляющую эти папки. Проверьте работу функций в этом же модуле.

import os


def create_dirs(range_of_dirs):
    list_of_dirs = []
    for i in range_of_dirs:
        os.system('mkdir '+'dir_'+str(i))
        list_of_dirs.append('dir_'+str(i))
    return list_of_dirs


def delete_dirs(list_of_dirs):
    for i in list_of_dirs:
        os.system('rmdir '+i)

if __name__ == '__main__':
    my_dirs = create_dirs(range(int(input('Сколько директорий создать?: '))))
    if input('директории созданы, удалить их?[y/n]: ') == 'y':
        delete_dirs(my_dirs)
        print('директории удалены.')
    else:
        print('директории сохранены.')
