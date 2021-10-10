#! /usr/bin/python3
from task_4_3 import currency_rates


def main(argv):
    """
    This function encapsulates another function which returns currencies exchange rates.
    Allow to return multiple requested currencies.

    :param argv: codes of currencies
    :return:
    """
    my_program, *args = argv
    for element in args:
        given_currency = currency_rates(element)
        print(f'{given_currency[0]} RUB/{element.upper()} ({given_currency[1]})')

    return 0


if __name__ == '__main__':
    import sys
    exit(main(sys.argv))
