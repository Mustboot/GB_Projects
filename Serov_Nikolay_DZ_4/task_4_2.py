#! /usr/bin/python3

from requests import get


def currency_rates(currency_code: str) -> float:
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
        if f'<CharCode>{currency_code.upper()}</CharCode>' not in url_response.text:
            return None
        else:
            currency_value, *_ = url_response.text[url_response.text.index(f'<CharCode>{currency_code.upper()}</CharCode>'):].partition('</Value>')
            *_, currency_value = currency_value.partition('<Value>')
            return float(currency_value.replace(',', '.'))
    else:  # если сервер не отвечает, сообщаем об этом
        print('К сожалению сервер с данными не отвечает или выбранной валюты не существует')


if __name__ == '__main__':
    print(f'Курс доллара: {currency_rates("USD")} RUB/USD')
    print(f'Курс евро: {currency_rates("EUR")} RUB/EUR')
