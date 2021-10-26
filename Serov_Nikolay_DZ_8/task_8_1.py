# 1. Написать функцию email_parse(<email_address>),
# которая при помощи регулярного выражения извлекает
# имя пользователя и почтовый домен из email адреса и
# возвращает их в виде словаря. Если адрес не валиден, выбросить исключение ValueError. Пример:
# >>> email_parse('someone@geekbrains.ru')
# {'username': 'someone', 'domain': 'geekbrains.ru'}
# >>> email_parse('someone@geekbrainsru')
# Traceback (most recent call last):
#   File "<stdin>", line 1, in <module>
#   ...
#     raise ValueError(msg)
# ValueError: wrong email: someone@geekbrainsru
# Примечание: подумайте о возможных ошибках в адресе и постарайтесь
# учесть их в регулярном выражении; имеет ли смысл в данном случае использовать функцию re.compile()?

import re

def email_parse(usr_email: str) -> dict:
    """
    This function is parsing email-addresses
    :param usr_email:
    :return: dict of username and domain
    """
    result = re.findall(r'([\w*\.]+)@([\w*]+\.[\w*\.]+)', usr_email)
    if result:
        return dict(zip(['username', 'domain'], list(result[0])))
    raise ValueError(f'Неверный адрес: {usr_email}')

if __name__ == '__main__':
    print(email_parse('Serov.Nikolay@gmail.com'))