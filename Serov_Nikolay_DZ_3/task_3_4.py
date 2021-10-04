#! /usr/bin/python3

# *(вместо задачи 3) Написать функцию thesaurus_adv(), принимающую в качестве аргументов
# строки в формате «Имя Фамилия» и возвращающую словарь, в котором ключи — первые буквы
# фамилий, а значения — словари, реализованные по схеме предыдущего задания и содержащие
# записи, в которых фамилия начинается с соответствующей буквы. Например:
# >>> thesaurus_adv("Иван Сергеев", "Инна Серова", "Петр
# Алексеев", "Илья Иванов", "Анна Савельева")
# {
# "А": {
#   "П": ["Петр Алексеев"]
# },
# "И": {
#   "И": ["Илья Иванов"]
# },
# "С": {
#   "И": ["Иван Сергеев", "Инна Серова"],
#   "А": ["Анна Савельева"]
# }
# }
# Как поступить, если потребуется сортировка по ключам?

def thesaurus_adv(*args: str) -> dict:
    """
    Function takes as arguments the names of employees and returns 'dict'
    in which the keys are the first letters of the names, and the values are lists
    containing names starting with the corresponding letter.

    :param args: [list of strings] the names of employees
    :return: dict where Keys are letters and Values are lists with names
    """

    # создаем ключи для словаря из первых букв фамилий
    # (элементы должны быть уникальными - используем возможность множества set)
    # а затем с помощью zip и генератора создаем шаблон словаря с вложенными пустыми словарями
    number_of_unique_letters_surname = len(set([element.split()[1][0] for element in args]))
    dict_of_names = dict(zip(set([element.split()[1][0] for element in args]),
                             [{} for _ in range(number_of_unique_letters_surname)]))

    # теперь добавляем имена по ключам
    for element in args:
        if element[0] in dict_of_names[element.split()[1][0]]:
            dict_of_names[element.split()[1][0]][element[0]].append(element)
        else:
            dict_of_names[element.split()[1][0]][element[0]] = [element]

    return dict_of_names


resultant_dict = thesaurus_adv("Иван Сергеев", "Инна Серова", "Петр Алексеев", "Илья Иванов", "Анна Савельева")
print(f'Словарь с именами сотрудников: {resultant_dict}')

# сортируем по ключу:
# - используем функцию sorted и метод .items возвращающий кортеж (key, val) из словаря
# - добавляем параметр key указывающий на элемент кортежа для сортировки (x[0] - первый элемент)
# - затем все конвертируем обратно в словарь
resultant_dict_sorted = dict(sorted(resultant_dict.items(), key=lambda x: x[0]))
for element_key in resultant_dict_sorted:
    resultant_dict_sorted[element_key] = dict(sorted(resultant_dict_sorted[element_key].items(), key=lambda x: x[0]))

print(f'Отсортированный по ключу словарь: {resultant_dict_sorted}')
