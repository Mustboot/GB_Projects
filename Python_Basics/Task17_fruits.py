# 1: Даны два списка фруктов.
# Получить список фруктов, присутствующих в обоих исходных списках.
# Примечание: Списки фруктов создайте вручную в начале файла.

from random import sample

# Шаг 0: из википедии берем список всех известных фруктов, копируем и сохраняем в файл fruits.txt
# Шаг 1: открываем файл fruits.txt в скрипте и делаем случайную выборку из n-ого количества фруктов в два списка,
# выборку делаем с помощью генератора и функции sample.
with open('fruits.txt', 'r', encoding='utf-8') as f:
    list_of_fruits_1 = sample([line.replace('\n', '') for line in f], 50)
with open('fruits.txt', 'r', encoding='utf-8') as f:
    list_of_fruits_2 = sample([line.replace('\n', '') for line in f], 50)

# Шаг 2: с помощью генератора фильтруем списки и выявляем совпадения, которые записываем в новый список.
list_of_common_fruits = [fruit for fruit in list_of_fruits_1 if fruit in list_of_fruits_2]

# Шаг 3: выводим все результаты в терминал
print('Случайный список №1: ' + str(list_of_fruits_1))
print('Случайный список №2: ' + str(list_of_fruits_2))
print('Общий список: ' + str(list_of_common_fruits))
