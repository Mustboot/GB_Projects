# 2: Дан список, заполненный произвольными числами.
# получить список из элементов исходного, удовлетворяющих следующим условиям:
# Элемент кратен 3,
# Элемент положительный,
# Элемент не кратен 4.
#
# Примечание: Список с целыми числами создайте вручную в начале файла.
# Не забудьте включить туда отрицательные числа. 10-20 чисел в списке вполне достаточно.

from random import randint

raw_list_of_numbers = [randint(-1000, 1000) for i in range(20)]
filtered_list = [number for number in raw_list_of_numbers if number > 0 and number % 3 == 0 and number % 4 != 0]
print(raw_list_of_numbers)
print(filtered_list)
