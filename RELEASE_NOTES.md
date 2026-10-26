# Release Notes
![Screenshot_1](https://github.com/user-attachments/assets/b4039f36-f94e-4868-8e27-81454031e340)

## 🚀 Релиз v1.1.0.3 — Умное сохранение версий, мониторинг запуска и чистота файлов

### 🛠 Что нового и исправлено:
- **Умное запоминание версий и лоадеров:** 
  - Профиль сервера «Игробар» (`1.21.1`) теперь автоматически выбирается **только при самом первом запуске** лаунчера (когда файл конфигурации ещё не создан).
  - При последующих запусках лаунчер честно запоминает и восстанавливает ваш последний ручной выбор (будь то другая версия Minecraft, кастомный Forge, NeoForge, Fabric или чистая ваниль с пунктом «Не устанавливать»). Больше не нужно заново искать нужный лоадер в списке!
- **Живой мониторинг запущенной игры:** 
  - Переход со стандартного скрытия вывода (`DEVNULL`) на потоковое чтение `stdout` (`subprocess.PIPE`).
  - Лаунчер в реальном времени отслеживает технические логи игры в фоновом потоке и выводит актуальные статусы в поле информации (*Инициализация OpenGL, Загрузка модификаций, Загрузка ресурсов*).
- **Исправление зависаний старых версий (1.12.x) в оконном режиме:** 
  - Устранена проблема с зависанием Minecraft 1.12.2 на базе LWJGL 2 при переходе в оконный режим (`fullscreen:false`) на Windows 11. Потоковая обработка вывода полностью сняла этот конфликт.
- **Очистка рабочего стола от логов установщиков:** 
  - Добавлен параметр `cwd=temp_dir` для внешних Java-установщиков NeoForge/Forge. Теперь технические файлы отчетов (`.jar.log`) создаются во временной директории и автоматически удаляются вместе с ней, оставляя рабочий стол и папку лаунчера идеально чистыми.

## 🚀 Release v1.1.0.3 — Smart Version Persistence, Launch Monitoring & File Cleanup

### 🛠 What's New and Fixed:
- **Smart Version & Loader Persistence:** 
  - The default "Igrobar" server profile (`1.21.1`) is now automatically selected **only on the very first launch** of the launcher (when no config file exists).
  - On subsequent launches, the launcher restores your last manual selection (whether it's another Minecraft version, custom Forge, NeoForge, Fabric, or vanilla with "Do not install"). No need to re-select your preferred loader every time!
- **Live Launch Monitoring:** 
  - Switched from piping output to `DEVNULL` to real-time `stdout` reading (`subprocess.PIPE`).
  - The launcher monitors game logs in a background thread and updates the status label live (*Initializing OpenGL, Loading mods, Reloading resources*).
- **Legacy (1.12.x) Windowed Mode Fix:** 
  - Resolved an issue where Minecraft 1.12.2 (LWJGL 2) hung on startup in windowed mode (`fullscreen:false`) on Windows 11 due to output buffer deadlocks. Continuous log streaming completely fixed this bug.
- **Installer Log Cleanup:** 
  - Added `cwd=temp_dir` execution context for NeoForge/Forge subprocesses. Technical installer log files (`.jar.log`) are now stored in a temporary directory and automatically deleted upon completion, keeping your desktop and launcher folders clean.

## 🚀 Реліз v1.1.0.3 — Розумне збереження версій, моніторинг запуску та чистота файлів

### 🛠 Що нового та виправлено:
- **Розумне запам'ятовування версій та лоадерів:** 
  - Профіль сервера «Ігробар» (`1.21.1`) тепер автоматично обирається **тільки під час першого запуску** лаунчера (коли файл конфігурації ще не створено).
  - При наступних запусках лаунчер чесно запам'ятовує та відновлює ваш останній вибір (іншу версію Minecraft, кастомний Forge, NeoForge, Fabric чи ванілу з пунктом «Не встановлювати»). Більше не потрібно щоразу шукати потрібний лоадер у списку!
- **Живий моніторинг запуску гри:** 
  - Перехід зі стандартного приховування виводу (`DEVNULL`) на потокове читання `stdout` (`subprocess.PIPE`).
  - Лаунчер у реальному часі відстежує технічні логи гри у фоновому потоці та виводить актуальні статуси у текстове поле (*Ініціалізація OpenGL, Завантаження модифікацій, Завантаження ресурсів*).
- **Виправлення зависань старих версій (1.12.x) у віконному режимі:** 
  - Усунуто проблему із зависанням Minecraft 1.12.2 на базі LWJGL 2 при запуску у віконному режимі (`fullscreen:false`) на Windows 11. Потокова обробка виводу повністю вирішила цей конфлікт.
- **Очищення робочого столу від логів установників:** 
  - Додано параметр `cwd=temp_dir` для зовнішніх Java-установників NeoForge/Forge. Тепер технічні файли звітів (`.jar.log`) створюються у тимчасовій директорії та автоматично видаляються разом із нею, залишаючи робочий стіл і папку лаунчера ідеально чистими.

## Скачать / Завантажити / Download

* [IB-Launcher.exe](https://github.com/mdreval/ib-launcher/releases/download/v1.1.0.3/IB-Launcher.exe) - Windows

* [IB-Launcher.dmg](https://github.com/mdreval/ib-launcher/releases/download/v1.1.0.3/IB-Launcher.dmg) - macOS