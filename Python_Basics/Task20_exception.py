# 4. Написать функцию которая принимает на вход число от 1 до 100.
# Если число равно 13, функция поднимает исключительную ситуации ValueError иначе возвращает введенное число,
# возведенное в квадрат.
# Далее написать основной код программы. Пользователь вводит число.
# Введенное число передаем параметром в написанную функцию и печатаем результат, который вернула функция.
# Обработать возможность возникновения исключительной ситуации, которая поднимается внутри функции.

from os import system


def pow_fn(x):
    if x != 13:
        return x**2
    else:
        raise ValueError


if __name__ == '__main__':
    while True:
        user_number = input('введите число от 1 до 100: ')
        user_number = int(user_number) if user_number.isdigit() and int(user_number) in range(1, 100) else 0
        if user_number:
           try:
               print(pow_fn(user_number))
               break
           except ValueError:
               system('cls')
               print('К сожалению число 13 тоже не подходит... введите другое число')
        else:
            system('cls')
