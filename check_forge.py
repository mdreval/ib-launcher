import minecraft_launcher_lib
import sys
import os
import logging

# Настройка логгирования
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def main():
    # Получаем сигнатуру функции install_forge_version
    forge_func = minecraft_launcher_lib.forge.install_forge_version
    print(f"Сигнатура функции: {forge_func.__name__}")
    
    # Проверяем доступные forge версии
    mc_version = "1.21.4"
    print(f"Проверка доступных Forge версий...")
    
    try:
        forge_versions = minecraft_launcher_lib.forge.list_forge_versions()
        print(f"Доступные Forge версии: {len(forge_versions)} версий")
        
        # Фильтруем версии для Minecraft 1.21.4
        mc_forge_versions = [v for v in forge_versions if v.startswith(f"{mc_version}-")]
        print(f"Forge версии для Minecraft {mc_version}: {mc_forge_versions}")
        
        if mc_forge_versions:
            print(f"Полный формат версии Forge: {mc_forge_versions[0]}")
    except Exception as e:
        print(f"Ошибка при получении списка версий Forge: {str(e)}")
    
    # Проверяем правильное использование функции
    test_path = os.path.join(os.getcwd(), "test_minecraft")
    os.makedirs(test_path, exist_ok=True)
    
    print(f"\nПравильный формат вызова install_forge_version:")
    print(f"minecraft_launcher_lib.forge.install_forge_version(")
    print(f"    versionid=\"1.21.4-54.1.0\",")
    print(f"    path=\"{test_path}\",")
    print(f"    callback={{'setStatus': lambda text: print(text), 'setProgress': lambda val: None}}")
    print(f")")

if __name__ == "__main__":
    main() 