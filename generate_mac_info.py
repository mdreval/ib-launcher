import re
import requests

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
                match = re.search(r'current_version\s*=\s*["\']([0-9.]+)["\']', content)
                if match:
                    return match.group(1)
        except Exception as e:
            print(f"Ошибка чтения версии из файла: {e}")
        
        return "1.0.6.8"  # Версия по умолчанию

def generate_info_plist():
    version = get_version()
    
    template = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>English</string>
    <key>CFBundleDisplayName</key>
    <string>IB-Launcher</string>
    <key>CFBundleExecutable</key>
    <string>IB-Launcher</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>CFBundleIdentifier</key>
    <string>com.igrobar.launcher</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>IB-Launcher</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>{version}</string>
    <key>CFBundleVersion</key>
    <string>{version}</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSHumanReadableCopyright</key>
    <string>Copyright (c) 2024 Igrobar</string>
</dict>
</plist>'''
    
    with open('Info.plist', 'w', encoding='utf-8') as f:
        f.write(template)

if __name__ == '__main__':
    generate_info_plist() 