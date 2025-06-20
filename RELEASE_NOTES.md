# Release Notes
![Screenshot_1](https://github.com/user-attachments/assets/7474a540-a7ac-4a11-8d19-bd406c685e61)

## Версия 1.0.8.2

### Что нового
- Добавлен индикатор онлайн-игроков сервера прямо в лаунчере
- Улучшено: лаунчер закрывается только после успешного запуска игры (с задержкой), что удобно для медленных ПК
- Улучшено запоминание выбранных версий Minecraft и Forge между запусками
- Исправлены стили и поведение тем (светлая/тёмная)
- Все настройки и путь установки теперь корректно сохраняются и загружаются на macOS

### Технические изменения
- Добавлен универсальный скрипт update_launcher_version.py для автоматического обновления версии во всех файлах проекта
- Исправлено формирование путей и сохранение конфигов на macOS
- Оптимизировано сохранение и загрузка пользовательских настроек
- Улучшена обработка сигналов запуска игры и закрытия лаунчера
- Мелкие улучшения и рефакторинг кода

## Version 1.0.8.2

### What's new
- Added server online players indicator directly in the launcher
- Improved: the launcher now closes only after the game has actually started (with a delay), which is convenient for slow PCs
- Improved remembering of selected Minecraft and Forge versions between launches
- Fixed styles and theme behavior (light/dark)
- All settings and installation path are now correctly saved and loaded on macOS

### Technical changes
- Added universal script update_launcher_version.py for automatic version updating in all project files
- Fixed path formation and config saving on macOS
- Optimized saving and loading of user settings
- Improved handling of game launch and launcher closing signals
- Minor improvements and code refactoring

## Примечания
Эта версия в основном фокусируется на исправлении ошибок и улучшении стабильности лаунчера. Особое внимание было уделено устранению проблемы с появлением командных окон и зависанием лаунчера при запуске игры. Также улучшена совместимость с различными версиями библиотек, чтобы обеспечить бесперебойную работу на разных системах.

## Известные проблемы
- Некоторые антивирусы могут блокировать лаунчер при первом запуске. Это ложное срабатывание, добавьте лаунчер в исключения антивируса.

## Скачать
- [IB-Launcher.exe](https://github.com/mdreval/ib-launcher/releases/download/v1.0.8.2/IB-Launcher.exe) - Windows
- [IB-Launcher.dmg](https://github.com/mdreval/ib-launcher/releases/download/v1.0.8.2/IB-Launcher.dmg) - macOS