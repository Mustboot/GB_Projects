# 2: Создать модуль music_deserialize.py.
# В этом модуле открыть файлы group.json и group.pickle, прочитать из них информацию.
# И получить объект: словарь из предыдущего задания.

import json
import pickle

with open('group.json', 'r', encoding='utf-8') as jf:
    my_favorite_group_j = json.load(jf)

print(my_favorite_group_j)

with open('group.pickle', 'rb') as pf:
    my_favorite_group_p = pickle.load(pf)

print(my_favorite_group_p)
