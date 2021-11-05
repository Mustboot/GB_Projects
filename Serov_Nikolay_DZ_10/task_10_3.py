#! /usr/bin/python3

class Cell:
    def __init__(self, slots: int):
        self.slots = slots

    def __add__(self, other):
        # Сложение. Объединение двух клеток. При этом число ячеек общей клетки должно равняться
        # сумме ячеек исходных двух клеток.
        if type(other) == Cell:
            return Cell(self.slots + other.slots)
        else:
            raise TypeError(f'Ошибка - тип слагаемого {type(other)}, ожидалось {type(self)}')

    def __sub__(self, other):
        # Вычитание. Участвуют две клетки. Операцию необходимо выполнять, только если разность
        # количества ячеек двух клеток больше нуля, иначе выводить соответствующее сообщение.
        if type(other) == Cell:
            if self.slots > other.slots:
                return Cell(self.slots - other.slots)
            else:
                raise ValueError('Невозможно произвести вычитание, т.к. уменьшаемое меньше вычитаемого.')
        else:
            raise TypeError(f'Ошибка - тип вычитаемого {type(other)}, ожидалось {type(self)}')

    def __mul__(self, other):
        # Умножение. Создаётся общая клетка из двух. Число ячеек общей клетки — произведение
        # количества ячеек этих двух клеток
        if type(other) == Cell:
            return Cell(self.slots * other.slots)
        else:
            raise TypeError(f'Ошибка - тип 2-го множителя {type(other)}, ожидалось {type(self)}')

    def __truediv__(self, other):
        if type(other) == Cell:
            return Cell(self.slots // other.slots)
        else:
            raise TypeError(f'Ошибка - тип делителя {type(other)}, ожидалось {type(self)}')

    def make_order(self, slots_in_row: int):
        """
        принимает экземпляр класса и количество ячеек в ряду. Этот метод позволяет организовать ячейки по рядам.
        Метод должен возвращать строку вида *****\n*****\n*****..., где количество ячеек между \n
        равно переданному аргументу. Если ячеек на формирование ряда не хватает, то в последний
        ряд записываются все оставшиеся.
        :param slots_in_row: длинна ряда
        :return: строка вида *****\n*****\n*****
        """
        show_cell = ''
        full_rows = self.slots // slots_in_row
        left_row = self.slots % slots_in_row
        for i in range(0, full_rows):
            show_cell += '*' * slots_in_row + '\n'
        if left_row:
            show_cell += '*' * left_row + '\n'
        return show_cell


if __name__ == '__main__':
    some_cell = Cell(12)
    another_cell = Cell(8)

    print(some_cell.make_order(5))

    final_cell = some_cell - another_cell
    print(final_cell.make_order(5))
