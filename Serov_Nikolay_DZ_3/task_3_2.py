#! /usr/bin/python3

# *(вместо задачи 1) Доработать предыдущую функцию в num_translate_adv(): реализовать
# корректную работу с числительными, начинающимися с заглавной буквы — результат тоже
# должен быть с заглавной. Например:
# >>> num_translate_adv("One")
# "Один"
# >>> num_translate_adv("two")
# "два"

def num_translate_adv(num_to_trans):
    """
    This function translates numerals (from one to ten) from English to Russian.
    Function is case sensitive.

    :param num_to_trans: numeral from one to ten in English, case sensitive
    :return: numeral, translated into Russian or 'None' if unable to translate
    """
    trans_dict = {"one": "один", "two": "два", "three": "три", "four": "четыре",
                  "five": "пять", "six": "шесть", "seven": "семь",
                  "eight": "восемь", "nine": "девять", "ten": "десять"}

    if num_to_trans.lower() in trans_dict:
        # исправил неточность - был не неправильный метод использован - .title() вместо .istitle()
        if num_to_trans.istitle():
            return trans_dict[num_to_trans.lower()].capitalize()
        else:
            return trans_dict[num_to_trans.lower()]


print(f'Проверка: None в случае невозможности перевода - {num_translate_adv("some_not_existing_num")}\n'
      f'Проверка: числительное с заглавной буквы (Two) - {num_translate_adv("Two")}\n'
      f'Проверка: числительное с маленькой буквы (two) - {num_translate_adv("two")}')
