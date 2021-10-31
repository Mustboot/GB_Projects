#! /usr/bin/python3

from time import sleep


class TrafficLight:

    def __init__(self):
        self.__color = 'необходимо включить светофор!'
        self.__lights = (('red', 7), ('yellow', 2), ('green', 4))

    def running(self):
        while True:
            for color, l_time in self.__lights:
                self.__color = color
                print(color)
                sleep(l_time)


if __name__ == '__main__':
    my_light = TrafficLight()
    my_light.running()
