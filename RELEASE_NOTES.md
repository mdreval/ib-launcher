# Release Notes
![Screenshot_1](https://github.com/user-attachments/assets/b4039f36-f94e-4868-8e27-81454031e340)

## Версия 1.0.9.6

### Что нового
- Для Minecraft **1.20.1** по умолчанию выбирается пункт **сервер IGROBAR**, а не номер Forge (`1.20.1-forge-47.4.23`).
- В комбобоксе лоадера игрок видит **сервер IGROBAR**; внутри ставится и запускается нужный Forge (сейчас **47.4.23**).
- Остальные версии Forge и Fabric по-прежнему доступны в том же списке.

### Технические изменения
- Подпись сервера вынесена в переводы (RU / EN / UK).
- Версия Minecraft и Forge профиля сервера задаётся константами `IGROBAR_MC_VERSION` и `IGROBAR_FORGE_VERSION` в `qt_version.py` — для обновления Forge сервера достаточно сменить одну строку.

---

## Версія 1.0.9.6

### Що нового
- Для Minecraft **1.20.1** за замовчуванням обирається пункт **сервер IGROBAR**, а не номер Forge (`1.20.1-forge-47.4.23`).
- У комбобоксі лоадера гравець бачить **сервер IGROBAR**; всередині встановлюється й запускається потрібний Forge (зараз **47.4.23**).
- Інші версії Forge та Fabric як і раніше доступні в тому ж списку.

### Технічні зміни
- Підпис сервера винесено в переклади (RU / EN / UK).
- Версія Minecraft і Forge профілю сервера задається константами `IGROBAR_MC_VERSION` та `IGROBAR_FORGE_VERSION` у `qt_version.py` — щоб оновити Forge сервера, достатньо змінити один рядок.

---

## Version 1.0.9.6

### What's new
- For Minecraft **1.20.1**, the default loader item is **IGROBAR server**, not a Forge version string (`1.20.1-forge-47.4.23`).
- The dropdown shows **IGROBAR server**; the matching Forge build is still installed and launched (currently **47.4.23**).
- Other Forge and Fabric versions remain in the same list.

### Technical changes
- The server label is translated (RU / EN / UK).
- Server Minecraft and Forge versions are `IGROBAR_MC_VERSION` and `IGROBAR_FORGE_VERSION` in `qt_version.py` — bump the Forge build by changing one constant.

---

## Примечания
Эта версия упрощает выбор сборки для игроков сервера IGROBAR: в интерфейсе видна понятная подпись, технический номер Forge скрыт.

## Известные проблемы
- Некоторые антивирусы могут блокировать лаунчер при первом запуске. Это ложное срабатывание, добавьте лаунчер в исключения антивируса.

## Скачать
- [IB-Launcher.exe](https://github.com/mdreval/ib-launcher/releases/download/v1.0.9.6/IB-Launcher.exe) - Windows
- [IB-Launcher.dmg](https://github.com/mdreval/ib-launcher/releases/download/v1.0.9.6/IB-Launcher.dmg) - macOS
