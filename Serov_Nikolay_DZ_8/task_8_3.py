#! /usr/bin/python3


def type_logger(func):
    def wrapper(num):
        res = func(num)
        print(f'{num}: {type(num)}, результат работы осн.функции {func.__name__}: {res}')
    return wrapper


@type_logger
def calc_cube(x):
    return x ** 3


if __name__ == '__main__':
    v = calc_cube(7)
    print(v)
