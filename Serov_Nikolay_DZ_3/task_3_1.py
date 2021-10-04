#! /usr/bin/python3

# Написать функцию num_translate(), переводящую числительные от 0 до 10 c английского на
# русский язык. Например:
# >>> num_translate("one")
# "один"
# >>> num_translate("eight")
# "восемь"
# Если перевод сделать невозможно, вернуть None. Подумайте, как и где лучше хранить
# информацию, необходимую для перевода: какой тип данных выбрать, в теле функции или снаружи.


def num_translate(num_to_trans: str) -> str:
    """
    This function translates numerals from English to Russian.

    :param num_to_trans: numeral from one to ten in English
    :return: numeral, translated into Russian or 'None' if unable to translate
    """

    translation_dict = {"one": "один", "two": "два", "three": "три",
                        "four": "четыре", "five": "пять", "six": "шесть",
                        "seven": "семь", "eight": "восемь", "nine": "девять", "ten": "десять"}

    if num_to_trans.lower() in translation_dict:
        return translation_dict[num_to_trans.lower()]


print(f'Проверка: перевести числительное (one) - {num_translate("one")}\n'
      f'Проверка: перевести числительное (Three) - {num_translate("Three")}\n'
      f'Проверка: если ошибка во фразе или нет такого слова то выводим None - {num_translate("qwerty")}')
