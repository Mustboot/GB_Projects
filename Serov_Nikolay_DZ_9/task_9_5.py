#! /usr/bin/python3

# Реализовать класс Stationery (канцелярская принадлежность):
# ● определить в нём атрибут title (название) и метод draw (отрисовка). Метод выводит
# сообщение «Запуск отрисовки»;
# ● создать три дочерних класса Pen (ручка), Pencil (карандаш), Handle (маркер);
# ● в каждом классе реализовать переопределение метода draw. Для каждого класса
# метод должен выводить уникальное сообщение;
# ● создать экземпляры классов и проверить, что выведет описанный метод для каждого
# экземпляра.

class Stationary:
    def __init__(self, title='канцелярская принадлежность'):
        self.title = title

    def draw(self):
        print(f'запуск отрисовки')


class Pen(Stationary):
    def __init__(self):
        super().__init__('Ручка')

    def draw(self):
        print(f'рисуем инструментом: {self.title}')


class Pencil(Stationary):
    def __init__(self):
        super().__init__('Карандаш')

    def draw(self):
        print(f'рисуем инструментом: {self.title}')


class Handle(Stationary):
    def __init__(self):
        super().__init__('Маркер')

    def draw(self):
        print(f'рисуем инструментом: {self.title}')


if __name__ == '__main__':
    tool_1 = Pen()
    tool_2 = Pencil()
    tool_3 = Handle()

    tool_1.draw()
    tool_2.draw()
    tool_3.draw()
