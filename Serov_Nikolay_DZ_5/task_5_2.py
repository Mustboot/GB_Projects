#! /usr/bin/python3
import sys

if __name__ == '__main__':
    odd_nums_limit = int(input('Введите значение верхнего предела до которго хотите полчить нечетные числа: '))
    odd_nums = (element for element in range(1, odd_nums_limit+1, 2))

    print(type(odd_nums))  # смотрим какой тип - должен быть генератор
    print(sys.getsizeof(odd_nums))  # смотрим на размер

    print(next(odd_nums))
    print(next(odd_nums))
    print(next(odd_nums))
