#! /usr/bin/python3

def combinations_gen(pupil, klass: list) -> tuple:
    """
    Generator that returns tuples of the form (<pupil>, <klass>)
    """

    if len(pupil) >= len(klass):
        for indx, one_of_pupil in enumerate(pupil):
            if len(klass) > indx:
                yield (one_of_pupil, klass[indx])
            else:
                yield (one_of_pupil, None)
    else:
        for indx, one_of_klasses in enumerate(klass):
            if len(pupil) > indx:
                yield (pupil[indx], one_of_klasses)
            else:
                yield (None, one_of_klasses)


tutors = ['Иван', 'Анастасия', 'Петр', 'Сергей', 'Дмитрий', 'Борис', 'Елена']
klasses = ['9А', '7В', '9Б', '9В', '8Б', '10А', '10Б', '9А']
combinations = combinations_gen(tutors, klasses)

print(f'мы создали генератор: {type(combinations)}')  # доказательство, что это генератор


print(next(combinations))
print(next(combinations))
print(next(combinations))
print(next(combinations))
print(next(combinations))
print(next(combinations))
print(next(combinations))
print(next(combinations))
print(next(combinations))
print(next(combinations))
