# Импорт необходимых библиотек
import os
import shutil
import requests
from pathlib import Path

import fitz  # PyMuPDF для PDF
from docx import Document  # python-docx для DOCX
import pytesseract  # для OCR
from PIL import Image  # для работы с изображениями

# --- Настройки ---
# Укажите путь к исходной папке и папке вывода, а также ваш DeepSeek API ключ.
SOURCE_FOLDER = Path("path/to/source_folder")
OUTPUT_BASE = Path("path/to/output_folder")
DEEPSEEK_API_KEY = "YOUR_DEEPSEEK_API_KEY"

# Файл для логирования
LOG_FILE = Path("log.txt")

# Максимальный объем текста для отправки (символы или слова)
MAX_CHARS = 1500
MAX_WORDS = 500

def extract_text_from_file(file_path):
    """
    Определяет тип файла по расширению и извлекает текст.
    Возвращает извлеченный текст или None в случае ошибки/неподдерживаемого формата.
    """
    ext = file_path.suffix.lower()
    text = ""
    try:
        if ext == ".pdf":
            # Извлечение текста из PDF с помощью PyMuPDF
            doc = fitz.open(file_path)
            for page in doc:
                text += page.get_text()
            doc.close()
        elif ext == ".docx":
            # Извлечение текста из DOCX с помощью python-docx
            doc = Document(file_path)
            for para in doc.paragraphs:
                text += para.text + "\n"
        elif ext == ".txt":
            # Чтение текста из TXT
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                text = f.read()
        elif ext in [".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".gif"]:
            # OCR для изображений через pytesseract
            try:
                image = Image.open(file_path)
                if image.mode != "RGB":
                    image = image.convert("RGB")
                text = pytesseract.image_to_string(image, lang='rus+eng')
            except Exception:
                return None
        else:
            # Неподдерживаемый формат
            return None
    except Exception:
        # Ошибка при извлечении текста (например, поврежденный файл)
        return None

    if not text:
        return None
    return text.strip()

def get_snippet(text, max_chars=MAX_CHARS, max_words=MAX_WORDS):
    """
    Формирует короткий фрагмент текста с ограничением по символам или словам.
    """
    words = text.split()
    if len(words) > max_words:
        words = words[:max_words]
    snippet = " ".join(words)
    if len(snippet) > max_chars:
        snippet = snippet[:max_chars]
    return snippet

def query_deepseek(snippet):
    """
    Отправляет запрос в DeepSeek API с заданным фрагментом текста.
    Возвращает ответ (текст) от модели или None в случае ошибки.
    """
    prompt = f"{snippet}\n\nЭто что за документ? Придумай для него имя в формате ГГГГ-ММ-ДД - [Тема].pdf. В какую папку его разместить?"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}"
    }
    data = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "Ты помощник, который даёт название и папку для документов."},
            {"role": "user", "content": prompt}
        ]
    }
    try:
        response = requests.post("https://api.deepseek.com/chat/completions", headers=headers, json=data)
        if response.status_code != 200:
            return None
        res_json = response.json()
        reply = res_json["choices"][0]["message"]["content"].strip()
        return reply
    except Exception:
        return None

def parse_deepseek_response(response_text):
    """
    Парсит ответ DeepSeek для выделения имени файла и названия папки.
    Ожидает формат: 'YYYY-MM-DD - Тема.pdf' и название папки.
    """
    new_name = None
    folder = None
    import re
    # Ищем шаблон имени файла
    name_match = re.search(r'(\d{4}-\d{2}-\d{2}\s*-\s*[^.\r\n]+\.pdf)', response_text)
    if name_match:
        new_name = name_match.group(1).strip()
    # Ищем слово "папку" и берем слово(ы) после него
    folder_match = re.search(r'в\s+папку\s+([^.\r\n]+)', response_text, re.IGNORECASE)
    if folder_match:
        folder = folder_match.group(1).strip().strip('"').strip("'")
    return new_name, folder

def main():
    # Проверяем существование исходной папки
    if not SOURCE_FOLDER.exists() or not SOURCE_FOLDER.is_dir():
        print(f"Исходная папка не найдена: {SOURCE_FOLDER}")
        return

    OUTPUT_BASE.mkdir(parents=True, exist_ok=True)
    log = open(LOG_FILE, 'w', encoding='utf-8')

    # Рекурсивно обходим файлы в исходной папке
    for root, dirs, files in os.walk(SOURCE_FOLDER):
        for filename in files:
            file_path = Path(root) / filename
            # Пропуск лог-файла и самого скрипта, если они здесь
            if file_path == LOG_FILE or file_path.name == Path(__file__).name:
                continue

            text = extract_text_from_file(file_path)
            if not text:
                log.write(f"ФАЙЛ: {file_path} - НЕТ ТЕКСТА ИЛИ НЕПОДДЕРЖИВАЕМЫЙ ФОРМАТ\n")
                continue

            snippet = get_snippet(text)
            if not snippet:
                log.write(f"ФАЙЛ: {file_path} - НЕВОЗМОЖНО СОЗДАТЬ ФРАГМЕНТ ИЗ ТЕКСТА\n")
                continue

            response = query_deepseek(snippet)
            if not response:
                log.write(f"ФАЙЛ: {file_path} - ОШИБКА API DeepSeek ИЛИ ПУСТОЙ ОТВЕТ\n")
                continue

            new_name, target_folder = parse_deepseek_response(response)
            if not new_name or not target_folder:
                log.write(f"ФАЙЛ: {file_path} - НЕПРАВИЛЬНЫЙ ОТВЕТ ОТ DeepSeek: {response}\n")
                continue

            target_dir = OUTPUT_BASE / target_folder
            target_dir.mkdir(parents=True, exist_ok=True)

            new_path = target_dir / new_name
            try:
                shutil.move(str(file_path), str(new_path))
                log.write(f"ФАЙЛ: {file_path} -> {new_path} - УСПЕХ\n")
            except Exception as e:
                log.write(f"ФАЙЛ: {file_path} - ОШИБКА ПРИ ПЕРЕМЕЩЕНИИ: {e}\n")

    log.close()

if __name__ == "__main__":
    main()
