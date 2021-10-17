#! /usr/bin/python3


if __name__ == '__main__':

    with open('hobby.csv', 'r', encoding='utf-8') as hobby_f,\
         open('users.csv', 'r', encoding='utf-8') as users_f,\
         open('combined_file.csv', 'w+', encoding='utf-8') as combo_f:
        combo_f.write('{')
        while True:
            users_data = users_f.readline().strip()
            hobby_data = hobby_f.readline().strip()
            u_surname, u_name, u_fname = users_data.split(',')  # парсинг имени, фамилии и отчества
            if hobby_data:
                if users_data:
                    # производим запись в новый файл ввиде словаря:
                    combo_f.write(f'"{users_data}": {{"name": "{u_name}", "surname": "{u_surname}", "patronymic": "{u_fname}", "hobby": "{hobby_data}"}}, ')
                else:
                    exit(1)
            else:
                combo_f.write('}')
                break
