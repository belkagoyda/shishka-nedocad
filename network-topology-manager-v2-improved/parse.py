#!/usr/bin/env python3
"""
Простой парсер проекта.
Собирает все текстовые файлы в один файл для отправки.
"""

import os
from pathlib import Path

# Расширения текстовых файлов
TEXT_EXTENSIONS = {
    '.py', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.scss',
    '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.txt',
    '.md', '.sh', '.bash', '.c', '.cpp', '.h', '.java', '.go',
    '.rs', '.php', '.rb', '.swift', '.kt', '.vue', '.sql'
}

# Папки, которые пропускаем
IGNORE_DIRS = {'node_modules', '.git', '__pycache__', 'venv', 'env', '.venv', 'dist', 'build'}

def is_text_file(file_path):
    """Проверяет, текстовый ли файл по расширению"""
    return file_path.suffix.lower() in TEXT_EXTENSIONS

def parse_project(project_path, output_file='project.txt'):
    """Парсит проект и записывает всё в один файл"""
    project_path = Path(project_path)
    
    with open(output_file, 'w', encoding='utf-8') as out:
        # Обходим все файлы
        for root, dirs, files in os.walk(project_path):
            # Удаляем игнорируемые папки из обхода
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
            
            for file in files:
                file_path = Path(root) / file
                
                # Проверяем расширение
                if not is_text_file(file_path):
                    continue
                
                # Относительный путь
                rel_path = file_path.relative_to(project_path)
                
                # Читаем и записываем
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    out.write(f"\n{'='*60}\n")
                    out.write(f"Файл: {rel_path}\n")
                    out.write(f"{'='*60}\n\n")
                    out.write(content)
                    out.write("\n")
                    
                    print(f"✓ {rel_path}")
                except Exception as e:
                    print(f"⚠ Ошибка чтения {rel_path}: {e}")

if __name__ == "__main__":
    # Запускаем в текущей папке
    parse_project('.', 'project.txt')
    print("\n✅ Готово! Результат в project.txt")