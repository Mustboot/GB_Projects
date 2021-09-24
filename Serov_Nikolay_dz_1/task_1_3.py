# Склонение слова
# Реализовать склонение слова «процент» во фразе «N процентов». Вывести эту фразу на экран отдельной
# строкой для каждого из чисел в интервале от 1 до 100:
# 1 процент
# 2 процента
# 3 процента
# 4 процента
# 5 процентов
# 6 процентов
# ...
# 100 процентов

user_percent = int(input('Введите процент от 0 до 100: '))
d_ending = user_percent % 10

if d_ending == 0 or d_ending > 4 or user_percent in [11, 12, 13, 14]:
    t_ending = 'ов'
elif d_ending >= 2 and d_ending <= 4:
    t_ending = 'а'
else:
    t_ending = ''
print(str(user_percent) + ' процент' + t_ending)
