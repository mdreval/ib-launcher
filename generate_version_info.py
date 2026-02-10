import requests
import re

def get_version():
    return "1.0.9.2"  # Версия по умолчанию

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
        StringStruct(u'LegalCopyright', u'Copyright (c) 2024-2025 Igrobar'),
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