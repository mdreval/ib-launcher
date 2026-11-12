/**
 * Понятные причины вылетов: читает журнал игры после падения и ищет
 * знакомые ошибки. Возвращает список { title, text } — показывается в
 * «Журнале игры» над логом.
 */

const RULES = [
  {
    test: /java\.lang\.OutOfMemoryError|There is insufficient memory for the Java Runtime|GC overhead limit exceeded/i,
    title: "Игре не хватило памяти",
    text: "Увеличьте память для игры в настройках сборки (для модпаков обычно нужно 6–8 ГБ) и закройте лишние программы.",
  },
  {
    test: /Could not reserve enough space for .*object heap|Invalid maximum heap size/i,
    title: "Выделено больше памяти, чем доступно",
    text: "Уменьшите память для игры в настройках сборки — столько свободной памяти на компьютере нет.",
  },
  {
    test: /UnsupportedClassVersionError|has been compiled by a more recent version of the Java Runtime/i,
    title: "Мод не подходит к версии Java",
    text: "Какой-то мод собран под более новую Java, чем нужна этой версии Minecraft. Скорее всего, мод не для этой версии игры — удалите или замените его.",
  },
  {
    test: /DuplicateModsFoundException|Found duplicate mods|Duplicate mods found|Mod ID .* is provided by multiple/i,
    title: "Один и тот же мод установлен дважды",
    text: "В папке mods две версии одного мода. Оставьте одну — на вкладке «Моды» выключите или удалите лишнюю.",
  },
  {
    test: /Missing or unsupported mandatory dependencies|requires .* (?:of|version) .*, which is missing|Mod resolution failed|Unmet dependency/i,
    title: "Не хватает мода-зависимости",
    text: "Одному из модов нужен другой мод, которого нет (или он не той версии). На вкладке «Моды» нажмите «Исправить» у мода с пометкой «не хватает зависимостей».",
    extract: /(?:Mod ID: '([\w-]+)'|requires (?:any version of |version [^ ]+ of )?([\w-]+))/gi,
  },
  {
    test: /Incompatible mods found|is incompatible with|breaks .* which is installed/i,
    title: "Моды несовместимы друг с другом",
    text: "Два мода не работают вместе. Удалите один из них — их названия есть в строках журнала с «incompatible».",
  },
  {
    test: /Mixin apply failed|MixinApplyError|InvalidInjectionException|mixin\.transformer\.throwables/i,
    title: "Конфликт модов (Mixin)",
    text: "Какой-то мод не смог встроиться в игру — обычно из-за несовместимости модов или мода не для этой версии. Название мода — в строках журнала с «mixin».",
  },
  {
    test: /Pixel format not accelerated|GLFW error 65542|WGL: The driver does not appear to support OpenGL|No OpenGL context found|OpenGL 3\.2/i,
    title: "Проблема с видеодрайвером",
    text: "Игра не смогла запустить графику. Обновите драйвер видеокарты с сайта NVIDIA, AMD или Intel. На ноутбуке выберите для Java дискретную видеокарту.",
  },
  {
    test: /EXCEPTION_ACCESS_VIOLATION|SIGSEGV|A fatal error has been detected by the Java Runtime/i,
    title: "Игра упала на уровне драйвера или Java",
    text: "Чаще всего это видеодрайвер или мод, работающий с графикой (шейдеры, Sodium/Embeddium). Обновите драйвер видеокарты, попробуйте выключить шейдеры.",
  },
  {
    test: /java\.lang\.ClassNotFoundException|java\.lang\.NoClassDefFoundError|NoSuchMethodError|NoSuchFieldError/i,
    title: "Мод не для этой версии",
    text: "Один из модов собран под другую версию Minecraft или загрузчика. Проверьте последние добавленные моды.",
  },
  {
    test: /Failed to verify username|Invalid session|Not authenticated with Minecraft\.net/i,
    title: "Проблема со входом в аккаунт",
    text: "Сервер не принял вход. Перезайдите в аккаунт в лаунчере (Аккаунты → выйти и войти снова).",
  },
  {
    test: /Address already in use|BindException/i,
    title: "Порт занят",
    text: "Другая программа занимает нужный порт. Перезагрузите компьютер или закройте второй запущенный Minecraft.",
  },
];

/** lines — массив строк журнала (string или { text }). */
function analyze(lines, exitCode) {
  const text = lines
    .slice(-3000)
    .map((l) => (typeof l === "string" ? l : l.text || ""))
    .join("\n");
  const found = [];
  for (const rule of RULES) {
    if (!rule.test.test(text)) continue;
    let detail = rule.text;
    if (rule.extract) {
      const mods = new Set();
      let m;
      rule.extract.lastIndex = 0;
      while ((m = rule.extract.exec(text)) && mods.size < 6) {
        const id = m[1] || m[2];
        if (id && !/^(minecraft|forge|neoforge|fabric|fabricloader|java)$/i.test(id)) mods.add(id);
      }
      if (mods.size) detail += ` Упомянутые моды: ${[...mods].join(", ")}.`;
    }
    found.push({ title: rule.title, text: detail });
    if (found.length >= 3) break;
  }
  if (!found.length && exitCode && exitCode !== 0) {
    found.push({
      title: "Игра завершилась с ошибкой",
      text: "Точную причину определить не удалось. Нажмите «Скопировать отчёт» и отправьте его в Discord сервера — там помогут.",
    });
  }
  return found;
}

module.exports = { analyze };
