#! /usr/bin/python3

# Реализуйте базовый класс Car:
# ● у класса должны быть следующие атрибуты: speed, color, name, is_police (булево). А
# также методы: go, stop, turn(direction), которые должны сообщать, что машина
# поехала, остановилась, повернула (куда);
# ● опишите несколько дочерних классов: TownCar, SportCar, WorkCar, PoliceCar;
# ● добавьте в базовый класс метод show_speed, который должен показывать текущую
# скорость автомобиля;
# ● для классов TownCar и WorkCar переопределите метод show_speed. При значении
# скорости свыше 60 (TownCar) и 40 (WorkCar) должно выводиться сообщение о
# превышении скорости.
# Создайте экземпляры классов, передайте значения атрибутов. Выполните доступ к атрибутам,
# выведите результат. Вызовите методы и покажите результат.

class Car:
    def __init__(self, speed: int, color: str, name: str, is_police=False):
        self.speed, self.color, self.name = speed, color, name
        self.direction = 'прямо'
        self.is_police = is_police

    def go(self):
        print(f'машина {self.name} поехала')

    def stop(self):
        print(f'машина {self.name} остановилась')

    def turn(self, direction: str):
        self.direction = direction
        print(f'машина {self.name} едет {self.direction}')

    def show_speed(self):
        print(self.speed)


class TownCar(Car):
    def show_speed(self):
        if self.speed > 60:
            return f'{self.speed} (Скорость превышена!)'
        else:
            return self.speed


class WorkCar(Car):
    def show_speed(self):
        if self.speed > 40:
            print(f'{self.speed} (Скорость превышена!)')
        else:
            print(self.speed)


class SportCar(Car):
    def __init__(self, speed: int, color: str, name: str, mode=False):
        super().__init__(speed, color, name)
        self.mode = mode

    def sport_mode(self, mode=True):
        self.mode = mode

    def is_sport_mode(self):
        if self.mode:
            print(f'Спорт режим активирован')
        else:
            print(f'Спорт режим выключен')


class PoliceCar(Car):
    def __init__(self, speed: int, color: str, name: str):
        super().__init__(speed, color, name, is_police=True)


if __name__ == '__main__':
    car_1 = TownCar(50, 'yellow', 'Lada')
    car_2 = WorkCar(41, 'green', 'ГАЗель')
    car_3 = SportCar(150, 'red', 'Bugatti')
    car_4 = PoliceCar(65, 'white-blue', 'VAZ-21007')

    car_1.go()
    print(car_2.name)
    car_2.show_speed()
    car_3.turn('направо')
    car_3.sport_mode()
    car_3.is_sport_mode()

