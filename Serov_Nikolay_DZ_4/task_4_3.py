#! /usr/bin/python3

from requests import get
from datetime import datetime


def currency_rates(currency_code: str) -> tuple:
    """
    This function returns exchange rate of RUB to a requested currency.

    :param currency_code: code of the requested currency
    :return: exchange rate
    """
    url_response = get('http://www.cbr.ru/scripts/XML_daily.asp')

    # проверка, отвечает ли сервер
    if url_response.status_code == 200:
        # проверка введенного кода валюты, независимо от регистра и на всякий случай
        # вместе с идентификаторами в <>-скобках для исключения случайного попадания.
        # Возвращаем None если код не найден
        response_timestamp = datetime.strptime(url_response.headers['Date'], '%a, %d %b %Y %H:%M:%S %Z')
        if f'<CharCode>{currency_code.upper()}</CharCode>' not in url_response.text:
            return (None, response_timestamp)
        else:
            currency_value, *_ = url_response.text[url_response.text.index(f'<CharCode>{currency_code.upper()}</CharCode>'):].partition('</Value>')
            *_, currency_value = currency_value.partition('<Value>')
            return (float(currency_value.replace(',', '.')), response_timestamp)
    else:  # если сервер не отвечает, сообщаем об этом
        print('К сожалению сервер с данными не отвечает или выбранной валюты не существует')
        return (None, None)


if __name__ == '__main__':
    USD_exrate = currency_rates("USD")
    EUR_exrate = currency_rates("E")
    print(type(USD_exrate[1]))
    print(f'Курс доллара: {USD_exrate[0]} RUB/USD ({USD_exrate[1]})')
    print(f'Курс евро: {EUR_exrate[0]} RUB/EUR ({EUR_exrate[1]})')
