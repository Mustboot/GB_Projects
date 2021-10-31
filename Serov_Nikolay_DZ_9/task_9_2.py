#! /usr/bin/python3


class Road:

    def __init__(self, width_m, length_m):
        self._width, self._length = width_m, length_m

    def get_width(self):
        return self._width

    def get_length(self):
        return self._length

    def asphalt_mass(self, thickness_cm, asphalt_kg_for_1cm_per_m2=25):
        return self._width * self._length * thickness_cm * asphalt_kg_for_1cm_per_m2

    def road_area(self):
        return self._width * self._length


if __name__ == '__main__':
    asphalt_calc = Road(20, 5000)
    thick_cm = int(input('Какой толщины (см) должен быть слой? '))
    print(f'Для покрытия асфальтом дороги:'
          f'\n длинной: {asphalt_calc.get_length()} метров;'
          f'\n шириной: {asphalt_calc.get_width()} метров;'
          f'\n площадью: {asphalt_calc.road_area()} кв.метров;'
          f'\n слоем в {thick_cm} сантиметров;'
          f'\n__________________________________'
          f'\n потребуется {int(asphalt_calc.asphalt_mass(thick_cm)/1000)} тонн асфальта')
