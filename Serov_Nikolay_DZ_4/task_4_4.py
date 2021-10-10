#! /usr/bin/python3

import task_4_3 as my_utils

if __name__ == '__main__':
    given_currency = my_utils.currency_rates("usd")
    print(f'Курс доллара: {given_currency[0]} RUB/USD ({given_currency[1]})')