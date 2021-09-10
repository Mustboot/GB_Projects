# 4: Давайте усложним предыдущее задание.
# Измените сущности, добавив новый параметр - armor = 1.2 (величина брони персонажа)
# Теперь надо добавить новую функцию,
# которая будет вычислять и возвращать полученный урон по формуле damage / armor
# Следовательно, у вас должно быть 2 функции:
# Наносит урон. Это улучшенная версия функции из задачи 3.
# Вычисляет урон по отношению к броне.
#
# Примечание. Функция номер 2 используется внутри функции номер 1
# для вычисления урона и вычитания его из здоровья персонажа.


player = {'name': input('Введите имя игрока: '), 'health': 100, 'damage': 50, 'armor': 1.6}
enemy = {'name': input('Введите имя противника: '), 'health': 100, 'damage': 50, 'armor': 2.1}


def attack(player1, player2, fn):
    player2['health'] = int(player2['health'] - fn(player1, player2))
    if player2['health'] < 0:
        player2['health'] = 0
    print('\nПосле атаки у игроков осталось следующее количество единиц здоровья:\n -> У {0} осталось {1}'
          '\n -> У {2} осталось {3}'.format(player1['name'], player1['health'], player2['name'], player2['health']))


def damage_fn(p1, p2):
    return p1['damage']/p2['armor']


while player['health'] > 0 and enemy['health'] > 0:
    turn = int(input('\nкто бьет сейчас? (Игрок[1] / Противник[2]: '))
    if turn == 1:
        attack(player, enemy, damage_fn)
    elif turn == 2:
        attack(enemy, player, lambda p1, p2: p1['damage']/p2['armor'])
    else:
        print('Неверно! Введите 1 или 2 для определения следующего хода.')

if player['health'] > 0:
    print('\n Победил {0}!'.format(player['name']))
else:
    print('\n {0} проиграл...'.format(player['name']))
