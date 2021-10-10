#! /usr/bin/python3
import sys

def odd_nums_generator(upper_limit=1) -> int:
    """
    Generator of odd numbers from 1 to "upper_limit" value

    :param upper_limit: odd nums up to this value
    :return: odd number
    """
    for element in range(1, upper_limit+1, 2):
        yield element


if __name__ == '__main__':
    odd_nums = odd_nums_generator(int(input('Введите значение верхнего предела до которго хотите полчить нечетные числа: ')))
    print(type(odd_nums), type(odd_nums_generator()))
    print(sys.getsizeof(odd_nums_generator), sys.getsizeof(odd_nums))
    print(next(odd_nums))
    print(next(odd_nums))
    print(next(odd_nums))
