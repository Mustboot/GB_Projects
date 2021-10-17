#! /usr/bin/python3

import requests


def url_response_parser(response_line: str) -> tuple:
    """
    This function is parsing a line of server's response and split it into three (3) parts:
     (<remote_addr>, <request_type>, <requested_resource>)

    :param response_line: string line - response from server
    :return: tuple(<remote_addr>, <request_type>, <requested_resource>)
    """
    remote_addr, _, response_line = response_line.partition(' - - ')  # вырезаем <remote_addr> из полученного ответа
    response_line = response_line.partition('] "')[2]
    request_type, _, response_line = response_line.partition(' ')  # вырезаем <request_type> из полученного ответа
    requested_resource = response_line.partition(' ')[0]  # вырезаем <requested_resource> из полученного ответа
    return (remote_addr[2:], request_type, requested_resource)  # в ответе убираем два первых символа из <remote_addr>


if __name__ == '__main__':

    list_of_requests = []

    # открываем потоковый запрос на ресурс с log-данными:
    url_response = requests.get('https://github.com/elastic/examples/raw/master/Common%20Data%20Formats/nginx_logs/nginx_logs', stream=True)

    # используя метод класса Response вызываем генератор и считываем построчно данные:
    for chunk in url_response.iter_lines():
        list_of_requests.append(url_response_parser(chunk.__str__()))  # парсинг и добавление кортежей в список

    print(list_of_requests)  # Выводим список для самопроверки
