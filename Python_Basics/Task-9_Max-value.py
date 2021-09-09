# 2: Создайте функцию, принимающую на вход 3 числа и возвращающую наибольшее из них.

def maxvalue(numbers):
    max_element = numbers[0]
    for i in numbers:
        if i > max_element:
            max_element = i
    return max_element


elements=[]
for i in range(3):
    elements.append(int(input('Введите число: ')))
print(maxvalue(elements))