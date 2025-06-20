#!/usr/bin/env python3
import os
import re
import sys

# Файлы, в которых нужно менять версию
TARGET_FILES = [
    'qt_version.py',
    'generate_version_info.py',
    'generate_mac_info.py',
    'Info.plist',
    'version_info.txt',
    'IB-Launcher.spec',
    'ib-launcher-mac.spec',
    'README.md',
    'RELEASE_NOTES.md',
]

# Функция для поиска текущей версии

def get_current_version():
    # Пробуем взять версию из version_info.txt
    try:
        with open('version_info.txt', encoding='utf-8') as f:
            for line in f:
                m = re.search(r'FileVersion.+?(\d+\.\d+\.\d+\.\d+)', line)
                if m:
                    return m.group(1)
    except Exception:
        pass
    # Альтернатива: из generate_version_info.py
    try:
        with open('generate_version_info.py', encoding='utf-8') as f:
            for line in f:
                m = re.search(r'return\s+["\\\'](\d+\.\d+\.\d+\.\d+)["\\\']', line)
                if m:
                    return m.group(1)
    except Exception:
        pass
    print('Не удалось определить текущую версию!')
    sys.exit(1)

def update_version_in_file(filepath, old_version, new_version):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        new_content = content.replace(old_version, new_version)
        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f'Обновлено: {filepath}')
    except Exception as e:
        print(f'Ошибка при обновлении {filepath}: {e}')

def main():
    if len(sys.argv) != 2:
        print('Использование: python update_launcher_version.py <новая_версия>')
        sys.exit(1)
    new_version = sys.argv[1]
    old_version = get_current_version()
    print(f'Текущая версия: {old_version}\nНовая версия: {new_version}')
    for file in TARGET_FILES:
        if os.path.exists(file):
            update_version_in_file(file, old_version, new_version)
        else:
            print(f'Файл не найден: {file}')
    print('Готово!')

if __name__ == '__main__':
    main() 