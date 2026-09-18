# Release Notes
![Screenshot_1](https://github.com/user-attachments/assets/b4039f36-f94e-4868-8e27-81454031e340)

## Версия 1.0.9.8

### Что нового
- Для Minecraft **1.21 и новее** в том же списке, что Forge и Fabric, доступен **NeoForge** (пункт «последняя» и конкретные сборки).
- Установка NeoForge не требует официального Minecraft Launcher: лаунчер создаёт `launcher_profiles.json` и сначала ставит ванильную версию.
- Перед установкой Forge/NeoForge сбрасываются системные переменные `_JAVA_OPTIONS`, `JAVA_OPTIONS`, `JAVA_TOOL_OPTIONS` — из‑за них установщик писал *Picked up _JAVA_OPTIONS: -Xmx8G -Xms512M* и падал.
- Память из слайдера лаунчера (например 9 ГБ для 1.20.1) **не сбрасывается**: в игру по-прежнему уходит `-Xmx` с ползунка.
- **1.20.1**, Forge и Fabric работают как в 1.0.9.6.

### Технические изменения
- Список и установка NeoForge через `minecraft_launcher_lib.mod_loader` (если есть) или Maven NeoForged + `neoforge-*-installer.jar`.
- Внутренний id: `neoforge-loader-{версия}-{minecraft}`; запуск через `get_minecraft_command`, не через команду Forge.

---

## Версія 1.0.9.8

### Що нового
- Для Minecraft **1.21 і новіше** у тому ж списку, що Forge і Fabric, доступний **NeoForge**.
- Встановлення NeoForge не потребує офіційного Minecraft Launcher: створюється `launcher_profiles.json`, спочатку ставиться ваніль.
- Перед встановленням Forge/NeoForge скидаються `_JAVA_OPTIONS` / `JAVA_TOOL_OPTIONS`.
- Памʼять зі слайдера лаунчера не змінюється.
- **1.20.1**, Forge і Fabric працюють як у 1.0.9.6.

### Технічні зміни
- NeoForge через `mod_loader` або Maven + установник JAR.
- Запуск NeoForge як звичайної версії Minecraft, не через Forge-команду.

---

## Version 1.0.9.8

### What's new
- **NeoForge** is in the same loader dropdown as Forge and Fabric for Minecraft **1.21+**.
- NeoForge install does not need the official Minecraft Launcher: a `launcher_profiles.json` is created and vanilla is installed first.
- System `_JAVA_OPTIONS` / `JAVA_TOOL_OPTIONS` are cleared before Forge/NeoForge install (fixes *Picked up _JAVA_OPTIONS: -Xmx8G -Xms512M*).
- The launcher memory slider (e.g. 9 GB for 1.20.1) is **unchanged**; the game still gets `-Xmx` from the slider.
- **1.20.1**, Forge, and Fabric still work as in 1.0.9.6.

### Technical changes
- NeoForge listing/install via `minecraft_launcher_lib.mod_loader` when available, otherwise NeoForged Maven + installer JAR.
- Launch id `neoforge-loader-…` uses `get_minecraft_command`, not the Forge launch path.

---

## Примечания
Слайдер памяти в настройках и флаги запуска лаунчера — это не системный `_JAVA_OPTIONS`. Сброс касается только переменных окружения Windows/IDE, чтобы установщик Forge/NeoForge не подхватывал чужой `-Xmx8G -Xms512M`.

## Известные проблемы
- Некоторые антивирусы могут блокировать лаунчер при первом запуске. Это ложное срабатывание, добавьте лаунчер в исключения антивируса.
- Для снапшотов/pre-release Minecraft Forge может отсутствовать в списке — используйте Fabric или NeoForge, если они есть под эту версию.

## Скачать
- [IB-Launcher.exe](https://github.com/mdreval/ib-launcher/releases/download/v1.0.9.8/IB-Launcher.exe) - Windows
- [IB-Launcher.dmg](https://github.com/mdreval/ib-launcher/releases/download/v1.0.9.8/IB-Launcher.dmg) - macOS
