#! /usr/bin/python3

from itertools import zip_longest


if __name__ == '__main__':
    tutors = ['Иван', 'Анастасия', 'Петр', 'Сергей', 'Дмитрий', 'Борис', 'Елена']
    klasses = ['9А', '7В', '9Б', '9В', '8Б', '10А', '10Б', '9А']

    pair_iterator = zip_longest(tutors, klasses)  # работает как генератор, но является объектом другого класса

    print(next(pair_iterator))
    print(next(pair_iterator))
    print(next(pair_iterator))
    print(next(pair_iterator))
    print(next(pair_iterator))
    print(next(pair_iterator))
    print(next(pair_iterator))
    print(next(pair_iterator))
