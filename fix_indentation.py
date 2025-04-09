import re

def fix_indentation(input_file, output_file):
    # Считываем весь файл как текст
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Исправление основных ошибок отступов в методе _install_modpack (строки 495-501)
    pattern = r'(logging\.info\("Моды актуальны"\)\n\s+)return\n\s+else:'
    replacement = r'\1                    return\n                else:'
    content = re.sub(pattern, replacement, content)
    
    # 2. Исправление отступов в методе _prepare_environment
    pattern = r'def _prepare_environment\(self\):\n\s+""".*?"""\n\s+try:\n\s+self\.status_update\.emit'
    replacement = r'def _prepare_environment(self):\n        """Подготавливает окружение для установки"""\n        try:\n            self.status_update.emit'
    content = re.sub(pattern, replacement, content)
    
    # 3. Исправление except в _prepare_environment
    pattern = r'copy_default_configs\(self\.install_path\)\n\s+\n\s+except Exception as e:'
    replacement = r'copy_default_configs(self.install_path)\n            \n        except Exception as e:'
    content = re.sub(pattern, replacement, content)
    
    # 4. Исправление метода setup_path
    pattern = r'def setup_path\(self\):\n\s+""".*?"""\n\s+try:'
    replacement = r'def setup_path(self):\n        """Устанавливает путь для выбранной версии Minecraft"""\n        try:'
    content = re.sub(pattern, replacement, content)
    
    # 5. Исправление проблемы с try/except в setup_path
    pattern = r'self\.check_game_installed\(\)\n\s+\n\s+except Exception as e:'
    replacement = r'self.check_game_installed()\n            \n        except Exception as e:'
    content = re.sub(pattern, replacement, content)
    
    # 6. Исправление метода start_installation
    pattern = r'def start_installation\(self\):\n\s+""".*?"""\n\s+try:\n\s+minecraft_version'
    replacement = r'def start_installation(self):\n        """Запускает установку или игру"""\n        try:\n            minecraft_version'
    content = re.sub(pattern, replacement, content)
    
    # 7. Исправление отступов для username в start_installation
    pattern = r'username = self\.username\.text\(\)\.strip\(\)\n\s+if not username:'
    replacement = r'            username = self.username.text().strip()\n            if not username:'
    content = re.sub(pattern, replacement, content)
    
    # 8. Исправление отступов для except в start_installation
    pattern = r'logging\.info\(f"Запущен поток установки/запуска игры"\)\n\s+\n\s+except Exception as e:'
    replacement = r'logging.info(f"Запущен поток установки/запуска игры")\n                \n        except Exception as e:'
    content = re.sub(pattern, replacement, content)
    
    # 9. Исправление отступа для QMessageBox в except блоке start_installation
    pattern = r'logging\.error\(f"Ошибка запуска установки: {str\(e\)}", exc_info=True\)\n\s+QMessageBox'
    replacement = r'logging.error(f"Ошибка запуска установки: {str(e)}", exc_info=True)\n            QMessageBox'
    content = re.sub(pattern, replacement, content)
    
    # 10. Исправляем отступы для version_to_install в start_installation
    pattern = r'# Определяем, что устанавливать - Forge или Vanilla\n\s+version_to_install'
    replacement = r'            # Определяем, что устанавливать - Forge или Vanilla\n            version_to_install'
    content = re.sub(pattern, replacement, content)
    
    # 11. Исправляем отступы для self.thread в start_installation
    pattern = r'# Создаем поток установки\n\s+self\.thread'
    replacement = r'            # Создаем поток установки\n            self.thread'
    content = re.sub(pattern, replacement, content)
    
    # 12. Исправляем отступы для подключения сигналов
    pattern = r'# Подключаем сигналы\n\s+self\.thread\.progress_update'
    replacement = r'            # Подключаем сигналы\n            self.thread.progress_update'
    content = re.sub(pattern, replacement, content)
    
    # 13. Исправляем отступы для thread.status_update и следующих строк
    pattern = r'self\.thread\.progress_update\.connect\(self\.update_progress\)\n\s+self\.thread\.status_update'
    replacement = r'self.thread.progress_update.connect(self.update_progress)\n            self.thread.status_update'
    content = re.sub(pattern, replacement, content)
    
    # 14. Исправляем отступы для thread.error_occurred и toggle_ui
    pattern = r'self\.thread\.status_update\.connect\(self\.status_label\.setText\)\n\s+self\.thread\.error_occurred'
    replacement = r'self.thread.status_update.connect(self.status_label.setText)\n            self.thread.error_occurred'
    content = re.sub(pattern, replacement, content)
    
    # 15. Исправляем отступы для thread.toggle_ui
    pattern = r'self\.thread\.error_occurred\.connect\(self\.show_error\)\n\s+self\.thread\.toggle_ui'
    replacement = r'self.thread.error_occurred.connect(self.show_error)\n            self.thread.toggle_ui'
    content = re.sub(pattern, replacement, content)
    
    # 16. Исправляем отступы для thread.start
    pattern = r'# Запускаем поток установки\n\s+self\.thread\.start'
    replacement = r'            # Запускаем поток установки\n            self.thread.start'
    content = re.sub(pattern, replacement, content)
    
    # 17. Исправляем отступ для if default_version in self.forge_cache:
    pattern = r'if default_version in self\.forge_cache:\n\s+logging\.info'
    replacement = r'if default_version in self.forge_cache:\n                        logging.info'
    content = re.sub(pattern, replacement, content)
    
    # 18. Исправляем try/except в методе remove_selected_mods
    pattern = r'try:\n\s+if os\.path\.exists\(mod_path\):'
    replacement = r'try:\n                        if os.path.exists(mod_path):'
    content = re.sub(pattern, replacement, content)
    
    # 19. Исправляем отступы для except в remove_selected_mods
    pattern = r'logging\.info\(f"Удален мод: {mod_name}"\)\n\s+except Exception as e:'
    replacement = r'logging.info(f"Удален мод: {mod_name}")\n                    except Exception as e:'
    content = re.sub(pattern, replacement, content)
    
    # 20. Исправляем отступы для logging.error после except
    pattern = r'except Exception as e:\n\s+logging\.error'
    replacement = r'except Exception as e:\n                        logging.error'
    content = re.sub(pattern, replacement, content)
    
    # 21. Исправляем отступы для self.update_mods_list()
    pattern = r'logging\.error\(f"Ошибка удаления мода {mod_name}: {str\(e\)}"\)\n\s+\n\s+self\.update_mods_list'
    replacement = r'logging.error(f"Ошибка удаления мода {mod_name}: {str(e)}")\n                \n            self.update_mods_list'
    content = re.sub(pattern, replacement, content)
    
    # 22. Исправляем except в блоке remove_selected_mods
    pattern = r'self\.update_mods_list\(\)\n\s+\n\s+except Exception as e:'
    replacement = r'self.update_mods_list()\n            \n        except Exception as e:'
    content = re.sub(pattern, replacement, content)
    
    # 23. Исправляем отступы для QMessageBox в except
    pattern = r'logging\.error\(f"Ошибка удаления модов: {str\(e\)}"\)\n\s+QMessageBox'
    replacement = r'logging.error(f"Ошибка удаления модов: {str(e)}")\n            QMessageBox'
    content = re.sub(pattern, replacement, content)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Файл {output_file} создан с исправленными отступами")

if __name__ == "__main__":
    fix_indentation("qt_version.py", "qt_version_fixed.py")
    print("Готово! Проверьте файл qt_version_fixed.py и переименуйте его в qt_version.py, если все выглядит хорошо.") 