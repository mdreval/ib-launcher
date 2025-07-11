import os
import sys
import json
import logging
import platform
import warnings
import subprocess
import webbrowser
import minecraft_launcher_lib
from minecraft_launcher_lib.command import get_minecraft_command
from minecraft_launcher_lib.utils import get_version_list
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                            QHBoxLayout, QLabel, QPushButton, QComboBox, 
                            QLineEdit, QProgressBar, QFileDialog, QMessageBox,
                            QTabWidget, QListWidget, QCheckBox, QDialog, QSlider,
                            QGroupBox, QRadioButton, QButtonGroup, QSplitter,
                            QFrame, QScrollArea, QSizePolicy, QSpacerItem,
                            QPlainTextEdit, QListWidgetItem, QTabBar)
from PyQt5.QtCore import Qt, QThread, pyqtSignal, QSize, QTimer, QUrl
from PyQt5.QtGui import QIcon, QPixmap, QFont, QDesktopServices
from PyQt5 import uic
import requests
import zipfile
import tempfile
import threading
import queue
import re
import urllib.request
import urllib.error
import urllib.parse
import ssl
import hashlib
import base64
import random
import string
from datetime import datetime  # Правильный импорт datetime
import traceback
import socket
import struct
import binascii
import ctypes
import shutil
import stat

TRANSLATIONS = {
    'ru': {
        # Main Window
        'window_title': 'IB Launcher',
        # Tabs
        'tab_game': 'Игра',
        'tab_mods': 'Моды',
        'tab_settings': 'Настройки',
        # Game Tab
        'username_group': 'Никнейм',
        'username_placeholder': 'Введите имя игрока',
        'version_group': 'Версия игры',
        'install_path_group': 'Путь установки',
        'browse_button': 'Обзор',
        'remove_version_button': 'Удалить',
        'status_label_ready': 'Готов к запуску',
        'start_button_install': 'Установить',
        'start_button_play': 'Играть',
        'players_online_label': 'Игроков онлайн: ',
        'server_offline': 'Сервер Offline',
        # Mods Tab
        'add_mod_button': 'Добавить моды',
        'remove_mod_button': 'Удалить выбранные',
        'check_updates_button_on': 'Отключить обновление модов',
        'check_updates_button_off': 'Включить обновление модов',
        'mods_found': 'Найдено модов: {count}',
        'mods_error': 'Ошибка загрузки модов',
        'select_mods_to_remove': 'Выберите моды для удаления',
        'confirm_remove_mods_title': 'Удаление модов',
        'confirm_remove_mods_text': 'Вы уверены, что хотите удалить {count} мод(ов)?',
        'add_mods_title': 'Выберите моды',
        'mods_filter': 'Minecraft Mods (*.jar)',
        # Settings Tab
        'memory_group': 'Настройки памяти',
        'memory_title': 'Выделенная память:',
        'memory_label_gb': '{value} ГБ',
        'launch_flags_group': 'Настройка запуска (Флаги)',
        'launch_flags_title': 'Дополнительные параметры запуска:',
        'launch_flags_placeholder': 'Введите дополнительные параметры запуска Java (каждый параметр с новой строки)',
        'theme_group': 'Тема интерфейса',
        'light_theme_radio': 'Светлая',
        'dark_theme_radio': 'Тёмная',
        'language_group': 'Язык лаунчера',
        'close_launcher_checkbox': 'Закрывать лаунчер после запуска игры',
        # Bottom info
        'telegram_tooltip': 'Наш Telegram канал',
        'youtube_tooltip': 'Наш YouTube канал',
        'version_label': 'Версия: ',
        'update_available': 'Версия: {current} (Доступно обновление: {latest})',
        # Messages & Statuses
        'error': 'Ошибка',
        'info': 'Информация',
        'warning': 'Предупреждение',
        'confirm_delete_version_title': 'Подтверждение удаления',
        'confirm_delete_version_text': 'Вы уверены, что хотите удалить версию {version} и все связанные файлы?',
        'delete_finished_title': 'Удаление завершено',
        'delete_finished_text': 'Версия {version} и все связанные файлы успешно удалены.',
        'path_not_found': 'Папка установки не найдена.',
        'no_internet_title': 'Нет подключения',
        'no_internet_text': 'Вы без доступа в интернет, будет запускаться только установленная версия.',
        'game_launching_text': 'Игра запускается, лаунчер закроется через 20 секунд...',
        'select_minecraft_version': 'Выберите версию Minecraft!',
        'enter_username': 'Введите имя игрока!',
        'no_write_permission': 'Нет прав на запись в выбранную папку!',
        'failed_to_create_dir': 'Не удалось создать директорию установки: {error}',
        'failed_to_install': 'Не удалось установить игру: {error}',
        'java_version_error_title': 'Ошибка Java',
        'java_install_error_text': 'Java не установлена или версия ниже 17!\n\nСейчас откроется страница загрузки Oracle Java.\nНа сайте выберите версию для вашей системы (Windows, macOS или Linux).\nДля Windows рекомендуется Windows x64 Installer.',
        'java_not_found_error_text': 'Java не найдена!\n\nСейчас откроется страница загрузки Oracle Java.\nНа сайте выберите версию для вашей системы (Windows, macOS или Linux).\nДля Windows рекомендуется Windows x64 Installer.'
    },
    'en': {
        'window_title': 'IB Launcher',
        'tab_game': 'Game',
        'tab_mods': 'Mods',
        'tab_settings': 'Settings',
        'username_group': 'Nickname',
        'username_placeholder': 'Enter player name',
        'version_group': 'Game Version',
        'install_path_group': 'Installation Path',
        'browse_button': 'Browse',
        'remove_version_button': 'Remove',
        'status_label_ready': 'Ready to launch',
        'start_button_install': 'Install',
        'start_button_play': 'Play',
        'players_online_label': 'Players online: ',
        'server_offline': 'Server Offline',
        'add_mod_button': 'Add Mods',
        'remove_mod_button': 'Remove Selected',
        'check_updates_button_on': 'Disable mods auto-update',
        'check_updates_button_off': 'Enable mods auto-update',
        'mods_found': 'Mods found: {count}',
        'mods_error': 'Error loading mods',
        'select_mods_to_remove': 'Select mods to remove',
        'confirm_remove_mods_title': 'Remove Mods',
        'confirm_remove_mods_text': 'Are you sure you want to remove {count} mod(s)?',
        'add_mods_title': 'Select Mods',
        'mods_filter': 'Minecraft Mods (*.jar)',
        'memory_group': 'Memory Settings',
        'memory_title': 'Allocated Memory:',
        'memory_label_gb': '{value} GB',
        'launch_flags_group': 'Launch Settings (Flags)',
        'launch_flags_title': 'Additional launch parameters:',
        'launch_flags_placeholder': 'Enter additional Java launch parameters (one per line)',
        'theme_group': 'Interface Theme',
        'light_theme_radio': 'Light',
        'dark_theme_radio': 'Dark',
        'language_group': 'Launcher Language',
        'close_launcher_checkbox': 'Close launcher after starting the game',
        'telegram_tooltip': 'Our Telegram channel',
        'youtube_tooltip': 'Our YouTube channel',
        'version_label': 'Version: ',
        'update_available': 'Version: {current} (Update available: {latest})',
        'error': 'Error',
        'info': 'Information',
        'warning': 'Warning',
        'confirm_delete_version_title': 'Confirm Deletion',
        'confirm_delete_version_text': 'Are you sure you want to delete version {version} and all related files?',
        'delete_finished_title': 'Deletion Complete',
        'delete_finished_text': 'Version {version} and all related files have been successfully deleted.',
        'path_not_found': 'Installation folder not found.',
        'no_internet_title': 'No Connection',
        'no_internet_text': 'You are offline. Only installed versions can be launched.',
        'game_launching_text': 'The game is launching, the launcher will close in 20 seconds...',
        'select_minecraft_version': 'Select a Minecraft version!',
        'enter_username': 'Please enter a username!',
        'no_write_permission': 'No write permission in the selected folder!',
        'failed_to_create_dir': 'Failed to create installation directory: {error}',
        'failed_to_install': 'Failed to install the game: {error}',
        'java_version_error_title': 'Java Error',
        'java_install_error_text': 'Java is not installed or version is below 17!\n\nThe Oracle Java download page will now open.\nOn the website, select the version for your system (Windows, macOS, or Linux).\nFor Windows, the x64 Installer is recommended.',
        'java_not_found_error_text': 'Java not found!\n\nThe Oracle Java download page will now open.\nOn the website, select the version for your system (Windows, macOS, or Linux).\nFor Windows, the x64 Installer is recommended.'
    },
    'uk': {
        'window_title': 'IB Launcher',
        'tab_game': 'Гра',
        'tab_mods': 'Моди',
        'tab_settings': 'Налаштування',
        'username_group': 'Нікнейм',
        'username_placeholder': 'Введіть ім\'я гравця',
        'version_group': 'Версія гри',
        'install_path_group': 'Шлях встановлення',
        'browse_button': 'Огляд',
        'remove_version_button': 'Видалити',
        'status_label_ready': 'Готовий до запуску',
        'start_button_install': 'Встановити',
        'start_button_play': 'Грати',
        'players_online_label': 'Гравців онлайн: ',
        'server_offline': 'Сервер Offline',
        'add_mod_button': 'Додати моди',
        'remove_mod_button': 'Видалити обрані',
        'check_updates_button_on': 'Вимкнути оновлення модів',
        'check_updates_button_off': 'Увімкнути оновлення модів',
        'mods_found': 'Знайдено модів: {count}',
        'mods_error': 'Помилка завантаження модів',
        'select_mods_to_remove': 'Виберіть моди для видалення',
        'confirm_remove_mods_title': 'Видалення модів',
        'confirm_remove_mods_text': 'Ви впевнені, що хочете видалити {count} мод(ів)?',
        'add_mods_title': 'Виберіть моди',
        'mods_filter': 'Minecraft Mods (*.jar)',
        'memory_group': 'Налаштування пам\'яті',
        'memory_title': 'Виділена пам\'ять:',
        'memory_label_gb': '{value} ГБ',
        'launch_flags_group': 'Налаштування запуску (Прапори)',
        'launch_flags_title': 'Додаткові параметри запуску:',
        'launch_flags_placeholder': 'Введіть додаткові параметри запуску Java (кожен параметр з нового рядка)',
        'theme_group': 'Тема інтерфейсу',
        'light_theme_radio': 'Світла',
        'dark_theme_radio': 'Темна',
        'language_group': 'Мова лаунчера',
        'close_launcher_checkbox': 'Закривати лаунчер після запуску гри',
        'telegram_tooltip': 'Наш Telegram канал',
        'youtube_tooltip': 'Наш YouTube канал',
        'version_label': 'Версія: ',
        'update_available': 'Версія: {current} (Доступне оновлення: {latest})',
        'error': 'Помилка',
        'info': 'Інформація',
        'warning': 'Попередження',
        'confirm_delete_version_title': 'Підтвердження видалення',
        'confirm_delete_version_text': 'Ви впевнені, що хочете видалити версію {version} та всі пов\'язані файли?',
        'delete_finished_title': 'Видалення завершено',
        'delete_finished_text': 'Версію {version} та всі пов\'язані файли успішно видалено.',
        'path_not_found': 'Папку встановлення не знайдено.',
        'no_internet_title': 'Немає з\'єднання',
        'no_internet_text': 'Ви без доступу до інтернету, запускатиметься тільки встановлена версія.',
        'game_launching_text': 'Гра запускається, лаунчер закриється через 20 секунд...',
        'select_minecraft_version': 'Виберіть версію Minecraft!',
        'enter_username': 'Введіть ім\'я гравця!',
        'no_write_permission': 'Немає прав на запис у вибрану папку!',
        'failed_to_create_dir': 'Не вдалося створити директорію встановлення: {error}',
        'failed_to_install': 'Не вдалося встановити гру: {error}',
        'java_version_error_title': 'Помилка Java',
        'java_install_error_text': 'Java не встановлено або версія нижче 17!\n\nЗараз відкриється сторінка завантаження Oracle Java.\nНа сайті виберіть версію для вашої системи (Windows, macOS, або Linux).\nДля Windows рекомендується Windows x64 Installer.',
        'java_not_found_error_text': 'Java не знайдено!\n\nЗараз відкриється сторінка завантаження Oracle Java.\nНа сайті виберіть версію для вашої системи (Windows, macOS, або Linux).\nДля Windows рекомендується Windows x64 Installer.'
    }
}

# Для Windows, импортируем модули WinAPI
if platform.system() == "Windows":
    try:
        import winreg
        import win32process
        import win32con
        import win32api
        HAS_WIN32API = True
    except ImportError:
        HAS_WIN32API = False
        logging.warning("win32api не найден, будет использоваться стандартный метод запуска процессов")
else:
    HAS_WIN32API = False
    winreg = None  # Для не-Windows систем

# Игнорируем все предупреждения
warnings.filterwarnings("ignore")
os.environ['QT_LOGGING_RULES'] = '*.debug=false;qt.qpa.*=false;qt.gui.icc*=false'

# Настройка путей
if platform.system() == "Windows":
    CONFIG_DIR = os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "IBLauncher-config")
    DEFAULT_MINECRAFT_DIR = os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "IBLauncher")
else:
    CONFIG_DIR = os.path.join(os.path.expanduser("~"), "Library", "Application Support", "IBLauncher-config")
    DEFAULT_MINECRAFT_DIR = os.path.join(os.path.expanduser("~"), "Library", "Application Support", "IBLauncher")

# Исправляем путь для macOS
if platform.system() == "Darwin":
    CONFIG_DIR = "/" + CONFIG_DIR

LOG_FILE = os.path.join(CONFIG_DIR, "launcher.log")
CONFIG_FILE = os.path.join(CONFIG_DIR, 'launcher_config.json')
FORGE_CACHE_FILE = os.path.join(CONFIG_DIR, 'forge_cache.json')

# Создаем только директорию для конфигурации лаунчера
os.makedirs(CONFIG_DIR, exist_ok=True)

# Настройка логирования
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    filename=LOG_FILE,
    filemode='w',
    encoding='utf-8'
)

def resource_path(relative_path):
    """ Получить абсолютный путь к ресурсу, работает как для разработки, так и для PyInstaller """
    try:
        # PyInstaller создает временную папку и хранит путь в _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")

    return os.path.join(base_path, relative_path)

def copy_default_configs(install_path):
    """Копирует файлы конфигурации из assets при первом запуске"""
    try:
        # Создаем директорию если её нет
        os.makedirs(install_path, exist_ok=True)
        
        # Пути к файлам в assets
        default_options = resource_path(os.path.join("assets", "options.txt"))
        default_servers = resource_path(os.path.join("assets", "servers.dat"))
        
        # Пути назначения
        dest_options = os.path.join(install_path, "options.txt")
        dest_servers = os.path.join(install_path, "servers.dat")
        
        # Копируем options.txt только если его нет
        if not os.path.exists(dest_options):
            if os.path.exists(default_options):
                # Копируем файл
                shutil.copy2(default_options, dest_options)
                logging.info(f"Скопирован файл options.txt")
            else:
                logging.warning("Файл options.txt не найден в assets")
        
        # Копируем servers.dat только если его нет
        if not os.path.exists(dest_servers):
            if os.path.exists(default_servers):
                shutil.copy2(default_servers, dest_servers)
                logging.info(f"Скопирован файл servers.dat")
            else:
                logging.warning("Файл servers.dat не найден в assets")
        
    except Exception as e:
        logging.error(f"Ошибка копирования конфигурации: {str(e)}")

def clean_quickplay_settings(install_path):
    """Полная очистка всех настроек быстрого старта"""
    try:
        # 1. Очистка options.txt
        options_file = os.path.join(install_path, "options.txt")
        if os.path.exists(options_file):
            try:
                with open(options_file, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                with open(options_file, 'w', encoding='utf-8') as f:
                    for line in lines:
                        if not any(x in line.lower() for x in ['quickplay', 'lastserver', 'lastworld']):
                            f.write(line)
                logging.info("Очищены настройки в options.txt")
            except Exception as e:
                logging.error(f"Ошибка при очистке options.txt: {str(e)}")

        # 2. Очистка JSON файлов
        json_files = [
            "launcher_profiles.json",
            "launcher_accounts.json",
            "usercache.json"
        ]
        
        for file in json_files:
            file_path = os.path.join(install_path, file)
            if os.path.exists(file_path):
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        try:
                            data = json.load(f)
                            if isinstance(data, dict):
                                # Рекурсивно удаляем все ключи, содержащие quickPlay
                                def clean_dict(d):
                                    if isinstance(d, dict):
                                        keys_to_remove = [k for k in d.keys() 
                                                        if any(x in str(k).lower() 
                                                              for x in ['quickplay', 'lastserver', 'lastworld'])]
                                        for k in keys_to_remove:
                                            del d[k]
                                        for v in d.values():
                                            if isinstance(v, (dict, list)):
                                                clean_dict(v)
                                    elif isinstance(d, list):
                                        for item in d:
                                            clean_dict(item)
                                
                                clean_dict(data)
                                with open(file_path, 'w', encoding='utf-8') as f:
                                    json.dump(data, f, indent=4)
                                logging.info(f"Очищены настройки в {file}")
                        except json.JSONDecodeError:
                            logging.info(f"Файл {file} не является JSON файлом")
                except Exception as e:
                    logging.error(f"Ошибка при очистке {file}: {str(e)}")

        # 3. Удаление файлов быстрого старта
        import glob, re
        pattern = re.compile(r'quickplay|lastserver|lastworld', re.IGNORECASE)
        all_files = glob.glob(os.path.join(install_path, "*"))
        for f in all_files:
            if pattern.search(os.path.basename(f)):
                try:
                    os.remove(f)
                    logging.info(f"Удален файл: {f}")
                except Exception as e:
                    logging.error(f"Ошибка удаления файла {f}: {str(e)}")

    except Exception as e:
        logging.error(f"Ошибка при очистке настроек быстрого старта: {str(e)}")

class JavaInstaller(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Установка Java")
        self.setFixedSize(400, 150)
        self.install_thread = None

        layout = QVBoxLayout()
        self.status_label = QLabel("Для работы требуется Java 17+. Установить сейчас?")
        self.install_button = QPushButton("Установить Java 17")
        self.cancel_button = QPushButton("Отмена")

        layout.addWidget(self.status_label)
        layout.addWidget(self.install_button)
        layout.addWidget(self.cancel_button)
        self.setLayout(layout)

        self.install_button.clicked.connect(self.start_java_installation)
        self.cancel_button.clicked.connect(self.reject)

    def start_java_installation(self):
        self.install_button.setEnabled(False)
        self.cancel_button.setEnabled(False)
        self.status_label.setText("Подготовка к установке...")
        QApplication.processEvents()

        self.install_thread = JavaInstallThread()
        self.install_thread.status_update.connect(self.update_status)
        self.install_thread.finished.connect(self.installation_finished)
        self.install_thread.error_occurred.connect(self.installation_error)
        self.install_thread.start()

    def update_status(self, message):
        self.status_label.setText(message)
        QApplication.processEvents()

    def installation_finished(self):
        QMessageBox.information(
            self,
            "Успех",
            "Java успешно установлена! Лаунчер будет перезапущен."
        )
        QApplication.exit(1337)

    def installation_error(self, error_message):
        self.install_button.setEnabled(True)
        self.cancel_button.setEnabled(True)
        QMessageBox.critical(self, "Ошибка", f"Ошибка установки: {error_message}")

class JavaInstallThread(QThread):
    status_update = pyqtSignal(str)
    error_occurred = pyqtSignal(str)

    def run(self):
        try:
            os_type = platform.system()
            
            # Обновленные URL для скачивания Java
            java_urls = {
                "Windows": "https://download.oracle.com/java/17/archive/jdk-17.0.10_windows-x64_bin.exe",
                "Darwin": "https://download.oracle.com/java/17/archive/jdk-17.0.10_macos-aarch64_bin.dmg"
            }
            
            if os_type not in java_urls:
                raise Exception(f"Неподдерживаемая операционная система: {os_type}")
            
            # Добавляем заголовки для скачивания с Oracle
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            # Создаем временную папку для загрузки
            temp_dir = os.path.join(os.path.expanduser("~"), "AppData", "Local", "Temp", "IBLauncher")
            os.makedirs(temp_dir, exist_ok=True)
            
            installer_name = "jdk-17.exe" if os_type == "Windows" else "jdk-17.dmg"
            installer_path = os.path.join(temp_dir, installer_name)
            
            # Скачиваем установщик
            self.status_update.emit("Загрузка Java...")
            
            response = requests.get(java_urls[os_type], headers=headers, stream=True, verify=True)
            response.raise_for_status()
            
            with open(installer_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            self.status_update.emit("Запуск установщика...")
            
            # Для Windows
            if os_type == "Windows":
                result = subprocess.run(
                    f'powershell "Start-Process \'{installer_path}\' -ArgumentList \'/s\' -Verb RunAs -Wait"',
                    shell=True,
                    capture_output=True,
                    text=True
                )
                if result.returncode != 0:
                    raise Exception(f"Ошибка: {result.stderr}")
            
            # Для macOS
            elif os_type == "Darwin":
                mount_output = subprocess.check_output(["hdiutil", "attach", installer_path]).decode()
                mount_point = mount_output.split("\t")[-1].strip()
                pkg_path = os.path.join(mount_point, "JDK 17.pkg")
                
                install_process = subprocess.run(
                    ["sudo", "installer", "-pkg", pkg_path, "-target", "/"],
                    input=subprocess.getoutput("whoami").strip() + "\n",
                    text=True,
                    capture_output=True
                )
                
                if install_process.returncode != 0:
                    raise Exception(f"Ошибка: {install_process.stderr}")
                
                subprocess.run(["hdiutil", "detach", mount_point], check=True)
            
            # Очищаем временные файлы
            try:
                os.remove(installer_path)
            except:
                pass
            
        except Exception as e:
            logging.error(f"Ошибка установки Java: {str(e)}")
            self.error_occurred.emit(str(e))

class InstallThread(QThread):
    progress_update = pyqtSignal(int, int, str)
    status_update = pyqtSignal(str)
    toggle_ui = pyqtSignal(bool)
    error_occurred = pyqtSignal(str)
    game_started = pyqtSignal()

    def __init__(self, version, username, install_path, memory=4, launch_flags_input=None, mods_update_switch=True):
        super().__init__()
        self.version = version
        self.username = username
        self.install_path = install_path
        self.memory = memory
        self.launch_flags_input = launch_flags_input
        self.stop_requested = False
        self.mods_update_switch=mods_update_switch
        self._game_started = False

    def run(self):
        try:
            self.toggle_ui.emit(False)
            self._prepare_environment()

            # Проверяем, нужно ли устанавливать игру или она уже установлена
            versions_dir = os.path.join(self.install_path, "versions")
            is_installed = False
            
            if "-" in self.version:  # Если это версия Forge
                # Проверяем, установлен ли Forge
                installed_version = minecraft_launcher_lib.forge.forge_to_installed_version(self.version)
                forge_dir = os.path.join(versions_dir, installed_version)
                if os.path.exists(forge_dir) and os.listdir(forge_dir):
                    logging.info(f"Forge версия {self.version} уже установлена")
                    is_installed = True
                else:
                    logging.info(f"Запуск установки Forge версии: {self.version}")
                    self._install_forge()
            else:  # Если это ванильная версия Minecraft
                # Проверяем, установлена ли ванильная версия
                vanilla_dir = os.path.join(versions_dir, self.version)
                
                if os.path.exists(vanilla_dir) and os.listdir(vanilla_dir):
                    logging.info(f"Minecraft версия {self.version} уже установлена напрямую")
                    is_installed = True
                else:
                    # Проверяем, установлена ли ванильная версия как часть Forge
                    for folder in os.listdir(versions_dir) if os.path.exists(versions_dir) else []:
                        if folder.startswith(f"{self.version}-") and "forge" in folder.lower():
                            forge_folder = os.path.join(versions_dir, folder)
                            vanilla_json = os.path.join(forge_folder, f"{self.version}.json")
                            if os.path.exists(vanilla_json):
                                logging.info(f"Minecraft версия {self.version} найдена внутри Forge")
                                is_installed = True
                                break
                    
                    if not is_installed:
                        logging.info(f"Запуск установки Minecraft версии: {self.version}")
                        self._install_minecraft()

            # Устанавливаем модпак только для версии 1.20.1 если нужно
            if self.version == "1.20.1" or self.version.startswith("1.20.1-"):
                self._install_modpack()
                
            # Запускаем игру
            self._launch_game()
        except Exception as e:
            logging.error(f"Ошибка установки: {str(e)}", exc_info=True)
            self.error_occurred.emit(f"Ошибка: {str(e)}")
        finally:
            self.toggle_ui.emit(True)

    def _prepare_environment(self):
        """Подготавливает окружение для установки"""
        try:
            self.status_update.emit("Подготовка директории...")

            # Создаем директории только в папке установки игры
            game_dirs = [
                self.install_path,
                os.path.join(self.install_path, "versions"),
                os.path.join(self.install_path, "libraries"),
                os.path.join(self.install_path, "mods"),
                os.path.join(self.install_path, "config"),
                os.path.join(self.install_path, "schematics"),
                os.path.join(self.install_path, "logs")
            ]

            # Создаем директории игры
            for directory in game_dirs:
                os.makedirs(directory, exist_ok=True)
                logging.info(f"Создана/проверена директория игры: {directory}")
            
            # Копируем файлы конфигурации только при первом запуске
            copy_default_configs(self.install_path)
            
        except Exception as e:
            logging.error(f"Ошибка подготовки окружения: {str(e)}")
            raise

    def _install_minecraft(self, version=None):
        """Установка базовой версии Minecraft"""
        version_to_install = version or self.version
        self.status_update.emit(f"Установка Minecraft {version_to_install}...")
        
        # Проверяем, существует ли уже прямая установка ванильной версии
        versions_dir = os.path.join(self.install_path, "versions")
        vanilla_dir = os.path.join(versions_dir, version_to_install)
        
        if os.path.exists(vanilla_dir) and os.listdir(vanilla_dir):
            logging.info(f"Найдена прямая установка Minecraft {version_to_install}")
            return
        
        # Проверяем, существует ли установка ванильной версии внутри Forge
        if os.path.exists(versions_dir):
            for folder in os.listdir(versions_dir):
                # Ищем папки с именами, содержащими версию Minecraft (например, "1.21.4-forge-x.y.z")
                if folder.startswith(f"{version_to_install}-") and "forge" in folder.lower():
                    forge_folder = os.path.join(versions_dir, folder)
                    logging.info(f"Найдена Forge-версия: {forge_folder}")
                    # Проверяем, установлена ли внутри ванильная версия
                    vanilla_json = os.path.join(forge_folder, f"{version_to_install}.json")
                    if os.path.exists(vanilla_json):
                        logging.info(f"Ванильная версия {version_to_install} найдена внутри Forge, пропускаем установку")
                        return
        
        # Устанавливаем ванильную версию, если она не найдена
        logging.info(f"Начинаем установку Minecraft {version_to_install}")
        
        # Добавляем startupinfo для скрытия консоли в Windows
        startupinfo = None
        if platform.system() == "Windows":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE

        try:
            # Пробуем новый API в minecraft_launcher_lib
            callback_dict = {
                'setStatus': lambda text: self.status_update.emit(text),
                'setProgress': lambda val: self.progress_update.emit(val, 0, ""),
                'setMax': lambda max_val: self.progress_update.emit(0, max_val, "")
            }
            
            if hasattr(minecraft_launcher_lib, 'install'):
                # Новые версии библиотеки, где install находится в отдельном модуле
                minecraft_launcher_lib.install.install_minecraft_version(
                    version_to_install, self.install_path, callback_dict)
            elif hasattr(minecraft_launcher_lib, 'minecraft'):
                # Версии, где функции находятся в модуле minecraft
                minecraft_launcher_lib.minecraft.install_minecraft_version(
                    version_to_install, self.install_path, callback_dict)
            else:
                # Альтернативный подход через отдельное использование объекта версии
                version_list = minecraft_launcher_lib.utils.get_version_list()
                version_id = None
                for v in version_list:
                    if v['id'] == version_to_install:
                        version_id = v
                        break
                
                if not version_id:
                    raise ValueError(f"Версия {version_to_install} не найдена в списке доступных версий")
                
                # Используем стандартный подход через объект Version
                from minecraft_launcher_lib.types import Version
                version_obj = Version(version_id)
                
                # Вручную устанавливаем версию
                self.status_update.emit(f"Скачивание клиента Minecraft {version_to_install}...")
                minecraft_launcher_lib.utils.ensure_minecraft_client_exists(
                    version_obj, self.install_path, callback_dict)
                
                self.status_update.emit(f"Скачивание и установка ассетов...")
                minecraft_launcher_lib.utils.ensure_minecraft_assets_exists(
                    version_obj, self.install_path, callback_dict)
                
                self.status_update.emit(f"Скачивание и установка библиотек...")
                minecraft_launcher_lib.utils.ensure_minecraft_libraries_exists(
                    version_obj, self.install_path, callback_dict)
                
        except Exception as e:
            logging.error(f"Ошибка установки Minecraft: {str(e)}", exc_info=True)
            raise ValueError(f"Ошибка установки Minecraft: {str(e)}")

    def _install_forge(self):
        try:
            logging.info(f"Начало установки Forge. Версия: {self.version}")

            # Преобразуем формат версии
            if self.version.startswith("1.20.1-forge-"):
                self.version = self.version.replace("-forge-", "-")
            
            # Проверяем установку
            versions_dir = os.path.join(self.install_path, "versions")
            installed_version = minecraft_launcher_lib.forge.forge_to_installed_version(self.version)
            
            if os.path.exists(os.path.join(versions_dir, installed_version)):
                logging.info(f"Forge версии {self.version} уже установлен")
                return

            # Скачиваем и устанавливаем Forge
            minecraft_launcher_lib.forge.install_forge_version(
                self.version,
                self.install_path,
                callback={
                    'setStatus': lambda text: self.status_update.emit(text),
                    'setProgress': lambda val: self.progress_update.emit(val, 0, ""),
                    'setMax': lambda max_val: self.progress_update.emit(0, max_val, "")
                }
            )
            
        except Exception as e:
            logging.error(f"Ошибка установки Forge: {str(e)}", exc_info=True)
            raise

    def _install_modpack(self):
        """Устанавливает модпак"""
        if not self.mods_update_switch:
            return
        try:
            self.status_update.emit("Проверка модпака...")
            
            # Подготавливаем папку mods
            install_path = self.install_path.text() if hasattr(self.install_path, 'text') else self.install_path
            mods_dir = os.path.join(install_path, "mods")
            os.makedirs(mods_dir, exist_ok=True)
            
            # Путь к файлу с информацией о модпаке
            modpack_info_file = os.path.join(mods_dir, "modpack_info.json")
            
            # Проверяем текущую информацию о модпаке
            current_modpack_info = {}
            if os.path.exists(modpack_info_file):
                with open(modpack_info_file, 'r') as f:
                    current_modpack_info = json.load(f)
            
            # Сначала проверяем локальный модпак
            local_modpack = resource_path(os.path.join("assets", "modpack.zip"))
            
            if os.path.exists(local_modpack):
                logging.info("Найден локальный модпак")
                modpack_path = local_modpack
               
                # Проверяем актуальность локального модпака
                local_size = os.path.getsize(local_modpack)
                if (current_modpack_info.get('size') == local_size and
                    all(os.path.exists(os.path.join(mods_dir, mod)) 
                        for mod in current_modpack_info.get('mods', []))):
                    logging.info("Моды актуальны")
                    return
            else:
                # Для exe версии проверяем GitHub
                self.status_update.emit("Проверка обновлений модпака...")
                api_url = "https://api.github.com/repos/mdreval/ib-launcher/releases/latest"
                response = requests.get(api_url, timeout=10)
                response.raise_for_status()
                release_data = response.json()
                
                modpack_asset = next((asset for asset in release_data['assets'] 
                                    if asset['name'] == 'modpack.zip'), None)
                if not modpack_asset:
                    raise ValueError("Модпак не найден в релизе")
                
                # Проверяем актуальность модов из GitHub
                if (current_modpack_info.get('size') == modpack_asset.get('size') and
                    all(os.path.exists(os.path.join(mods_dir, mod)) 
                        for mod in current_modpack_info.get('mods', []))):
                    logging.info("Моды актуальны")
                    return
                
                # Скачиваем модпак с отображением прогресса
                self.status_update.emit("Скачивание модпака...")
                response = requests.get(modpack_asset['browser_download_url'], stream=True)
                response.raise_for_status()
                
                # Получаем размер файла
                total_size = int(response.headers.get('content-length', 0))
                self.progress_update.emit(0, total_size, "")
                
                temp_dir = os.path.join(os.path.expanduser("~"), "AppData", "Local", "Temp", "IBLauncher")
                os.makedirs(temp_dir, exist_ok=True)
                temp_modpack = os.path.join(temp_dir, "modpack.zip")
                
                # Скачиваем с отображением прогресса
                downloaded_size = 0
                with open(temp_modpack, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            downloaded_size += len(chunk)
                            self.progress_update.emit(downloaded_size, total_size, "")
                
                modpack_path = temp_modpack
            
            # Получаем список установленных модов
            installed_mods = []
            
            # Удаляем старые моды
            if os.path.exists(mods_dir):
                for file in os.listdir(mods_dir):
                    if file.endswith('.jar'):
                        try:
                            os.remove(os.path.join(mods_dir, file))
                            logging.info(f"Удален старый мод: {file}")
                        except Exception as e:
                            logging.error(f"Ошибка удаления мода {file}: {str(e)}")
            
            # Распаковываем новые моды с отображением прогресса
            with zipfile.ZipFile(modpack_path, 'r') as zip_ref:
                # Получаем общее количество файлов для распаковки
                total_files = len([f for f in zip_ref.filelist if f.filename.endswith('.jar')])
                self.progress_update.emit(0, total_files, "")
                
                # Распаковываем файлы с обновлением прогресса
                extracted_files = 0
                for file_info in zip_ref.filelist:
                    if file_info.filename.endswith('.jar'):
                        zip_ref.extract(file_info.filename, mods_dir)
                        installed_mods.append(file_info.filename)
                        extracted_files += 1
                        self.progress_update.emit(extracted_files, total_files, "")
                        logging.info(f"Установлен мод: {file_info.filename}")
            
            # Сохраняем информацию о модпаке
            modpack_info = {
                'size': os.path.getsize(modpack_path),
                'updated_at': datetime.now().isoformat(),
                'mods': installed_mods
            }
            
            with open(modpack_info_file, 'w') as f:
                json.dump(modpack_info, f, indent=4)
            
            # Удаляем временный файл если он был создан
            if modpack_path != local_modpack:
                try:
                    os.remove(modpack_path)
                except Exception as e:
                    logging.error(f"Ошибка удаления временного файла: {str(e)}")
            
                logging.info("Модпак успешно установлен")
            self.status_update.emit("Модпак установлен")
            
        except Exception as e:
            logging.error(f"Ошибка установки модпака: {str(e)}")
            raise ValueError(f"Ошибка установки модпака: {str(e)}")

    def _launch_game(self):
        """Запускает игру"""
        try:
            # Проверяем наличие имени пользователя
            if not self.username:
                self.error_occurred.emit("Введите имя пользователя")
                return

            logging.info(f"Запуск игры с памятью: {self.memory}GB")
            
            # Очищаем переменную окружения _JAVA_OPTIONS
            if '_JAVA_OPTIONS' in os.environ:
                del os.environ['_JAVA_OPTIONS']
                logging.info("Очищена переменная окружения _JAVA_OPTIONS")
            
            # Определяем версию для запуска
            version_to_launch = self.version
            
            # Проверяем наличие ванильной или Forge версии
            versions_dir = os.path.join(self.install_path, "versions")
            
            # Если нам нужно запустить ванильную версию (без Forge)
            if "-" not in version_to_launch:
                vanilla_dir = os.path.join(versions_dir, version_to_launch)
                
                # Если прямой установки ванильной версии нет, но есть Forge
                if not os.path.exists(vanilla_dir) or not os.listdir(vanilla_dir):
                    # Проверяем, установлена ли ванильная версия как часть Forge
                    for folder in os.listdir(versions_dir) if os.path.exists(versions_dir) else []:
                        if folder.startswith(f"{version_to_launch}-") and "forge" in folder.lower():
                            logging.info(f"Ванильная версия {version_to_launch} недоступна напрямую, используем версию внутри Forge")
                            # Будем запускать Forge, но без модов (как ванильную версию)
                            version_to_launch = folder
                            break
            # Если это Forge версия, форматируем её правильно
            elif "-" in version_to_launch:
                # Проверяем, есть ли уже префикс forge
                if "forge" not in version_to_launch.lower():
                    version_to_launch = version_to_launch.replace("-", "-forge-", 1)
            
            logging.info(f"Запуск версии: {version_to_launch}")
            
            # Формируем опции запуска с оптимизированными параметрами
            options = {
                'username': self.username,
                'uuid': '60a69d1e-3db8-41ae-a14b-9b5a3a8be00d',
                'token': '',
                'jvmArguments': [
                    f'-Xmx{self.memory}G',
                    '-XX:+UnlockExperimentalVMOptions',
                    '-XX:+UseG1GC',
                    '-XX:G1NewSizePercent=20',
                    '-XX:G1ReservePercent=20',
                    '-XX:MaxGCPauseMillis=50',
                    '-XX:G1HeapRegionSize=32M',
                    '-Dfml.ignoreInvalidMinecraftCertificates=true',
                    '-Dfml.ignorePatchDiscrepancies=true',
                    '-Djava.net.preferIPv4Stack=true',
                    '-Dlog4j2.formatMsgNoLookups=true',
                    '-XX:+DisableAttachMechanism',  # Ускоряет запуск
                    '-XX:+UseStringDeduplication',  # Оптимизация памяти
                    '-XX:+OptimizeStringConcat',    # Оптимизация строк
                    '-XX:+UseCompressedOops'        # Оптимизация указателей
                ],
                'launchTarget': 'fmlclient',
                'executablePath': self.find_java_path(True),
                'gameDirectory': os.path.abspath(self.install_path)
            }

            # Добавляем специальные аргументы для macOS
            if platform.system() == "Darwin":
                options['jvmArguments'].insert(0, '-XstartOnFirstThread')
                if platform.machine() == 'arm64':
                    options['jvmArguments'].append('-Dos.arch=aarch64')

            # Проверяем, является ли версия новым Forge
            is_forge_version = "forge" in version_to_launch.lower()
            
            try:
                if is_forge_version:
                    # Получаем команду запуска для Forge
                    command = get_forge_launch_command(version_to_launch, self.install_path, options)
                    if command:
                        process = launch_forge_with_command(command)
                        if process:
                            logging.info(f"Игра успешно запущена с PID: {process.pid}")
                            self.game_started.emit()
                            return
                        else:
                            raise Exception("Не удалось запустить Forge")
                    else:
                        raise Exception("Не удалось сформировать команду запуска Forge")
                else:
                    # Запускаем ванильную версию
                    command = get_minecraft_command(version_to_launch, self.install_path, options)
                    
                    if platform.system() == "Windows" and HAS_WIN32API:
                        pid = launch_process_hidden(command, cwd=self.install_path)
                        if pid:
                            logging.info(f"Игра успешно запущена с PID: {pid}")
                            self.game_started.emit()
                            return
                        else:
                            logging.warning("Запуск через WinAPI не удался, используем стандартный метод")
                    
                    # Создаем флаги для Windows
                    creation_flags = 0x08000008 if platform.system() == "Windows" else 0
                    
                    # Запускаем процесс с оптимизированными настройками
                    process = subprocess.Popen(
                        command,
                        creationflags=creation_flags,
                        stdin=subprocess.DEVNULL,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        cwd=os.path.abspath(self.install_path),
                        close_fds=True,
                        start_new_session=True
                    )
                    
                    if process:
                        logging.info(f"Игра успешно запущена с PID: {process.pid}")
                        self.game_started.emit()
                        return
                    else:
                        raise Exception("Не удалось запустить игру")
            except minecraft_launcher_lib.exceptions.VersionNotFound as e:
                logging.error(f"Версия {version_to_launch} не найдена. Проверяем альтернативные варианты...")
                
                # Пробуем найти подходящую версию
                if is_forge_version:
                    # Извлекаем базовую версию Minecraft
                    base_version = version_to_launch.split("-forge-")[0]
                    forge_version = version_to_launch.split("-forge-")[1]
                    
                    # Ищем установленные версии Forge
                    forge_versions = []
                    if os.path.exists(versions_dir):
                        for folder in os.listdir(versions_dir):
                            if folder.startswith(f"{base_version}-forge-"):
                                forge_versions.append(folder)
                    
                    if forge_versions:
                        # Берем последнюю установленную версию Forge
                        version_to_launch = sorted(forge_versions)[-1]
                        logging.info(f"Найдена альтернативная версия Forge: {version_to_launch}")
                        
                        # Повторяем попытку запуска с новой версией
                        if is_forge_version:
                            command = get_forge_launch_command(version_to_launch, self.install_path, options)
                        else:
                            command = get_minecraft_command(version_to_launch, self.install_path, options)
                        
                        if command:
                            process = launch_forge_with_command(command)
                            if process:
                                logging.info(f"Игра успешно запущена с PID: {process.pid}")
                                self.game_started.emit()
                                return
                raise Exception(f"Не удалось найти подходящую версию для запуска: {str(e)}")

        except Exception as e:
            logging.error(f"Ошибка запуска игры: {str(e)}", exc_info=True)
            self.error_occurred.emit(f"Ошибка запуска игры: {str(e)}")

    def find_java_path(self, requires_java24=True):
        """
        Находит путь к Java на системе.
        
        Args:
            requires_java24 (bool): Если True, ищет Java 24+, иначе ищет Java 24+
        
        Returns:
            str: Путь к Java или None, если не найден
        """
        min_version = 24  # Всегда ищем Java 24+
        logging.info(f"Поиск Java {min_version}+ на системе...")
        
        found_java_paths = []
        
        # Сначала ищем через системные команды
        system_java = self._find_system_java()
        if system_java:
            logging.info(f"Найден системный Java: {system_java}")
            try:
                version = self._get_java_version(system_java)
                if version >= min_version:
                    logging.info(f"Системный Java соответствует требованиям: версия {version}")
                    return system_java
                else:
                    logging.info(f"Системный Java версии {version} ниже минимальной {min_version}")
                    found_java_paths.append((system_java, version))
            except Exception as e:
                logging.warning(f"Ошибка при проверке системного Java: {str(e)}")
        
        # Сканируем директории
        java_paths = self._scan_java_directories()
        logging.info(f"Найдено {len(java_paths)} путей Java для проверки")
        
        # Проверяем версии и собираем все подходящие
        for path in java_paths:
            try:
                version = self._get_java_version(path)
                if version > 0:  # Убедимся, что версия определена
                    found_java_paths.append((path, version))
                    logging.info(f"Найден Java {version} в {path}")
                    if version >= min_version:
                        logging.info(f"Java {version} соответствует минимальной версии {min_version}")
            except Exception as e:
                logging.warning(f"Ошибка при проверке {path}: {str(e)}")
        
        # Сортируем найденные пути по версии (от новых к старым)
        found_java_paths.sort(key=lambda x: x[1], reverse=True)
        
        # Ищем первый соответствующий требованиям
        for path, version in found_java_paths:
            if version >= min_version:
                logging.info(f"Выбран Java {version} ({path})")
                return path
        

        # Если Java не найден вообще
        logging.error(f"Java не найден на системе")
        
        msg = QMessageBox()
        msg.setIcon(QMessageBox.Critical)
        msg.setWindowTitle("Java не найден")
        
        msg.setText("Для запуска этой версии Minecraft требуется Java 24.\nJava не найден на вашей системе.")
        
        msg.setInformativeText("Хотите перейти на страницу загрузки Java?")
        msg.setStandardButtons(QMessageBox.Yes | QMessageBox.No)
        
        if msg.exec_() == QMessageBox.Yes:
            # Открываем ссылку для скачивания Java в зависимости от ОС
            system = platform.system()
            if system == "Windows":
                webbrowser.open("https://www.oracle.com/java/technologies/downloads/#java24")
            elif system == "Darwin":  # macOS
                webbrowser.open("https://www.oracle.com/java/technologies/downloads/#java24")
            else:  # Linux
                webbrowser.open("https://www.oracle.com/java/technologies/downloads/#java24")
        
        return None

    def _scan_java_directories(self):
        """Сканирует директории для поиска всех установленных Java"""
        java_paths = []
        
        if platform.system() == "Windows":
            # Расширенный список директорий для поиска Java в Windows
            root_dirs = [
                r'C:\Program Files\Java', 
                r'C:\Program Files (x86)\Java',
                r'C:\Program Files\Eclipse Adoptium', 
                r'C:\Program Files\Eclipse Temurin',
                r'C:\Program Files\Amazon Corretto', 
                r'C:\Program Files\Microsoft',
                r'C:\Program Files\AdoptOpenJDK',
                r'C:\Program Files\BellSoft\LibericaJDK',
                r'C:\Program Files\Zulu'
            ]
            
            # Также проверяем JAVA_HOME и PATH
            java_home = os.environ.get('JAVA_HOME')
            if java_home:
                java_bin = os.path.join(java_home, 'bin')
                if os.path.exists(java_bin):
                    root_dirs.append(java_bin)
                    
            # Ищем в каждой директории
            for root_dir in root_dirs:
                if os.path.exists(root_dir):
                    try:
                        # Сначала пробуем найти в корневой директории
                        for dir_name in os.listdir(root_dir):
                            if 'jdk' in dir_name.lower() or 'jre' in dir_name.lower():
                                # Проверяем и javaw.exe и java.exe
                                java_path = os.path.join(root_dir, dir_name, 'bin', 'javaw.exe')
                                if os.path.exists(java_path):
                                    java_paths.append(java_path)
                                    
                                java_path = os.path.join(root_dir, dir_name, 'bin', 'java.exe')
                                if os.path.exists(java_path):
                                    java_paths.append(java_path)
                                    
                        # Проверяем глубже для некоторых сложных структур
                        for dir_name in os.listdir(root_dir):
                            if os.path.isdir(os.path.join(root_dir, dir_name)):
                                subdir = os.path.join(root_dir, dir_name)
                                for subdir_name in os.listdir(subdir):
                                    if 'jdk' in subdir_name.lower() or 'jre' in subdir_name.lower():
                                        java_path = os.path.join(subdir, subdir_name, 'bin', 'javaw.exe')
                                        if os.path.exists(java_path):
                                            java_paths.append(java_path)
                    except Exception as e:
                        logging.error(f"Ошибка при сканировании директории {root_dir}: {str(e)}")
        
        elif platform.system() == "Darwin":  # macOS
            # macOS обычно хранит Java в /Library/Java/JavaVirtualMachines/
            root_dirs = [
                '/Library/Java/JavaVirtualMachines/',
                '/System/Library/Java/JavaVirtualMachines/',
                '/opt/homebrew/Cellar/openjdk',
                '/usr/local/opt/openjdk',
                '/opt/local/lib/openjdk',
                '/Applications/Eclipse JDK',    # Дополнительные места
                f'{os.path.expanduser("~")}/Library/Java/JavaVirtualMachines',  # Пользовательские установки
            ]
            
            for root_dir in root_dirs:
                if os.path.exists(root_dir):
                    try:
                        for dir_name in os.listdir(root_dir):
                            # В macOS ищем более общим шаблоном, чтобы захватить как jdk, так и openjdk и другие варианты
                            if 'jdk' in dir_name.lower() or 'java' in dir_name.lower() or 'openjdk' in dir_name.lower():
                                # Стандартный путь для macOS JDK
                                java_path = os.path.join(root_dir, dir_name, 'Contents/Home/bin/java')
                                if os.path.exists(java_path):
                                    java_paths.append(java_path)
                                    
                                # Альтернативный путь для некоторых дистрибутивов
                                java_path = os.path.join(root_dir, dir_name, 'bin/java')
                                if os.path.exists(java_path):
                                    java_paths.append(java_path)
                                    
                                # Для Homebrew версий
                                java_path = os.path.join(root_dir, dir_name, 'libexec/bin/java')
                                if os.path.exists(java_path):
                                    java_paths.append(java_path)
                                    
                                # Проверяем вложенные подпапки для версий
                                version_dir = os.path.join(root_dir, dir_name, 'Versions')
                                if os.path.exists(version_dir) and os.path.isdir(version_dir):
                                    try:
                                        for ver_dir in os.listdir(version_dir):
                                            java_path = os.path.join(version_dir, ver_dir, 'bin/java')
                                            if os.path.exists(java_path):
                                                java_paths.append(java_path)
                                    except Exception as e:
                                        logging.error(f"Ошибка при сканировании подпапки версий: {str(e)}")
                    except Exception as e:
                        logging.error(f"Ошибка при сканировании директории {root_dir}: {str(e)}")
                        
            # Проверяем пути установки через пакетные менеджеры
            homebrew_paths = [
                '/opt/homebrew/opt/openjdk/bin/java',
                '/opt/homebrew/opt/openjdk@21/bin/java',
                '/opt/homebrew/opt/openjdk@17/bin/java',
                '/usr/local/opt/openjdk/bin/java',
                '/usr/local/opt/openjdk@21/bin/java',
                '/usr/local/opt/openjdk@17/bin/java',
            ]
            
            for path in homebrew_paths:
                if os.path.exists(path):
                    java_paths.append(path)
                    
            # Попробуем найти через стандартные пути и символические ссылки
            for path in ['/usr/bin/java', '/usr/local/bin/java']:
                if os.path.exists(path):
                    java_paths.append(path)
        
        else:  # Linux
            # Типичные пути для Linux
            root_dirs = [
                '/usr/lib/jvm',
                '/usr/java',
                '/opt/java',
                '/opt/jdk',
                '/usr/local/java',
                '/opt/oracle',
                '/usr/local/lib/jvm',
                '/snap/jdk',
                '/snap/openjdk',
            ]
            
            for root_dir in root_dirs:
                if os.path.exists(root_dir):
                    try:
                        for dir_name in os.listdir(root_dir):
                            if ('java' in dir_name.lower() or 'jdk' in dir_name.lower() or 'jre' in dir_name.lower()):
                                java_path = os.path.join(root_dir, dir_name, 'bin/java')
                                if os.path.exists(java_path):
                                    java_paths.append(java_path)
                    except Exception as e:
                        logging.error(f"Ошибка при сканировании директории {root_dir}: {str(e)}")
                        
            # Проверяем стандартные бинарные директории
            for path in ['/usr/bin/java', '/usr/local/bin/java', '/bin/java']:
                if os.path.exists(path):
                    java_paths.append(path)
        
        return java_paths
        
    def _find_system_java(self):
        """Находит Java через системные команды (where/which)"""
        try:
            system = platform.system()
            
            if system == "Darwin" or system == "Linux":  # macOS или Linux
                cmd = ['which', 'java']
            else:  # Windows
                cmd = ['where', 'javaw']
                
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True,
                creationflags=subprocess.CREATE_NO_WINDOW if system == "Windows" else 0
            )
            
            if result.returncode == 0:
                paths = result.stdout.strip().split('\n')
                if paths and paths[0]:
                    return paths[0]
        except Exception as e:
            logging.warning(f"Ошибка поиска Java через системные команды: {str(e)}")
            
        return None

    def _get_java_version(self, java_path):
        """Получает версию Java из пути"""
        try:
            # Заменяем javaw.exe на java.exe для лучшей совместимости
            java_exe = java_path.replace('javaw.exe', 'java.exe')
            logging.info(f"Проверка версии исполняемым файлом: {java_exe}")
            
            result = subprocess.run(
                [java_exe, '-version'],
                capture_output=True,
                text=True
            )

            # Java выводит информацию о версии в stderr
            version_output = result.stderr if result.stderr else result.stdout
            logging.info(f"Вывод команды java -version: {version_output}")

            # Извлекаем версию Java
            # Формат может быть "1.8.0_301" (Java 8) или "11.0.2" (Java 11+) или просто "17" (Java 17)
            version_pattern = r'version "([^"]+)"'
            match = re.search(version_pattern, version_output)
            
            if not match:
                # Альтернативный шаблон для OpenJDK
                version_pattern = r'openjdk version "([^"]+)"'
                match = re.search(version_pattern, version_output)
            
            if match:
                version_string = match.group(1)
                logging.info(f"Найдена строка версии Java: {version_string}")
                
                # Определяем основной номер версии
                if version_string.startswith("1."):
                    # Старый формат версии (1.8 = Java 8)
                    try:
                        major_version = int(version_string.split('.')[1])
                        logging.info(f"Определена старая версия Java: 1.{major_version} -> Java {major_version}")
                        return major_version
                    except Exception as e:
                        logging.error(f"Ошибка при парсинге старой версии Java: {str(e)}")
                        return 0
                else:
                    # Новый формат версии (11.0.2 = Java 11, 17.0.1 = Java 17, 21 = Java 21)
                    try:
                        major_version = int(version_string.split('.')[0])
                        logging.info(f"Определена новая версия Java: {major_version}")
                        return major_version
                    except Exception as e:
                        # Последняя попытка - извлечь первое число
                        try:
                            major_version = int(re.search(r'(\d+)', version_string).group(1))
                            logging.info(f"Определена версия Java по первому числу: {major_version}")
                            return major_version
                        except:
                            logging.error(f"Ошибка при парсинге новой версии Java: {str(e)}")
                            return 0
            else:
                logging.warning("Не удалось определить версию Java из вывода")
                return 0
        except Exception as e:
            logging.error(f"Ошибка получения версии Java: {str(e)}")
            return 0

    def install_game(self):
        """Установка игры"""
        try:
            # Проверяем, что выбрана версия Minecraft
            selected_version = self.minecraft_version.currentText()
            if not selected_version:
                QMessageBox.warning(self, "Ошибка", "Выберите версию Minecraft")
                return
            
            # Получаем имя пользователя
            username = self.username.text().strip()
            if not username:
                QMessageBox.warning(self, "Ошибка", "Введите имя пользователя")
                return
            
            # Получаем путь установки
            install_path = self.install_path.text().strip()
            if not os.path.exists(install_path):
                os.makedirs(install_path, exist_ok=True)
            
            # Проверяем доступность записи в указанный путь
            if not os.access(install_path, os.W_OK):
                QMessageBox.critical(self, "Ошибка", "Нет прав на запись в выбранную папку!")
                return
            
            # Проверяем наличие Java в зависимости от выбранной версии
            if not self.check_java_for_version(selected_version):
                QMessageBox.warning(self, "Ошибка", f"Требуется соответствующая версия Java для Minecraft {selected_version}")
                return
            
            # Проверка Forge
            forge_selected = (
                self.forge_version.isEnabled() and 
                self.forge_version.currentText() != "Не устанавливать"
            )
            
            if forge_selected:
                # Сначала устанавливаем базовую версию Minecraft
                self.status_label.setText(f"Установка Minecraft {selected_version}...")
                minecraft_launcher_lib.install.install_minecraft_version(
                    versionid=selected_version,
                    minecraft_directory=install_path,
                    callback={
                        'setStatus': lambda text: self.status_label.setText(text),
                        'setProgress': lambda val: self.progress_bar.setValue(val),
                        'setMax': lambda val: self.progress_bar.setMaximum(val)
                    }
                )
                
                # Затем устанавливаем Forge
                forge_version = self.forge_version.currentText()
                forge_version_id = forge_version.replace(f"{selected_version}-forge-", f"{selected_version}-")
                self.status_label.setText(f"Установка Forge {forge_version_id}...")
                
                minecraft_launcher_lib.forge.install_forge_version(
                    forge_version_id,
                    install_path,
                    callback={
                        'setStatus': lambda text: self.status_label.setText(text),
                        'setProgress': lambda val: self.progress_bar.setValue(val),
                        'setMax': lambda val: self.progress_bar.setMaximum(val)
                    }
                )
                
                # Добавляем версию Forge в кеш
                self.add_to_forge_cache(selected_version, forge_version_id)
                
                # Для 1.20.1 с Forge устанавливаем модпак
                if selected_version == "1.20.1" and self.mods_update_checkbox.isChecked():
                    self.install_modpack()
            else:
                # Установка только Minecraft без Forge
                self.status_label.setText(f"Установка Minecraft {selected_version}...")
                minecraft_launcher_lib.install.install_minecraft_version(
                    versionid=selected_version,
                    minecraft_directory=install_path,
                    callback={
                        'setStatus': lambda text: self.status_label.setText(text),
                        'setProgress': lambda val: self.progress_bar.setValue(val),
                        'setMax': lambda val: self.progress_bar.setMaximum(val)
                    }
                )
            
            self.status_label.setText(f"Minecraft {selected_version} установлен")
            self.start_button.setText("Играть")
            
            # Проверяем успешность установки
            self.check_game_installed()
            
        except Exception as e:
            logging.error(f"Ошибка установки игры: {str(e)}", exc_info=True)
            QMessageBox.critical(self, "Ошибка", f"Не удалось установить игру: {str(e)}")
            self.status_label.setText("Произошла ошибка при установке")

    def on_install_path_changed(self):
        """Обработчик изменения пути установки"""
        try:
            # Сохраняем новый путь в конфигурации
            self.save_config()
            # Проверяем установку игры
            self.check_game_installed()
        except Exception as e:
            logging.error(f"Ошибка при обработке изменения пути установки: {str(e)}")

    def remove_version(self):
        """Удаляет выбранную версию игры"""
        try:
            # Получаем текущие версии
            minecraft_version = self.minecraft_version.currentText()
            forge_version = self.forge_version.currentText() if self.forge_version.isEnabled() else None
            install_path = self.install_path.text().strip()

            # Определяем, какую версию нужно удалить
            if forge_version == "Не устанавливать" or forge_version is None:
                version_to_remove = minecraft_version
            else:
                version_to_remove = forge_version

            # Спрашиваем подтверждение
            reply = QMessageBox.question(
                self,
                "Подтверждение удаления",
                f"Вы уверены, что хотите удалить версию {version_to_remove} и все связанные файлы?",
                QMessageBox.Yes | QMessageBox.No
            )

            if reply == QMessageBox.No:
                return

            # Функция для обработки ошибок при удалении защищённых файлов
            def on_rm_error(func, path, exc_info):
                import stat
                try:
                    os.chmod(path, stat.S_IWRITE)
                    func(path)
                except Exception:
                    pass

            # Удаляем всю папку установки
            if os.path.exists(install_path):
                import shutil
                try:
                    # Удаляем всю папку установки с обработчиком ошибок
                    shutil.rmtree(install_path, onerror=on_rm_error)
                    logging.info(f"Удалена папка установки: {install_path}")

                    # Обновляем состояние кнопок
                    self.check_game_installed()

                    # Показываем сообщение об успешном удалении
                    QMessageBox.information(
                        self,
                        "Удаление завершено",
                        f"Версия {version_to_remove} и все связанные файлы успешно удалены."
                    )
                except Exception as e:
                    logging.error(f"Ошибка при удалении папки установки: {str(e)}")
                    raise
            else:
                logging.warning(f"Папка установки не найдена: {install_path}")
                QMessageBox.warning(
                    self,
                    "Предупреждение",
                    "Папка установки не найдена."
                )

        except Exception as e:
            logging.error(f"Ошибка при удалении версии: {str(e)}", exc_info=True)
            QMessageBox.critical(
                self,
                "Ошибка",
                f"Не удалось удалить версию: {str(e)}"
            )

    def get_natives_path(self):
        """Определяет путь к нативным библиотекам в зависимости от архитектуры"""
        if platform.system() != "Darwin":
            return None
            
        arch = platform.machine()
        if arch == 'arm64':
            return "-natives-macos-arm64"
        else:
            return "-natives-macos"

class MainWindow(QMainWindow):
    # Добавляем сигналы
    status_update = pyqtSignal(str)
    progress_update = pyqtSignal(int, int, str)
    
    
    def __init__(self):
        super().__init__()
        self.is_loading = True
        
        # Загружаем UI
        uic.loadUi(resource_path("design.ui"), self)
        
        # Инициализируем переменные
        self.install_path_str = ""
        self.forge_cache = {}
        self.mods_update_switch = True
        self.language = 'ru'  # Язык по умолчанию
        
        # Устанавливаем иконку для окна и панели задач с учетом платформы
        if platform.system() == "Windows":
            # Устанавливаем иконку до создания окна
            import ctypes
            myappid = 'igrobar.iblauncher.1.0'
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
            
            # Загружаем иконку
            icon_path = resource_path(os.path.join("assets", "icon.ico"))
            if os.path.exists(icon_path):
                self.setWindowIcon(QIcon(icon_path))
        elif platform.system() == "Darwin":  # macOS
            icon_path = resource_path(os.path.join("assets", "icon.icns"))
            if os.path.exists(icon_path):
                self.setWindowIcon(QIcon(icon_path))
        else:  # Linux и другие
            icon_path = resource_path(os.path.join("assets", "icon.png"))
            if os.path.exists(icon_path):
                self.setWindowIcon(QIcon(icon_path))

        # Находим все необходимые виджеты
        self.username = self.findChild(QLineEdit, "username_input")
        self.minecraft_version = self.findChild(QComboBox, "minecraft_version")
        self.forge_version = self.findChild(QComboBox, "forge_version")
        self.install_path = self.findChild(QLineEdit, "install_path")
        self.browse_button = self.findChild(QPushButton, "browse_button")
        self.memory_slider = self.findChild(QSlider, "memory_slider")
        self.memory_label = self.findChild(QLabel, "memory_label")
        self.launch_flags_input = self.findChild(QPlainTextEdit, "launch_flags_input")
        self.youtube_button = self.findChild(QPushButton, "youtube_button")
        self.telegram_button = self.findChild(QPushButton, "telegram_button")
        self.start_button = self.findChild(QPushButton, "start_button")
        self.mods_list = self.findChild(QListWidget, "mods_list")
        self.add_mod_button = self.findChild(QPushButton, "add_mod_button")
        self.remove_mod_button = self.findChild(QPushButton, "remove_mod_button")
        self.check_updates_button = self.findChild(QPushButton, "check_updates_button")
        self.remove_version_button = self.findChild(QPushButton, "remove_version_button")
        self.players_online_label = self.findChild(QLabel, "players_online_label")
        self.light_theme_radio = self.findChild(QRadioButton, "light_theme_radio")
        self.dark_theme_radio = self.findChild(QRadioButton, "dark_theme_radio")
        self.close_launcher_checkbox = self.findChild(QCheckBox, "close_launcher_checkbox")
        self.version_label = self.findChild(QLabel, "version_label")
        self.status_label = self.findChild(QLabel, "status_label")
        self.progress_bar = self.findChild(QProgressBar, "progress_bar")
        self.tabWidget = self.findChild(QTabWidget, "tabWidget")

        # Дополнительные виджеты для перевода
        self.username_group = self.findChild(QGroupBox, "username_group")
        self.version_group = self.findChild(QGroupBox, "versions_group")
        self.path_group = self.findChild(QGroupBox, "path_group")
        self.memory_group = self.findChild(QGroupBox, "memory_group")
        self.memory_title = self.findChild(QLabel, "memory_title")
        self.launch_flags_group = self.findChild(QGroupBox, "launch_flags_group")
        self.launch_flags_title = self.findChild(QLabel, "launch_flags_title")
        self.theme_group = self.findChild(QGroupBox, "theme_group")
        self.language_group = self.findChild(QGroupBox, "language_group")
        
        # Элементы для выбора языка
        self.ru_language_radio = self.findChild(QRadioButton, "ru_language_radio")
        self.en_language_radio = self.findChild(QRadioButton, "en_language_radio")
        self.uk_language_radio = self.findChild(QRadioButton, "uk_language_radio")

        # Подключаем сигналы для модов
        self.add_mod_button.clicked.connect(self.add_mods)
        self.remove_mod_button.clicked.connect(self.remove_selected_mods)
        self.check_updates_button.clicked.connect(self.toggle_auto_updates)
        self.tabWidget.currentChanged.connect(self.on_tab_changed)
        self.remove_version_button.clicked.connect(self.remove_version)  # Подключаем обработчик удаления версии
        # Подключаем обработчики
        self.light_theme_radio.toggled.connect(self.on_theme_changed)
        self.dark_theme_radio.toggled.connect(self.on_theme_changed)
        self.close_launcher_checkbox.toggled.connect(self.save_config)
        
        # Подключаем обработчик смены языка
        if self.ru_language_radio: self.ru_language_radio.toggled.connect(self.on_language_changed)
        if self.en_language_radio: self.en_language_radio.toggled.connect(self.on_language_changed)
        if self.uk_language_radio: self.uk_language_radio.toggled.connect(self.on_language_changed)
        
        # Проверяем Java
        self.check_java()
        self.check_dependencies()
        
        # Загружаем конфигурацию
        self.load_config()
        
        # Устанавливаем путь установки для выбранной версии
        self.load_versions()  # Сначала загружаем версии
        self.setup_path()

        # Подключаем сигналы
        self.browse_button.clicked.connect(self.select_install_path)
        self.start_button.clicked.connect(self.start_installation)
        self.minecraft_version.currentIndexChanged.connect(self.on_minecraft_version_changed)
        self.forge_version.currentIndexChanged.connect(self.on_forge_version_changed)
        self.username.textChanged.connect(self.save_config)
        self.memory_slider.valueChanged.connect(self.on_memory_changed)
        self.launch_flags_input.textChanged.connect(self.save_config)
        self.install_path.textChanged.connect(self.on_install_path_changed)  # Добавляем обработчик изменения пути
        self.forge_version.currentTextChanged.connect(self.check_game_installed)
        self.youtube_button.clicked.connect(self.open_youtube)
        self.telegram_button.clicked.connect(self.open_telegram)
        self.status_update.connect(self.status_label.setText)
        self.progress_update.connect(self.update_progress)

        # Проверяем обновления при запуске
        QTimer.singleShot(1000, self.check_launcher_update)  # Проверяем через секунду после запуска

        # Обновляем версию в интерфейсе
        self.version_label = self.findChild(QLabel, "version_label")
        self.update_version_label()
        self.tabWidget.setCurrentIndex(0)
        
        # После загрузки всего проверяем наличие игры
        self.check_game_installed()
        self.update_players_online()
        self.online_timer = QTimer()
        self.online_timer.timeout.connect(self.update_players_online)
        self.online_timer.start(30000)
        # Применяем тему при запуске
        self.apply_theme()
        
        self.retranslate_ui()

        self.is_loading = False

    def retranslate_ui(self):
        """Переводит все тексты в интерфейсе"""
        try:
            translations = TRANSLATIONS.get(self.language, TRANSLATIONS['ru'])
            
            # Main Window
            self.setWindowTitle(translations['window_title'])
            
            # Tabs
            if self.tabWidget:
                self.tabWidget.setTabText(0, translations['tab_game'])
                self.tabWidget.setTabText(1, translations['tab_mods'])
                self.tabWidget.setTabText(2, translations['tab_settings'])

            # Game Tab
            if self.username_group: self.username_group.setTitle(translations['username_group'])
            if self.username: self.username.setPlaceholderText(translations['username_placeholder'])
            if self.version_group: self.version_group.setTitle(translations['version_group'])
            if self.path_group: self.path_group.setTitle(translations['install_path_group'])
            if self.browse_button: self.browse_button.setText(translations['browse_button'])
            if self.remove_version_button: self.remove_version_button.setText(translations['remove_version_button'])
            if self.status_label: self.status_label.setText(translations['status_label_ready'])
            self.check_game_installed() # Обновляем текст кнопки Играть/Установить

            # Mods Tab
            if self.add_mod_button: self.add_mod_button.setText(translations['add_mod_button'])
            if self.remove_mod_button: self.remove_mod_button.setText(translations['remove_mod_button'])
            if self.check_updates_button:
                if self.mods_update_switch:
                    self.check_updates_button.setText(translations['check_updates_button_on'])
                else:
                    self.check_updates_button.setText(translations['check_updates_button_off'])

            # Settings Tab
            if self.memory_group: self.memory_group.setTitle(translations['memory_group'])
            if self.memory_title: self.memory_title.setText(translations['memory_title'])
            if self.memory_label and self.memory_slider: self.memory_label.setText(translations['memory_label_gb'].format(value=self.memory_slider.value()))
            if self.launch_flags_group: self.launch_flags_group.setTitle(translations['launch_flags_group'])
            if self.launch_flags_title: self.launch_flags_title.setText(translations['launch_flags_title'])
            if self.launch_flags_input: self.launch_flags_input.setPlaceholderText(translations['launch_flags_placeholder'])
            if self.theme_group: self.theme_group.setTitle(translations['theme_group'])
            if self.light_theme_radio: self.light_theme_radio.setText(translations['light_theme_radio'])
            if self.dark_theme_radio: self.dark_theme_radio.setText(translations['dark_theme_radio'])
            if self.language_group: self.language_group.setTitle(translations['language_group'])
            if self.close_launcher_checkbox: self.close_launcher_checkbox.setText(translations['close_launcher_checkbox'])

            # Bottom info
            if self.telegram_button: self.telegram_button.setToolTip(translations['telegram_tooltip'])
            if self.youtube_button: self.youtube_button.setToolTip(translations['youtube_tooltip'])
            self.update_version_label() # Обновляем текст версии
            self.update_players_online() # Обновляем онлайн

        except Exception as e:
            logging.error(f"Ошибка перевода интерфейса: {str(e)}", exc_info=True)

    def on_language_changed(self):
        """Обработчик смены языка"""
        if hasattr(self, 'is_loading') and self.is_loading:
            return
            
        new_language = 'ru' # По умолчанию
        if self.en_language_radio and self.en_language_radio.isChecked():
            new_language = 'en'
        elif self.uk_language_radio and self.uk_language_radio.isChecked():
            new_language = 'uk'

        if new_language and new_language != self.language:
            self.language = new_language
            logging.info(f"Язык изменен на: {self.language}")
            self.retranslate_ui()
            self.save_config()

    def clean_path(self, path):
        """
        Очищает путь от лишних IBLauncher
        """
        parts = path.split(os.sep)
        cleaned_parts = []
        iblauncher_found = False
        
        for part in parts:
            if part == "IBLauncher" and not iblauncher_found:
                cleaned_parts.append(part)
                iblauncher_found = True
            elif part.startswith("IBLauncher_"):
                cleaned_parts.append(part)
            elif part != "IBLauncher":
                cleaned_parts.append(part)
        
        return os.sep.join(cleaned_parts)

    def setup_path(self):
        """Настраивает путь установки в зависимости от выбранной версии"""
        try:
            # Получаем выбранную версию Minecraft
            selected_version = self.minecraft_version.currentText()
            if not selected_version:
                return

            # Получаем текущий путь
            current_path = self.install_path.text().strip()
            
            # Если путь пустой или это путь по умолчанию
            if not current_path or current_path == DEFAULT_MINECRAFT_DIR:
                # Используем путь по умолчанию
                if platform.system() == "Windows":
                    appdata_path = os.path.join(os.environ.get('APPDATA', ''))
                    base_path = appdata_path
                elif platform.system() == "Darwin":  # macOS
                    home_path = os.path.expanduser("~")
                    base_path = os.path.join(home_path, "Library", "Application Support")
                else:  # Linux
                    home_path = os.path.expanduser("~")
                    base_path = home_path
            else:
                # Если путь уже установлен пользователем
                # Нормализуем текущий путь
                if platform.system() == "Windows":
                    current_path = current_path.replace("/", "\\")
                    # Убеждаемся, что после буквы диска есть обратный слеш
                    if len(current_path) >= 2 and current_path[1] == ':' and current_path[2] != '\\':
                        current_path = current_path[:2] + '\\' + current_path[2:]
                
                # Удаляем возможные дублирования IBLauncher в пути
                path_parts = current_path.split("IBLauncher")
                base_path = path_parts[0].rstrip("\\")
                
                # Если путь заканчивается на номер версии, удаляем его
                if base_path.endswith("_"):
                    base_path = base_path.rstrip("_")

            # Формируем новый путь в зависимости от версии
            if selected_version == "1.20.1":
                new_path = os.path.join(base_path, "IBLauncher")
            else:
                new_path = os.path.join(base_path, f"IBLauncher_{selected_version}")
            
            # Нормализуем путь для Windows
            if platform.system() == "Windows":
                new_path = new_path.replace("/", "\\")
                # Убеждаемся, что после буквы диска есть обратный слеш
                if len(new_path) >= 2 and new_path[1] == ':' and new_path[2] != '\\':
                    new_path = new_path[:2] + '\\' + new_path[2:]
            
            logging.info(f"Setup path: base_path={base_path}, new_path={new_path}")
            
            # Устанавливаем путь в UI
            self.install_path.setText(new_path)
            self.install_path_str = new_path
            
            # Проверяем установку игры
            self.check_game_installed()
            
        except Exception as e:
            logging.error(f"Ошибка при настройке пути установки: {str(e)}")
            # Используем путь по умолчанию в случае ошибки
            if platform.system() == "Windows":
                appdata_path = os.path.join(os.environ.get('APPDATA', ''))
                default_path = os.path.join(appdata_path, "IBLauncher")
            elif platform.system() == "Darwin":  # macOS
                home_path = os.path.expanduser("~")
                default_path = os.path.join(home_path, "Library", "Application Support", "IBLauncher")
            else:  # Linux
                home_path = os.path.expanduser("~")
                default_path = os.path.join(home_path, "IBLauncher")
            
            # Нормализуем путь по умолчанию для Windows
            if platform.system() == "Windows":
                default_path = default_path.replace("/", "\\")
                if len(default_path) >= 2 and default_path[1] == ':' and default_path[2] != '\\':
                    default_path = default_path[:2] + '\\' + default_path[2:]
            
            self.install_path.setText(default_path)
            self.install_path_str = default_path

    def select_install_path(self):
        """Открывает диалог выбора пути установки"""
        try:
            # Получаем текущий путь
            current_path = self.install_path.text().strip()
            
            # Если путь пустой, используем путь по умолчанию
            if not current_path:
                if platform.system() == "Windows":
                    current_path = os.path.join(os.environ.get('APPDATA', ''))
                else:
                    current_path = os.path.expanduser("~")
            
            # Открываем диалог выбора папки
            folder_path = QFileDialog.getExistingDirectory(
                self,
                "Выберите папку для установки",
                current_path,
                QFileDialog.ShowDirsOnly
            )
            
            if folder_path:
                # Получаем выбранную версию Minecraft
                selected_version = self.minecraft_version.currentText()
                
                # Формируем новый путь в зависимости от версии
                if selected_version == "1.20.1":
                    new_path = os.path.join(folder_path, "IBLauncher")
                else:
                    new_path = os.path.join(folder_path, f"IBLauncher_{selected_version}")
                
                # Нормализуем путь для Windows
                if platform.system() == "Windows":
                    # Убеждаемся, что после буквы диска есть обратный слеш
                    if len(new_path) >= 2 and new_path[1] == ':' and new_path[2] != '\\':
                        new_path = new_path[:2] + '\\' + new_path[2:]
                    new_path = new_path.replace('/', '\\')
                
                # Устанавливаем путь в UI
                self.install_path.setText(new_path)
                self.install_path_str = new_path
                
                # Сохраняем конфиг
                self.save_config()

                # Проверяем установку игры
                self.check_game_installed()
                
        except Exception as e:
            logging.error(f"Ошибка при выборе пути установки: {str(e)}")
            self.show_error(f"Ошибка при выборе пути установки: {str(e)}")

    def check_java(self):
        """Проверяет наличие Java"""
        try:
            # Ищем путь к Java так же, как и при запуске
            possible_paths = [
                'javaw.exe',  # Проверяем в PATH
                'java.exe',   # Альтернативный вариант
                r'\usr\bin\java',
                r'C:\Program Files\Java\jdk-24\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-24.0.1\bin\javaw.exe',
                r'C:\Program Files\Eclipse Adoptium\jdk-24\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-21\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-21.0.2\bin\javaw.exe',
                r'C:\Program Files\Eclipse Adoptium\jdk-21\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.10\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17\bin\javaw.exe',
                r'C:\Program Files\Eclipse Adoptium\jdk-17\bin\javaw.exe',
                os.path.join(os.environ.get('JAVA_HOME', ''), 'bin', 'javaw.exe'),
            ]

            java_path = None
            
            # Сначала проверяем через where
            try:
                system = platform.system()
                logging.info(f"System: {system}")
                if system=="Darwin":
                    result = subprocess.run(['which', 'java'], 
                                        capture_output=True, 
                                        text=True)
                else:
                    result = subprocess.run(['where', 'javaw'], 
                                        capture_output=True, 
                text=True,
                                        creationflags=subprocess.CREATE_NO_WINDOW)
                if result.returncode == 0:
                    java_paths = result.stdout.strip().split('\n')
                    if java_paths:
                        java_path = java_paths[0]
                        logging.info(f"Java найдена через where: {java_path}")
            except Exception as e:
                logging.warning(f"Не удалось найти Java через where: {e}")

            # Если where не нашел, проверяем другие пути
            if not java_path:
                for path in possible_paths:
                    if os.path.exists(path):
                        java_path = path
                        logging.info(f"Java найдена по пути: {java_path}")
                        break

            if java_path:
                # Проверяем версию найденной Java
                java_exe = java_path.replace('javaw.exe', 'java.exe')
                result = subprocess.run(
                    [java_exe, '-version'], 
                    capture_output=True,  # Используем только capture_output
                    #reationflags=subprocess.CREATE_NO_WINDOW,
                    text=True
                )
                
                version_output = result.stderr
                logging.info(f"Java version check output: {version_output}")
                
                # Проверяем версию через регулярное выражение
                import re
                version_pattern = r'version "([^"]+)"'
                match = re.search(version_pattern, version_output)
                
                if match:
                    version_string = match.group(1)
                    logging.info(f"Found Java version: {version_string}")
                    
                    # Проверяем версию
                    if any(str(v) in version_string for v in range(17, 25)):
                        logging.info("Java version is compatible")
                        return java_path
            
            # Если Java не найдена или версия не подходит
            logging.warning("Java version is not compatible or not found")
            response = QMessageBox.critical(
                self,
                "Ошибка",
                "Java не установлена или версия ниже 17!\n\n" +
                "Сейчас откроется страница загрузки Oracle Java.\n" +
                "На сайте выберите версию для вашей системы (Windows, macOS или Linux).\n" +
                "Для Windows рекомендуется Windows x64 Installer.",
                QMessageBox.Ok | QMessageBox.Cancel
            )
            
            if response == QMessageBox.Ok:
                QDesktopServices.openUrl(QUrl("https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html"))
            return False

        except Exception as e:
            logging.error(f"Ошибка проверки Java: {str(e)}", exc_info=True)
            response = QMessageBox.critical(
                self,
                "Ошибка",
                "Java не найдена!\n\n" +
                "Сейчас откроется страница загрузки Oracle Java.\n" +
                "На сайте выберите версию для вашей системы (Windows, macOS или Linux).\n" +
                "Для Windows рекомендуется Windows x64 Installer.",
                QMessageBox.Ok | QMessageBox.Cancel
            )
            
            if response == QMessageBox.Ok:
                QDesktopServices.openUrl(QUrl("https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html"))
            return False

    def load_config(self):
        """Загружает конфигурацию из файла"""
        try:
            config_path = CONFIG_FILE
            if os.path.exists(config_path):
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    
                # Загружаем имя пользователя
                if 'username' in config:
                    self.username_input.setText(config['username'])
                
                # Загружаем язык
                if 'language' in config:
                    self.language = config.get('language', 'ru')
                    if self.language == 'en' and self.en_language_radio:
                        self.en_language_radio.setChecked(True)
                    elif self.language == 'uk' and self.uk_language_radio:
                        self.uk_language_radio.setChecked(True)
                    elif self.ru_language_radio:
                        self.ru_language_radio.setChecked(True)

                # Загружаем выделенную память
                if 'memory' in config:
                    memory = config['memory']
                    self.memory_slider.setValue(memory)
                    self.memory_label.setText(f"{memory} ГБ")
                
                # Загружаем путь установки
                if 'install_path' in config:
                    install_path = config['install_path']
                    # Получаем версию Minecraft
                    minecraft_version = config.get('minecraft_version', '1.20.1')
                    
                    # Нормализуем путь для Windows
                    install_path = os.path.normpath(install_path)
                    
                    # Разбиваем путь на части, учитывая оба типа разделителей
                    path_parts = [part for part in install_path.replace('\\', '/').split('/') if part]
                    
                    # Находим индекс последнего IBLauncher
                    iblauncher_indices = [i for i, part in enumerate(path_parts) if part == "IBLauncher" or part.startswith("IBLauncher_")]
                    
                    if iblauncher_indices:
                        # Берем путь до последнего IBLauncher
                        base_path = os.path.join(*path_parts[:iblauncher_indices[-1]])
                    else:
                        # Если IBLauncher не найден, используем весь путь
                        base_path = install_path
                    
                    # Формируем новый путь
                    if minecraft_version == "1.20.1":
                        new_path = os.path.join(base_path, "IBLauncher")
                    else:
                        new_path = os.path.join(base_path, f"IBLauncher_{minecraft_version}")
                    
                    # Нормализуем путь
                    new_path = os.path.normpath(new_path)
                    # Исправление: если macOS и путь не начинается с '/', добавить слеш
                    if platform.system() == "Darwin" and not new_path.startswith("/"):
                        new_path = "/" + new_path
                    
                    self.install_path.setText(new_path)
                    self.install_path_str = new_path
                
                # Загружаем версию Minecraft
                if 'minecraft_version' in config:
                    version = config['minecraft_version']
                    index = self.minecraft_version.findText(version)
                    if index >= 0:
                        self.minecraft_version.setCurrentIndex(index)
                
                # Загружаем версию Forge
                if 'forge_version' in config:
                    forge_version = config['forge_version']
                    index = self.forge_version.findText(forge_version)
                    if index >= 0:
                        self.forge_version.setCurrentIndex(index)
                
                # Загружаем флаги запуска
                if 'launch_flags' in config:
                    self.launch_flags_input.setPlainText(config['launch_flags'])
                
                # Загружаем настройку автообновления модов
                if 'auto_update_mods' in config:
                    self.auto_update_mods = config['auto_update_mods']
                    self.mods_update_switch = config['auto_update_mods']  # Синхронизация с переменной, используемой в логике
                    self.check_updates_button.setText(
                        "Отключить обновление модов" if self.auto_update_mods else "Включить обновление модов"
                    )
                
                # Загружаем тему
                if 'theme' in config:
                    if config['theme'] == 'dark':
                        self.dark_theme_radio.setChecked(True)
                    else:
                        self.light_theme_radio.setChecked(True)
                # Загружаем опцию закрытия лаунчера
                if 'close_launcher' in config:
                    self.close_launcher_checkbox.setChecked(config['close_launcher'])
                
        except Exception as e:
            logging.error(f"Ошибка при загрузке конфигурации: {str(e)}")
            # Используем значения по умолчанию
            self.install_path.setText(DEFAULT_MINECRAFT_DIR)
            self.install_path_str = DEFAULT_MINECRAFT_DIR

    def save_config(self):
        """Сохраняет настройки лаунчера"""
        if hasattr(self, 'is_loading') and self.is_loading:
            return
        try:
            minecraft_version = self.minecraft_version.currentText()
            forge_version = self.forge_version.currentText() if self.forge_version.isEnabled() else None
            
            config = {
                'username': self.username.text(),
                'memory': self.memory_slider.value(),
                'install_path': self.install_path.text(),  # Сохраняем текущий путь установки
                'minecraft_version': minecraft_version,
                'forge_version': forge_version,
                'launch_flags': self.launch_flags_input.toPlainText(),
                'auto_update_mods': self.mods_update_switch,
                'theme': 'dark' if self.dark_theme_radio.isChecked() else 'light',
                'close_launcher': self.close_launcher_checkbox.isChecked(),
                'language': self.language
            }
            
            # Создаём директорию конфига, если она не существует
            os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
            
            with open(CONFIG_FILE, 'w') as f:
                json.dump(config, f)
                
            logging.info(f"Настройки сохранены. Minecraft: {minecraft_version}, Forge: {forge_version}, Path: {self.install_path.text()}")
        except Exception as e:
            logging.error(f"Ошибка сохранения настроек: {str(e)}")

    def check_internet_connection(self):
        """Проверка подключения к интернету"""
        try:
            # Пробуем подключиться к надежному сервису
            requests.get("https://www.google.com", timeout=3)
            return True
        except requests.RequestException:
            return False

    def load_versions(self):
        logging.info("Начало загрузки версий")
        self.minecraft_version.clear()
        self.forge_version.clear()

        try:
            has_internet = self.check_internet_connection()
            if not has_internet:
                logging.warning("Нет подключения к интернету")
                translations = TRANSLATIONS.get(self.language, TRANSLATIONS['ru'])
                QMessageBox.warning(
                    self,
                    translations['no_internet_title'],
                    translations['no_internet_text']
                )
                
                # Загружаем сохраненные версии из кеша
                if os.path.exists(CONFIG_FILE):
                    with open(CONFIG_FILE, 'r') as f:
                        config = json.load(f)
                        saved_version = config.get('minecraft_version')
                        saved_forge = config.get('forge_version')
                        
                        if saved_version:
                            self.minecraft_version.addItem(saved_version)
                            self.minecraft_version.setCurrentText(saved_version)
                            
                            # Если версия не 1.20.1, добавляем "Не устанавливать"
                            if saved_version != "1.20.1":
                                self.forge_version.addItem("Не устанавливать")
                            
                            # Загружаем соответствующую версию Forge из кеша
                            if saved_version in self.forge_cache:
                                cached_version = self.forge_cache[saved_version]
                                if isinstance(cached_version, list):
                                    for forge_version in cached_version:
                                        forge_full_version = f"{saved_version}-forge-{forge_version.split('-')[1]}"
                                        self.forge_version.addItem(forge_full_version)
                                else:
                                    forge_full_version = f"{saved_version}-forge-{cached_version.split('-')[1]}"
                                    self.forge_version.addItem(forge_full_version)
                                self.forge_version.setEnabled(True)
                                
                                # Устанавливаем сохраненную версию Forge
                                if saved_forge and saved_forge != "None":
                                    index = self.forge_version.findText(saved_forge)
                                    if index >= 0:
                                        self.forge_version.setCurrentIndex(index)
                                    else:
                                        self.forge_version.setCurrentIndex(0)
                                else:
                                    # Если версия не 1.20.1, устанавливаем "Не устанавливать"
                                    if saved_version != "1.20.1":
                                        self.forge_version.setCurrentIndex(0)
                return

            # Загружаем версии Minecraft
            versions = []
            for v in minecraft_launcher_lib.utils.get_version_list():
                version_id = v['id']
                if (v['type'] == 'release' and 
                    version_id != '1.20.5' and
                    self._compare_versions(version_id, '1.20.1') >= 0):
                    versions.append(version_id)

            logging.info(f"Получены версии Minecraft: {versions}")

            # Сортируем версии в порядке убывания, но 1.20.1 всегда первая
            if '1.20.1' in versions:
                versions.remove('1.20.1')
                versions.sort(key=lambda x: [int(i) for i in x.split('.')], reverse=True)
                versions.insert(0, '1.20.1')
                logging.info("Версия 1.20.1 перемещена в начало списка")
            else:
                versions.sort(key=lambda x: [int(i) for i in x.split('.')], reverse=True)

            for version in versions:
                self.minecraft_version.addItem(version)

            # --- ДОБАВЛЕНО: выбираем последние сохранённые версии ---
            saved_version = None
            saved_forge = None
            if os.path.exists(CONFIG_FILE):
                with open(CONFIG_FILE, 'r') as f:
                    config = json.load(f)
                    saved_version = config.get('minecraft_version')
                    saved_forge = config.get('forge_version')

            # Если есть сохранённая версия — выбираем её
            if saved_version and self.minecraft_version.findText(saved_version) >= 0:
                self.minecraft_version.setCurrentText(saved_version)
            else:
                # По умолчанию выбираем 1.20.1, если есть
                idx_1201 = self.minecraft_version.findText('1.20.1')
                if idx_1201 >= 0:
                    self.minecraft_version.setCurrentIndex(idx_1201)
                else:
                    self.minecraft_version.setCurrentIndex(0)

            # После выбора версии — обновляем список Forge и выбираем сохранённую версию Forge
            self.on_minecraft_version_changed(self.minecraft_version.currentIndex())
            if saved_forge and self.forge_version.findText(saved_forge) >= 0:
                self.forge_version.setCurrentText(saved_forge)
            else:
                # По умолчанию выбираем 1.20.1-forge-47.3.22, если есть
                idx_forge = self.forge_version.findText('1.20.1-forge-47.3.22')
                if idx_forge >= 0:
                    self.forge_version.setCurrentIndex(idx_forge)
            # --- КОНЕЦ ДОБАВЛЕНИЯ ---

        except Exception as e:
            logging.error(f"Ошибка загрузки версий: {str(e)}", exc_info=True)
            QMessageBox.critical(
                self,
                "Ошибка",
                "Ошибка загрузки версий Minecraft. Проверьте подключение к интернету."
            )

    def _compare_versions(self, version1, version2):
        """Сравнивает две версии. Возвращает:
        1 если version1 > version2
        0 если version1 == version2
        -1 если version1 < version2"""
        v1_parts = [int(x) for x in version1.split('.')]
        v2_parts = [int(x) for x in version2.split('.')]
        
        for i in range(max(len(v1_parts), len(v2_parts))):
            v1 = v1_parts[i] if i < len(v1_parts) else 0
            v2 = v2_parts[i] if i < len(v2_parts) else 0
            if v1 > v2:
                return 1
            elif v1 < v2:
                return -1
        return 0

    def check_dependencies(self):
        """Проверяет наличие всех зависимостей"""
        try:
            self.status_update.emit("Проверка модов...")
            
            # Проверяем обновления модов
            if self.check_mods_update():
                logging.info("Требуется обновление модов")
                self.status_update.emit("Обновление модов...")
                self.install_modpack()
                return
            
            logging.info("Моды актуальны")
            
        except Exception as e:
            logging.error(f"Ошибка проверки зависимостей: {str(e)}")
            raise

    def load_forge_cache(self):
        """Загрузка кеша версий Forge"""
        logging.info("Загрузка кеша Forge")
        try:
            if os.path.exists(FORGE_CACHE_FILE):
                with open(FORGE_CACHE_FILE, 'r') as f:
                    cache = json.load(f)
                    logging.info(f"Загружен кеш Forge: {cache}")
                    return cache
            logging.info("Файл кеша не найден")
        except Exception as e:
            logging.error(f"Ошибка загрузки кеша Forge: {str(e)}", exc_info=True)
        return {}

    def save_forge_cache(self, minecraft_version, forge_version):
        """Сохранение версии Forge в кеш"""
        logging.info(f"Сохранение в кеш: {minecraft_version} -> {forge_version}")
        try:
            cache = self.forge_cache
            cache[minecraft_version] = forge_version
            with open(FORGE_CACHE_FILE, 'w') as f:
                json.dump(cache, f)
            logging.info(f"Кеш успешно сохранен: {cache}")
        except Exception as e:
            logging.error(f"Ошибка сохранения кеша Forge: {str(e)}", exc_info=True)

    def update_forge_versions(self):
        """Обновляет список версий Forge для текущей версии Minecraft"""
        try:
            selected_version = self.minecraft_version.currentText()
            if selected_version == "1.20.1":
                return  # Для 1.20.1 используем фиксированную версию
            
            # Получаем все доступные версии Forge
            forge_versions = minecraft_launcher_lib.forge.list_forge_versions()
            available_versions = []
            
            # Фильтруем версии для выбранной версии Minecraft
            for version in forge_versions:
                if version.startswith(selected_version):
                    available_versions.append(version)
            
            if available_versions:
                # Очищаем текущий список
                self.forge_version.clear()
                self.forge_version.addItem("Не устанавливать")
                
                # Добавляем новые версии
                for version in available_versions:
                    forge_display_version = f"{selected_version}-forge-{version.split('-')[1]}"
                    self.forge_version.addItem(forge_display_version)
                    # Сохраняем в кеш
                    self.add_to_forge_cache(selected_version, version)
                
                self.forge_version.setEnabled(True)
                self.status_label.setText(f"Найдено {len(available_versions)} версий Forge для {selected_version}")
            else:
                self.status_label.setText(f"Не найдено версий Forge для {selected_version}")
                
        except Exception as e:
            logging.error(f"Ошибка при обновлении версий Forge: {str(e)}", exc_info=True)
            self.status_label.setText("Ошибка при обновлении версий Forge")

    def on_minecraft_version_changed(self, index):
        selected_version = self.minecraft_version.currentText()
        self.forge_version.clear()
        self.forge_version.setEnabled(True)

        added_versions = set()

        # Для 1.20.1: сначала добавляем пункт "Не устанавливать", затем дефолтную версию, затем все >= 47.3.22
        if selected_version == "1.20.1":
            self.forge_version.addItem("Не устанавливать")
            default_forge_version = "1.20.1-47.3.22"
            default_forge_display = f"1.20.1-forge-47.3.22"
            self.forge_version.addItem(default_forge_display)
            added_versions = {default_forge_display}
            self.add_to_forge_cache("1.20.1", default_forge_version)
            self.forge_version.setEnabled(True)
            try:
                forge_versions = minecraft_launcher_lib.forge.list_forge_versions()
                for version in forge_versions:
                    if version.startswith("1.20.1"):
                        forge_number = version.split('-')[1]
                        def ver_tuple(s):
                            return tuple(int(x) for x in s.split('.'))
                        if ver_tuple(forge_number) >= ver_tuple("47.3.22"):
                            forge_display = f"1.20.1-forge-{forge_number}"
                            if forge_display not in added_versions:
                                self.forge_version.addItem(forge_display)
                                added_versions.add(forge_display)
                                self.add_to_forge_cache("1.20.1", version)
            except Exception as e:
                logging.error(f"Ошибка получения списка версий Forge для 1.20.1: {str(e)}")
            self.forge_version.setEnabled(True)
            self.forge_version.setCurrentIndex(1)
        else:
            self.forge_version.addItem("Не устанавливать")
            added_versions.add("Не устанавливать")
            self.update_forge_versions()

        self.setup_path()
        self.status_label.setText(f"Выбрана версия Minecraft: {selected_version}")
        self.check_game_installed()
        # Для 1.20.1 — по умолчанию дефолтная версия Forge, для других — "Не устанавливать"
        if selected_version == "1.20.1":
            self.forge_version.setCurrentIndex(1)
        else:
            self.forge_version.setCurrentIndex(0)
        self.save_config()

    def on_forge_version_changed(self, index):
        if index >= 0:
            forge_version = self.forge_version.currentText()
            self.status_label.setText(f"Выбрана версия Forge: {forge_version}")
            # Сохраняем выбранную версию Forge
            self.save_config()

    def on_memory_changed(self, value):
        self.memory_label.setText(f"{value} ГБ")
        self.save_config()  # Сохраняем конфиг при изменении значения памяти

    def start_installation(self):
        """Запускает установку или игру"""
        try:
            minecraft_version = self.minecraft_version.currentText()
            forge_display_version = self.forge_version.currentText() if self.forge_version.isEnabled() else None
            
            logging.info(f"Запуск установки/игры. Minecraft: {minecraft_version}, Forge: {forge_display_version}")
            
            # Проверка полей формы
            if not minecraft_version:
                QMessageBox.warning(self, "Ошибка", "Выберите версию Minecraft!")
                return
            
            username = self.username.text().strip()
            if not username:
                QMessageBox.warning(self, "Ошибка", "Введите имя игрока!")
                self.username.setFocus()
                return

            install_path = self.install_path.text().strip()
            
            # Проверяем наличие пути установки
            if not os.path.exists(install_path):
                try:
                    os.makedirs(install_path)
                    logging.info(f"Создана директория установки: {install_path}")
                except Exception as e:
                    logging.error(f"Ошибка создания директории: {str(e)}")
                    QMessageBox.critical(self, "Ошибка", f"Не удалось создать директорию установки: {str(e)}")
                    return
            
            if not os.access(install_path, os.W_OK):
                QMessageBox.critical(self, "Ошибка", "Нет прав на запись в выбранную папку!")
                return
            
            # Получаем значение памяти из слайдера
            memory_value = self.memory_slider.value()
            logging.info(f"Значение памяти из слайдера: {memory_value}GB")

            # Проверяем наличие подходящей версии Java
            logging.info(f"Проверка Java для версии {minecraft_version}")
            if not self.check_java_for_version(minecraft_version):
                logging.warning(f"Проверка Java для версии {minecraft_version} не пройдена")
                return
            
            # Определяем версию для установки
            forge_version = None
            if forge_display_version and forge_display_version != "Не устанавливать" and "forge" in forge_display_version.lower():
                try:
                    if '-forge-' in forge_display_version:
                        forge_parts = forge_display_version.split('-forge-')
                        if len(forge_parts) == 2:
                            forge_version = f"{minecraft_version}-{forge_parts[1]}"
                            logging.info(f"Извлечена версия Forge: {forge_version}")
                    else:
                        forge_version = forge_display_version
                        logging.info(f"Используем версию Forge как есть: {forge_version}")
                except Exception as e:
                    logging.error(f"Ошибка извлечения версии Forge: {str(e)}")
            
            # Определяем, что устанавливать - Forge или Vanilla
            version_to_install = forge_version if forge_version else minecraft_version
            logging.info(f"Выбрана версия для установки/запуска: {version_to_install}")

            # Создаем поток установки
            self.thread = InstallThread(
                version_to_install,
                username,
                install_path,
                memory_value,  # Передаем значение памяти из слайдера
                self.launch_flags_input,
                self.mods_update_switch
            )
            
            # Подключаем сигналы
            self.thread.progress_update.connect(self.update_progress)
            self.thread.status_update.connect(self.status_label.setText)
            self.thread.error_occurred.connect(self.show_error)
            self.thread.toggle_ui.connect(self.toggle_ui_elements)
            self.thread.finished.connect(self.on_install_thread_finished)
            self.thread.game_started.connect(self.on_game_started)
            # Запускаем поток установки
            self.thread.start()
            logging.info(f"Запущен поток установки/запуска игры с памятью {memory_value}GB")
            
        except Exception as e:
            logging.error(f"Ошибка запуска установки: {str(e)}", exc_info=True)
            QMessageBox.critical(self, "Ошибка", f"Не удалось запустить установку: {str(e)}")
            self.toggle_ui_elements(True)  # Разблокируем интерфейс в случае ошибки

    def on_install_thread_finished(self):
        # Не закрываем лаунчер здесь, закрытие теперь только через on_game_started
        pass

    def toggle_ui_elements(self, enabled):
        self.start_button.setEnabled(enabled)
        self.minecraft_version.setEnabled(enabled)
        self.forge_version.setEnabled(enabled)
        self.username.setEnabled(enabled)
        self.browse_button.setEnabled(enabled)

    def update_progress(self, current, maximum, message):
        """Обновляет прогресс-бар"""
        if maximum > 0:
            self.progress_bar.setMaximum(maximum)
        self.progress_bar.setValue(current)

    def show_error(self, message):
        translations = TRANSLATIONS.get(self.language, TRANSLATIONS['ru'])
        QMessageBox.critical(self, translations['error'], message)
        self.toggle_ui_elements(True)

    def check_game_installed(self):
        """Проверяет наличие игры и обновляет текст кнопки"""
        try:
            # Получаем и нормализуем путь
            raw_path = self.install_path.text().strip()
            if platform.system() == "Windows":
                # Убеждаемся, что путь начинается правильно для Windows
                if raw_path.startswith("C:"):
                    raw_path = "C:\\" + raw_path[2:]
                install_path = os.path.normpath(raw_path)
            else:
                install_path = os.path.normpath(raw_path)
            
            minecraft_version = self.minecraft_version.currentText()
            forge_version = self.forge_version.currentText() if self.forge_version.isEnabled() else None
            
            logging.info(f"=== Начало проверки установки игры ===")
            logging.info(f"Исходный путь: {raw_path}")
            logging.info(f"Путь установки (после нормализации): {install_path}")
            logging.info(f"Версия Minecraft: {minecraft_version}")
            logging.info(f"Версия Forge: {forge_version}")
            
            # Определяем, какую версию нужно проверять
            if forge_version == "Не устанавливать" or forge_version is None:
                # Проверяем наличие ванильной версии Minecraft
                version_to_check = minecraft_version
                logging.info("Проверяем ванильную версию Minecraft")
            else:
                # Проверяем наличие Forge версии
                version_to_check = forge_version
                logging.info("Проверяем версию Forge")
            
            logging.info(f"Версия для проверки: {version_to_check}")
            
            # Проверяем наличие конкретной версии в папке versions
            versions_path = os.path.join(install_path, "versions")
            version_folder = os.path.join(versions_path, version_to_check)
            is_installed = False
            
            logging.info(f"Путь к папке versions: {versions_path}")
            logging.info(f"Проверяемая папка версии: {version_folder}")
            logging.info(f"Папка versions существует: {os.path.exists(versions_path)}")
            logging.info(f"Папка версии существует: {os.path.exists(version_folder)}")
            
            # Проверяем наличие явной версии (либо Forge, либо ванильной)
            if os.path.exists(version_folder):
                if os.path.isdir(version_folder):
                    files = os.listdir(version_folder)
                    logging.info(f"Содержимое папки версии: {files}")
                    if files:  # Проверяем, что папка не пуста
                        is_installed = True
                        logging.info("Версия найдена в папке versions")
            
            # Если версия не найдена и это ванильная версия, проверяем в Forge
            if not is_installed and (forge_version == "Не устанавливать" or forge_version is None):
                logging.info("Версия не найдена напрямую, проверяем в папках Forge")
                # Проверяем, есть ли Forge-версии, которые могли установить ванильную версию
                if os.path.exists(versions_path):
                    for folder in os.listdir(versions_path):
                        logging.info(f"Проверяем папку: {folder}")
                        # Ищем папки с именами, содержащими версию Minecraft
                        if folder.startswith(f"{minecraft_version}-") and "forge" in folder.lower():
                            forge_folder = os.path.join(versions_path, folder)
                            logging.info(f"Найдена папка Forge: {forge_folder}")
                            # Проверяем, установлена ли внутри ванильная версия
                            vanilla_json = os.path.join(forge_folder, f"{minecraft_version}.json")
                            logging.info(f"Проверяем наличие файла: {vanilla_json}")
                            if os.path.exists(vanilla_json):
                                logging.info(f"Найден файл {minecraft_version}.json внутри папки Forge")
                                is_installed = True
                                break
            
            logging.info(f"Итоговый результат проверки установки: {is_installed}")
            
            # Находим кнопку удаления
            remove_button = self.findChild(QPushButton, "remove_version_button")
            
            translations = TRANSLATIONS.get(self.language, TRANSLATIONS['ru'])

            if is_installed:
                logging.info("Меняем текст кнопки на 'Играть'")
                self.start_button.setText(translations['start_button_play'])
                if not self.start_button.text() == translations['start_button_play']:
                    logging.error(f"Не удалось изменить текст кнопки на '{translations['start_button_play']}'")
                logging.info(f"Версия {version_to_check} найдена")
                # Включаем кнопку удаления
                if remove_button:
                    remove_button.setEnabled(True)
                    remove_button.setStyleSheet("""
                        QPushButton {
                            background-color: #DC143C;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            padding: 5px;
                        }
                        QPushButton:hover {
                            background-color: #B22222;
                        }
                    """)
            else:
                logging.info("Меняем текст кнопки на 'Установить'")
                self.start_button.setText(translations['start_button_install'])
                if not self.start_button.text() == translations['start_button_install']:
                    logging.error(f"Не удалось изменить текст кнопки на '{translations['start_button_install']}'")
                logging.info(f"Версия {version_to_check} не найдена")
                # Отключаем кнопку удаления
                if remove_button:
                    remove_button.setEnabled(False)
                    remove_button.setStyleSheet("""
                        QPushButton {
                            background-color: #CCCCCC;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            padding: 5px;
                        }
                    """)
            
            logging.info(f"Текущий текст кнопки: {self.start_button.text()}")
            logging.info("=== Конец проверки установки игры ===")
            
        except Exception as e:
            logging.error(f"Ошибка при проверке установки игры: {str(e)}", exc_info=True)
            self.start_button.setText("Установить")

    def add_to_forge_cache(self, minecraft_version, forge_version):
        try:
            if os.path.exists(FORGE_CACHE_FILE):
                with open(FORGE_CACHE_FILE, 'r') as f:
                    cache = json.load(f)
            else:
                cache = {}

            if minecraft_version not in cache:
                cache[minecraft_version] = [forge_version]
            elif isinstance(cache[minecraft_version], list):
                if forge_version not in cache[minecraft_version]:
                    cache[minecraft_version].append(forge_version)
            else:
                # Если раньше было строкой, преобразуем в список
                old_version = cache[minecraft_version]
                cache[minecraft_version] = [old_version, forge_version]

            with open(FORGE_CACHE_FILE, 'w') as f:
                json.dump(cache, f)
        except Exception as e:
            logging.error(f"Ошибка сохранения кеша Forge: {str(e)}")

    def open_youtube(self):
        """Открывает YouTube канал"""
        url = QUrl("https://www.youtube.com/@igrobar")  # Замените на вашу ссылку
        QDesktopServices.openUrl(url)
        logging.info("Открыта ссылка на YouTube")

    def open_telegram(self):
        """Открывает Telegram канал"""
        url = QUrl("https://t.me/igrobar")  # Замените на вашу ссылку
        QDesktopServices.openUrl(url)
        logging.info("Открыта ссылка на Telegram")

    def check_mods_update(self):
        """Проверяет обновления модов"""
        try:
            # Проверяем, что выбрана версия 1.20.1
            selected_version = self.minecraft_version.currentText()
            if selected_version != "1.20.1":
                logging.info(f"Проверка обновлений модов пропущена: версия {selected_version} не 1.20.1")
                return False

            # Проверяем, включено ли автообновление модов
            if not self.mods_update_checkbox.isChecked():
                logging.info("Автообновление модов отключено")
                return False
            
            logging.info("Начало проверки обновлений модов")
            
            # Проверяем наличие папки модов
            mods_path = os.path.join(self.install_path_str, "mods")
            if not os.path.exists(mods_path):
                os.makedirs(mods_path)
                logging.info(f"Создана папка модов: {mods_path}")
            
            # Получаем список доступных модов с GitHub
            try:
                api_url = "https://api.github.com/repos/IGROBAR/ib-launcher-modpack/contents/mods"
                response = requests.get(api_url, timeout=10)
                response.raise_for_status()
                github_mods = response.json()
                
                # Преобразуем в словарь для удобства
                github_mods_dict = {mod["name"]: mod for mod in github_mods if mod["name"].endswith(".jar")}
                
                # Получаем список установленных модов
                installed_mods = {}
                if os.path.exists(mods_path):
                    for file in os.listdir(mods_path):
                        if file.endswith('.jar'):
                            installed_mods[file] = os.path.getsize(os.path.join(mods_path, file))
                
                # Определяем необходимые обновления
                mods_to_update = {}
                
                # Проверяем новые и обновленные моды
                for github_mod_name, github_mod in github_mods_dict.items():
                    if github_mod_name not in installed_mods:
                        # Новый мод
                        mods_to_update[github_mod_name] = github_mod
                        logging.info(f"Обнаружен новый мод: {github_mod_name}")
                    elif int(github_mod["size"]) != installed_mods[github_mod_name]:
                        # Размер отличается - нужно обновить
                        mods_to_update[github_mod_name] = github_mod
                        logging.info(f"Обнаружено обновление мода: {github_mod_name}")
                
                # Проверяем устаревшие моды (не существующие на GitHub)
                for installed_mod in list(installed_mods.keys()):
                    if installed_mod not in github_mods_dict and installed_mod != "modpack_info.json":
                        # Устаревший мод - добавляем его к удалению
                        mods_to_update[installed_mod] = None
                        logging.info(f"Обнаружен устаревший мод: {installed_mod}")
                
                if mods_to_update:
                    # Спрашиваем пользователя, хочет ли он обновить моды
                    reply = QMessageBox.question(self, "Обновление модов", 
                                                f"Доступны обновления модов ({len(mods_to_update)} шт.). Обновить?", 
                                                QMessageBox.Yes | QMessageBox.No)
                    
                    if reply == QMessageBox.Yes:
                        # Удаляем устаревшие моды
                        for mod_name, mod_info in list(mods_to_update.items()):
                            if mod_info is None:
                                mod_path = os.path.join(mods_path, mod_name)
                                if os.path.exists(mod_path):
                                    os.remove(mod_path)
                                    logging.info(f"Удален устаревший мод: {mod_name}")
                                del mods_to_update[mod_name]
                        
                        # Обновляем моды
                        if mods_to_update:
                            return self.update_mods(mods_to_update, mods_path)
                        else:
                            QMessageBox.information(self, "Обновление модов", "Моды успешно обновлены")
                            return True
                else:
                    logging.info("Моды актуальны")
                    return True
                    
            except Exception as e:
                logging.error(f"Ошибка при проверке обновлений модов: {str(e)}", exc_info=True)
                QMessageBox.warning(self, "Ошибка", f"Ошибка при проверке обновлений модов: {str(e)}")
                return False
                
        except Exception as e:
            logging.error(f"Ошибка в методе check_mods_update: {str(e)}", exc_info=True)
            return False

    def install_modpack(self):
        """Устанавливает модпак"""
        try:
            self.status_update.emit("Проверка модпака...")
            
            # Подготавливаем папку mods
            install_path = self.install_path.text() if hasattr(self.install_path, 'text') else self.install_path
            mods_dir = os.path.join(install_path, "mods")
            os.makedirs(mods_dir, exist_ok=True)
            
            # Путь к файлу с информацией о модпаке
            modpack_info_file = os.path.join(mods_dir, "modpack_info.json")
            
            # Проверяем текущую информацию о модпаке
            current_modpack_info = {}
            if os.path.exists(modpack_info_file):
                with open(modpack_info_file, 'r') as f:
                    current_modpack_info = json.load(f)
            
            # Сначала проверяем локальный модпак
            local_modpack = resource_path(os.path.join("assets", "modpack.zip"))
            
            if os.path.exists(local_modpack):
                logging.info("Найден локальный модпак")
                modpack_path = local_modpack
               
                # Проверяем актуальность локального модпака
                local_size = os.path.getsize(local_modpack)
                if (current_modpack_info.get('size') == local_size and
                    all(os.path.exists(os.path.join(mods_dir, mod)) 
                        for mod in current_modpack_info.get('mods', []))):
                    logging.info("Моды актуальны")
                    return
            else:
                # Для exe версии проверяем GitHub
                self.status_update.emit("Проверка обновлений модпака...")
                api_url = "https://api.github.com/repos/mdreval/ib-launcher/releases/latest"
                response = requests.get(api_url, timeout=10)
                response.raise_for_status()
                release_data = response.json()
                
                modpack_asset = next((asset for asset in release_data['assets'] 
                                    if asset['name'] == 'modpack.zip'), None)
                if not modpack_asset:
                    raise ValueError("Модпак не найден в релизе")
                
                # Проверяем актуальность модов из GitHub
                if (current_modpack_info.get('size') == modpack_asset.get('size') and
                    all(os.path.exists(os.path.join(mods_dir, mod)) 
                        for mod in current_modpack_info.get('mods', []))):
                    logging.info("Моды актуальны")
                    return
                
                # Скачиваем модпак с отображением прогресса
                self.status_update.emit("Скачивание модпака...")
                response = requests.get(modpack_asset['browser_download_url'], stream=True)
                response.raise_for_status()
                
                # Получаем размер файла
                total_size = int(response.headers.get('content-length', 0))
                self.progress_update.emit(0, total_size, "")
                
                temp_dir = os.path.join(os.path.expanduser("~"), "AppData", "Local", "Temp", "IBLauncher")
                os.makedirs(temp_dir, exist_ok=True)
                temp_modpack = os.path.join(temp_dir, "modpack.zip")
                
                # Скачиваем с отображением прогресса
                downloaded_size = 0
                with open(temp_modpack, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            downloaded_size += len(chunk)
                            self.progress_update.emit(downloaded_size, total_size, "")
                
                modpack_path = temp_modpack
            
            # Получаем список установленных модов
            installed_mods = []
            
            # Удаляем старые моды
            if os.path.exists(mods_dir):
                for file in os.listdir(mods_dir):
                    if file.endswith('.jar'):
                        try:
                            os.remove(os.path.join(mods_dir, file))
                            logging.info(f"Удален старый мод: {file}")
                        except Exception as e:
                            logging.error(f"Ошибка удаления мода {file}: {str(e)}")
            
            # Распаковываем новые моды с отображением прогресса
            with zipfile.ZipFile(modpack_path, 'r') as zip_ref:
                # Получаем общее количество файлов для распаковки
                total_files = len([f for f in zip_ref.filelist if f.filename.endswith('.jar')])
                self.progress_update.emit(0, total_files, "")
                
                # Распаковываем файлы с обновлением прогресса
                extracted_files = 0
                for file_info in zip_ref.filelist:
                    if file_info.filename.endswith('.jar'):
                        zip_ref.extract(file_info.filename, mods_dir)
                        installed_mods.append(file_info.filename)
                        extracted_files += 1
                        self.progress_update.emit(extracted_files, total_files, "")
                        logging.info(f"Установлен мод: {file_info.filename}")
            
            # Сохраняем информацию о модпаке
            modpack_info = {
                'size': os.path.getsize(modpack_path),
                'updated_at': datetime.now().isoformat(),
                'mods': installed_mods
            }
            
            with open(modpack_info_file, 'w') as f:
                json.dump(modpack_info, f, indent=4)
            
            # Удаляем временный файл если он был создан
            if modpack_path != local_modpack:
                try:
                    os.remove(modpack_path)
                except Exception as e:
                    logging.error(f"Ошибка удаления временного файла: {str(e)}")
            
            logging.info("Модпак успешно установлен")
            self.status_update.emit("Модпак установлен")
            
        except Exception as e:
            logging.error(f"Ошибка установки модпака: {str(e)}")
            raise ValueError(f"Ошибка установки модпака: {str(e)}")

    def check_launcher_update(self):
        """Проверяет наличие обновлений лаунчера"""
        try:
            # Текущая версия лаунчера
            current_version = "1.0.8.9"
            
            # Получаем информацию о последнем релизе с GitHub
            api_url = "https://api.github.com/repos/mdreval/ib-launcher/releases/latest"
            response = requests.get(api_url, timeout=10, verify=True)
            response.raise_for_status()
            latest_release = response.json()
            latest_version = latest_release['tag_name'].lstrip('v')
            
            # Сравниваем версии
            if latest_version > current_version:
                # Спрашиваем пользователя об обновлении
                reply = QMessageBox.question(
                    self,
                    "Доступно обновление",
                    f"Доступна новая версия лаунчера (v{latest_version}). Хотите обновиться?",
                    QMessageBox.Yes | QMessageBox.No
                )
                
                if reply == QMessageBox.Yes:
                    # Открываем страницу релиза в браузере
                    webbrowser.open(latest_release['html_url'])
                    
                    # Показываем сообщение о необходимости закрыть лаунчер
                    QMessageBox.information(
                        self,
                        "Обновление",
                        "Пожалуйста, закройте лаунчер и установите новую версию."
                    )
            
        except Exception as e:
            logging.error(f"Ошибка проверки обновлений: {str(e)}")

    def update_version_label(self):
        """Обновляет метку версии в интерфейсе"""
        try:
            # Текущая версия лаунчера
            current_version = "1.0.8.9"
            
            # Пробуем получить последнюю версию с GitHub
            api_url = "https://api.github.com/repos/mdreval/ib-launcher/releases/latest"
            response = requests.get(api_url, timeout=10, verify=True)
            response.raise_for_status()
            latest_release = response.json()
            latest_version = latest_release['tag_name'].lstrip('v')
            
            translations = TRANSLATIONS.get(self.language, TRANSLATIONS['ru'])
            # Сравниваем версии
            if latest_version > current_version:
                # Если доступна новая версия, показываем обе
                self.version_label.setText(translations['update_available'].format(current=current_version, latest=latest_version))
                self.version_label.setStyleSheet("QLabel { color: #ff6b6b; }")  # Красный цвет для уведомления
            else:
                # Если версия актуальная
                self.version_label.setText(f"{translations['version_label']}{current_version}")
                self.version_label.setStyleSheet("QLabel { color: #666666; }")  # Возвращаем обычный цвет
            
        except Exception as e:
            logging.error(f"Ошибка получения версии: {str(e)}")
            translations = TRANSLATIONS.get(self.language, TRANSLATIONS['ru'])
            # При ошибке показываем только текущую версию
            self.version_label.setText(f"{translations['version_label']}{current_version}")

    def on_tab_changed(self, index):
        """Обработчик смены вкладки"""
        if index == 1:  # Индекс вкладки модов
            self.update_mods_list()
    
    def update_mods_list(self):
        """Обновляет список модов"""
        try:
            self.mods_list.clear()
            install_path = self.install_path.text().strip()
            mods_dir = os.path.join(install_path, "mods")
            
            if not os.path.exists(mods_dir):
                return
                
            for file in os.listdir(mods_dir):
                if file.endswith('.jar'):
                    # Убираем расширение .jar и форматируем имя
                    mod_name = file[:-4]
                    mod_name = mod_name.replace('-', ' ').replace('_', ' ').title()
                    self.mods_list.addItem(mod_name)
            
            translations = TRANSLATIONS.get(self.language, TRANSLATIONS['ru'])
            # Обновляем статус
            self.status_label.setText(translations['mods_found'].format(count=self.mods_list.count()))
            
        except Exception as e:
            logging.error(f"Ошибка обновления списка модов: {str(e)}")
            translations = TRANSLATIONS.get(self.language, TRANSLATIONS['ru'])
            self.status_label.setText(translations['mods_error'])
    
    def add_mods(self):
        """Добавляет новые моды"""
        try:
            translations = TRANSLATIONS.get(self.language, TRANSLATIONS['ru'])
            files, _ = QFileDialog.getOpenFileNames(
                self,
                translations['add_mods_title'],
                "",
                translations['mods_filter']
            )
            
            if not files:
                return
                
            install_path = self.install_path.text().strip()
            mods_dir = os.path.join(install_path, "mods")
            os.makedirs(mods_dir, exist_ok=True)
            
            for file in files:
                try:
                    shutil.copy2(file, os.path.join(mods_dir, os.path.basename(file)))
                    logging.info(f"Добавлен мод: {file}")
                except Exception as e:
                    logging.error(f"Ошибка копирования мода {file}: {str(e)}")
            
            self.update_mods_list()
            
        except Exception as e:
            logging.error(f"Ошибка добавления модов: {str(e)}")
            QMessageBox.critical(self, "Ошибка", f"Не удалось добавить моды: {str(e)}")
    
    def remove_selected_mods(self):
        """Удаляет выбранные моды"""
        try:
            # Получаем выбранные моды
            selected_items = self.mods_list.selectedItems()
            translations = TRANSLATIONS.get(self.language, TRANSLATIONS['ru'])
            
            if not selected_items:
                QMessageBox.information(self, translations['info'], translations['select_mods_to_remove'])
                return
            
            # Спрашиваем подтверждение
            response = QMessageBox.question(
                self,
                translations['confirm_remove_mods_title'],
                translations['confirm_remove_mods_text'].format(count=len(selected_items)),
                QMessageBox.Yes | QMessageBox.No
            )
            
            if response == QMessageBox.No:
                return
                
            # Удаляем файлы модов
            mods_dir = os.path.join(self.install_path_str, "mods")
            
            for item in selected_items:
                mod_name = item.text().lower().replace(' ', '-') + '.jar'
                mod_path = os.path.join(mods_dir, mod_name)
                try:
                    if os.path.exists(mod_path):
                        os.remove(mod_path)
                        logging.info(f"Удален мод: {mod_name}")
                except Exception as e:
                    logging.error(f"Ошибка удаления мода {mod_name}: {str(e)}")
            
            self.update_mods_list()
            
        except Exception as e:
            logging.error(f"Ошибка удаления модов: {str(e)}")
            QMessageBox.critical(self, "Ошибка", f"Не удалось удалить моды: {str(e)}")
    
    def toggle_auto_updates(self):
        """Включает/выключает автообновление модов"""
        try:
            translations = TRANSLATIONS.get(self.language, TRANSLATIONS['ru'])
            if self.check_updates_button.text() == translations['check_updates_button_on']:
                self.check_updates_button.setText(translations['check_updates_button_off'])
                # Сохраняем настройку
                config = {}
                if os.path.exists(CONFIG_FILE):
                    with open(CONFIG_FILE, 'r') as f:
                        config = json.load(f)
                config['auto_update_mods'] = False
                with open(CONFIG_FILE, 'w') as f:
                    json.dump(config, f)
                self.mods_update_switch= False
                self.check_updates_button.setStyleSheet("background-color: red; color:white; font-weight:bold;");

            else:
                self.check_updates_button.setText(translations['check_updates_button_on'])
                # Сохраняем настройку
                config = {}
                if os.path.exists(CONFIG_FILE):
                    with open(CONFIG_FILE, 'r') as f:
                        config = json.load(f)
                config['auto_update_mods'] = True
                with open(CONFIG_FILE, 'w') as f:
                    json.dump(config, f)
                self.mods_update_switch= True
                self.check_updates_button.setStyleSheet("background-color: #2E8B57; color:white; font-weight:bold;");
        except Exception as e:
            logging.error(f"Ошибка переключения автообновления: {str(e)}")
            self.mods_update_switch= True
            self.check_updates_button.setStyleSheet("background-color: #2E8B57; color:white; font-weight:bold;");

    def check_java_for_version(self, minecraft_version):
        """Проверяет соответствие Java и выбранной версии Minecraft"""
        logging.info(f"Проверка Java для версии {minecraft_version}")
        
        # Определяем требуемую версию Java для разных версий Minecraft
        requires_java24 = True  # Всегда используем Java 24
        
        # Анализируем версию Minecraft
        try:
            # Для всех версий Minecraft теперь требуется Java 24
            logging.info(f"Для версии {minecraft_version} требуется Java 24+")
        except Exception as e:
            logging.error(f"Ошибка анализа версии Minecraft: {str(e)}")
            # По умолчанию предполагаем, что требуется Java 24
            logging.info("По умолчанию используем Java 24")
        
        # Находим путь к Java
        java_path = self.find_java_path(requires_java24)
        
        if java_path:
            # Получаем версию Java
            java_version = self._get_java_version(java_path)
            logging.info(f"Найдена Java версии {java_version}")
            
            translations = TRANSLATIONS.get(self.language, TRANSLATIONS['ru'])
            # Проверяем соответствие версии
            if java_version < 24:
                result = QMessageBox.critical(
                    self, 
                    translations['java_version_error_title'], 
                    f"Для Minecraft {minecraft_version} требуется Java 24 или выше.\n"
                    f"Установлена версия: {java_version}\n"
                    f"Пожалуйста, установите более новую версию Java с сайта Oracle:\n"
                    f"https://www.oracle.com/java/technologies/downloads/#jdk24"
                )
                if result == QMessageBox.Ok:
                    QDesktopServices.openUrl(QUrl("https://www.oracle.com/java/technologies/downloads/#java24"))
            else:
                return True
        else:
            translations = TRANSLATIONS.get(self.language, TRANSLATIONS['ru'])
            # Java не найдена
            result = QMessageBox.critical(
                self, 
                translations['java_version_error_title'],
                f"Для Minecraft {minecraft_version} требуется Java 24, но она не найдена.\n"
                f"Пожалуйста, установите Java 24 с сайта Oracle:\n"
                f"https://www.oracle.com/java/technologies/downloads/#jdk24"
            )
            if result == QMessageBox.Ok:
                QDesktopServices.openUrl(QUrl("https://www.oracle.com/java/technologies/downloads/#java24"))
            return False

    def find_java_path(self, requires_java24=True):
        """
        Находит путь к Java на системе.
        
        Args:
            requires_java24 (bool): Если True, ищет Java 24+, иначе ищет Java 24+
        
        Returns:
            str: Путь к Java или None, если не найден
        """
        min_version = 24  # Всегда ищем Java 24+
        logging.info(f"Поиск Java {min_version}+ на системе...")
        
        found_java_paths = []
        
        # Сначала ищем через системные команды
        system_java = self._find_system_java()
        if system_java:
            logging.info(f"Найден системный Java: {system_java}")
            try:
                version = self._get_java_version(system_java)
                if version >= min_version:
                    logging.info(f"Системный Java соответствует требованиям: версия {version}")
                    return system_java
                else:
                    logging.info(f"Системный Java версии {version} ниже минимальной {min_version}")
                    found_java_paths.append((system_java, version))
            except Exception as e:
                logging.warning(f"Ошибка при проверке системного Java: {str(e)}")
        
        # Сканируем директории
        java_paths = self._scan_java_directories()
        logging.info(f"Найдено {len(java_paths)} путей Java для проверки")
        
        # Проверяем версии и собираем все подходящие
        for path in java_paths:
            try:
                version = self._get_java_version(path)
                if version > 0:  # Убедимся, что версия определена
                    found_java_paths.append((path, version))
                    logging.info(f"Найден Java {version} в {path}")
                    if version >= min_version:
                        logging.info(f"Java {version} соответствует минимальной версии {min_version}")
            except Exception as e:
                logging.warning(f"Ошибка при проверке {path}: {str(e)}")
        
        # Сортируем найденные пути по версии (от новых к старым)
        found_java_paths.sort(key=lambda x: x[1], reverse=True)
        
        # Ищем первый соответствующий требованиям
        for path, version in found_java_paths:
            if version >= min_version:
                logging.info(f"Выбран Java {version} ({path})")
                return path
        
        # Если не нашлось подходящей версии, но есть хоть какой-то Java
        if found_java_paths:
            best_path, best_version = found_java_paths[0]
            logging.warning(f"Не найден Java {min_version}+. Лучшая найденная версия: Java {best_version}")
            return None
        
        # Если Java не найден вообще
        logging.error(f"Java не найден на системе")
        
        msg = QMessageBox()
        msg.setIcon(QMessageBox.Critical)
        msg.setWindowTitle("Java не найден")
        
        msg.setText("Для запуска этой версии Minecraft требуется Java 24.\nJava не найден на вашей системе.")
        
        msg.setInformativeText("Хотите перейти на страницу загрузки Java?")
        msg.setStandardButtons(QMessageBox.Yes | QMessageBox.No)
        
        if msg.exec_() == QMessageBox.Yes:
            # Открываем ссылку для скачивания Java в зависимости от ОС
            system = platform.system()
            if system == "Windows":
                webbrowser.open("https://www.oracle.com/java/technologies/downloads/#java24")
            elif system == "Darwin":  # macOS
                webbrowser.open("https://www.oracle.com/java/technologies/downloads/#java24")
            else:  # Linux
                webbrowser.open("https://www.oracle.com/java/technologies/downloads/#java24")
        
        return None

    def _scan_java_directories(self):
        """Сканирует директории для поиска всех установленных Java"""
        java_paths = []
        
        if platform.system() == "Windows":
            # Расширенный список директорий для поиска Java в Windows
            root_dirs = [
                r'C:\Program Files\Java', 
                r'C:\Program Files (x86)\Java',
                r'C:\Program Files\Eclipse Adoptium', 
                r'C:\Program Files\Eclipse Temurin',
                r'C:\Program Files\Amazon Corretto', 
                r'C:\Program Files\Microsoft',
                r'C:\Program Files\AdoptOpenJDK',
                r'C:\Program Files\BellSoft\LibericaJDK',
                r'C:\Program Files\Zulu'
            ]
            
            # Также проверяем JAVA_HOME и PATH
            java_home = os.environ.get('JAVA_HOME')
            if java_home:
                java_bin = os.path.join(java_home, 'bin')
                if os.path.exists(java_bin):
                    root_dirs.append(java_bin)
                    
            # Ищем в каждой директории
            for root_dir in root_dirs:
                if os.path.exists(root_dir):
                    try:
                        # Сначала пробуем найти в корневой директории
                        for dir_name in os.listdir(root_dir):
                            if 'jdk' in dir_name.lower() or 'jre' in dir_name.lower():
                                # Проверяем и javaw.exe и java.exe
                                java_path = os.path.join(root_dir, dir_name, 'bin', 'javaw.exe')
                                if os.path.exists(java_path):
                                    java_paths.append(java_path)
                                    
                                java_path = os.path.join(root_dir, dir_name, 'bin', 'java.exe')
                                if os.path.exists(java_path):
                                    java_paths.append(java_path)
                                    
                        # Проверяем глубже для некоторых сложных структур
                        for dir_name in os.listdir(root_dir):
                            if os.path.isdir(os.path.join(root_dir, dir_name)):
                                subdir = os.path.join(root_dir, dir_name)
                                for subdir_name in os.listdir(subdir):
                                    if 'jdk' in subdir_name.lower() or 'jre' in subdir_name.lower():
                                        java_path = os.path.join(subdir, subdir_name, 'bin', 'javaw.exe')
                                        if os.path.exists(java_path):
                                            java_paths.append(java_path)
                    except Exception as e:
                        logging.error(f"Ошибка при сканировании директории {root_dir}: {str(e)}")
        
        elif platform.system() == "Darwin":  # macOS
            # macOS обычно хранит Java в /Library/Java/JavaVirtualMachines/
            root_dirs = [
                '/Library/Java/JavaVirtualMachines/',
                '/System/Library/Java/JavaVirtualMachines/',
                '/opt/homebrew/Cellar/openjdk',
                '/usr/local/opt/openjdk',
                '/opt/local/lib/openjdk',
                '/Applications/Eclipse JDK',    # Дополнительные места
                f'{os.path.expanduser("~")}/Library/Java/JavaVirtualMachines',  # Пользовательские установки
            ]
            
            for root_dir in root_dirs:
                if os.path.exists(root_dir):
                    try:
                        for dir_name in os.listdir(root_dir):
                            # В macOS ищем более общим шаблоном, чтобы захватить как jdk, так и openjdk и другие варианты
                            if 'jdk' in dir_name.lower() or 'java' in dir_name.lower() or 'openjdk' in dir_name.lower():
                                # Стандартный путь для macOS JDK
                                java_path = os.path.join(root_dir, dir_name, 'Contents/Home/bin/java')
                                if os.path.exists(java_path):
                                    java_paths.append(java_path)
                                    
                                # Альтернативный путь для некоторых дистрибутивов
                                java_path = os.path.join(root_dir, dir_name, 'bin/java')
                                if os.path.exists(java_path):
                                    java_paths.append(java_path)
                                    
                                # Для Homebrew версий
                                java_path = os.path.join(root_dir, dir_name, 'libexec/bin/java')
                                if os.path.exists(java_path):
                                    java_paths.append(java_path)
                                    
                                # Проверяем вложенные подпапки для версий
                                version_dir = os.path.join(root_dir, dir_name, 'Versions')
                                if os.path.exists(version_dir) and os.path.isdir(version_dir):
                                    try:
                                        for ver_dir in os.listdir(version_dir):
                                            java_path = os.path.join(version_dir, ver_dir, 'bin/java')
                                            if os.path.exists(java_path):
                                                java_paths.append(java_path)
                                    except Exception as e:
                                        logging.error(f"Ошибка при сканировании подпапки версий: {str(e)}")
                    except Exception as e:
                        logging.error(f"Ошибка при сканировании директории {root_dir}: {str(e)}")
                        
            # Проверяем пути установки через пакетные менеджеры
            homebrew_paths = [
                '/opt/homebrew/opt/openjdk/bin/java',
                '/opt/homebrew/opt/openjdk@21/bin/java',
                '/opt/homebrew/opt/openjdk@17/bin/java',
                '/usr/local/opt/openjdk/bin/java',
                '/usr/local/opt/openjdk@21/bin/java',
                '/usr/local/opt/openjdk@17/bin/java',
            ]
            
            for path in homebrew_paths:
                if os.path.exists(path):
                    java_paths.append(path)
                    
            # Попробуем найти через стандартные пути и символические ссылки
            for path in ['/usr/bin/java', '/usr/local/bin/java']:
                if os.path.exists(path):
                    java_paths.append(path)
        
        else:  # Linux
            # Типичные пути для Linux
            root_dirs = [
                '/usr/lib/jvm',
                '/usr/java',
                '/opt/java',
                '/opt/jdk',
                '/usr/local/java',
                '/opt/oracle',
                '/usr/local/lib/jvm',
                '/snap/jdk',
                '/snap/openjdk',
            ]
            
            for root_dir in root_dirs:
                if os.path.exists(root_dir):
                    try:
                        for dir_name in os.listdir(root_dir):
                            if ('java' in dir_name.lower() or 'jdk' in dir_name.lower() or 'jre' in dir_name.lower()):
                                java_path = os.path.join(root_dir, dir_name, 'bin/java')
                                if os.path.exists(java_path):
                                    java_paths.append(java_path)
                    except Exception as e:
                        logging.error(f"Ошибка при сканировании директории {root_dir}: {str(e)}")
                        
            # Проверяем стандартные бинарные директории
            for path in ['/usr/bin/java', '/usr/local/bin/java', '/bin/java']:
                if os.path.exists(path):
                    java_paths.append(path)
        
        return java_paths
        
    def _find_system_java(self):
        """Находит Java через системные команды (where/which)"""
        try:
            system = platform.system()
            
            if system == "Darwin" or system == "Linux":  # macOS или Linux
                cmd = ['which', 'java']
            else:  # Windows
                cmd = ['where', 'javaw']
                
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True,
                creationflags=subprocess.CREATE_NO_WINDOW if system == "Windows" else 0
            )
            
            if result.returncode == 0:
                paths = result.stdout.strip().split('\n')
                if paths and paths[0]:
                    return paths[0]
        except Exception as e:
            logging.warning(f"Ошибка поиска Java через системные команды: {str(e)}")
            
        return None

    def _get_java_version(self, java_path):
        """Получает версию Java из пути"""
        try:
            # Заменяем javaw.exe на java.exe для лучшей совместимости
            java_exe = java_path.replace('javaw.exe', 'java.exe')
            logging.info(f"Проверка версии исполняемым файлом: {java_exe}")
            
            result = subprocess.run(
                [java_exe, '-version'],
                capture_output=True,
                text=True
            )

            # Java выводит информацию о версии в stderr
            version_output = result.stderr if result.stderr else result.stdout
            logging.info(f"Вывод команды java -version: {version_output}")

            # Извлекаем версию Java
            # Формат может быть "1.8.0_301" (Java 8) или "11.0.2" (Java 11+) или просто "17" (Java 17)
            version_pattern = r'version "([^"]+)"'
            match = re.search(version_pattern, version_output)
            
            if not match:
                # Альтернативный шаблон для OpenJDK
                version_pattern = r'openjdk version "([^"]+)"'
                match = re.search(version_pattern, version_output)
            
            if match:
                version_string = match.group(1)
                logging.info(f"Найдена строка версии Java: {version_string}")
                
                # Определяем основной номер версии
                if version_string.startswith("1."):
                    # Старый формат версии (1.8 = Java 8)
                    try:
                        major_version = int(version_string.split('.')[1])
                        logging.info(f"Определена старая версия Java: 1.{major_version} -> Java {major_version}")
                        return major_version
                    except Exception as e:
                        logging.error(f"Ошибка при парсинге старой версии Java: {str(e)}")
                        return 0
                else:
                    # Новый формат версии (11.0.2 = Java 11, 17.0.1 = Java 17, 21 = Java 21)
                    try:
                        major_version = int(version_string.split('.')[0])
                        logging.info(f"Определена новая версия Java: {major_version}")
                        return major_version
                    except Exception as e:
                        # Последняя попытка - извлечь первое число
                        try:
                            major_version = int(re.search(r'(\d+)', version_string).group(1))
                            logging.info(f"Определена версия Java по первому числу: {major_version}")
                            return major_version
                        except:
                            logging.error(f"Ошибка при парсинге новой версии Java: {str(e)}")
                            return 0
            else:
                logging.warning("Не удалось определить версию Java из вывода")
                return 0
        except Exception as e:
            logging.error(f"Ошибка получения версии Java: {str(e)}")
            return 0

    def install_game(self):
        """Установка игры"""
        try:
            # Проверяем, что выбрана версия Minecraft
            selected_version = self.minecraft_version.currentText()
            if not selected_version:
                QMessageBox.warning(self, "Ошибка", "Выберите версию Minecraft")
                return
            
            # Получаем имя пользователя
            username = self.username.text().strip()
            if not username:
                QMessageBox.warning(self, "Ошибка", "Введите имя пользователя")
                return
            
            # Получаем путь установки
            install_path = self.install_path.text().strip()
            if not os.path.exists(install_path):
                os.makedirs(install_path, exist_ok=True)
            
            # Проверяем доступность записи в указанный путь
            if not os.access(install_path, os.W_OK):
                QMessageBox.critical(self, "Ошибка", "Нет прав на запись в выбранную папку!")
                return
            
            # Проверяем наличие Java в зависимости от выбранной версии
            #if not self.check_java_for_version(selected_version):
            #    QMessageBox.warning(self, "Ошибка", f"Требуется соответствующая версия Java для Minecraft {selected_version}")
            #    return
            
            # Проверка Forge
            forge_selected = (
                self.forge_version.isEnabled() and 
                self.forge_version.currentText() != "Не устанавливать"
            )
            
            if forge_selected:
                # Сначала устанавливаем базовую версию Minecraft
                self.status_label.setText(f"Установка Minecraft {selected_version}...")
                minecraft_launcher_lib.install.install_minecraft_version(
                    versionid=selected_version,
                    minecraft_directory=install_path,
                    callback={
                        'setStatus': lambda text: self.status_label.setText(text),
                        'setProgress': lambda val: self.progress_bar.setValue(val),
                        'setMax': lambda val: self.progress_bar.setMaximum(val)
                    }
                )
                
                # Затем устанавливаем Forge
                forge_version = self.forge_version.currentText()
                forge_version_id = forge_version.replace(f"{selected_version}-forge-", f"{selected_version}-")
                self.status_label.setText(f"Установка Forge {forge_version_id}...")
                
                minecraft_launcher_lib.forge.install_forge_version(
                    forge_version_id,
                    install_path,
                    callback={
                        'setStatus': lambda text: self.status_label.setText(text),
                        'setProgress': lambda val: self.progress_bar.setValue(val),
                        'setMax': lambda val: self.progress_bar.setMaximum(val)
                    }
                )
                
                # Добавляем версию Forge в кеш
                self.add_to_forge_cache(selected_version, forge_version_id)
                
                # Для 1.20.1 с Forge устанавливаем модпак
                if selected_version == "1.20.1" and self.mods_update_checkbox.isChecked():
                    self.install_modpack()
            else:
                # Установка только Minecraft без Forge
                self.status_label.setText(f"Установка Minecraft {selected_version}...")
                minecraft_launcher_lib.install.install_minecraft_version(
                    versionid=selected_version,
                    minecraft_directory=install_path,
                    callback={
                        'setStatus': lambda text: self.status_label.setText(text),
                        'setProgress': lambda val: self.progress_bar.setValue(val),
                        'setMax': lambda val: self.progress_bar.setMaximum(val)
                    }
                )
            
            self.status_label.setText(f"Minecraft {selected_version} установлен")
            self.start_button.setText("Играть")
            
            # Проверяем успешность установки
            self.check_game_installed()
            
        except Exception as e:
            logging.error(f"Ошибка установки игры: {str(e)}", exc_info=True)
            QMessageBox.critical(self, "Ошибка", f"Не удалось установить игру: {str(e)}")
            self.status_label.setText("Произошла ошибка при установке")

    def on_install_path_changed(self):
        """Обработчик изменения пути установки"""
        try:
            # Сохраняем новый путь в конфигурации
            self.save_config()
            # Проверяем установку игры
            self.check_game_installed()
        except Exception as e:
            logging.error(f"Ошибка при обработке изменения пути установки: {str(e)}")

    def remove_version(self):
        """Удаляет выбранную версию игры"""
        try:
            # Получаем текущие версии
            minecraft_version = self.minecraft_version.currentText()
            forge_version = self.forge_version.currentText() if self.forge_version.isEnabled() else None
            install_path = self.install_path.text().strip()

            # Определяем, какую версию нужно удалить
            if forge_version == "Не устанавливать" or forge_version is None:
                version_to_remove = minecraft_version
            else:
                version_to_remove = forge_version

            # Спрашиваем подтверждение
            reply = QMessageBox.question(
                self,
                "Подтверждение удаления",
                f"Вы уверены, что хотите удалить версию {version_to_remove} и все связанные файлы?",
                QMessageBox.Yes | QMessageBox.No
            )

            if reply == QMessageBox.No:
                return

            # Функция для обработки ошибок при удалении защищённых файлов
            def on_rm_error(func, path, exc_info):
                import stat
                try:
                    os.chmod(path, stat.S_IWRITE)
                    func(path)
                except Exception:
                    pass

            # Удаляем всю папку установки
            if os.path.exists(install_path):
                import shutil
                try:
                    # Удаляем всю папку установки с обработчиком ошибок
                    shutil.rmtree(install_path, onerror=on_rm_error)
                    logging.info(f"Удалена папка установки: {install_path}")

                    # Обновляем состояние кнопок
                    self.check_game_installed()

                    # Показываем сообщение об успешном удалении
                    QMessageBox.information(
                        self,
                        "Удаление завершено",
                        f"Версия {version_to_remove} и все связанные файлы успешно удалены."
                    )
                except Exception as e:
                    logging.error(f"Ошибка при удалении папки установки: {str(e)}")
                    raise
            else:
                logging.warning(f"Папка установки не найдена: {install_path}")
                QMessageBox.warning(
                    self,
                    "Предупреждение",
                    "Папка установки не найдена."
                )

        except Exception as e:
            logging.error(f"Ошибка при удалении версии: {str(e)}", exc_info=True)
            QMessageBox.critical(
                self,
                "Ошибка",
                f"Не удалось удалить версию: {str(e)}"
            )

    def get_natives_path(self):
        """Определяет путь к нативным библиотекам в зависимости от архитектуры"""
        if platform.system() != "Darwin":
            return None
            
        arch = platform.machine()
        if arch == 'arm64':
            return "-natives-macos-arm64"
        else:
            return "-natives-macos"

    def _launch_game(self):
        """Запускает игру"""
        try:
            # Проверяем наличие имени пользователя
            if not self.username:
                self.error_occurred.emit("Введите имя пользователя")
                return

            logging.info(f"Запуск игры с памятью: {self.memory}GB")
            
            # Очищаем переменную окружения _JAVA_OPTIONS
            if '_JAVA_OPTIONS' in os.environ:
                del os.environ['_JAVA_OPTIONS']
                logging.info("Очищена переменная окружения _JAVA_OPTIONS")
            
            # Определяем версию для запуска
            version_to_launch = self.version
            
            # Проверяем наличие ванильной или Forge версии
            versions_dir = os.path.join(self.install_path, "versions")
            
            # Если нам нужно запустить ванильную версию (без Forge)
            if "-" not in version_to_launch:
                vanilla_dir = os.path.join(versions_dir, version_to_launch)
                
                # Если прямой установки ванильной версии нет, но есть Forge
                if not os.path.exists(vanilla_dir) or not os.listdir(vanilla_dir):
                    # Проверяем, установлена ли ванильная версия как часть Forge
                    for folder in os.listdir(versions_dir) if os.path.exists(versions_dir) else []:
                        if folder.startswith(f"{version_to_launch}-") and "forge" in folder.lower():
                            logging.info(f"Ванильная версия {version_to_launch} недоступна напрямую, используем версию внутри Forge")
                            # Будем запускать Forge, но без модов (как ванильную версию)
                            version_to_launch = folder
                            break
            # Если это Forge версия, форматируем её правильно
            elif "-" in version_to_launch:
                # Проверяем, есть ли уже префикс forge
                if "forge" not in version_to_launch.lower():
                    version_to_launch = version_to_launch.replace("-", "-forge-", 1)
            
            logging.info(f"Запуск версии: {version_to_launch}")
            
            # Формируем опции запуска с оптимизированными параметрами
            options = {
                'username': self.username,
                'uuid': '60a69d1e-3db8-41ae-a14b-9b5a3a8be00d',
                'token': '',
                'jvmArguments': [
                    f'-Xmx{self.memory}G',
                    '-XX:+UnlockExperimentalVMOptions',
                    '-XX:+UseG1GC',
                    '-XX:G1NewSizePercent=20',
                    '-XX:G1ReservePercent=20',
                    '-XX:MaxGCPauseMillis=50',
                    '-XX:G1HeapRegionSize=32M',
                    '-Dfml.ignoreInvalidMinecraftCertificates=true',
                    '-Dfml.ignorePatchDiscrepancies=true',
                    '-Djava.net.preferIPv4Stack=true',
                    '-Dlog4j2.formatMsgNoLookups=true',
                    '-XX:+DisableAttachMechanism',  # Ускоряет запуск
                    '-XX:+UseStringDeduplication',  # Оптимизация памяти
                    '-XX:+OptimizeStringConcat',    # Оптимизация строк
                    '-XX:+UseCompressedOops'        # Оптимизация указателей
                ],
                'launchTarget': 'fmlclient',
                'executablePath': self.find_java_path(True),
                'gameDirectory': os.path.abspath(self.install_path)
            }

            # Добавляем специальные аргументы для macOS
            if platform.system() == "Darwin":
                options['jvmArguments'].insert(0, '-XstartOnFirstThread')
                if platform.machine() == 'arm64':
                    options['jvmArguments'].append('-Dos.arch=aarch64')

            # Проверяем, является ли версия новым Forge
            is_forge_version = "forge" in version_to_launch.lower()
            
            try:
                if is_forge_version:
                    # Получаем команду запуска для Forge
                    command = get_forge_launch_command(version_to_launch, self.install_path, options)
                    if command:
                        process = launch_forge_with_command(command)
                        if process:
                            logging.info(f"Игра успешно запущена с PID: {process.pid}")
                            self.game_started.emit()
                            return
                        else:
                            raise Exception("Не удалось запустить Forge")
                    else:
                        raise Exception("Не удалось сформировать команду запуска Forge")
                else:
                    # Запускаем ванильную версию
                    command = get_minecraft_command(version_to_launch, self.install_path, options)
                    
                    if platform.system() == "Windows" and HAS_WIN32API:
                        pid = launch_process_hidden(command, cwd=self.install_path)
                        if pid:
                            logging.info(f"Игра успешно запущена с PID: {pid}")
                            self.game_started.emit()
                            return
                        else:
                            logging.warning("Запуск через WinAPI не удался, используем стандартный метод")
                    
                    # Создаем флаги для Windows
                    creation_flags = 0x08000008 if platform.system() == "Windows" else 0
                    
                    # Запускаем процесс с оптимизированными настройками
                    process = subprocess.Popen(
                        command,
                        creationflags=creation_flags,
                        stdin=subprocess.DEVNULL,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        cwd=os.path.abspath(self.install_path),
                        close_fds=True,
                        start_new_session=True
                    )
                    
                    if process:
                        logging.info(f"Игра успешно запущена с PID: {process.pid}")
                        self.game_started.emit()
                        return
                    else:
                        raise Exception("Не удалось запустить игру")
            except minecraft_launcher_lib.exceptions.VersionNotFound as e:
                logging.error(f"Версия {version_to_launch} не найдена. Проверяем альтернативные варианты...")
                
                # Пробуем найти подходящую версию
                if is_forge_version:
                    # Извлекаем базовую версию Minecraft
                    base_version = version_to_launch.split("-forge-")[0]
                    forge_version = version_to_launch.split("-forge-")[1]
                    
                    # Ищем установленные версии Forge
                    forge_versions = []
                    if os.path.exists(versions_dir):
                        for folder in os.listdir(versions_dir):
                            if folder.startswith(f"{base_version}-forge-"):
                                forge_versions.append(folder)
                    
                    if forge_versions:
                        # Берем последнюю установленную версию Forge
                        version_to_launch = sorted(forge_versions)[-1]
                        logging.info(f"Найдена альтернативная версия Forge: {version_to_launch}")
                        
                        # Повторяем попытку запуска с новой версией
                        if is_forge_version:
                            command = get_forge_launch_command(version_to_launch, self.install_path, options)
                        else:
                            command = get_minecraft_command(version_to_launch, self.install_path, options)
                        
                        if command:
                            process = launch_forge_with_command(command)
                            if process:
                                logging.info(f"Игра успешно запущена с PID: {process.pid}")
                                self.game_started.emit()
                                return
                raise Exception(f"Не удалось найти подходящую версию для запуска: {str(e)}")

        except Exception as e:
            logging.error(f"Ошибка запуска игры: {str(e)}", exc_info=True)
            self.error_occurred.emit(f"Ошибка запуска игры: {str(e)}")

    def update_players_online(self):
        ip = "135.181.237.56"
        port = 25970
        online = get_minecraft_online(ip, port)
        translations = TRANSLATIONS.get(self.language, TRANSLATIONS['ru'])
        if online is None:
            self.players_online_label.setText(f'<span style="color:#DC143C;font-weight:bold;">{translations["server_offline"]}</span>')
        else:
            self.players_online_label.setText(f'{translations["players_online_label"]}<span style="color:#2E8B57;font-weight:bold;">{online}</span>')

    def on_theme_changed(self):
        self.apply_theme()
        self.save_config()

    def apply_theme(self):
        # Смена логотипа в зависимости от темы
        logo_label = self.findChild(QLabel, "logo")
        if self.dark_theme_radio.isChecked():
            if logo_label:
                logo_label.setPixmap(QPixmap(resource_path(os.path.join("assets", "title2.png"))))
        else:
            if logo_label:
                logo_label.setPixmap(QPixmap(resource_path(os.path.join("assets", "title.png"))))
        if self.dark_theme_radio.isChecked():
            self.setStyleSheet("""
                QWidget { background-color: #23272e; color: #e0e0e0; }
                QLineEdit, QPlainTextEdit, QComboBox, QGroupBox, QTabWidget, QSlider, QCheckBox, QRadioButton {
                    background-color: #2c313c; color: #e0e0e0; border-color: #444;
                }
                QGroupBox {
                    font-size: 10pt;
                    font-weight: bold;
                    border: 2px solid #cccccc;
                    border-radius: 6px;
                    margin-top: 1ex;
                    padding: 10px;
                }
                QGroupBox::title {
                    subcontrol-origin: margin;
                    left: 10px;
                    padding: 0 5px;
                }
                QTabWidget::pane {
                    border: 2px solid #23272e;
                    background: #23272e;
                }
                QTabBar::tab {
                    background: #2c313c;
                    color: #e0e0e0;
                    border: 1px solid #444;
                    border-bottom: none;
                    padding: 8px 20px 8px 20px;
                    min-width: 80px;
                    font-weight: bold;
                }
                QTabBar::tab:selected {
                    background: #23272e;
                    color: #fff;
                    border-bottom: 2px solid #2E8B57;
                }
                QTabBar::tab:!selected {
                    margin-top: 2px;
                }
                QTabBar::tab:hover {
                    background: #3a3f4b;
                }
                QComboBox {
                    padding: 2px;
                    border: 2px solid #ccc;
                    border-radius: 4px;
                    background: #23272e;
                    color: #e0e0e0;
                    min-height: 23px;
                    font-size: 8pt;
                }
                QComboBox QAbstractItemView {
                    background: #23272e;
                    color: #e0e0e0;
                    selection-background-color: #2E8B57;
                    selection-color: #fff;
                }
                QComboBox::drop-down {
                    border: none;
                    padding-right: 5px;
                }
                QComboBox::down-arrow {
                    image: url(assets/arrow.png);
                    width: 12px;
                    height: 12px;
                }
                QComboBox:hover {
                    border-color: #2E8B57;
                }
                QPlainTextEdit {
                    padding: 5px;
                    border: 2px solid #ccc;
                    border-radius: 4px;
                    background: #23272e;
                    color: #e0e0e0;
                    font-size: 9pt;
                }
                QPlainTextEdit:focus {
                    border-color: #8B0000;
                }
                QPushButton {
                    background-color: #2E8B57;
                    color: #fff;
                }
                QProgressBar { background: #23272e; color: #fff; border: 1px solid #444; }
                QLabel#memory_title, QLabel#launch_flags_title { background-color: transparent; }
            """)
        else:
            self.setStyleSheet("""
                QWidget { background-color: #f5f5f5; color: #23272e; }
                QLineEdit, QPlainTextEdit, QComboBox, QGroupBox, QTabWidget, QSlider, QCheckBox, QRadioButton {
                    background-color: #fff; color: #23272e; border-color: #ccc;
                }
                QGroupBox {
                    font-size: 10pt;
                    font-weight: bold;
                    border: 1.5px solid #cccccc;
                    border-radius: 6px;
                    margin-top: 1ex;
                    padding: 10px;
                }
                QGroupBox::title {
                    subcontrol-origin: margin;
                    left: 10px;
                    padding: 0 5px;
                }
                QTabWidget::pane {
                    border: 2px solid #f5f5f5;
                    background: #f5f5f5;
                }
                QTabBar::tab {
                    background: #fff;
                    color: #23272e;
                    border: 1px solid #ccc;
                    border-bottom: none;
                    padding: 8px 20px 8px 20px;
                    min-width: 80px;
                    font-weight: bold;
                }
                QTabBar::tab:selected {
                    background: #f5f5f5;
                    color: #23272e;
                    border-bottom: 2px solid #2E8B57;
                }
                QTabBar::tab:!selected {
                    margin-top: 2px;
                }
                QTabBar::tab:hover {
                    background: #eaeaea;
                }
                QComboBox {
                    padding: 2px;
                    border: 2px solid #ccc;
                    border-radius: 4px;
                    background: #fff;
                    color: #23272e;
                    min-height: 23px;
                    font-size: 8pt;
                }
                QComboBox QAbstractItemView {
                    background: #fff;
                    color: #23272e;
                    selection-background-color: #2E8B57;
                    selection-color: #fff;
                }
                QComboBox::drop-down {
                    border: none;
                    padding-right: 5px;
                }
                QComboBox::down-arrow {
                    image: url(assets/arrow.png);
                    width: 12px;
                    height: 12px;
                }
                QComboBox:hover {
                    border-color: #2E8B57;
                }
                QPlainTextEdit {
                    padding: 5px;
                    border: 2px solid #ccc;
                    border-radius: 4px;
                    background: #fff;
                    color: #23272e;
                    font-size: 9pt;
                }
                QPlainTextEdit:focus {
                    border-color: #8B0000;
                }
                QPushButton {
                    background-color: #2E8B57;
                    color: #fff;
                }
                QProgressBar { background: #f5f5f5; color: #23272e; border: 1px solid #ccc; }
                QLabel#memory_title, QLabel#launch_flags_title { background-color: transparent; }
            """)
            # Сбросить стили для QTabWidget, QTabBar, QComboBox, QPlainTextEdit, чтобы они были светлыми
            self.tabWidget.setStyleSheet("")
            self.findChild(QTabBar).setStyleSheet("")
            self.minecraft_version.setStyleSheet("")
            self.forge_version.setStyleSheet("")
            self.launch_flags_input.setStyleSheet("")

    def on_game_started(self):
        # Слот вызывается, когда игра действительно стартовала
        if self.close_launcher_checkbox.isChecked():
            import logging
            logging.info('on_game_started called, setting status and starting timer')
            label = self.findChild(QLabel, 'status_label')
            translations = TRANSLATIONS.get(self.language, TRANSLATIONS['ru'])
            if label:
                label.setText(translations['game_launching_text'])
            else:
                print('status_label not found!')
            QTimer.singleShot(20000, self.close)

# Функция для запуска процесса в Windows без показа окон
def launch_process_hidden(command, cwd=None):
    """
    Запускает процесс в Windows без показа командного окна, 
    используя непосредственно WinAPI.
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
        startupinfo.wShowWindow = win32con.SW_HIDE
        
        # Запускаем процесс с дополнительными флагами для оптимизации
        process_info = win32process.CreateProcess(
            None,
            command_str,
            None,
            None,
            0,
            win32process.CREATE_NO_WINDOW | win32process.DETACHED_PROCESS | win32process.CREATE_NEW_PROCESS_GROUP,
            None,
            cwd,
            startupinfo
        )
        
        # Освобождаем дескрипторы
        win32api.CloseHandle(process_info[0])
        win32api.CloseHandle(process_info[1])
        
        pid = process_info[2]
        logging.info(f"Процесс успешно запущен с PID: {pid}")
        return pid
    except Exception as e:
        logging.error(f"Ошибка при запуске процесса через WinAPI: {str(e)}", exc_info=True)
        return None

def launch_forge_with_command(command):
    """Запускает Forge, используя сформированную команду"""
    try:
        logging.info(f"Запуск Forge с командой длиной {len(command)} аргументов")
        
        minecraft_dir = None
        for arg in command:
            if "--gameDir" in arg:
                idx = command.index(arg)
                if idx + 1 < len(command):
                    minecraft_dir = command[idx + 1]
                    logging.info(f"Используем рабочую директорию: {minecraft_dir}")
                    break
        
        if minecraft_dir and not os.path.exists(minecraft_dir):
            logging.warning(f"Рабочая директория {minecraft_dir} не существует, пытаемся создать")
            os.makedirs(minecraft_dir, exist_ok=True)
        
        if not minecraft_dir:
            minecraft_dir = os.getcwd()
            logging.warning(f"Не удалось найти рабочую директорию в аргументах, используем текущую: {minecraft_dir}")
        
        if platform.system() == "Windows" and HAS_WIN32API:
            # Используем оптимизированный метод запуска для Windows
            pid = launch_process_hidden(command, cwd=minecraft_dir)
            if pid:
                class PseudoProcess:
                    def __init__(self, pid):
                        self.pid = pid
                return PseudoProcess(pid)
            else:
                logging.warning("Запуск через WinAPI не удался, используем стандартный метод")
        
        # Для других ОС или если WinAPI не сработал
        creation_flags = 0
        if platform.system() == "Windows":
            creation_flags = 0x08000008  # CREATE_NO_WINDOW | DETACHED_PROCESS
            
        try:
            # Специальная обработка для macOS
            if platform.system() == "Darwin":
                process = subprocess.Popen(
                    command,
                    cwd=minecraft_dir,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                    shell=False,
                    start_new_session=True
                )
            else:
                # Для Windows и Linux используем оптимизированные настройки
                process = subprocess.Popen(
                    command,
                    cwd=minecraft_dir,
                    creationflags=creation_flags if platform.system() == "Windows" else 0,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                    shell=False,
                    start_new_session=True,
                    close_fds=True
                )
            logging.info(f"Forge успешно запущен через subprocess, PID: {process.pid}")
            return process
        except Exception as e:
            logging.error(f"Ошибка при запуске процесса через subprocess: {str(e)}", exc_info=True)
            return None
            
    except Exception as e:
        logging.error(f"Ошибка при запуске Forge: {str(e)}", exc_info=True)
        return None

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
        
        # Проверяем если это 1.21.x или выше
        if minecraft_version.startswith("1.21"):
            logging.info(f"Версия {version} является новой версией Forge (1.21.x)")
            return True
            
        # Проверяем если это 1.20.2 или выше 
        elif minecraft_version.startswith("1.20."):
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
    """Формирует команду запуска для новых версий Forge (1.20.2+)"""
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
        main_class_index = -1
        main_class = version_data.get("mainClass", "net.minecraft.client.main.Main")
        
        for i, arg in enumerate(command):
            if arg == main_class:
                main_class_index = i
                logging.info(f"Найден главный класс {main_class} в позиции {i}")
                break
        
        # Если нашли индекс главного класса, заменяем его на класс загрузчика Forge
        if main_class_index > 0:
            bootstrap_class = "net.minecraftforge.bootstrap.ForgeBootstrap"
            logging.info(f"Заменяем главный класс {main_class} на {bootstrap_class}")
            command[main_class_index] = bootstrap_class
            
            # Проверяем и добавляем необходимые аргументы для Forge
            if "--fml.forgeVersion" not in " ".join(command):
                forge_version = version.split("-forge-")[1] if "-forge-" in version else "unknown"
                logging.info(f"Извлечена версия Forge: {forge_version}")
                
                if "--launchTarget" not in " ".join(command):
                    logging.info("Добавляем аргумент --launchTarget forge_client")
                    command.append("--launchTarget")
                    command.append("forge_client")
                
                if "--versionType" not in " ".join(command):
                    logging.info("Добавляем аргумент --versionType release")
                    command.append("--versionType")
                    command.append("release")
                
                # Добавляем специальные аргументы для macOS
                if platform.system() == "Darwin":
                    if "-XstartOnFirstThread" not in command:
                        command.insert(1, "-XstartOnFirstThread")
                    if platform.machine() == 'arm64' and "-Dos.arch=aarch64" not in command:
                        command.append("-Dos.arch=aarch64")
        else:
            logging.warning(f"Не удалось найти главный класс {main_class} в команде запуска")
        
        logging.info(f"Модифицированная команда запуска содержит {len(command)} аргументов")
        return command
        
    except Exception as e:
        logging.error(f"Ошибка при формировании команды запуска Forge: {str(e)}", exc_info=True)
        logging.info("Пробуем использовать стандартный метод запуска как запасной вариант")
        return get_minecraft_command(version, minecraft_directory, options)

def launch_process_hidden_forge(command, cwd=None):
    """Запускает процесс в Windows без показа окон"""
    if not platform.system() == "Windows" or not HAS_WIN32API:
        logging.warning("Функция launch_process_hidden требует Windows и win32api")
        return None
        
    try:
        command_str = subprocess.list2cmdline(command)
        logging.info(f"Запуск процесса с командой: {command_str}")
        
        startupinfo = win32process.STARTUPINFO()
        startupinfo.dwFlags = win32process.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = win32con.SW_HIDE
        
        process_info = win32process.CreateProcess(
            None,
            command_str,
            None,
            None,
            0,
            win32process.CREATE_NO_WINDOW | win32process.DETACHED_PROCESS,
            None,
            cwd,
            startupinfo
        )
        
        win32api.CloseHandle(process_info[0])
        win32api.CloseHandle(process_info[1])
        
        pid = process_info[2]
        logging.info(f"Процесс успешно запущен с PID: {pid}")
        
        class PseudoProcess:
            def __init__(self, pid):
                self.pid = pid
        
        return PseudoProcess(pid)
    except Exception as e:
        logging.error(f"Ошибка при запуске процесса через WinAPI: {str(e)}", exc_info=True)
        return None

def get_minecraft_online(ip, port, timeout=2):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, port))
        # Handshake packet
        host = ip.encode('utf-8')
        data = b''
        data += b'\x00'  # packet id = 0 (handshake)
        data += b'\x47'  # protocol version (71 for 1.17, 47 for 1.8, 754 for 1.16.5+)
        data += struct.pack('>b', len(host)) + host
        data += struct.pack('>H', port)
        data += b'\x01'  # next state: status
        packet = struct.pack('>B', len(data)) + data
        sock.sendall(packet)
        # Status request
        sock.sendall(b'\x01\x00')
        # Read response
        def read_varint(sock):
            number = 0
            for i in range(5):
                part = sock.recv(1)[0]
                number |= (part & 0x7F) << 7 * i
                if not part & 0x80:
                    break
            return number
        _ = read_varint(sock)
        _ = read_varint(sock)
        length = read_varint(sock)
        data = b''
        while len(data) < length:
            data += sock.recv(length - len(data))
        sock.close()
        resp = json.loads(data.decode('utf-8'))
        return resp['players']['online']
    except Exception:
        return None

if __name__ == "__main__":
    QApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    while True:
        app = QApplication(sys.argv)
        window = MainWindow()
        window.show()
        exit_code = app.exec_()
        if exit_code != 1337:
            break