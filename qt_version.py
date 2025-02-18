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
                            QPlainTextEdit)
from PyQt5.QtGui import QPixmap, QDesktopServices, QFont, QIcon
from PyQt5 import uic
from minecraft_launcher_lib.utils import get_version_list
from minecraft_launcher_lib.install import install_minecraft_version
from minecraft_launcher_lib.command import get_minecraft_command
from random_username.generate import generate_username
import minecraft_launcher_lib.forge
import nbtlib
import time

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

    def __init__(self, version, username, install_path, memory=4, launch_flags_input=None):
        super().__init__()
        self.version = version
        self.username = username
        self.install_path = install_path
        self.memory = memory
        self.launch_flags_input = launch_flags_input
        self.stop_requested = False

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
        try:
            self.status_update.emit("Проверка модпака...")
            
            # Проверяем, запущены ли мы из exe
            is_bundled = getattr(sys, 'frozen', False)
            
            # Подготавливаем папку mods
            mods_dir = os.path.join(self.install_path, "mods")
            os.makedirs(mods_dir, exist_ok=True)
            
            # Проверяем нужно ли обновление
            needs_update = False
            mods_info_file = os.path.join(mods_dir, "mods_info.json")
            
            if not is_bundled:
                # Для локальной версии проверяем modpack.zip в assets
                local_modpack = resource_path(os.path.join("assets", "modpack.zip"))
                if os.path.exists(local_modpack):
                    local_pack_size = os.path.getsize(local_modpack)
                    local_pack_time = os.path.getmtime(local_modpack)
                    
                    if os.path.exists(mods_info_file):
                        with open(mods_info_file, 'r') as f:
                            local_info = json.load(f)
                            if (local_info['size'] != local_pack_size or 
                                local_info['updated_at'] != local_pack_time):
                                needs_update = True
                    else:
                        needs_update = True
                    
                    if needs_update:
                        # Удаляем старые моды если нужно обновление
                        self.status_update.emit("Удаление старых модов...")
                        for file in os.listdir(mods_dir):
                            if file.endswith('.jar'):
                                try:
                                    file_path = os.path.join(mods_dir, file)
                                    os.remove(file_path)
                                    logging.info(f"Удален старый мод: {file}")
                                except Exception as e:
                                    logging.error(f"Ошибка удаления мода {file}: {str(e)}")
                        
                        # Устанавливаем моды из локального архива
                        self.status_update.emit("Установка модов из локального архива...")
                        with zipfile.ZipFile(local_modpack, 'r') as zip_ref:
                            for file_info in zip_ref.filelist:
                                if file_info.filename.endswith('.jar'):
                                    zip_ref.extract(file_info.filename, mods_dir)
                                    logging.info(f"Установлен мод: {file_info.filename}")
                        
                        # Сохраняем информацию о модах
                        with open(mods_info_file, 'w') as f:
                            json.dump({
                                'size': local_pack_size,
                                'updated_at': local_pack_time
                            }, f)
                        
                        logging.info("Локальный модпак установлен")
                    else:
                        logging.info("Моды не требуют обновления")
                    
                    return  # Выходим после установки локального модпака
                else:
                    logging.warning("Модпак не найден в assets")
            
            # Для exe версии проверяем GitHub только если нет локального модпака
            if is_bundled:
                self.status_update.emit("Загрузка модпака с GitHub...")
                api_url = "https://api.github.com/repos/mdreval/ib-launcher/releases/latest"
                response = requests.get(api_url, timeout=10, verify=True)
                response.raise_for_status()
                release_data = response.json()
                
                modpack_asset = next((asset for asset in release_data['assets'] 
                                    if asset['name'] == 'modpack.zip'), None)
                if not modpack_asset:
                    raise ValueError("Модпак не найден в релизе")
                
                # Далее код установки с GitHub...
                
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
                r'C:\Program Files\Java\jdk-17.0.10\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17\bin\javaw.exe',
                os.path.join(os.environ.get('JAVA_HOME', ''), 'bin', 'javaw.exe'),
            ]

            # Сначала проверяем через where
            try:
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
                creationflags=subprocess.CREATE_NO_WINDOW,
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
            # Ищем путь к Java так же, как и при запуске
            possible_paths = [
                'javaw.exe',  # Проверяем в PATH
                'java.exe',   # Альтернативный вариант
                r'C:\Program Files\Java\jdk-17.0.10\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17\bin\javaw.exe',
                r'C:\Program Files\Eclipse Adoptium\jdk-17\bin\javaw.exe',
                os.path.join(os.environ.get('JAVA_HOME', ''), 'bin', 'javaw.exe'),
            ]

            java_path = None
            
            # Сначала проверяем через where
            try:
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
                    text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW
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
        
        self.setup_path()
        self.check_java()
        self.check_dependencies()
        
        # Загружаем конфигурацию и версии
        self.load_config()
        self.load_versions()

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

    def setup_path(self):
        self.install_path.setText(DEFAULT_MINECRAFT_DIR)
        os.makedirs(DEFAULT_MINECRAFT_DIR, exist_ok=True)
        self.check_game_installed()

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
                r'C:\Program Files\Java\jdk-17.0.10\bin\javaw.exe',
                r'C:\Program Files\Java\jdk-17\bin\javaw.exe',
                r'C:\Program Files\Eclipse Adoptium\jdk-17\bin\javaw.exe',
                os.path.join(os.environ.get('JAVA_HOME', ''), 'bin', 'javaw.exe'),
            ]

            java_path = None
            
            # Сначала проверяем через where
            try:
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
                    text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW
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
                        return True
            
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
                    
                    # Загружаем путь установки
                    install_path = config.get('install_path', '')
                    if install_path:
                        self.install_path.setText(install_path)
                    else:
                        self.install_path.setText(DEFAULT_MINECRAFT_DIR)
                    
                    # Загружаем настройки памяти
                    memory = config.get('memory', None)
                    if memory is not None:
                        self.memory_slider.setValue(int(memory))
                        self.memory_label.setText(f"{memory} ГБ")
                    
                    # Загружаем флаги запуска
                    if 'launch_flags' in config:
                        self.launch_flags_input.setPlainText(config['launch_flags'])
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
            config = {
                'username': self.username.text(),
                'memory': self.memory_slider.value(),
                'install_path': self.install_path.text()
            }
            with open(CONFIG_FILE, 'w') as f:
                json.dump(config, f)
            logging.info("Настройки сохранены")
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
                self._install_modpack()
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

        self.status_label.setText(f"Выбрана версия Minecraft: {selected_version}")
        self.check_game_installed()
        
        # Если это версия 1.20.1, устанавливаем первую версию Forge как выбранную
        if selected_version == "1.20.1" and self.forge_version.count() > 0:
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
        """Запускает установку"""
        try:
            minecraft_version = self.minecraft_version.currentText()
            forge_display_version = self.forge_version.currentText() if self.forge_version.isEnabled() else None
            
            # Преобразуем отображаемую версию Forge в реальную
            if forge_display_version and forge_display_version.startswith("1.20.1-forge-"):
                forge_version = forge_display_version.replace("-forge-", "-")
            else:
                forge_version = forge_display_version
            
            username = self.username.text().strip()
            install_path = self.install_path.text().strip()

            if not username:
                QMessageBox.warning(self, "Ошибка", "Введите имя игрока!")
                self.username.setFocus()
                return

            if not minecraft_version:
                QMessageBox.warning(self, "Ошибка", "Выберите версию Minecraft!")
                return

            if not os.access(install_path, os.W_OK):
                QMessageBox.critical(self, "Ошибка", "Нет прав на запись в выбранную папку!")
                return

            # Проверяем наличие модов
            mods_dir = os.path.join(install_path, "mods")
            if not os.path.exists(mods_dir) or not os.listdir(mods_dir):
                # Проверяем локальный modpack.zip
                local_modpack = resource_path(os.path.join("assets", "modpack.zip"))
                if os.path.exists(local_modpack):
                    logging.info("Найден локальный modpack.zip")
                    self.status_label.setText("Установка модпака...")
                    
                    # Создаем папку mods если её нет
                    os.makedirs(mods_dir, exist_ok=True)
                    
                    # Распаковываем модпак
                    with zipfile.ZipFile(local_modpack, 'r') as zip_ref:
                        # Получаем список файлов в архиве
                        for file_info in zip_ref.filelist:
                            # Проверяем, что это jar файл
                            if file_info.filename.endswith('.jar'):
                                # Извлекаем только в папку mods
                                zip_ref.extract(file_info.filename, mods_dir)
                                logging.info(f"Установлен мод: {file_info.filename}")
                    
                    logging.info("Модпак установлен из assets")
                else:
                    logging.warning("Модпак не найден в assets")
                    QMessageBox.warning(self, "Внимание", "Модпак не найден!")
                    return

            # Если все проверки пройдены, запускаем установку/игру
            version_to_install = forge_version if forge_version else minecraft_version
            logging.info(f"Выбрана версия для установки: {version_to_install}")

            self.thread = InstallThread(
                version_to_install,
                username,
                install_path,
                self.memory_slider.value(),
                self.launch_flags_input
            )
            
            # Подключаем сигналы из потока к слотам главного окна
            self.thread.progress_update.connect(self.update_progress)
            self.thread.status_update.connect(self.status_label.setText)
            self.thread.error_occurred.connect(self.show_error)
            self.thread.toggle_ui.connect(self.toggle_ui_elements)
            
            self.thread.start()
            
        except Exception as e:
            logging.error(f"Ошибка запуска установки: {str(e)}")
            QMessageBox.critical(self, "Ошибка", str(e))

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
            self.status_update.emit("Проверка обновлений модов...")
            
            # Проверяем, запущены ли мы из exe
            is_bundled = getattr(sys, 'frozen', False)
            
            if not is_bundled:
                # Для локальной версии проверяем modpack.zip в assets
                local_modpack = resource_path(os.path.join("assets", "modpack.zip"))
                if os.path.exists(local_modpack):
                    # Получаем размер и дату локального модпака
                    local_pack_size = os.path.getsize(local_modpack)
                    local_pack_time = os.path.getmtime(local_modpack)
                    
                    # Проверяем локальные моды
                    mods_dir = os.path.join(self.install_path, "mods")
                    if not os.path.exists(mods_dir):
                        return True  # Нужно установить моды
                        
                    # Проверяем файл с информацией о модах
                    mods_info_file = os.path.join(mods_dir, "mods_info.json")
                    
                    if os.path.exists(mods_info_file):
                        with open(mods_info_file, 'r') as f:
                            local_info = json.load(f)
                            
                        # Сравниваем размер и дату
                        if (local_info['size'] != local_pack_size or 
                            local_info['updated_at'] != local_pack_time):
                            logging.info("Найдено обновление модов в assets")
                            return True
                    else:
                        # Если файла нет, нужно обновить моды
                        return True
                        
                    logging.info("Локальные моды не требуют обновления")
                    return False
                else:
                    logging.warning("Модпак не найден в assets")
                    return False
            
            # Для exe версии проверяем GitHub
            # ... существующий код проверки GitHub ...

        except Exception as e:
            logging.error(f"Ошибка проверки модов: {str(e)}")
            return False

    def check_launcher_update(self):
        """Проверяет наличие обновлений лаунчера"""
        try:
            # Текущая версия лаунчера
            CURRENT_VERSION = "1.0.2.9"
            
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
            
            if launcher_updated and latest_version > CURRENT_VERSION:
                # Показываем диалог обновления
                update_dialog = QMessageBox()
                update_dialog.setWindowTitle("Доступно обновление")
                update_dialog.setText(f"Доступна новая версия лаунчера: {latest_version}\n\nТекущая версия: {CURRENT_VERSION}")
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
        """Обновляет отображение версии из GitHub"""
        try:
            api_url = "https://api.github.com/repos/mdreval/ib-launcher/releases/latest"
            response = requests.get(api_url, timeout=10, verify=True)
            response.raise_for_status()
            latest_release = response.json()
            version = latest_release['tag_name'].lstrip('v')
            self.version_label.setText(f"Версия: {version}")
        except Exception as e:
            logging.error(f"Ошибка получения версии: {str(e)}")
            self.version_label.setText("Версия: Неизвестно")

if __name__ == "__main__":
    QApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    while True:
        app = QApplication(sys.argv)
        window = MainWindow()
        window.show()
        exit_code = app.exec_()
        if exit_code != 1337:
            break