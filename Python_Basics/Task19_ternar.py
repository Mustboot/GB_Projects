# 3. Напишите функцию, которая принимает на вход список.
# Функция создает из этого списка новый список из квадратных корней чисел (если число положительное)
# и самих чисел (если число отрицательное) и возвращает результат
# (желательно применить генератор и тернарный оператор при необходимости).
# В результате работы функции исходный список не должен измениться.
# Например:
# old_list = [1, -3, 4]
# result = [1, -3, 2]
#
# Примечание: Список с целыми числами создайте вручную в начале файла.
# Не забудьте включить туда отрицательные числа. 10-20 чисел в списке вполне достаточно.

from math import sqrt
from random import randint


def conditional_sqrt(list_of_rnd_number):
    return [round(sqrt(number), 2) for number in list_of_rnd_number if number > 0]


if __name__ == '__main__':
    initial_list = [randint(-100, 100) for i in range(20)]
    resultant_list = conditional_sqrt(initial_list)

    print(initial_list)
    print(resultant_list)
