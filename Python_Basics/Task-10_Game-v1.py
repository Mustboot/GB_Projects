# 3: Давайте опишем пару сущностей player и enemy через словарь,
# который будет иметь ключи и значения:
# name - строка полученная от пользователя,
# health = 100,
# damage = 50.
# Поэкспериментируйте с значениями урона и жизней по желанию.
### Теперь надо создать функцию attack(person1, person2).
### Примечание: имена аргументов можете указать свои.
### Функция в качестве аргумента будет принимать атакующего и атакуемого.
### В теле функция должна получить параметр damage атакующего и отнять это
### количество от health атакуемого. Функция должна сама работать со словарями и изменять их значения.


player = {'name': input('Введите имя игрока: '), 'health': 100, 'damage': 50}
enemy = {'name': input('Введите имя противника: '), 'health': 100, 'damage': 50}

def attack(player1, player2):
    player2['health'] = player2['health']-player1['damage']
    print('После атаки у игроков осталось следуюещее количество единиц здоровья:\n У {0} осталось {1}'
          '\n У {2} осталось {3}\n'.format(player1['name'], player1['health'],player2['name'],player2['health']))

while player['health'] > 0 and enemy['health'] > 0:
    turn = int(input('кто бьет сейчас? (Игрок[1] / Противник[2]: '))
    if turn == 1:
        attack(player, enemy)
    elif turn == 2:
        attack(enemy,player)
    else:
        print('Неверно! Введите 1 или 2 для определения следующего хода.')

if player['health'] > 0:
    print('Победил игрок!')
else:
    print('Игрок проиграл...')



