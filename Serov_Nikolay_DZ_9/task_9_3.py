#! /usr/bin/python3

# Реализовать базовый класс Worker (работник):
# ● определить атрибуты: name, surname, position (должность), income (доход);
# ● последний атрибут должен быть защищённым и ссылаться на словарь, содержащий
# элементы «оклад» и «премия», например, {"wage": wage, "bonus": bonus};
# ● создать класс Position (должность) на базе класса Worker;
# ● в классе Position реализовать методы получения полного имени сотрудника
# (get_full_name) и дохода с учётом премии (get_total_income);
# ● проверить работу примера на реальных данных: создать экземпляры класса Position,
# передать данные, проверить значения атрибутов, вызвать методы экземпляров.

class Worker:
    def __init__(self, name: str, surname: str, position: str):
        self.name, self.surname, self.position = name, surname, position
        self._income = {"wage": 0, "bonus": 0}


class Position(Worker):
    def __init__(self, wage: int, bonus: int, name: str, surname: str, position: str):
        super().__init__(name, surname, position)
        self._income["wage"] = wage
        self._income["bonus"] = bonus

    def get_full_name(self):
        return f'{self.name} {self.surname}'

    def get_total_income(self):
        return self._income["wage"] + self._income["bonus"]


if __name__ == '__main__':
    worker_man = Position(1000, 100, 'Nikolay', 'Serov', 'Technical professional')
    print(f'Полное имя работника: {worker_man.get_full_name()}')
    print(f'Доход с учетом бонуса: {worker_man.get_total_income()}')
