#! /usr/bin/python3

# Написать функцию thesaurus(), принимающую в качестве аргументов имена сотрудников и
# возвращающую словарь, в котором ключи — первые буквы имён, а значения — списки,
# содержащие имена, начинающиеся с соответствующей буквы. Например:
# >>> thesaurus("Иван", "Мария", "Петр", "Илья")
# {
# "И": ["Иван", "Илья"],
# "М": ["Мария"],
# "П": ["Петр"]
# }
# Подумайте: полезен ли будет вам оператор распаковки? Как поступить, если потребуется
# сортировка по ключам? Можно ли использовать словарь в этом случае?


def thesaurus(*args: str) -> dict:
    """
    Function takes as arguments the names of employees and returns 'dict'
    in which the keys are the first letters of the names, and the values are lists
    containing names starting with the corresponding letter.

    :param args: [list of strings] the names of employees
    :return: dict where Keys are letters and Values are lists with names
    """

    # создаем ключи для словаря, где элементы должны быть уникальными,
    # для этого используем возможность множества set (содержит только уникальные элементы)
    # а затем с помощью zip и генератора создаем шаблон словаря
    number_of_unique_letters = len(set([element[0] for element in args]))
    dict_of_names = dict(zip(set([element[0] for element in args]), [[] for _ in range(number_of_unique_letters)]))

    # теперь добавляем имена по ключу
    for element in args:
        dict_of_names[element[0]].append(element)

    return dict_of_names

resultant_dict = thesaurus("Илья", "Мария", "Петр", "Иван", "Егор", "Михаил", "Семен")
print(f'Словарь с именами сотрудников: {resultant_dict}')

# сортируем по ключу:
# - используем функцию sorted и метод .items возвращающий кортеж (key, val) из словаря
# - добавляем параметр key указывающий на элемент кортежа для сортировки (x[0] - первый элемент)
# - затем все конвертируем обратно в словарь
resultant_dict_sorted = dict(sorted(resultant_dict.items(), key=lambda x: x[0]))
print(f'Отсортированный по ключу словарь: {resultant_dict_sorted}')