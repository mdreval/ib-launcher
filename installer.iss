[Setup][Setup]
AppName=IB Launcher
AppVersion=1.1.0.3
DefaultDirName={autopf}\IBLauncher
DefaultGroupName=IB Launcher
OutputDir=Output
OutputBaseFilename=IBLauncher_Setup
SetupIconFile=assets\icon.ico
Compression=lzma
SolidCompression=yes
; Добавляем иконку и информацию для нормального удаления программы
UninstallDisplayIcon={app}\IBLauncher.exe

[Files]
; Упаковываем ТОЛЬКО скомпилированный через PyInstaller exe-файл.
; Папку assets больше копировать не нужно, она уже внутри файла!
Source: "dist\IB-Launcher.exe"; DestDir: "{app}"; DestName: "IBLauncher.exe"; Flags: ignoreversion

[Icons]
; Ярлык в меню «Пуск»
Name: "{group}\IB Launcher"; Filename: "{app}\IBLauncher.exe"
; Ссылка на деинсталлятор в меню «Пуск»
Name: "{group}\Удалить IB Launcher"; Filename: "{uninstallexe}"
; Ярлык на рабочем столе
Name: "{autodesktop}\IB Launcher"; Filename: "{app}\IBLauncher.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Создать значок на рабочем столе"; GroupDescription: "Дополнительные значки:"

[Run]
Filename: "{app}\IBLauncher.exe"; Description: "Запустить IB Launcher"; Flags: nowait postinstall skipifsilent