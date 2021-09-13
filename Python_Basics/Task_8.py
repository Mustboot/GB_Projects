# 1: Создайте функцию, принимающую на вход имя, возраст и город проживания человека.
# Функция должна возвращать строку вида «Василий, 21 год(а), проживает в городе Москва»

def person_description(name, age, city):
    return '{0}, {1} год(а), проживает в городе {2}'.format(name,age,city)

user_name = input('Введите имя: ')
user_age = input('Введите возраст: ')
user_city = input('Введите город проживания: ')

print(person_description(user_name,user_age,user_city))


