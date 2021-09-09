# 3: Дан список заполненный произвольными целыми числами.
# Получите новый список, элементами которого будут только уникальные элементы исходного.
#     Примечание. Списки создайте вручную, например так:
#       my_list_1 = [2, 2, 5, 12, 8, 2, 12]
#
# В этом случае ответ будет:
# [5, 8]

my_list_1 = [2, 2, 5, 12, 8, 2, 12]
only_unique_elements = []
for element in my_list_1:
    if my_list_1.count(element) == 1:
        only_unique_elements.append(element)
print(only_unique_elements)