import os
import re
import json
import logging
import subprocess
import minecraft_launcher_lib
from minecraft_launcher_lib.command import get_minecraft_command
import platform

def is_new_forge_version(version):
    """Проверяет, является ли версия новой версией Forge (1.20.2+)"""
    if not version or not isinstance(version, str):
        return False
    
    # Проверяем если это Forge версия
    if "forge" not in version.lower():
        return False
    
    try:
        # Извлекаем версию Minecraft из полной версии
        minecraft_version = version.split('-')[0]
        logging.info(f"Проверка версии Forge: {version}, Minecraft версия: {minecraft_version}")
        
        # Проверяем если это 1.21.x или выше (все версии 1.21.x требуют новый метод запуска)
        if minecraft_version.startswith("1.21"):
            logging.info(f"Версия {version} является новой версией Forge (1.21.x)")
            return True
            
        # Проверяем если это 1.20.2 или выше 
        elif minecraft_version.startswith("1.20."):
            # Для 1.20.x проверяем если это 1.20.2 или выше
            version_parts = minecraft_version.split('.')
            if len(version_parts) > 2 and int(version_parts[2]) >= 2:
                logging.info(f"Версия {version} является новой версией Forge (1.20.2+)")
                return True
            else:
                logging.info(f"Версия {version} является старой версией Forge (до 1.20.2)")
        else:
            logging.info(f"Версия {version} является старой версией Forge")
    except Exception as e:
        logging.error(f"Ошибка при проверке версии Forge {version}: {str(e)}")
    
    return False

def get_minecraft_directory(path):
    """Возвращает правильный путь к директории Minecraft"""
    return os.path.abspath(path)

def get_forge_launch_command(version, minecraft_directory, options):
    """
    Формирует команду запуска для новых версий Forge (1.20.2+)
    
    Args:
        version: Версия Forge для запуска (например, "1.21.4-forge-54.1.0")
        minecraft_directory: Путь к директории с файлами Minecraft
        options: Словарь с параметрами запуска
        
    Returns:
        list: Командная строка для запуска Forge
    """
    logging.info(f"Формирование команды запуска для Forge версии {version}")
    
    # Если это не новая версия Forge, используем стандартную функцию
    if not is_new_forge_version(version):
        logging.info(f"Используется стандартный метод запуска для версии {version}")
        return get_minecraft_command(version, minecraft_directory, options)
    
    minecraft_directory = get_minecraft_directory(minecraft_directory)
    
    # Путь к JSON-файлу версии
    version_json_path = os.path.join(minecraft_directory, "versions", version, f"{version}.json")
    logging.info(f"Путь к JSON-файлу версии: {version_json_path}")
    
    if not os.path.exists(version_json_path):
        logging.error(f"Файл JSON версии не найден: {version_json_path}")
        logging.info("Пробуем использовать стандартный метод запуска как запасной вариант")
        return get_minecraft_command(version, minecraft_directory, options)
    
    try:
        # Считываем JSON-файл версии
        with open(version_json_path, 'r') as f:
            version_data = json.load(f)
            logging.info(f"JSON файл версии успешно загружен: {version_json_path}")
        
        # Получаем базовую команду от стандартной библиотеки
        command = get_minecraft_command(version, minecraft_directory, options)
        logging.info(f"Получена базовая команда запуска, длина: {len(command)} аргументов")
        
        # Модифицируем команду для новых версий Forge
        # Находим индекс класса запуска в команде
        main_class_index = -1
        main_class = version_data.get("mainClass", "net.minecraft.client.main.Main")
        
        for i, arg in enumerate(command):
            if arg == main_class:
                main_class_index = i
                logging.info(f"Найден главный класс {main_class} в позиции {i}")
                break
        
        # Если нашли индекс главного класса, заменяем его на класс загрузчика Forge
        if main_class_index > 0:
            # В новых версиях Forge нужно использовать Bootstrap класс
            bootstrap_class = "net.minecraftforge.bootstrap.ForgeBootstrap"
            logging.info(f"Заменяем главный класс {main_class} на {bootstrap_class}")
            command[main_class_index] = bootstrap_class
            
            # Проверяем и добавляем необходимые аргументы для Forge
            if "--fml.forgeVersion" not in " ".join(command):
                forge_version = version.split("-forge-")[1] if "-forge-" in version else "unknown"
                logging.info(f"Извлечена версия Forge: {forge_version}")
                
                # Добавляем параметры запуска Forge
                if "--launchTarget" not in " ".join(command):
                    logging.info("Добавляем аргумент --launchTarget forge_client")
                    command.append("--launchTarget")
                    command.append("forge_client")
                
                # Добавляем аргумент versionType если его нет
                if "--versionType" not in " ".join(command):
                    logging.info("Добавляем аргумент --versionType release")
                    command.append("--versionType")
                    command.append("release")
        else:
            logging.warning(f"Не удалось найти главный класс {main_class} в команде запуска")
        
        logging.info(f"Модифицированная команда запуска содержит {len(command)} аргументов")
        if len(command) > 5:
            logging.info(f"Первые 5 аргументов: {' '.join(command[:5])}... (обрезано)")
        
        return command
        
    except Exception as e:
        logging.error(f"Ошибка при формировании команды запуска Forge: {str(e)}", exc_info=True)
        logging.info("Пробуем использовать стандартный метод запуска как запасной вариант")
        # В случае ошибки возвращаем стандартную команду
        return get_minecraft_command(version, minecraft_directory, options)

def launch_forge_with_command(command):
    """Запускает Forge, используя сформированную команду"""
    try:
        logging.info(f"Запуск Forge с командой длиной {len(command)} аргументов")
        
        # Определяем рабочую директорию из пути запуска
        minecraft_dir = None
        for arg in command:
            if "--gameDir" in arg:
                idx = command.index(arg)
                if idx + 1 < len(command):
                    minecraft_dir = command[idx + 1]
                    logging.info(f"Используем рабочую директорию: {minecraft_dir}")
                    break
        
        # Проверяем, что рабочая директория существует
        if minecraft_dir and not os.path.exists(minecraft_dir):
            logging.warning(f"Рабочая директория {minecraft_dir} не существует, пытаемся создать")
            os.makedirs(minecraft_dir, exist_ok=True)
        
        # Если не нашли директорию, используем текущую
        if not minecraft_dir:
            minecraft_dir = os.getcwd()
            logging.warning(f"Не удалось найти рабочую директорию в аргументах, используем текущую: {minecraft_dir}")
        
        # На Windows НЕ добавляем флаг CREATE_NO_WINDOW, чтобы видеть консоль для отладки
        creation_flags = 0
        # if platform.system() == "Windows":
        #     creation_flags = subprocess.CREATE_NO_WINDOW
            
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=creation_flags,
            cwd=minecraft_dir  # Устанавливаем рабочую директорию
        )
        
        logging.info(f"Forge успешно запущен, PID: {process.pid}")
        return process
    except Exception as e:
        logging.error(f"Ошибка запуска Forge: {str(e)}", exc_info=True)
        return None 