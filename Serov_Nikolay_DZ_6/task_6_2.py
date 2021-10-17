#! /usr/bin/python3

import requests
import random


def url_response_parser(response_line: str) -> tuple:
    """
    This function is parsing a line of server's response and split it into three (3) parts:
    (<remote_addr>, <request_type>, <requested_resource>)

    :param response_line: string line - response from server
    :return: tuple(remote_addr, request_type, requested_resource)
    """
    remote_addr, _, response_line = response_line.partition(' - - ')  # вырезаем <remote_addr> из полученного ответа
    response_line = response_line.partition('] "')[2]
    request_type, _, response_line = response_line.partition(' ')  # вырезаем <request_type> из полученного ответа
    requested_resource = response_line.partition(' ')[0]  # вырезаем <requested_resource> из полученного ответа
    return (remote_addr[2:], request_type, requested_resource)  # в ответе убираем два первых символа из <remote_addr>


if __name__ == '__main__':

    requests_analysis = dict()

    # открываем потоковый запрос на ресурс с log-данными:
    url_response = requests.get('https://github.com/elastic/examples/raw/master/Common%20Data%20Formats/nginx_logs/nginx_logs', stream=True)

    # используя метод класса Response вызываем генератор и считываем построчно данные:
    for chunk in url_response.iter_lines():
        parsed_data = url_response_parser(chunk.__str__())  # парсинг
        # сбор данных для анализа спам-запросов:
        requests_analysis.setdefault(parsed_data[0], 0)  # проверка на наличие данного адреса в словаре
        requests_analysis[parsed_data[0]] += 1  # увеличение счетчика запросов

    # Найти IP адрес спамера и количество отправленных им запросов по данным файла логов.
    # Примечание:
    # 1) спамер — это клиент, отправивший больше всех запросов;
    # 2) код должен работать даже с файлами, размер которых превышает объем ОЗУ компьютера.

    spamers = sorted(requests_analysis.items(), key=lambda x: x[1], reverse=True)
    print(f'Список спамеров:\n'
          f' 1) {spamers[0][0]} - {spamers[0][1]} запросов\n'
          f' 2) {spamers[1][0]} - {spamers[1][1]} запросов\n'
          f' 3) {spamers[2][0]} - {spamers[2][1]} запросов')  # Выводим список для самопроверки
