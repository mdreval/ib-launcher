import os
import sys
import logging
import platform
from PyQt5.QtWidgets import (QApplication, QMainWindow, QMessageBox, QPushButton, 
                            QVBoxLayout, QWidget, QLabel)
from PyQt5.QtCore import Qt
from datetime import datetime

# Настройка логирования
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    filename="launcher_simple.log",
    filemode='w',
    encoding='utf-8'
)

class SimpleMainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        
        # Настройка окна
        self.setWindowTitle("Временный лаунчер")
        self.setGeometry(100, 100, 400, 300)
        
        # Центральный виджет
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # Вертикальная компоновка
        layout = QVBoxLayout(central_widget)
        
        # Заголовок
        header = QLabel("Временный лаунчер")
        header.setAlignment(Qt.AlignCenter)
        header.setStyleSheet("font-size: 20px; font-weight: bold;")
        layout.addWidget(header)
        
        # Информационное сообщение
        info = QLabel("Обнаружены проблемы с основным лаунчером.\nИдет исправление...")
        info.setAlignment(Qt.AlignCenter)
        layout.addWidget(info)
        
        # Показываем информацию о системе
        system_info = QLabel(f"Операционная система: {platform.system()} {platform.version()}")
        system_info.setAlignment(Qt.AlignCenter)
        layout.addWidget(system_info)
        
        # Логи
        log_button = QPushButton("Просмотр логов")
        log_button.clicked.connect(self.view_logs)
        layout.addWidget(log_button)
        
        # Кнопка исправления
        fix_button = QPushButton("Исправить лаунчер")
        fix_button.clicked.connect(self.fix_launcher)
        layout.addWidget(fix_button)
        
        # Статус
        self.status_label = QLabel("Ожидание действий...")
        self.status_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(self.status_label)
        
        # Выводим стартовое сообщение
        logging.info(f"=========== ЗАПУСК ВРЕМЕННОГО ЛАУНЧЕРА {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ===========")
        logging.info(f"Версия Python: {sys.version}")
        logging.info(f"Операционная система: {platform.system()} {platform.version()}")
    
    def view_logs(self):
        """Открывает окно для просмотра логов"""
        msg = QMessageBox()
        msg.setWindowTitle("Логи лаунчера")
        
        try:
            with open("launcher_simple.log", 'r', encoding='utf-8') as f:
                log_content = f.read()
            
            msg.setText(log_content[-2000:] if len(log_content) > 2000 else log_content)
            msg.setStandardButtons(QMessageBox.Ok)
            msg.exec_()
        except Exception as e:
            logging.error(f"Ошибка при открытии логов: {str(e)}")
            QMessageBox.critical(self, "Ошибка", f"Не удалось открыть логи: {str(e)}")
    
    def fix_launcher(self):
        """Исправляет основной файл лаунчера"""
        try:
            self.status_label.setText("Исправление лаунчера...")
            
            # Прочитаем основной файл лаунчера
            with open('qt_version.py', 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
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
                logging.info(f"Удаление метода add_to_forge_cache (строки {start_line+1}-{end_line})")
                fixed_lines = lines[:start_line] + lines[end_line:]
                
                # Сохраняем исправленный файл
                backup_file = f"qt_version_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.py"
                with open(backup_file, 'w', encoding='utf-8') as f:
                    f.writelines(lines)
                
                with open('qt_version_new.py', 'w', encoding='utf-8') as f:
                    f.writelines(fixed_lines)
                
                self.status_label.setText(f"Лаунчер исправлен! Резервная копия: {backup_file}")
                logging.info(f"Лаунчер исправлен! Резервная копия: {backup_file}")
                
                # Показываем сообщение
                QMessageBox.information(self, "Успех", 
                    f"Лаунчер исправлен! Резервная копия: {backup_file}\n"
                    f"Новый файл: qt_version_new.py\n\n"
                    f"Вы можете скопировать новый файл и переименовать его в qt_version.py вручную.")
            else:
                self.status_label.setText("Проблемный метод не найден")
                logging.warning("Проблемный метод не найден")
        
        except Exception as e:
            logging.error(f"Ошибка при исправлении лаунчера: {str(e)}")
            self.status_label.setText(f"Ошибка: {str(e)}")
            QMessageBox.critical(self, "Ошибка", f"Не удалось исправить лаунчер: {str(e)}")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = SimpleMainWindow()
    window.show()
    sys.exit(app.exec_()) 