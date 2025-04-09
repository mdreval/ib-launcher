import os
import re
import json
import logging
import subprocess
import minecraft_launcher_lib
from minecraft_launcher_lib.command import get_minecraft_command
import platform

# Для Windows, проверяем доступность WinAPI
if platform.system() == "Windows":
    try:
        import win32process
        import win32con
        import win32api
        HAS_WIN32API = True
    except ImportError:
        HAS_WIN32API = False
        logging.warning("win32api не найден, будет использоваться стандартный метод запуска процессов")
else:
    HAS_WIN32API = False

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

# Функция для запуска процесса в Windows без показа окон
def launch_process_hidden_forge(command, cwd=None):
    """
    Запускает процесс в Windows без показа командного окна, 
    используя непосредственно WinAPI.
    
    Args:
        command (list): Команда для запуска
        cwd (str): Рабочая директория
        
    Returns:
        int: ID процесса или None в случае ошибки
    """
    if not platform.system() == "Windows" or not HAS_WIN32API:
        logging.warning("Функция launch_process_hidden требует Windows и win32api")
        return None
        
    try:
        # Преобразуем команду в строку
        command_str = subprocess.list2cmdline(command)
        logging.info(f"Запуск процесса с командой: {command_str}")
        
        # Создаем процесс с флагами для скрытия окна
        startupinfo = win32process.STARTUPINFO()
        startupinfo.dwFlags = win32process.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = win32con.SW_HIDE  # Скрыть окно
        
        # Запускаем процесс
        process_info = win32process.CreateProcess(
            None,  # Приложение
            command_str,  # Командная строка
            None,  # Process Security
            None,  # Thread Security
            0,  # Не наследовать дескрипторы
            win32process.CREATE_NO_WINDOW | win32process.DETACHED_PROCESS,  # Флаги создания
            None,  # Переменные окружения
            cwd,  # Рабочая директория
            startupinfo  # Информация о запуске
        )
        
        # Освобождаем дескрипторы
        win32api.CloseHandle(process_info[0])  # Process handle
        win32api.CloseHandle(process_info[1])  # Thread handle
        
        # Возвращаем ID процесса
        pid = process_info[2]
        logging.info(f"Процесс успешно запущен с PID: {pid}")
        
        # Создаем псевдо-объект процесса для совместимости
        class PseudoProcess:
            def __init__(self, pid):
                self.pid = pid
        
        return PseudoProcess(pid)
    except Exception as e:
        logging.error(f"Ошибка при запуске процесса через WinAPI: {str(e)}", exc_info=True)
        return None

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
        
        # Используем WinAPI для запуска в Windows
        if platform.system() == "Windows" and HAS_WIN32API:
            process = launch_process_hidden_forge(command, cwd=minecraft_dir)
            if process:
                logging.info(f"Forge успешно запущен через WinAPI, PID: {process.pid}")
                return process
            else:
                logging.warning("Запуск через WinAPI не удался, используем стандартный метод")
        
        # На Windows добавляем флаг CREATE_NO_WINDOW, чтобы скрыть консоль
        creation_flags = 0
        if platform.system() == "Windows":
            # Объединяем флаги: CREATE_NO_WINDOW | DETACHED_PROCESS = 0x08000008
            creation_flags = 0x08000008
            
        # Перенаправляем все выводы в devnull для дополнительной изоляции
        try:
            with open(os.devnull, 'w') as devnull:
                process = subprocess.Popen(
                    command,
                    stdin=subprocess.PIPE if platform.system() == "Windows" else None,
                    stdout=devnull if platform.system() == "Windows" else None,
                    stderr=devnull if platform.system() == "Windows" else None,
                    creationflags=creation_flags,
                    cwd=minecraft_dir,  # Устанавливаем рабочую директорию
                    close_fds=True,  # Закрыть дескрипторы файлов родителя
                    start_new_session=True  # Начать новую сессию (для Unix)
                )
            
            logging.info(f"Forge успешно запущен, PID: {process.pid}")
            return process
        except Exception as e:
            logging.error(f"Ошибка запуска Forge: {str(e)}", exc_info=True)
            return None
    except Exception as e:
        logging.error(f"Ошибка запуска Forge: {str(e)}", exc_info=True)
        return None 