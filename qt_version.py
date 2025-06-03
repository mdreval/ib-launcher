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
                            QPlainTextEdit, QListWidgetItem)
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
import winreg
import shutil

# Для Windows, импортируем модули WinAPI
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

# Игнорируем все предупреждения
warnings.filterwarnings("ignore")
os.environ['QT_LOGGING_RULES'] = '*.debug=false;qt.qpa.*=false;qt.gui.icc*=false'

# Настройка путей
CONFIG_DIR = os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "IBLauncher-config")
LOG_FILE = os.path.join(CONFIG_DIR, "launcher.log")
CONFIG_FILE = os.path.join(CONFIG_DIR, 'launcher_config.json')
FORGE_CACHE_FILE = os.path.join(CONFIG_DIR, 'forge_cache.json')

# Путь установки Minecraft
DEFAULT_MINECRAFT_DIR = os.path.join(
    os.path.expanduser("~"),
    "AppData", "Roaming", "IBLauncher" if platform.system() == "Windows"
    else "Library/Application Support/IBLauncher"
)

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
            self.status_label.setText("Загрузка Java...")
            QApplication.processEvents()
            
            response = requests.get(java_urls[os_type], headers=headers, stream=True, verify=True)
            response.raise_for_status()
            
            with open(installer_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            self.status_label.setText("Запуск установщика...")
            QApplication.processEvents()
            
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
            
            QMessageBox.information(
                self,
                "Успех",
                "Java успешно установлена! Лаунчер будет перезапущен."
            )
            QApplication.exit(1337)
            
        except Exception as e:
            logging.error(f"Ошибка установки Java: {str(e)}")
            QMessageBox.critical(self, "Ошибка", f"Ошибка установки: {str(e)}")

class InstallThread(QThread):
    progress_update = pyqtSignal(int, int, str)
    status_update = pyqtSignal(str)
    toggle_ui = pyqtSignal(bool)
    error_occurred = pyqtSignal(str)

    def __init__(self, version, username, install_path, memory=4, launch_flags_input=None, mods_update_switch=True):
        super().__init__()
        self.version = version
        self.username = username
        self.install_path = install_path
        self.memory = memory
        self.launch_flags_input = launch_flags_input
        self.stop_requested = False
        self.mods_update_switch=mods_update_switch

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
                version_to_launch = version_to_launch.replace("-", "-forge-", 1)
            
            logging.info(f"Запуск версии: {version_to_launch}")
            
            # Формируем опции запуска
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
                    '-Dlog4j2.formatMsgNoLookups=true'
                ],
                'launchTarget': 'fmlclient',
                'executablePath': self.find_java_path(True),
                'gameDirectory': os.path.abspath(self.install_path)
            }

            # Логируем финальные JVM аргументы
            logging.info(f"JVM аргументы для запуска: {options['jvmArguments']}")

            # Проверяем, является ли версия новым Forge (1.20.2+ или 1.21.x)
            is_forge_version = "forge" in version_to_launch.lower()
            
            if is_forge_version:
                # Получаем команду запуска для Forge
                command = get_forge_launch_command(version_to_launch, self.install_path, options)
                if command:
                    # Запускаем Forge с полученной командой
                    process = launch_forge_with_command(command)
                    if process:
                        logging.info(f"Игра успешно запущена с PID: {process.pid}")
                        return
                    else:
                        raise Exception("Не удалось запустить Forge")
                else:
                    raise Exception("Не удалось сформировать команду запуска Forge")
            else:
                # Запускаем ванильную версию
                command = get_minecraft_command(version_to_launch, self.install_path, options)
                process = launch_process_hidden(command, cwd=self.install_path)
                if process:
                    # Проверяем тип process и логируем соответственно
                    if isinstance(process, int):
                        logging.info(f"Игра успешно запущена с PID: {process}")
                    else:
                        logging.info(f"Игра успешно запущена с PID: {process.pid}")
                    return
                else:
                    raise Exception("Не удалось запустить игру")

        except Exception as e:
            logging.error(f"Ошибка запуска игры: {str(e)}", exc_info=True)
            self.error_occurred.emit(f"Ошибка запуска игры: {str(e)}")

    def find_java_path(self, requires_java21=False):
        """
        Находит путь к Java на системе.
        
        Args:
            requires_java21 (bool): Если True, ищет Java 21+, иначе ищет Java 17+
        
        Returns:
            str: Путь к Java или None, если не найден
        """
        min_version = 21 if requires_java21 else 17
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
            
            # Показываем сообщение о несоответствии версии
            msg = QMessageBox()
            msg.setIcon(QMessageBox.Critical)
            msg.setWindowTitle("Требуется Java " + str(min_version))
            
            if min_version == 21:
                msg.setText(f"Для запуска этой версии Minecraft требуется Java 21.\nУ вас установлен Java {best_version}.")
            else:
                msg.setText(f"Для запуска этой версии Minecraft требуется Java 17 или выше.\nУ вас установлен Java {best_version}.")
            
            msg.setInformativeText("Вы хотите загрузить правильную версию Java?")
            msg.setStandardButtons(QMessageBox.Yes | QMessageBox.No)
            
            if msg.exec_() == QMessageBox.Yes:
                # Открываем ссылку для скачивания Java в зависимости от ОС
                system = platform.system()
                if system == "Windows":
                    if min_version == 21:
                        webbrowser.open("https://www.oracle.com/java/technologies/javase/jdk21-archive-downloads.html")
                    else:
                        webbrowser.open("https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html")
                elif system == "Darwin":  # macOS
                    if min_version == 21:
                        webbrowser.open("https://www.oracle.com/java/technologies/downloads/#jdk21-mac")
                    else:
                        webbrowser.open("https://www.oracle.com/java/technologies/downloads/#jdk17-mac")
                else:  # Linux
                    if min_version == 21:
                        webbrowser.open("https://www.oracle.com/java/technologies/downloads/#jdk21-linux")
                    else:
                        webbrowser.open("https://www.oracle.com/java/technologies/downloads/#jdk17-linux")
            
            return None
        
        # Если Java не найден вообще
        logging.error(f"Java не найден на системе")
        
        msg = QMessageBox()
        msg.setIcon(QMessageBox.Critical)
        msg.setWindowTitle("Java не найден")
        
        if min_version == 21:
            msg.setText("Для запуска этой версии Minecraft требуется Java 21.\nJava не найден на вашей системе.")
        else:
            msg.setText("Для запуска Minecraft требуется Java 17 или выше.\nJava не найден на вашей системе.")
        
        msg.setInformativeText("Хотите перейти на страницу загрузки Java?")
        msg.setStandardButtons(QMessageBox.Yes | QMessageBox.No)
        
        if msg.exec_() == QMessageBox.Yes:
            # Открываем ссылку для скачивания Java в зависимости от ОС
            system = platform.system()
            if system == "Windows":
                if min_version == 21:
                    webbrowser.open("https://www.oracle.com/java/technologies/javase/jdk21-archive-downloads.html")
                else:
                    webbrowser.open("https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html")
            elif system == "Darwin":  # macOS
                if min_version == 21:
                    webbrowser.open("https://www.oracle.com/java/technologies/downloads/#jdk21-mac")
                else:
                    webbrowser.open("https://www.oracle.com/java/technologies/downloads/#jdk17-mac")
            else:  # Linux
                if min_version == 21:
                    webbrowser.open("https://www.oracle.com/java/technologies/downloads/#jdk21-linux")
                else:
                    webbrowser.open("https://www.oracle.com/java/technologies/downloads/#jdk17-linux")
        
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
            
            # Удаляем всю папку установки
            if os.path.exists(install_path):
                import shutil
                try:
                    # Удаляем всю папку установки
                    shutil.rmtree(install_path)
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

class MainWindow(QMainWindow):
    # Добавляем сигналы
    status_update = pyqtSignal(str)
    progress_update = pyqtSignal(int, int, str)
    
    
    def __init__(self):
        super().__init__()
        
        # Загружаем UI
        uic.loadUi(resource_path("design.ui"), self)
        
        # Инициализируем переменные
        self.install_path_str = ""
        self.forge_cache = {}
        self.mods_update_switch = True
        
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
        
        # Подключаем сигналы для модов
        self.add_mod_button.clicked.connect(self.add_mods)
        self.remove_mod_button.clicked.connect(self.remove_selected_mods)
        self.check_updates_button.clicked.connect(self.toggle_auto_updates)
        self.tabWidget.currentChanged.connect(self.on_tab_changed)
        self.remove_version_button.clicked.connect(self.remove_version)  # Подключаем обработчик удаления версии
        
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
                    base_path = os.path.join(appdata_path, "IBLauncher")
                else:
                    home_path = os.path.expanduser("~")
                    base_path = os.path.join(home_path, "IBLauncher")
            else:
                # Если путь уже установлен пользователем
                # Проверяем, содержит ли путь уже IBLauncher
                if "IBLauncher" in current_path:
                    # Если содержит, получаем родительскую директорию
                    base_path = os.path.dirname(current_path)
                else:
                    # Если не содержит, используем текущий путь как есть
                    base_path = current_path

            # Формируем новый путь в зависимости от версии
            if selected_version == "1.20.1":
                new_path = os.path.join(base_path, "IBLauncher")
            else:
                new_path = os.path.join(base_path, f"IBLauncher_{selected_version}")
            
            # Нормализуем путь
            new_path = os.path.normpath(new_path)
            
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
            else:
                home_path = os.path.expanduser("~")
                default_path = os.path.join(home_path, "IBLauncher")
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
                
                # Нормализуем путь
                new_path = os.path.normpath(new_path)
                
                # Устанавливаем путь в UI
                self.install_path.setText(new_path)
                self.install_path_str = new_path
                
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
            config_path = os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "IBLauncher-config", "launcher_config.json")
            if os.path.exists(config_path):
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    
                # Загружаем имя пользователя
                if 'username' in config:
                    self.username_input.setText(config['username'])
                
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
                    self.check_updates_button.setText(
                        "Отключить обновление модов" if self.auto_update_mods else "Включить обновление модов"
                    )
                
        except Exception as e:
            logging.error(f"Ошибка при загрузке конфигурации: {str(e)}")
            # Используем значения по умолчанию
            self.install_path.setText(DEFAULT_MINECRAFT_DIR)
            self.install_path_str = DEFAULT_MINECRAFT_DIR

    def save_config(self):
        """Сохраняет настройки лаунчера"""
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
                'auto_update_mods': self.mods_update_switch
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
                QMessageBox.warning(
                    self,
                    "Нет подключения",
                    "Вы без доступа в интернет, будет запускаться только установленная версия."
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

            # Добавляем версии по одной
            for version in versions:
                self.minecraft_version.addItem(version)

            # Загружаем сохраненную версию из конфига
            saved_version = None
            saved_forge = None
            if os.path.exists(CONFIG_FILE):
                with open(CONFIG_FILE, 'r') as f:
                    config = json.load(f)
                    saved_version = config.get('minecraft_version')
                    saved_forge = config.get('forge_version')

            # Устанавливаем версию по умолчанию или сохраненную
            default_version = "1.20.1"
            default_index = self.minecraft_version.findText(default_version)
            
            if saved_version:
                saved_index = self.minecraft_version.findText(saved_version)
                if saved_index >= 0:
                    default_index = saved_index
                    default_version = saved_version

            if default_index >= 0:
                self.minecraft_version.setCurrentIndex(default_index)
                logging.info("Установлена версия Minecraft по умолчанию")

                # Загружаем версию Forge для 1.20.1
                if default_version == "1.20.1":
                    logging.info("Загрузка версии Forge для 1.20.1")
                    forge_version = "1.20.1-47.3.22"
                    forge_display_version = f"1.20.1-forge-47.3.22"
                    self.forge_version.addItem(forge_display_version)
                    self.forge_version.setEnabled(True)
                    logging.info(f"Добавлена версия Forge: {forge_display_version}")

                    if "1.20.1" not in self.forge_cache:
                        logging.info("Сохранение версии Forge в кеш")
                        self.save_forge_cache("1.20.1", forge_version)
                else:
                    # Для других версий обновляем список версий Forge
                    self.update_forge_versions()
                    
                    # Устанавливаем сохраненную версию Forge
                    if saved_forge and saved_forge != "None":
                        index = self.forge_version.findText(saved_forge)
                        if index >= 0:
                            self.forge_version.setCurrentIndex(index)
                        else:
                            self.forge_version.setCurrentIndex(0)
                    else:
                        self.forge_version.setCurrentIndex(0)
            else:
                # Если индекс не найден, устанавливаем 1.20.1
                logging.info("Индекс не найден, устанавливаем версию 1.20.1")
                default_index = self.minecraft_version.findText('1.20.1')
                if default_index >= 0:
                    self.minecraft_version.setCurrentIndex(default_index)
                    forge_version = "1.20.1-47.3.22"
                    forge_display_version = f"1.20.1-forge-47.3.22"
                    self.forge_version.addItem(forge_display_version)
                    self.forge_version.setEnabled(True)
                    logging.info("Установлена версия 1.20.1 и Forge")

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

        # Специальная обработка для 1.20.1 - добавляем нашу версию Forge первой
        if selected_version == "1.20.1":
            forge_version = "1.20.1-47.3.22"
            forge_display_version = f"1.20.1-forge-47.3.22"
            self.forge_version.addItem(forge_display_version)
            added_versions.add(forge_display_version)
            self.add_to_forge_cache("1.20.1", forge_version)
            self.forge_version.setEnabled(True)
        else:
            # Для всех остальных версий добавляем "Не устанавливать" как первый пункт
            self.forge_version.addItem("Не устанавливать")
            added_versions.add("Не устанавливать")
            
            # Обновляем список версий Forge
            self.update_forge_versions()

        # Обновляем путь установки в зависимости от выбранной версии
        self.setup_path()

        self.status_label.setText(f"Выбрана версия Minecraft: {selected_version}")
        self.check_game_installed()
        
        # Если это версия 1.20.1, устанавливаем первую версию Forge как выбранную
        if selected_version == "1.20.1" and self.forge_version.count() > 0:
            self.forge_version.setCurrentIndex(0)
        else:
            # Для других версий устанавливаем "Не устанавливать" по умолчанию
            self.forge_version.setCurrentIndex(0)
        
        # Сохраняем выбранную версию
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
            
            # Запускаем поток установки
            self.thread.start()
            logging.info(f"Запущен поток установки/запуска игры с памятью {memory_value}GB")
            
        except Exception as e:
            logging.error(f"Ошибка запуска установки: {str(e)}", exc_info=True)
            QMessageBox.critical(self, "Ошибка", f"Не удалось запустить установку: {str(e)}")
            self.toggle_ui_elements(True)  # Разблокируем интерфейс в случае ошибки

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
        QMessageBox.critical(self, "Ошибка", message)
        self.toggle_ui_elements(True)

    def check_game_installed(self):
        """Проверяет наличие игры и обновляет текст кнопки"""
        install_path = self.install_path.text().strip()
        minecraft_version = self.minecraft_version.currentText()
        forge_version = self.forge_version.currentText() if self.forge_version.isEnabled() else None
        
        logging.info(f"=== Начало проверки установки игры ===")
        logging.info(f"Путь установки: {install_path}")
        logging.info(f"Версия Minecraft: {minecraft_version}")
        logging.info(f"Версия Forge: {forge_version}")
        
        # Определяем, какую версию нужно проверять
        if forge_version == "Не устанавливать" or forge_version is None:
            # Проверяем наличие ванильной версии Minecraft
            version_to_check = minecraft_version
        else:
            # Проверяем наличие Forge версии
            version_to_check = forge_version
        
        logging.info(f"Версия для проверки: {version_to_check}")
        
        # Проверяем наличие конкретной версии в папке versions
        versions_path = os.path.join(install_path, "versions")
        version_folder = os.path.join(versions_path, version_to_check)
        is_installed = False
        
        logging.info(f"Проверяемая папка: {version_folder}")
        logging.info(f"Папка существует: {os.path.exists(version_folder)}")
        
        # Проверяем наличие явной версии (либо Forge, либо ванильной)
        if os.path.exists(version_folder) and os.listdir(version_folder):
            files = os.listdir(version_folder)
            logging.info(f"Содержимое папки: {files}")
            is_installed = True
        # Если это "Не устанавливать", дополнительно проверяем наличие ванильной версии внутри Forge
        elif forge_version == "Не устанавливать":
            # Проверяем, есть ли Forge-версии, которые могли установить ванильную версию
            if os.path.exists(versions_path):
                for folder in os.listdir(versions_path):
                    # Ищем папки с именами, содержащими версию Minecraft (например, "1.21.4-forge-x.y.z")
                    if folder.startswith(f"{minecraft_version}-") and "forge" in folder.lower():
                        forge_folder = os.path.join(versions_path, folder)
                        logging.info(f"Найдена Forge-версия: {forge_folder}")
                        # Проверяем, установлена ли внутри ванильная версия
                        vanilla_json = os.path.join(forge_folder, f"{minecraft_version}.json")
                        if os.path.exists(vanilla_json):
                            logging.info(f"Ванильная версия {minecraft_version} найдена внутри Forge")
                            is_installed = True
                            break
        
        logging.info(f"Результат проверки установки: {is_installed}")
        
        # Находим кнопку удаления
        remove_button = self.findChild(QPushButton, "remove_version_button")
        
        if is_installed:
            logging.info("Меняем текст кнопки на 'Играть'")
            self.start_button.setText("Играть")
            if not self.start_button.text() == "Играть":
                logging.error("Не удалось изменить текст кнопки на 'Играть'")
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
            self.start_button.setText("Установить")
            if not self.start_button.text() == "Установить":
                logging.error("Не удалось изменить текст кнопки на 'Установить'")
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
        try:
            # Текущая версия лаунчера
            current_version = "1.0.7.4"
            
            # Проверяем GitHub API
            api_url = "https://api.github.com/repos/mdreval/ib-launcher/releases/latest"
            response = requests.get(api_url, timeout=10, verify=True)
            response.raise_for_status()
            latest_release = response.json()
            
            # Получаем версию последнего релиза (убираем 'v' из начала)
            latest_version = latest_release['tag_name'].lstrip('v')
            
            # Проверяем только обновления лаунчера
            launcher_updated = False
            for asset in latest_release['assets']:
                if platform.system() == "Windows" and asset['name'] == "IB-Launcher.exe":
                    launcher_updated = True
                elif platform.system() == "Darwin" and asset['name'] == "IB-Launcher.dmg":
                    launcher_updated = True
            
            if launcher_updated and latest_version > current_version:
                # Показываем диалог обновления
                update_dialog = QMessageBox()
                update_dialog.setWindowTitle("Доступно обновление")
                update_dialog.setText(f"Доступна новая версия лаунчера: {latest_version}\n\nТекущая версия: {current_version}")
                update_dialog.setInformativeText("Хотите обновить лаунчер?")
                update_dialog.setStandardButtons(QMessageBox.Yes | QMessageBox.No)
                update_dialog.setDefaultButton(QMessageBox.Yes)
                
                if update_dialog.exec_() == QMessageBox.Yes:
                    # Открываем страницу релиза в браузере
                    QDesktopServices.openUrl(QUrl(latest_release['html_url']))
                    
                    # Закрываем лаунчер
                    QApplication.quit()
                
        except Exception as e:
            logging.error(f"Ошибка проверки обновлений: {str(e)}")

    def update_version_label(self):
        try:
            # Текущая версия лаунчера
            current_version = "1.0.7.4"
            
            # Пробуем получить последнюю версию с GitHub
            api_url = "https://api.github.com/repos/mdreval/ib-launcher/releases/latest"
            response = requests.get(api_url, timeout=10, verify=True)
            response.raise_for_status()
            latest_release = response.json()
            latest_version = latest_release['tag_name'].lstrip('v')
            
            # Сравниваем версии
            if latest_version > current_version:
                # Если доступна новая версия, показываем обе
                self.version_label.setText(f"Версия: {current_version} (Доступно обновление: {latest_version})")
                self.version_label.setStyleSheet("QLabel { color: #ff6b6b; }")  # Красный цвет для уведомления
            else:
                # Если версия актуальная
                self.version_label.setText(f"Версия: {current_version}")
                self.version_label.setStyleSheet("QLabel { color: #666666; }")  # Возвращаем обычный цвет
            
        except Exception as e:
            logging.error(f"Ошибка получения версии: {str(e)}")
            # При ошибке показываем только текущую версию
            self.version_label.setText(f"Версия: {current_version}")

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
                    
            # Обновляем статус
            self.status_label.setText(f"Найдено модов: {self.mods_list.count()}")
            
        except Exception as e:
            logging.error(f"Ошибка обновления списка модов: {str(e)}")
            self.status_label.setText("Ошибка загрузки модов")
    
    def add_mods(self):
        """Добавляет новые моды"""
        try:
            files, _ = QFileDialog.getOpenFileNames(
                self,
                "Выберите моды",
                "",
                "Minecraft Mods (*.jar)"
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
            
            if not selected_items:
                QMessageBox.information(self, "Информация", "Выберите моды для удаления")
                return
            
            # Спрашиваем подтверждение
            response = QMessageBox.question(
                self,
                "Удаление модов",
                f"Вы уверены, что хотите удалить {len(selected_items)} мод(ов)?",
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
            if self.check_updates_button.text() == "Отключить обновление модов":
                self.check_updates_button.setText("Включить обновление модов")
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
                self.check_updates_button.setText("Отключить обновление модов")
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
        requires_java21 = False
        
        # Анализируем версию Minecraft
        try:
            # Проверяем конкретные версии для особой обработки
            if minecraft_version == "1.21.4":
                requires_java21 = True
                logging.info(f"Для версии {minecraft_version} требуется Java 21+")
            # Проверяем общий случай версии 1.21.x
            elif minecraft_version.startswith('1.21'):
                requires_java21 = True
                logging.info(f"Для версии {minecraft_version} требуется Java 21+")
            # Проверяем версию 1.20.2+
            elif minecraft_version.startswith('1.20.'):
                # Разбиваем версию на компоненты
                version_parts = minecraft_version.split('.')
                if len(version_parts) > 2 and int(version_parts[2]) >= 2:
                    requires_java21 = True
                    logging.info(f"Для версии {minecraft_version} требуется Java 21+")
                else:
                    logging.info(f"Для версии {minecraft_version} требуется Java 17+")
            else:
                logging.info(f"Для версии {minecraft_version} требуется Java 17+")
        except Exception as e:
            logging.error(f"Ошибка анализа версии Minecraft: {str(e)}")
            # По умолчанию предполагаем, что требуется Java 17
            logging.info("По умолчанию используем Java 17")
        
        # Находим путь к Java
        java_path = self.find_java_path(requires_java21)
        
        if java_path:
            # Получаем версию Java
            java_version = self._get_java_version(java_path)
            logging.info(f"Найдена Java версии {java_version}")
            
            # Проверяем соответствие версии
            if requires_java21 and java_version < 21:
                result = QMessageBox.critical(
                    self, 
                    "Ошибка Java", 
                    f"Для Minecraft {minecraft_version} требуется Java 21 или выше.\n"
                    f"Установлена версия: {java_version}\n"
                    f"Пожалуйста, установите более новую версию Java с сайта Oracle:\n"
                    f"https://www.oracle.com/java/technologies/downloads/#jdk21"
                )
                if result == QMessageBox.Ok:
                    QDesktopServices.openUrl(QUrl("https://www.oracle.com/java/technologies/javase/jdk21-archive-downloads.html"))
            elif not requires_java21 and java_version < 17:
                result = QMessageBox.critical(
                    self, 
                    "Ошибка Java", 
                    f"Для Minecraft {minecraft_version} требуется Java 17 или выше.\n"
                    f"Установлена версия: {java_version}\n"
                    f"Пожалуйста, установите более новую версию Java с сайта Oracle:\n"
                    f"https://www.oracle.com/java/technologies/downloads/#jdk17"
                )
                if result == QMessageBox.Ok:
                    QDesktopServices.openUrl(QUrl("https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html"))
            else:
                return True
        else:
            # Java не найдена
            if requires_java21:
                result = QMessageBox.critical(
                    self, 
                    "Ошибка Java", 
                    f"Для Minecraft {minecraft_version} требуется Java 21, но она не найдена.\n"
                    f"Пожалуйста, установите Java 21 с сайта Oracle:\n"
                    f"https://www.oracle.com/java/technologies/downloads/#jdk21"
                )
                if result == QMessageBox.Ok:
                    QDesktopServices.openUrl(QUrl("https://www.oracle.com/java/technologies/javase/jdk21-archive-downloads.html"))
            else:
                result = QMessageBox.critical(
                    self, 
                    "Ошибка Java", 
                    f"Для Minecraft {minecraft_version} требуется Java 17, но она не найдена.\n"
                    f"Пожалуйста, установите Java 17 с сайта Oracle:\n"
                    f"https://www.oracle.com/java/technologies/downloads/#jdk17"
                )
                if result == QMessageBox.Ok:
                    QDesktopServices.openUrl(QUrl("https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html"))
            return False

    def find_java_path(self, requires_java21=False):
        """
        Находит путь к Java на системе.
        
        Args:
            requires_java21 (bool): Если True, ищет Java 21+, иначе ищет Java 17+
        
        Returns:
            str: Путь к Java или None, если не найден
        """
        min_version = 21 if requires_java21 else 17
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
            
            # Показываем сообщение о несоответствии версии
            msg = QMessageBox()
            msg.setIcon(QMessageBox.Critical)
            msg.setWindowTitle("Требуется Java " + str(min_version))
            
            if min_version == 21:
                msg.setText(f"Для запуска этой версии Minecraft требуется Java 21.\nУ вас установлен Java {best_version}.")
            else:
                msg.setText(f"Для запуска этой версии Minecraft требуется Java 17 или выше.\nУ вас установлен Java {best_version}.")
            
            msg.setInformativeText("Вы хотите загрузить правильную версию Java?")
            msg.setStandardButtons(QMessageBox.Yes | QMessageBox.No)
            
            if msg.exec_() == QMessageBox.Yes:
                # Открываем ссылку для скачивания Java в зависимости от ОС
                system = platform.system()
                if system == "Windows":
                    if min_version == 21:
                        webbrowser.open("https://www.oracle.com/java/technologies/javase/jdk21-archive-downloads.html")
                    else:
                        webbrowser.open("https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html")
                elif system == "Darwin":  # macOS
                    if min_version == 21:
                        webbrowser.open("https://www.oracle.com/java/technologies/downloads/#jdk21-mac")
                    else:
                        webbrowser.open("https://www.oracle.com/java/technologies/downloads/#jdk17-mac")
                else:  # Linux
                    if min_version == 21:
                        webbrowser.open("https://www.oracle.com/java/technologies/downloads/#jdk21-linux")
                    else:
                        webbrowser.open("https://www.oracle.com/java/technologies/downloads/#jdk17-linux")
            
            return None
        
        # Если Java не найден вообще
        logging.error(f"Java не найден на системе")
        
        msg = QMessageBox()
        msg.setIcon(QMessageBox.Critical)
        msg.setWindowTitle("Java не найден")
        
        if min_version == 21:
            msg.setText("Для запуска этой версии Minecraft требуется Java 21.\nJava не найден на вашей системе.")
        else:
            msg.setText("Для запуска Minecraft требуется Java 17 или выше.\nJava не найден на вашей системе.")
        
        msg.setInformativeText("Хотите перейти на страницу загрузки Java?")
        msg.setStandardButtons(QMessageBox.Yes | QMessageBox.No)
        
        if msg.exec_() == QMessageBox.Yes:
            # Открываем ссылку для скачивания Java в зависимости от ОС
            system = platform.system()
            if system == "Windows":
                if min_version == 21:
                    webbrowser.open("https://www.oracle.com/java/technologies/javase/jdk21-archive-downloads.html")
                else:
                    webbrowser.open("https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html")
            elif system == "Darwin":  # macOS
                if min_version == 21:
                    webbrowser.open("https://www.oracle.com/java/technologies/downloads/#jdk21-mac")
                else:
                    webbrowser.open("https://www.oracle.com/java/technologies/downloads/#jdk17-mac")
            else:  # Linux
                if min_version == 21:
                    webbrowser.open("https://www.oracle.com/java/technologies/downloads/#jdk21-linux")
                else:
                    webbrowser.open("https://www.oracle.com/java/technologies/downloads/#jdk17-linux")
        
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
            
            # Удаляем всю папку установки
            if os.path.exists(install_path):
                import shutil
                try:
                    # Удаляем всю папку установки
                    shutil.rmtree(install_path)
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

# Функция для запуска процесса в Windows без показа окон
def launch_process_hidden(command, cwd=None):
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
        return pid
    except Exception as e:
        logging.error(f"Ошибка при запуске процесса через WinAPI: {str(e)}", exc_info=True)
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
            process = launch_process_hidden_forge(command, cwd=minecraft_dir)
            if process:
                logging.info(f"Forge успешно запущен через WinAPI, PID: {process.pid}")
                return process
            else:
                logging.warning("Запуск через WinAPI не удался, используем стандартный метод")
        
        creation_flags = 0
        if platform.system() == "Windows":
            creation_flags = 0x08000008
            
        try:
            process = subprocess.Popen(
                command,
                cwd=minecraft_dir,
                creationflags=creation_flags,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                shell=False
            )
            logging.info(f"Forge успешно запущен через subprocess, PID: {process.pid}")
            return process
        except Exception as e:
            logging.error(f"Ошибка при запуске процесса через subprocess: {str(e)}", exc_info=True)
            return None
            
    except Exception as e:
        logging.error(f"Ошибка при запуске Forge: {str(e)}", exc_info=True)
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