import os
import glob
import logging
from aiogram import Bot, Dispatcher, Router
from aiogram.enums import ParseMode
from aiogram.filters import Command
from aiogram.types import Message
from dotenv import load_dotenv
import docx
import pypdf as PyPDF2

# Укажите токен вашего бота
load_dotenv()
API_TOKEN = os.getenv('API_TOKEN')

# Инициализация объектов
bot = Bot(token=API_TOKEN)
dp = Dispatcher()  
router = Router()

# Настройка логирования
logging.basicConfig(level=logging.INFO)

# Функция для поиска текста в файлах (обновленная версия для PyPDF)
def search_text_in_files(query, directory):
    results = []
    for filepath in glob.glob(os.path.join(directory, "*")):
        try:
            if filepath.endswith(".txt"):
                with open(filepath, "r", encoding="utf-8") as file:
                    content = file.read()
                    paragraphs = content.split("\n\n")
                    for i, paragraph in enumerate(paragraphs):
                        if query.lower() in paragraph.lower():
                            results.append({
                                "file": os.path.basename(filepath),
                                "paragraph": paragraph,
                                "page": None
                            })
            
            elif filepath.endswith(".docx"):
                doc = docx.Document(filepath)
                for i, paragraph in enumerate(doc.paragraphs):
                    if query.lower() in paragraph.text.lower():
                        results.append({
                            "file": os.path.basename(filepath),
                            "paragraph": paragraph.text,
                            "page": i + 1
                        })
            
            elif filepath.endswith(".pdf"):
                with open(filepath, "rb") as file:
                    reader = PyPDF2.PdfReader(file)
                    for page_num in range(len(reader.pages)):
                        page = reader.pages[page_num]
                        text = page.extract_text()
                        if text and query.lower() in text.lower():
                            results.append({
                                "file": os.path.basename(filepath),
                                "paragraph": text,
                                "page": page_num + 1
                            })
        except Exception as e:
            logging.error(f"Ошибка при обработке файла {filepath}: {e}")
    return results

# Обработчик команды /start
@router.message(Command("start"))
async def handle_start(message: Message):
    await message.answer("Привет! Отправь мне слово или фразу для поиска в файлах.")

# Обработчик текстовых сообщений
@router.message()
async def handle_message(message: Message):
    query = message.text
    directory = os.path.join(os.path.dirname(__file__), "files")  # Укажите ваш путь
    
    try:
        results = search_text_in_files(query, directory)
        if not results:
            await message.answer("Ничего не найдено. Попробуйте другой запрос.")
            return

        for result in results:
            response = (
                f"📄 Документ: {result['file']}\n"
                f"📑 Страница: {result['page'] if result['page'] else 'N/A'}\n"
                f"🔍 Текст:\n{result['paragraph'][:1000]}..."  # Ограничение длины текста
            )
            await message.answer(response, parse_mode=ParseMode.HTML)
    
    except Exception as e:
        logging.error(f"Ошибка: {e}")
        await message.answer("Произошла ошибка при обработке запроса.")

# Регистрация роутера
dp.include_router(router)

# Запуск бота
if __name__ == '__main__':
    dp.run_polling(bot)