import os
import sys
import warnings
import json
import psutil
import uuid
from pathlib import Path

# Игнорируем все предупреждения
warnings.filterwarnings("ignore")
os.environ['QT_LOGGING_RULES'] = '*.debug=false;qt.qpa.*=false;qt.gui.icc*=false'

import shutil
import logging
import zipfile
import requests
import subprocess
import platform
from uuid import uuid1
from PyQt5.QtCore import QThread, pyqtSignal, Qt, QProcess, QUrl, QTimer
from PyQt5.QtWidgets import (QApplication, QMainWindow, QMessageBox,
                            QWidget, QVBoxLayout, QDialog, QVBoxLayout,
                            QLabel, QProgressBar, QPushButton, QFileDialog,
                            QHBoxLayout, QSlider, QGroupBox, QComboBox, QLineEdit,
                            QPlainTextEdit, QListWidget)
from PyQt5.QtGui import QPixmap, QDesktopServices, QFont, QIcon
from PyQt5 import uic
from minecraft_launcher_lib.utils import get_version_list
from minecraft_launcher_lib.install import install_minecraft_version
from minecraft_launcher_lib.command import get_minecraft_command
from random_username.generate import generate_username
import minecraft_launcher_lib.forge
import nbtlib
import time
import traceback
import datetime
import re

try:
    import win32gui
except ImportError:
    pass

def resource_path(relative_path):
    """ Получить абсолютный путь к ресурсу, работает как для разработки, так и для PyInstaller """
    try:
        # PyInstaller создает временную папку и хранит путь в _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")

    return os.path.join(base_path, relative_path)

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

            if "-" in self.version:  # Если это версия Forge (например, "1.20.1-47.2.20")
                logging.info(f"Запуск установки Forge версии: {self.version}")
                self._install_forge()
            else:
                logging.info(f"Запуск установки Minecraft версии: {self.version}")
                self._install_minecraft()

            self._install_modpack()
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
        
        # Добавляем startupinfo для скрытия консоли в Windows
        startupinfo = None
        if platform.system() == "Windows":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE

        install_minecraft_version(
            versionid=version_to_install,
            minecraft_directory=self.install_path,
            callback={
                'setStatus': lambda text: self.status_update.emit(text),
                'setProgress': lambda val: self.progress_update.emit(val, 0, ""),
                'setMax': lambda max_val: self.progress_update.emit(0, max_val, "")
            }
        )

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
                'updated_at': datetime.datetime.now().isoformat(),
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

            # Преобразуем версию Forge в правильный формат
            version_to_launch = self.version
            if "-" in version_to_launch:
                version_to_launch = version_to_launch.replace("-", "-forge-", 1)
            
            logging.info(f"Запуск версии: {version_to_launch}")

            # Получаем путь к Java
            java_path = None
            possible_paths = [
                'javaw.exe',
                r'\usr\bin\java',
                r'C:\Program Files\Java\jdk-17.0.10\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17\bin\javaw.exe',
                os.path.join(os.environ.get('JAVA_HOME', ''), 'bin', 'javaw.exe'),
            ]

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
                    logging.info(f"java_paths: {java_paths}")
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

            if not java_path:
                raise FileNotFoundError("Не удалось найти путь к Java")

            # Настраиваем параметры запуска
            options = {
                'username': self.username,
                'uuid': str(uuid.uuid4()),
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
                'executablePath': java_path,
                'gameDirectory': os.path.abspath(self.install_path)  # Используем абсолютный путь
            }

            # Получаем команду запуска
            minecraft_command = get_minecraft_command(
                version_to_launch,
                os.path.abspath(self.install_path),  # Используем абсолютный путь
                options
            )

            # Удаляем параметры quickPlay из команды
            minecraft_command = [arg for arg in minecraft_command if not any(
                x in arg.lower() for x in ['quickplay', 'lastserver', 'singleplayer']
            )]

            # Запускаем процесс с указанием рабочей директории
            logging.info(f"Команда запуска: {' '.join(minecraft_command)}")
            subprocess.Popen(
                minecraft_command,
                #creationflags=subprocess.CREATE_NO_WINDOW,
                cwd=os.path.abspath(self.install_path)  # Устанавливаем рабочую директорию
            )

            # Отправляем сигнал для закрытия главного окна
            QApplication.quit()
            
        except Exception as e:
            logging.error(f"Ошибка запуска игры: {str(e)}", exc_info=True)
            self.error_occurred.emit(f"Не удалось запустить Minecraft: {str(e)}")

    def find_java(self):
        """Находит путь к Java"""
        try:
            # Расширенный список путей для поиска Java
            possible_paths = [
                # Windows paths for Java executables in PATH
                'javaw.exe',
                'java.exe',
                
                # Common installation paths for JDK and JRE
                r'C:\Program Files\Java\jdk-17\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.1\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.2\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.3\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.4\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.5\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.6\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.7\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.8\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.9\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.10\bin\javaw.exe',
                
                # Java 21 paths
                r'C:\Program Files\Java\jdk-21\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-21.0.1\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-21.0.2\bin\javaw.exe',
                
                # Program Files (x86) paths
                r'C:\Program Files (x86)\Java\jdk-17\bin\javaw.exe',
                r'C:\Program Files (x86)\Java\jdk-17.0.10\bin\javaw.exe',
                r'C:\Program Files (x86)\Java\jdk-21\bin\javaw.exe',
                
                # Adoptium/Eclipse Temurin paths
                r'C:\Program Files\Eclipse Adoptium\jdk-17\bin\javaw.exe',
                r'C:\Program Files\Eclipse Adoptium\jdk-21\bin\javaw.exe',
                r'C:\Program Files\Eclipse Temurin\jdk-17\bin\javaw.exe',
                r'C:\Program Files\Eclipse Temurin\jdk-21\bin\javaw.exe',
                
                # Amazon Corretto
                r'C:\Program Files\Amazon Corretto\jdk17\bin\javaw.exe',
                r'C:\Program Files\Amazon Corretto\jdk21\bin\javaw.exe',
                
                # Microsoft OpenJDK
                r'C:\Program Files\Microsoft\jdk-17\bin\javaw.exe',
                r'C:\Program Files\Microsoft\jdk-21\bin\javaw.exe',
                
                # Unix paths
                r'/usr/bin/java',
                r'/usr/lib/jvm/java-17-openjdk/bin/java',
                r'/usr/lib/jvm/java-21-openjdk/bin/java',
                
                # JAVA_HOME path
                os.path.join(os.environ.get('JAVA_HOME', ''), 'bin', 'javaw.exe'),
                os.path.join(os.environ.get('JAVA_HOME', ''), 'bin', 'java'),
            ]

            # Расширенный поиск через регулярные выражения
            if platform.system() == "Windows":
                # Ищем все доступные версии Java в Program Files
                java_dirs = []
                for root_dir in [r'C:\Program Files\Java', r'C:\Program Files (x86)\Java']:
                    if os.path.exists(root_dir):
                        try:
                            for dir_name in os.listdir(root_dir):
                                if 'jdk' in dir_name.lower() or 'jre' in dir_name.lower():
                                    java_path = os.path.join(root_dir, dir_name, 'bin', 'javaw.exe')
                                    if os.path.exists(java_path):
                                        java_dirs.append(java_path)
                        except Exception as e:
                            logging.error(f"Ошибка при сканировании директории Java: {str(e)}")
                
                # Добавляем найденные пути в список
                possible_paths.extend(java_dirs)
                logging.info(f"Найдены дополнительные пути Java: {java_dirs}")

            java_path = None
            
            # Сначала проверяем через where/which
            try:
                system = platform.system()
                logging.info(f"Операционная система: {system}")
                
                if system == "Darwin":  # macOS
                    result = subprocess.run(['which', 'java'], 
                                         capture_output=True, 
                                         text=True)
                    cmd = 'which java'
                elif system == "Linux":
                    result = subprocess.run(['which', 'java'], 
                                         capture_output=True, 
                                         text=True)
                    cmd = 'which java'
                else:  # Windows
                    result = subprocess.run(['where', 'javaw'], 
                                         capture_output=True, 
                                         text=True, 
                                         creationflags=subprocess.CREATE_NO_WINDOW)
                    cmd = 'where javaw'
                
                logging.info(f"Выполнена команда: {cmd}")
                logging.info(f"Код возврата: {result.returncode}")
                logging.info(f"Вывод команды: {result.stdout}")
                
                if result.returncode == 0:
                    java_paths = result.stdout.strip().split('\n')
                    if java_paths:
                        java_path = java_paths[0]
                        logging.info(f"Java найдена через {cmd}: {java_path}")
            except Exception as e:
                logging.warning(f"Не удалось найти Java через where/which: {str(e)}")

            # Если where/which не нашел, проверяем все возможные пути
            if not java_path:
                logging.info("Поиск Java по всем возможным путям...")
                for path in possible_paths:
                    if os.path.exists(path):
                        java_path = path
                        logging.info(f"Java найдена по пути: {java_path}")
                        break

            if java_path:
                # Проверяем версию найденной Java
                java_exe = java_path.replace('javaw.exe', 'java.exe')
                logging.info(f"Проверка версии Java: {java_exe}")
                
                try:
                    result = subprocess.run(
                        [java_exe, '-version'], 
                        capture_output=True,
                        text=True                    
                    )
                    
                    version_output = result.stderr if result.stderr else result.stdout
                    logging.info(f"Вывод проверки версии Java: {version_output}")
                    
                    # Проверяем версию через регулярное выражение
                    version_pattern = r'version "([^"]+)"'
                    match = re.search(version_pattern, version_output)
                    
                    if match:
                        version_string = match.group(1)
                        logging.info(f"Найдена версия Java: {version_string}")
                        
                        # Извлекаем основной номер версии
                        major_version = self._get_java_version(java_path)
                        logging.info(f"Основной номер версии Java: {major_version}")
                        
                        # Проверяем версию - нужна 17+ или 21+
                        if major_version >= 17:
                            logging.info(f"Java версии {major_version} совместима")
                            return java_path
                        else:
                            logging.warning(f"Java версии {major_version} ниже требуемой")
                    else:
                        logging.warning("Не удалось извлечь версию Java из вывода")
                except Exception as e:
                    logging.error(f"Ошибка при проверке версии Java: {str(e)}")
            
            # Если Java не найдена или версия не подходит
            logging.warning("Java не найдена или версия не совместима")
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
            return None
            
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
            return None

    def save_settings(self):
        """Сохраняет настройки"""
        try:
            # Загружаем существующий конфиг или создаем новый
            config = {}
            if os.path.exists(CONFIG_FILE):
                with open(CONFIG_FILE, 'r') as f:
                    config = json.load(f)
            
            # Сохраняем значения, даже если они пустые
            username = self.username.text().strip()
            config['username'] = username
            
            minecraft_version = self.version
            config['minecraft_version'] = minecraft_version
            
            if self.version.startswith("1.20.1-forge-"):
                forge_version = self.version.replace("-forge-", "-")
                config['forge_version'] = forge_version
            
            install_path = self.install_path.text().strip()
            config['install_path'] = install_path if install_path != DEFAULT_MINECRAFT_DIR else ""
            
            memory = self.memory
            config['memory'] = memory
            
            # Всегда сохраняем значение флагов запуска, даже если оно пустое
            launch_flags = self.launch_flags_input.toPlainText().strip()
            config['launch_flags'] = launch_flags
            
            # Сохраняем конфиг
            with open(CONFIG_FILE, 'w') as f:
                json.dump(config, f)
                
        except Exception as e:
            logging.error(f"Ошибка сохранения конфига: {str(e)}")

class MainWindow(QMainWindow):
    # Добавляем сигналы
    status_update = pyqtSignal(str)
    progress_update = pyqtSignal(int, int, str)
    
    
    def __init__(self):
        super().__init__()
        self.mods_update_switch= True
        self.java_checked = False
        self.forge_cache = self.load_forge_cache()
        
        # Загружаем UI
        uic.loadUi(resource_path("design.ui"), self)
        
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
                # Устанавливаем иконку для приложения
                import win32gui
                try:
                    win32gui.LoadImage(
                        0, icon_path, win32gui.IMAGE_ICON,
                        0, 0, win32gui.LR_LOADFROMFILE
                    )
                except Exception as e:
                    logging.error(f"Ошибка загрузки иконки: {str(e)}")
        
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
        
        # Подключаем сигналы для модов
        self.add_mod_button.clicked.connect(self.add_mods)
        self.remove_mod_button.clicked.connect(self.remove_selected_mods)
        self.check_updates_button.clicked.connect(self.toggle_auto_updates)
        self.tabWidget.currentChanged.connect(self.on_tab_changed)
        
        # Проверяем Java
        self.check_java()
        self.check_dependencies()
        
        # Загружаем конфигурацию
        self.load_config()
        
        # Устанавливаем путь установки для выбранной версии
        self.load_versions()  # Сначала загружаем версии
        self.setup_path()     # Затем устанавливаем путь установки

        # Подключаем сигналы
        self.browse_button.clicked.connect(self.select_install_path)
        self.start_button.clicked.connect(self.start_installation)
        self.minecraft_version.currentIndexChanged.connect(self.on_minecraft_version_changed)
        self.forge_version.currentIndexChanged.connect(self.on_forge_version_changed)
        self.username.textChanged.connect(self.save_config)
        self.memory_slider.valueChanged.connect(self.on_memory_changed)
        self.launch_flags_input.textChanged.connect(self.save_config)
        self.install_path.textChanged.connect(self.check_game_installed)
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

    def setup_path(self):
        """
        Устанавливает путь для выбранной версии Minecraft
        """
        try:
            # Получаем путь к AppData\Roaming
            if platform.system() == "Windows":
                appdata_path = os.path.join(os.environ.get('APPDATA', ''))
            else:
                # На macOS и Linux используем ~/.IBLauncher
                appdata_path = os.path.expanduser('~')
            
            # Получаем выбранную версию Minecraft
            selected_version = self.minecraft_version.currentText()
            
            # Для версии 1.20.1 используем стандартную папку IBLauncher
            if selected_version == "1.20.1":
                install_path = os.path.join(appdata_path, 'IBLauncher')
            else:
                # Для других версий создаем отдельные папки с именем версии
                install_path = os.path.join(appdata_path, f'IBLauncher_{selected_version}')
            
            # Устанавливаем путь в UI
            self.install_path.setText(install_path)
            self.install_path_str = install_path  # Сохраняем путь в переменной экземпляра
            
            # Создаем директорию, если она не существует
            if not os.path.exists(install_path):
                try:
                    os.makedirs(install_path, exist_ok=True)
                    logging.info(f"Создана директория для установки: {install_path}")
                except Exception as e:
                    logging.error(f"Ошибка при создании директории: {str(e)}")
            
            # Проверяем установку игры
            self.check_game_installed()
        except Exception as e:
            logging.error(f"Ошибка при настройке пути установки: {str(e)}")
            # Используем путь по умолчанию в случае ошибки
            self.install_path.setText(DEFAULT_MINECRAFT_DIR)

    def select_install_path(self):
        path = QFileDialog.getExistingDirectory(
            self,
            "Выберите папку для установки",
            DEFAULT_MINECRAFT_DIR,
            QFileDialog.ShowDirsOnly
        )
        if path:
            self.install_path.setText(path)
            os.makedirs(path, exist_ok=True)
            self.check_game_installed()

    def check_java(self):
        """Проверяет наличие Java"""
        try:
            # Ищем путь к Java так же, как и при запуске
            possible_paths = [
                'javaw.exe',  # Проверяем в PATH
                'java.exe',   # Альтернативный вариант
                r'\usr\bin\java',
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
                    if any(str(v) in version_string for v in range(17, 22)):
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
        try:
            if os.path.exists(CONFIG_FILE):
                with open(CONFIG_FILE, 'r') as f:
                    config = json.load(f)
                    
                    # Загружаем никнейм
                    if 'username' in config:
                        self.username.setText(config['username'])
                    
                    # Загружаем последние выбранные версии
                    self.saved_minecraft_version = config.get('minecraft_version', '1.20.1')
                    self.saved_forge_version = config.get('forge_version', '1.20.1-forge-47.3.22')
                    
                    logging.info(f"Загружена сохраненная версия Minecraft: {self.saved_minecraft_version}")
                    logging.info(f"Загружена сохраненная версия Forge: {self.saved_forge_version}")
                    
                    # Загружаем настройки памяти
                    memory = config.get('memory', None)
                    if memory is not None:
                        self.memory_slider.setValue(int(memory))
                        self.memory_label.setText(f"{memory} ГБ")
                    
                    # Загружаем флаги запуска
                    if 'launch_flags' in config:
                        self.launch_flags_input.setPlainText(config['launch_flags'])
                        
                    # Загружаем настройку автообновления
                    if config.get('auto_update_mods', True):
                        self.check_updates_button.setText("Отключить обновление модов")
                        self.check_updates_button.setStyleSheet("background-color: #2E8B57; color:white; font-weight:bold;");
                        self.mods_update_switch = True
                    else:
                        self.check_updates_button.setText("Включить обновление модов")
                        self.check_updates_button.setStyleSheet("background-color: red; color:white; font-weight:bold;");
                        self.mods_update_switch = False
            else:
                # При первом запуске устанавливаем версии по умолчанию
                self.saved_minecraft_version = '1.20.1'
                self.saved_forge_version = '1.20.1-forge-47.3.22'

        except Exception as e:
            logging.error(f"Ошибка загрузки конфига: {str(e)}")
            # При ошибке также устанавливаем версии по умолчанию
            self.saved_minecraft_version = '1.20.1'
            self.saved_forge_version = '1.20.1-forge-47.3.22'

    def save_config(self):
        """Сохраняет настройки лаунчера"""
        try:
            minecraft_version = self.minecraft_version.currentText()
            forge_version = self.forge_version.currentText() if self.forge_version.isEnabled() else None
            
            config = {
                'username': self.username.text(),
                'memory': self.memory_slider.value(),
                'install_path': self.install_path.text(),
                'minecraft_version': minecraft_version,
                'forge_version': forge_version,
                'launch_flags': self.launch_flags_input.toPlainText(),
                'auto_update_mods': self.mods_update_switch
            }
            
            # Создаём директорию конфига, если она не существует
            os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
            
            with open(CONFIG_FILE, 'w') as f:
                json.dump(config, f)
                
            logging.info(f"Настройки сохранены. Minecraft: {minecraft_version}, Forge: {forge_version}")
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
                        if saved_version:
                            self.minecraft_version.addItem(saved_version)
                            self.minecraft_version.setCurrentText(saved_version)
                            
                            # Загружаем соответствующую версию Forge из кеша
                            if saved_version in self.forge_cache:
                                cached_version = self.forge_cache[saved_version]
                                if isinstance(cached_version, list):
                                    for forge_version in cached_version:
                                        self.forge_version.addItem(forge_version)
                                else:
                                    self.forge_version.addItem(cached_version)
                                self.forge_version.setEnabled(True)
                return

            # Остальной код загрузки версий (существующий)
            versions = []
            for v in get_version_list():
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

            # Устанавливаем сохраненную или дефолтную версию
            default_version = getattr(self, 'saved_minecraft_version', None) or '1.20.1'
            logging.info(f"Выбрана версия по умолчанию: {default_version}")

            default_index = self.minecraft_version.findText(default_version)
            logging.info(f"Индекс версии по умолчанию: {default_index}")

            if default_index >= 0:
                self.minecraft_version.setCurrentIndex(default_index)
                logging.info("Установлена версия Minecraft по умолчанию")

                # Загружаем версию Forge для 1.20.1
                if default_version == "1.20.1":
                    logging.info("Загрузка версии Forge для 1.20.1")
                    forge_version = "1.20.1-47.3.22"
                    forge_display_version = f"1.20.1-forge-47.3.22"  # Добавляем отображаемую версию
                    self.forge_version.addItem(forge_display_version)
                    self.forge_version.setEnabled(True)
                    logging.info(f"Добавлена версия Forge: {forge_display_version}")

                    if "1.20.1" not in self.forge_cache:
                        logging.info("Сохранение версии Forge в кеш")
                        self.save_forge_cache("1.20.1", forge_version)
                # Для других версий проверяем кеш
                elif default_version in self.forge_cache:
                    logging.info(f"Загрузка версии Forge из кеша для {default_version}")
                    cached_version = self.forge_cache[default_version]
                    # Проверяем, является ли cached_version списком
                    if isinstance(cached_version, list):
                        for forge_version in cached_version:
                            forge_full_version = f"{default_version}-forge-{forge_version.split('-')[1]}"
                            self.forge_version.addItem(forge_full_version)
                    else:
                        forge_full_version = f"{default_version}-forge-{cached_version.split('-')[1]}"
                        self.forge_version.addItem(forge_full_version)
                    self.forge_version.setEnabled(True)
            else:
                # Если индекс не найден, устанавливаем 1.20.1
                logging.info("Индекс не найден, устанавливаем версию 1.20.1")
                default_index = self.minecraft_version.findText('1.20.1')
                if default_index >= 0:
                    self.minecraft_version.setCurrentIndex(default_index)
                    forge_version = "1.20.1-47.3.22"
                    forge_display_version = f"1.20.1-forge-47.3.22"  # Добавляем отображаемую версию
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

    def on_minecraft_version_changed(self, index):
        selected_version = self.minecraft_version.currentText()
        self.forge_version.clear()
        self.forge_version.setEnabled(True)

        added_versions = set()

        # Специальная обработка для 1.20.1 - добавляем нашу версию Forge первой
        if selected_version == "1.20.1":
            forge_version = "1.20.1-47.3.22"
            forge_display_version = f"1.20.1-forge-47.3.22"  # Добавляем отображаемую версию
            self.forge_version.addItem(forge_display_version)
            added_versions.add(forge_display_version)
            self.add_to_forge_cache("1.20.1", forge_version)
            self.forge_version.setEnabled(True)
        else:
            # Для всех остальных версий добавляем "Не устанавливать" как первый пункт
            self.forge_version.addItem("Не устанавливать")
            added_versions.add("Не устанавливать")

        # Затем добавляем все кешированные версии для этой версии Minecraft
        cached_versions = []
        if selected_version in self.forge_cache:
            cached_versions = self.forge_cache[selected_version]
            if not isinstance(cached_versions, list):
                cached_versions = [cached_versions]
            for version in cached_versions:
                forge_full_version = f"{selected_version}-forge-{version.split('-')[1]}"
                if forge_full_version not in added_versions:
                    added_versions.add(forge_full_version)
                    self.forge_version.addItem(forge_full_version)

        # Для версий кроме 1.20.1 ищем новые версии в сети
        if selected_version != "1.20.1":
            forge_version = minecraft_launcher_lib.forge.find_forge_version(selected_version)
            if forge_version:
                forge_full_version = f"{selected_version}-forge-{forge_version.split('-')[1]}"
                if forge_full_version not in added_versions:
                    added_versions.add(forge_full_version)
                    self.forge_version.addItem(forge_full_version)
                    self.add_to_forge_cache(selected_version, forge_version)
                self.forge_version.setEnabled(True)

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

            # Проверяем наличие подходящей версии Java
            logging.info(f"Проверка Java для версии {minecraft_version}")
            if not self.check_java_for_version(minecraft_version):
                logging.warning(f"Проверка Java для версии {minecraft_version} не пройдена")
                # Сообщение уже было показано в check_java_for_version
                return
            
            # Определяем версию для установки
            # Если у выбранной версии Forge есть "forge" в имени и это не "Не устанавливать"
            forge_version = None
            if forge_display_version and forge_display_version != "Не устанавливать" and "forge" in forge_display_version.lower():
                try:
                    # Получаем номер версии Forge из форматированного текста
                    # формат: "1.20.1-forge-47.3.22" -> "1.20.1-47.3.22"
                    forge_parts = forge_display_version.split('-forge-')
                    if len(forge_parts) == 2:
                        forge_version = f"{minecraft_version}-{forge_parts[1]}"
                        logging.info(f"Извлечена версия Forge: {forge_version}")
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
                self.memory_slider.value(),
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
            logging.info(f"Запущен поток установки/запуска игры")
                
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
        display_version = self.forge_version.currentText() if self.forge_version.isEnabled() else self.minecraft_version.currentText()
        
        logging.info(f"=== Начало проверки установки игры ===")
        logging.info(f"Путь установки: {install_path}")
        logging.info(f"Отображаемая версия: {display_version}")
        
        # Для проверки используем отображаемую версию как есть, так как папки именно так и называются
        actual_version = display_version
        logging.info(f"Версия для проверки: {actual_version}")
        
        # Проверяем наличие конкретной версии в папке versions
        versions_path = os.path.join(install_path, "versions")
        version_folder = os.path.join(versions_path, actual_version)
        
        logging.info(f"Проверяемая папка: {version_folder}")
        logging.info(f"Папка существует: {os.path.exists(version_folder)}")
        
        if os.path.exists(version_folder):
            files = os.listdir(version_folder)
            logging.info(f"Содержимое папки: {files}")
        
        is_installed = os.path.exists(version_folder) and os.listdir(version_folder)
        logging.info(f"Результат проверки установки: {is_installed}")
        
        if is_installed:
            logging.info("Меняем текст кнопки на 'Играть'")
            self.start_button.setText("Играть")
            if not self.start_button.text() == "Играть":
                logging.error("Не удалось изменить текст кнопки на 'Играть'")
            logging.info(f"Версия {actual_version} найдена в {version_folder}")
        else:
            logging.info("Меняем текст кнопки на 'Установить'")
            self.start_button.setText("Установить")
            if not self.start_button.text() == "Установить":
                logging.error("Не удалось изменить текст кнопки на 'Установить'")
            logging.info(f"Версия {actual_version} не найдена в {version_folder}")
        
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
                'updated_at': datetime.datetime.now().isoformat(),
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
        """Проверяет наличие обновления лаунчера"""
        try:
            current_version = "1.0.6.8"
            
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
        """Обновляет метку версии"""
        try:
            current_version = "1.0.6.8"
            
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
        """
        Проверяет наличие подходящей версии Java для указанной версии Minecraft
        Для версий 1.20.2+ требуется Java 21+
        Для версий 1.20.1 и ниже требуется Java 17+
        """
        try:
            logging.info(f"Проверка требуемой версии Java для Minecraft: {minecraft_version}")
            
            # Определяем, требуется ли Java 21+
            requires_java21 = False
            
            # Упрощенное определение требуемой версии Java - для 1.20.2 и выше требуется Java 21
            if minecraft_version == "1.20.1" or minecraft_version == "1.20.0":
                logging.info(f"Для версии {minecraft_version} требуется Java 17+")
                requires_java21 = False
            else:
                try:
                    # Разбиваем версию на числа
                    parts = minecraft_version.split('.')
                    if len(parts) >= 3:  # Формат x.y.z (1.20.2)
                        major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
                        # Для версии 1.20.2 и выше нужна Java 21
                        if (major > 1) or (major == 1 and minor > 20) or (major == 1 and minor == 20 and patch >= 2):
                            requires_java21 = True
                            logging.info(f"Для версии {minecraft_version} требуется Java 21+")
                    elif len(parts) >= 2:  # Формат x.y (1.21)
                        major, minor = int(parts[0]), int(parts[1])
                        # Для версии 1.21 и выше нужна Java 21
                        if (major > 1) or (major == 1 and minor >= 21):
                            requires_java21 = True
                            logging.info(f"Для версии {minecraft_version} требуется Java 21+")
                except Exception as e:
                    logging.error(f"Ошибка при анализе версии Minecraft: {str(e)}")
                
                if requires_java21:
                    logging.info(f"Для версии {minecraft_version} требуется Java 21+")
                else:
                    logging.info(f"Для версии {minecraft_version} требуется Java 17+")
            
            # Находим путь к Java (аналогично методу find_java в InstallThread)
            java_path = self.find_java_path(requires_java21)
            logging.info(f"Результат поиска Java: {java_path}")
            
            if java_path:
                # Проверяем версию найденной Java
                java_version = self._get_java_version(java_path)
                logging.info(f"Определена версия Java: {java_version}")
                
                # Проверяем соответствие версии требованиям
                if requires_java21 and java_version < 21:
                    logging.warning(f"У вас Java {java_version}, но требуется Java 21+ для Minecraft {minecraft_version}")
                    
                    # Показываем диалог установки Java 21
                    message = (
                        f"Для Minecraft {minecraft_version} требуется Java 21 или выше!\n\n"
                        f"Текущая версия: Java {java_version}\n\n"
                        "Сейчас откроется страница загрузки Oracle Java 21.\n"
                        "На сайте выберите версию для вашей системы (Windows, macOS или Linux)."
                    )
                    
                    response = QMessageBox.critical(
                        self,
                        "Требуется Java 21+",
                        message,
                        QMessageBox.Ok | QMessageBox.Cancel
                    )
                    
                    if response == QMessageBox.Ok:
                        QDesktopServices.openUrl(QUrl("https://www.oracle.com/java/technologies/javase/jdk21-archive-downloads.html"))
                    return False
                    
                elif not requires_java21 and java_version < 17:
                    logging.warning(f"У вас Java {java_version}, но требуется Java 17+ для Minecraft {minecraft_version}")
                    
                    # Показываем диалог установки Java 17
                    message = (
                        f"Для Minecraft {minecraft_version} требуется Java 17 или выше!\n\n"
                        f"Текущая версия: Java {java_version}\n\n"
                        "Сейчас откроется страница загрузки Oracle Java 17.\n"
                        "На сайте выберите версию для вашей системы (Windows, macOS или Linux)."
                    )
                    
                    response = QMessageBox.critical(
                        self,
                        "Требуется Java 17+",
                        message,
                        QMessageBox.Ok | QMessageBox.Cancel
                    )
                    
                    if response == QMessageBox.Ok:
                        QDesktopServices.openUrl(QUrl("https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html"))
                    return False
                    
                else:
                    logging.info(f"Версия Java {java_version} подходит для Minecraft {minecraft_version}")
                    return True
            else:
                logging.warning("Java не найдена в системе")
                
                # Определяем, какую версию Java нужно скачать
                java_url = "https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html"
                java_version_text = "17"
                
                if requires_java21:
                    java_url = "https://www.oracle.com/java/technologies/javase/jdk21-archive-downloads.html"
                    java_version_text = "21"
                
                # Показываем диалог установки Java
                message = (
                    f"Для Minecraft {minecraft_version} требуется Java {java_version_text}+\n\n"
                    "Java не найдена на вашем компьютере.\n\n"
                    "Сейчас откроется страница загрузки Oracle Java.\n"
                    "На сайте выберите версию для вашей системы (Windows, macOS или Linux)."
                )
                
                response = QMessageBox.critical(
                    self,
                    "Java не найдена",
                    message,
                    QMessageBox.Ok | QMessageBox.Cancel
                )
                
                if response == QMessageBox.Ok:
                    QDesktopServices.openUrl(QUrl(java_url))
                return False
                
        except Exception as e:
            logging.error(f"Ошибка при проверке Java: {str(e)}", exc_info=True)
            
            # При ошибке показываем стандартный диалог установки Java 17
            response = QMessageBox.critical(
                self,
                "Ошибка проверки Java",
                "Произошла ошибка при проверке Java.\n\n"
                "Рекомендуется установить Java 17 или новее.\n\n"
                "Сейчас откроется страница загрузки Oracle Java 17.",
                QMessageBox.Ok | QMessageBox.Cancel
            )
            
            if response == QMessageBox.Ok:
                QDesktopServices.openUrl(QUrl("https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html"))
            return False
            
    def find_java_path(self, requires_java21=False):
        """
        Находит путь к Java в системе
        Возвращает путь к Java или None, если Java не найдена
        """
        try:
            # Расширенный список путей для поиска Java
            possible_paths = [
                # Windows paths for Java executables in PATH
                'javaw.exe',
                'java.exe',
                
                # Common installation paths for JDK and JRE
                r'C:\Program Files\Java\jdk-17\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.1\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.2\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.3\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.4\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.5\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.6\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.7\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.8\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.9\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.10\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.11\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17.0.12\bin\javaw.exe',
                
                # Java 21 paths
                r'C:\Program Files\Java\jdk-21\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-21.0.1\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-21.0.2\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-21.0.3\bin\javaw.exe',
                
                # Program Files (x86) paths
                r'C:\Program Files (x86)\Java\jdk-17\bin\javaw.exe',
                r'C:\Program Files (x86)\Java\jdk-17.0.10\bin\javaw.exe',
                r'C:\Program Files (x86)\Java\jdk-21\bin\javaw.exe',
                
                # Adoptium/Eclipse Temurin paths
                r'C:\Program Files\Eclipse Adoptium\jdk-17\bin\javaw.exe',
                r'C:\Program Files\Eclipse Adoptium\jdk-21\bin\javaw.exe',
                r'C:\Program Files\Eclipse Temurin\jdk-17\bin\javaw.exe',
                r'C:\Program Files\Eclipse Temurin\jdk-21\bin\javaw.exe',
                
                # Amazon Corretto
                r'C:\Program Files\Amazon Corretto\jdk17\bin\javaw.exe',
                r'C:\Program Files\Amazon Corretto\jdk21\bin\javaw.exe',
                
                # Microsoft OpenJDK
                r'C:\Program Files\Microsoft\jdk-17\bin\javaw.exe',
                r'C:\Program Files\Microsoft\jdk-21\bin\javaw.exe',
                
                # Unix paths
                r'/usr/bin/java',
                r'/usr/lib/jvm/java-17-openjdk/bin/java',
                r'/usr/lib/jvm/java-21-openjdk/bin/java',
                
                # JAVA_HOME path
                os.path.join(os.environ.get('JAVA_HOME', ''), 'bin', 'javaw.exe'),
                os.path.join(os.environ.get('JAVA_HOME', ''), 'bin', 'java'),
            ]

            # Расширенный поиск через регулярные выражения
            if platform.system() == "Windows":
                # Ищем все доступные версии Java в Program Files
                java_dirs = []
                for root_dir in [r'C:\Program Files\Java', r'C:\Program Files (x86)\Java']:
                    if os.path.exists(root_dir):
                        try:
                            for dir_name in os.listdir(root_dir):
                                if 'jdk' in dir_name.lower() or 'jre' in dir_name.lower():
                                    java_path = os.path.join(root_dir, dir_name, 'bin', 'javaw.exe')
                                    if os.path.exists(java_path):
                                        java_dirs.append(java_path)
                        except Exception as e:
                            logging.error(f"Ошибка при сканировании директории Java: {str(e)}")
                
                # Добавляем найденные пути в список
                possible_paths.extend(java_dirs)
                logging.info(f"Найдены дополнительные пути Java: {java_dirs}")

            java_path = None
            
            # Сначала проверяем через where/which
            try:
                system = platform.system()
                logging.info(f"Операционная система: {system}")
                
                if system == "Darwin":  # macOS
                    result = subprocess.run(['which', 'java'], 
                                        capture_output=True, 
                                        text=True)
                    cmd = 'which java'
                elif system == "Linux":
                    result = subprocess.run(['which', 'java'], 
                                        capture_output=True, 
                                        text=True)
                    cmd = 'which java'
                else:  # Windows
                    result = subprocess.run(['where', 'javaw'], 
                                        capture_output=True, 
                                        text=True, 
                                        creationflags=subprocess.CREATE_NO_WINDOW)
                    cmd = 'where javaw'
                
                logging.info(f"Выполнена команда: {cmd}")
                logging.info(f"Код возврата: {result.returncode}")
                logging.info(f"Вывод команды: {result.stdout}")
                
                if result.returncode == 0:
                    java_paths = result.stdout.strip().split('\n')
                    if java_paths:
                        java_path = java_paths[0]
                        logging.info(f"Java найдена через {cmd}: {java_path}")
            except Exception as e:
                logging.warning(f"Не удалось найти Java через where/which: {str(e)}")

            # Если where/which не нашел, проверяем все возможные пути
            if not java_path:
                logging.info("Поиск Java по всем возможным путям...")
                for path in possible_paths:
                    if os.path.exists(path):
                        java_path = path
                        logging.info(f"Java найдена по пути: {java_path}")
                        break

            if java_path:
                # Проверяем версию найденной Java
                java_exe = java_path.replace('javaw.exe', 'java.exe')
                logging.info(f"Проверка версии Java: {java_exe}")
                
                try:
                    result = subprocess.run(
                        [java_exe, '-version'], 
                        capture_output=True,
                        text=True                    
                    )
                    
                    version_output = result.stderr if result.stderr else result.stdout
                    logging.info(f"Вывод проверки версии Java: {version_output}")
                    
                    # Проверяем версию через регулярное выражение
                    version_pattern = r'version "([^"]+)"'
                    match = re.search(version_pattern, version_output)
                    
                    if match:
                        version_string = match.group(1)
                        logging.info(f"Найдена версия Java: {version_string}")
                        
                        # Извлекаем основной номер версии
                        major_version = self._get_java_version(java_path)
                        logging.info(f"Основной номер версии Java: {major_version}")
                        
                        min_version = 21 if requires_java21 else 17
                        
                        # Проверяем версию - нужна min_version+
                        if major_version >= min_version:
                            logging.info(f"Java версии {major_version} совместима (требуется {min_version}+)")
                            return java_path
                        else:
                            logging.warning(f"Java версии {major_version} ниже требуемой (нужна {min_version}+)")
                    else:
                        logging.warning("Не удалось извлечь версию Java из вывода")
                except Exception as e:
                    logging.error(f"Ошибка при проверке версии Java: {str(e)}")
            
            return None
            
        except Exception as e:
            logging.error(f"Ошибка поиска Java: {str(e)}", exc_info=True)
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

            # Проверяем несколько паттернов версий
            # Oracle Java часто использует формат: "java version "1.8.0_301""
            # Новые версии Oracle Java: "java version "11.0.2""
            # OpenJDK часто использует: "openjdk version "11.0.8""
            version_patterns = [
                r'version "([^"]+)"',               # Стандартный формат
                r'openjdk version "([^"]+)"',       # OpenJDK формат
                r'(\d+)\.(\d+)\.(\d+)(?:_\d+)?',    # Прямой поиск чисел версии
                r'(\d+)-[A-Za-z0-9]+',              # Amazon Corretto/другие формат
                r'(\d+)',                           # Последняя попытка - найти хоть какое-то число
            ]
            
            version_string = None
            for pattern in version_patterns:
                match = re.search(pattern, version_output)
                if match:
                    version_string = match.group(1)
                    logging.info(f"Найдена версия Java по шаблону '{pattern}': {version_string}")
                    break
            
            if not version_string:
                logging.warning("Не удалось определить версию Java")
                return 0
                
            logging.info(f"Извлеченная строка версии Java: {version_string}")

            # Определяем основной номер версии
            # Формат может быть "1.8.0_301" (Java 8) или "11.0.2" (Java 11+) или просто "17" (Java 17)
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
                    except Exception as e2:
                        logging.error(f"Ошибка при парсинге новой версии Java: {str(e)} / {str(e2)}")
                        return 0

        except Exception as e:
            logging.error(f"Ошибка получения версии Java: {str(e)}", exc_info=True)
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

if __name__ == "__main__":
    QApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    while True:
        app = QApplication(sys.argv)
        window = MainWindow()
        window.show()
        exit_code = app.exec_()
        if exit_code != 1337:
            break