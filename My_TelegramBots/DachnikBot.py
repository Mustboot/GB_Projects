import telebot

# Nikolay Serov id: 815483333
# Ekaterina Serova id: 1006605292
list_of_family_members = {'815483333': 'Nikolay Serov', '1006605292': 'Ekaterina Serova'}

# Сюда вставляем токен - DachnikBot
bot = telebot.TeleBot('1463375086:AAFHD6gUbTzxefRw2O6PjQto5zIzTyw-Aso')

if __name__ == '__main__':
    try:
        @bot.message_handler(commands=['start'])
        def start_command(message):
            if str(message.from_user.id) in list_of_family_members.keys():
                bot.send_message(message.chat.id, 'Привет, проверка связи')
                print('Пользователь ' + list_of_family_members[str(message.from_user.id)] + ' написал в чат')


        @bot.message_handler(commands=['temp_at_home'])
        def temperature_check_command(message):
            if str(message.from_user.id) in list_of_family_members.keys():
                bot.send_message(message.chat.id, 'Температура')



        @bot.message_handler(content_types=['text'])
        def check_the_text(message):
            if str(message.from_user.id) in list_of_family_members.keys():
                if message.text.lower() in ['привет дачник', 'эй дачник']:
                    bot.send_message(message.chat.id, 'и тебе привет!')
                else:
                    bot.send_message(message.chat.id, 'Прости, но пока у меня нет этих Emoji')


        bot.polling()

    except ApiTelegramException:
        print('В программе что-то случилось... но продолжаем работать.')
        bot.polling()
