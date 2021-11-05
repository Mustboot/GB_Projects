#! /usr/bin/python3

# Реализовать класс Matrix (матрица). Обеспечить перегрузку конструктора класса (метод __init__()),
# который должен принимать данные (список списков) для формирования матрицы.
# Следующий шаг — реализовать перегрузку метода __str__() для вывода матрицы в привычном виде.
# Далее реализовать перегрузку метода __add__() для сложения двух объектов класса Matrix
# (двух матриц). Результатом сложения должна быть новая матрица


class Matrix:
    def __init__(self, matrix_list: list):
        # Проверяем корректность введенных данных данных
        if all(len(matrix_list[0]) == len(matrix_list[i]) for i in range(len(matrix_list[1:]))):
            self.matrix = matrix_list
            self.rows = len(self.matrix)
            self.columns = len(self.matrix[0])
        else:
            raise ValueError('Incorrect data')

    def __str__(self):
        matrix_string = ''
        for row in self.matrix:
            for column in row:
                matrix_string += str(column) + ' '
            matrix_string += '\n'
        return matrix_string

    def __add__(self, other):
        if type(other) == Matrix and self.rows == other.rows and self.columns == other.columns:
            new_matrix = []
            for row in range(0, self.rows):
                new_matrix.append([])
                for column in range(0, self.columns):
                    new_matrix[row].append(self.matrix[row][column] + other.matrix[row][column])
            return Matrix(new_matrix)
        else:
            raise ArithmeticError('Matrices must be of the same dimension.')


if __name__ == '__main__':
    data_1 = [[31, 22],
              [37, 43],
              [51, 86]]
    data_2 = [[3, 5, 32],
              [2, 4, 6],
              [-1, 64, -8]]
    data_3 = [[3, 5, 8, 3],
              [8, 3, 7, 1]]

    matr_1 = Matrix(data_1)
    matr_2 = Matrix(data_1)  # специально для проверки сложения создаем другую матрицу того же размера, что и первая
    matr_3 = Matrix(data_3)
    matr_4 = matr_1 + matr_2

    print(matr_4)
