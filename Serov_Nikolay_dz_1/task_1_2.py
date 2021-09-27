# Создать список, состоящий из кубов нечётных чисел от 1 до 1000 (куб X - третья степень числа X):

# создаем список с помощью генератора:
raw_list_of_numbers = [element ** 3 for element in range(1, 1001) if element % 2]

# или создаем список с помощью цикла:
element_for_list = 1
raw_list_of_numbers.clear()
while element_for_list <= 999:
    if element_for_list % 2:
        raw_list_of_numbers.append(element_for_list ** 3)
    element_for_list += 1

# Выводим результат в терминал для самопроверки
print('список, состоящий из кубов нечётных чисел от 1 до 1000: \n' + str(raw_list_of_numbers))

# a) Вычислить сумму тех чисел из этого списка, сумма цифр которых делится нацело на 7.
#    Например, число «19 ^ 3 = 6859» будем включать в сумму, так как 6 + 8 + 5 + 9 = 28 – делится нацело на 7.
#    Внимание: использовать только арифметические операции!

# создаем переменную для хранения суммы чисел из созданного списка,
# сумма цифр которых делится нацело на 7.
sum_of_numbers_div7 = 0

# перебираем все элементы списка, ...
for element in raw_list_of_numbers:
    # ... производим проверку условия (сумма цифр делится нацело на 7),
    # используя только арифметические операции...
    temp_element = element
    sum_of_digits = 0
    while temp_element >= 1:
        sum_of_digits += temp_element % 10
        temp_element //= 10
    # ... и суммируем подходящие числа.
    if not sum_of_digits % 7:
        print(sum_of_digits)
        sum_of_numbers_div7 += element

# Выводим результат в терминал
print('\nсумма тех чисел из этого списка, сумма цифр которых делится нацело на 7: \n'
      + str(sum_of_numbers_div7))

# b) К каждому элементу списка добавить 17 и заново вычислить сумму тех чисел из этого списка,
#    сумма цифр которых делится нацело на 7.

# для целостности кода, как бы заново создаем переменную для хранения суммы чисел из созданного списка,
# сумма цифр которых делится нацело на 7.
sum_of_numbers_div7 = 0

# создаем второй список (хотя это не обязательно)
raw_list_of_numbers_2 = []
for element in raw_list_of_numbers:
    raw_list_of_numbers_2.append(element + 17)

# вновь перебираем все элементы списка, ...
for element in raw_list_of_numbers_2:
    # ... производим проверку условия (сумма цифр делится нацело на 7), используя только арифметические операции...
    temp_element = element
    sum_of_digits = 0
    while temp_element >= 1:
        sum_of_digits += temp_element % 10
        temp_element //= 10
    # ... и суммируем подходящие числа.
    if not sum_of_digits % 7:
        print(sum_of_digits)
        sum_of_numbers_div7 += element

# Выводим результат в терминал
print('\nВариант 1 (доп.список): сумма чисел увеличенных на 17 из начального списка,'
      'сумма цифр которых делится нацело на 7: \n'
      + str(sum_of_numbers_div7))

# c) * Решить задачу под пунктом b, не создавая новый список.

# для целостности кода, еще раз заново создаем переменную для хранения суммы чисел из созданного списка,
# сумма цифр которых делится нацело на 7.
sum_of_numbers_div7 = 0

# увеличиваем элементы на 17 не создавая второй список
raw_list_of_numbers = [element + 17 for element in raw_list_of_numbers]


# вновь перебираем все элементы списка, ...
for element in raw_list_of_numbers:
    # ... производим проверку условия (сумма цифр делится нацело на 7), используя только арифметические операции...
    temp_element = element
    sum_of_digits = 0
    while temp_element >= 1:
        sum_of_digits += temp_element % 10
        temp_element //= 10
    # ... и суммируем подходящие числа.

    if not sum_of_digits % 7:
        print(sum_of_digits)
        sum_of_numbers_div7 += element

# Выводим результат в терминал
print('\nВариант 2 (без доп.списка): сумма чисел увеличенных на 17 из начального списка,'
      'сумма цифр которых делится нацело на 7: \n'
      + str(sum_of_numbers_div7))
