# Release Notes
![Screenshot_1](https://github.com/user-attachments/assets/d272e853-a86d-4ead-9be0-ec16cc2df348)

## Версия 1.0.9.3

### Что нового

- В комбобоксе лоадера (рядом с Forge) доступен **Fabric**: пункт «последняя» версия лоадера и список недавних версий (стабильные и нестабильные помечены).
- В списке версий Minecraft отображаются **снапшоты** (не раньше по времени релиза 1.20.1).
- **Java** проверяется только при нажатии «Установить» или «Играть», а не при запуске лаунчера.
- Требуемая **мажорная** версия Java зависит от выбранной версии Minecraft (17 / 21 / 25); установленная **более новая** JVM подходит. Диалоги и подсказки по загрузке — на языке интерфейса (RU / UK / EN), с учётом Windows / macOS / Linux.

### Технические изменения

- Установка и запуск Fabric через `minecraft_launcher_lib.fabric`; исправлена логика выбора JVM и запуска (Fabric не обрабатывается как Forge).
- Убраны блокирующие диалоги Java из фонового потока установки; матрица минимальной Java вынесена в общую логику (`get_min_java_for_minecraft` и ссылки Oracle по якорям java17 / java21 / java25).

---

## Версія 1.0.9.3

### Що нового

- У комбобоксі лоадера (поруч із Forge) доступний **Fabric**: пункт «остання» версія лоадера та список недавніх версій (нестабільні позначені).
- У списку версій Minecraft показуються **знімки** (не раніше за час релізу 1.20.1).
- **Java** перевіряється лише при натисканні «Встановити» або «Грати», а не при запуску лаунчера.
- Потрібна **мажорна** версія Java залежить від обраної версії Minecraft (17 / 21 / 25); **новіша** JVM підходить. Діалоги та підказки — мовою інтерфейсу (RU / UK / EN), з урахуванням Windows / macOS / Linux.

### Технічні зміни

- Встановлення та запуск Fabric через `minecraft_launcher_lib.fabric`; виправлено вибір JVM і запуск (Fabric не обробляється як Forge).
- Прибрано блокуючі діалоги Java з фонового потоку встановлення; матриця мінімальної Java винесена в спільну логіку та посилання Oracle (#java17 / #java21 / #java25).

---

## Version 1.0.9.3

### What's new

- **Fabric** is available in the same loader combo as Forge (latest loader plus many recent versions; pre-release loaders are labeled).
- **Snapshots** appear in the Minecraft version list (from the 1.20.1 release timestamp onward).
- **Java** is validated only when you click **Install** or **Play**, not when the launcher starts.
- Required **major** Java depends on the selected Minecraft version (17 / 21 / 25); **newer** JVMs are accepted. Dialogs and download hints follow UI language (RU / UK / EN) and OS.

### Technical changes

- Fabric install/launch via `minecraft_launcher_lib.fabric`; JVM selection and launch path fixed so Fabric is not mistaken for Forge.
- Removed Java message boxes from the install thread; centralized minimum-Java rules and Oracle download anchors (java17 / java21 / java25).

---

## Примечания
Эта версия в основном фокусируется на исправлении ошибок и улучшении стабильности лаунчера. Особое внимание было уделено устранению проблемы с появлением командных окон и зависанием лаунчера при запуске игры. Также улучшена совместимость с различными версиями библиотек, чтобы обеспечить бесперебойную работу на разных системах.

## Известные проблемы
- Некоторые антивирусы могут блокировать лаунчер при первом запуске. Это ложное срабатывание, добавьте лаунчер в исключения антивируса.

## Скачать
- [IB-Launcher.exe](https://github.com/mdreval/ib-launcher/releases/download/v1.0.9.3/IB-Launcher.exe) - Windows
- [IB-Launcher.dmg](https://github.com/mdreval/ib-launcher/releases/download/v1.0.9.3/IB-Launcher.dmg) - macOS