import requests
import re

def get_version():
    try:
        # Пробуем получить версию из GitHub
        api_url = "https://api.github.com/repos/mdreval/ib-launcher/releases/latest"
        response = requests.get(api_url, timeout=10)
        response.raise_for_status()
        latest_release = response.json()
        version = latest_release['tag_name'].lstrip('v')
        return version
    except Exception as e:
        print(f"Ошибка получения версии из GitHub: {e}")
        # Если не удалось получить из GitHub, ищем в файле
        try:
            with open('qt_version.py', 'r', encoding='utf-8') as f:
                content = f.read()
                match = re.search(r'CURRENT_VERSION\s*=\s*["\']([0-9.]+)["\']', content)
                if match:
                    return match.group(1)
        except Exception as e:
            print(f"Ошибка чтения версии из файла: {e}")
        
        return "1.0.6.5"  # Версия по умолчанию

def generate_version_info():
    version = get_version()
    version_tuple = tuple(map(int, version.split('.')))
    
    template = f'''# UTF-8
#
VSVersionInfo(
  ffi=FixedFileInfo(
    filevers={version_tuple},
    prodvers={version_tuple},
    mask=0x3f,
    flags=0x0,
    OS=0x40004,
    fileType=0x1,
    subtype=0x0,
    date=(0, 0)
  ),
  kids=[
    StringFileInfo([
      StringTable(
        u'040904B0',
        [StringStruct(u'CompanyName', u'IgroBar'),
        StringStruct(u'FileDescription', u'IB Launcher'),
        StringStruct(u'FileVersion', u'{version}'),
        StringStruct(u'InternalName', u'IB-Launcher'),
        StringStruct(u'LegalCopyright', u'Copyright (c) 2024 Igrobar'),
        StringStruct(u'OriginalFilename', u'IB-Launcher.exe'),
        StringStruct(u'ProductName', u'IB Launcher'),
        StringStruct(u'ProductVersion', u'{version}')])
    ]),
    VarFileInfo([VarStruct(u'Translation', [1033, 1200])])
  ]
)'''
    
    with open('version_info.txt', 'w', encoding='utf-8') as f:
        f.write(template)

if __name__ == '__main__':
    generate_version_info() 