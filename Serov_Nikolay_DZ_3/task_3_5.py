#! /usr/bin/python3

# Реализовать функцию get_jokes(), возвращающую n шуток, сформированных из трех
# случайных слов, взятых из трёх списков (по одному из каждого):
# nouns = ["автомобиль", "лес", "огонь", "город", "дом"]
# adverbs = ["сегодня", "вчера", "завтра", "позавчера", "ночью"]
# adjectives = ["веселый", "яркий", "зеленый", "утопичный",
# "мягкий"]
# Например:
# >>> get_jokes(2)
# ["лес завтра зеленый", "город вчера веселый"]
# Документировать код функции.
# Сможете ли вы добавить еще один аргумент — флаг, разрешающий или запрещающий повторы
# слов в шутках (когда каждое слово можно использовать только в одной шутке)? Сможете ли вы
# сделать аргументы именованными?

from random import sample


def get_jokes(num_of_jokes=1, no_repeat=False):
    """
    Function returns n-jokes formed from three random words taken from three lists.
    If the no_repeat flag is False then function is not limited on the number of jokes
    but the words will be repeated, and if the flag is True then Max number of jokes
    is limited by the length of lists.

    :param num_of_jokes: number of jokes to compile
    :param no_repeat: False or True - flag that allows or prohibits repeating words in jokes
    (when each word can only be used in one joke)
    :return: the list of n-jokes
    """
    # списки со словами для шуток - должны быть одинаковой длины
    nouns = ["автомобиль", "лес", "огонь", "город", "дом"]
    adverbs = ["сегодня", "вчера", "завтра", "позавчера", "ночью"]
    adjectives = ["веселый", "яркий", "зеленый", "утопичный", "мягкий"]

    # проверяем на возможность повторений слов
    if no_repeat:
        param_for_counts = [1] * len(nouns)
        num_of_jokes = len(nouns)
    else:
        param_for_counts = [num_of_jokes] * len(nouns) if num_of_jokes > len(nouns) else [1] * len(nouns)

    # компилируем список с шутками
    all_jokes = list(map(' '.join, list(zip(sample(nouns, counts=param_for_counts, k=num_of_jokes),
                                            sample(adverbs, counts=param_for_counts, k=num_of_jokes),
                                            sample(adjectives, counts=param_for_counts, k=num_of_jokes)))))

    return all_jokes


print(f'Проверка: список из трех уникальных шуток (флаг запрета повторений включен) -\n {get_jokes(3, True)}\n\n'
      f'Проверка: список из 7 шуток (флаг запрета повторений включен) -\n {get_jokes(7, True)}\n'
      f'Привечание - как видно, выводится список из 5 шуток так как длина списков со словами равна 5\n\n'
      f'Проверка: список из 7 шуток (флаг запрета повторений выключен) -\n {get_jokes(7)}\n'
      f'Примечание - количество шуток теперь 7, но слова в шутках повторяются')
