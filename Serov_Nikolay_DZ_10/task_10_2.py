#! /usr/bin/python3

# Реализовать проект расчёта суммарного расхода ткани на производство одежды. Основная
# сущность (класс) этого проекта — одежда, которая может иметь определённое название. К
# типам одежды в этом проекте относятся пальто и костюм. У этих типов одежды существуют
# параметры: размер (для пальто) и рост (для костюма). Это могут быть обычные числа: V и H
# соответственно.
# Для определения расхода ткани по каждому типу одежды использовать формулы: для пальто
# (V/6.5 + 0.5), для костюма (2*H + 0.3). Проверить работу этих методов на реальных данных.
# Выполнить общий подсчёт расхода ткани. Проверить на практике полученные на этом уроке
# знания. Реализовать абстрактные классы для основных классов проекта и проверить работу
# декоратора @property.

class Clothes:
    def __init__(self):
        self.title = 'Одежда'


class Coat(Clothes):
    def __init__(self, size: int, title='Пальто'):
        super().__init__()
        self.title = title
        self.size = size

    def fabric_quantity(self):
        return self.size / 6.5 + 0.5


class Suit(Clothes):
    def __init__(self, height, title='Костюм'):
        super().__init__()
        self.height = height
        self.title = title

    @property
    def fabric_quantity(self):
        return 2 * self.height + 0.3


if __name__ == '__main__':
    coat_1 = Coat(12)
    suit_1 = Suit(180)

    print(f'Для пошива {coat_1.title} размера {coat_1.size} '
          f'нужно следующее кол-во ткани: {coat_1.fabric_quantity():.2f}')

    print(f'Для пошива {suit_1.title} на рост {suit_1.height} '
          f'нужно следующее кол-во ткани: {suit_1.fabric_quantity:.2f}')
