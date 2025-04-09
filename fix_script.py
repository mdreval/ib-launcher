import os
import sys

def fix_file_indentation(input_file, output_file):
    """Исправляет индентацию и другие проблемы в файле Python"""
    print(f"Исправление отступов в файле {input_file}")
    
    # Чтение файла
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Список проблемных мест с отступами (номер строки, правильный отступ)
    problem_areas = {
        344: "                logging.info(f\"Запуск установки Forge версии: {self.version}\")",
        345: "                self._install_forge()",
        365: "                    logging.info(f\"Запуск установки Minecraft версии: {self.version}\")",
        366: "                    self._install_minecraft()",
        370: "                self._install_modpack()",
        383: "            self.status_update.emit(\"Подготовка директории...\")",
        387: "                game_dirs = [",
        496: "                return",
        497: "                else:",
        520: "                    # Для exe версии проверяем GitHub",
        521: "                    self.status_update.emit(\"Проверка обновлений модпака...\")",
        798: "                    self.game_process = process",
        # и т.д.
    }
    
    # Удаляем проблемный метод add_to_forge_cache
    remove_method = False
    start_line = None
    end_line = None
    
    for i, line in enumerate(lines):
        # Находим начало метода
        if "def add_to_forge_cache" in line:
            start_line = i
            remove_method = True
            
        # Находим конец метода
        if remove_method and line.strip().startswith("def ") and "add_to_forge_cache" not in line:
            end_line = i
            break
    
    # Если нашли метод, удаляем его
    if start_line is not None and end_line is not None:
        print(f"Удаление метода add_to_forge_cache (строки {start_line+1}-{end_line})")
        fixed_lines = lines[:start_line] + lines[end_line:]
    else:
        fixed_lines = lines
    
    # Исправляем проблемные строки
    for i, line in enumerate(fixed_lines):
        # Исправляем конкретные проблемные места
        line_num = i + 1  # Нумерация строк с 1
        if line_num in problem_areas:
            fixed_lines[i] = problem_areas[line_num] + "\n"
    
    # Исправляем все блоки try без отступов
    i = 0
    while i < len(fixed_lines):
        line = fixed_lines[i].rstrip()
        if line.strip() == "try:":
            indent = len(line) - len(line.lstrip())  # Текущий отступ
            # Проверяем следующую строку
            if i + 1 < len(fixed_lines):
                next_line = fixed_lines[i + 1].rstrip()
                next_indent = len(next_line) - len(next_line.lstrip())
                # Если следующая строка имеет такой же или меньший отступ
                if next_indent <= indent:
                    # Добавляем правильный отступ
                    fixed_lines[i + 1] = " " * (indent + 4) + next_line.lstrip() + "\n"
        i += 1
    
    # Сохраняем исправленный файл
    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(fixed_lines)
    
    print(f"Файл {output_file} создан с исправленными отступами")

if __name__ == "__main__":
    fix_file_indentation('qt_version.py', 'qt_version_fixed_new.py')
    print("Теперь скопируйте qt_version_fixed_new.py в qt_version.py, если всё выглядит правильно.") 