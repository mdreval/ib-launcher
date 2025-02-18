@echo off

rmdir /s /q build

rmdir /s /q dist

del *.spec



pyinstaller --noconfirm --onefile --windowed ^

    --add-data "design.ui;." ^

    --add-data "assets/*;assets/" ^

    --icon "assets/icon.ico" ^

    --version-file "file_version_info.txt" ^

    --name "IB-Launcher" ^

    qt_version.py



pause