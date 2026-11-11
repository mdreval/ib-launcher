/** Переводы для текста, который формирует main-процесс (журнал игры, трей, диалоги). */

const { app } = require("electron");
const dict = require("../../shared/i18n");

function language() {
  try {
    const chosen = require("../services/settings").get().language;
    if (chosen) return chosen;
  } catch (err) {
    /* настройки ещё не загружены */
  }
  try {
    return dict.detect(app.getLocale());
  } catch (err) {
    return "ru";
  }
}

function tr(text) {
  return dict.translate(text, language());
}

module.exports = { tr, language };
