// Onboarding page logic. Separate file (not inline) to satisfy the extension CSP
// (script-src 'self' forbids inline <script>). Handles the version tag, the close
// button, RU/EN localization (data-i18n / data-i18n-html), and the reduced-motion
// switch that freezes the pin-flow demo on its end state.
'use strict';

const DICT = {
  en: {
    pageTitle: "Get started with Umbra EQ",
    eq: "EQ",
    presets: "Presets",
    rules: "Rules",
    tabs: "Tabs",
    more: "More",
    eqAction: "EQ This Tab",
    reset: "Reset",
    hearing: "Loud audio can harm your hearing, so keep it sensible",
    another: "Another extension",
    volume: "Vol",
    bass: "Bass",
    mids: "Mids",
    treble: "Treble",
    air: "Air",
    previewPreset: "Preview: Vocal",

    heroTitle: "Shape any <span>tab's sound</span>",
    tag: 'An equalizer for every tab. Boost the bass, tame harsh highs, or make a quiet video louder — all on your computer.',
    toolbarTip: 'Your toolbar is up here',
    pinTitle: 'Pin Umbra so it is one click away',
    pinLead: 'Chrome hides new extensions behind the puzzle icon in the toolbar. Pin Umbra EQ once and it stays in reach.',
    ddHeader: 'Extensions',
    step1: 'Click the <b>puzzle icon</b> at the top-right of Chrome.',
    step2: 'Find <b>Umbra EQ</b> in the list and click its pin.',
    step3: 'On any tab with sound, click Umbra and press <b>EQ This Tab</b>.',
    priv: '<b>Audio stays on your computer.</b> Umbra never records or uploads it. Saved presets and site rules may use Chrome Sync when browser sync is enabled.',
    gotit: 'Got it',
    feedback: 'Questions / feedback →'
  },
  ru: {
    pageTitle: "Знакомство с Umbra EQ",
    eq: "Эквалайзер",
    presets: "Пресеты",
    rules: "Правила",
    tabs: "Вкладки",
    more: "Ещё",
    eqAction: "Включить на вкладке",
    reset: "Вернуть",
    hearing: "Громкий звук вредит слуху — не переусердствуй",
    another: "Другое расширение",
    volume: "Гром.",
    bass: "Бас",
    mids: "Середина",
    treble: "Верхи",
    air: "Воздух",
    previewPreset: "Пример: Vocal",

    heroTitle: 'Свой звук <span>у каждой вкладки</span>',
    tag: 'Больше баса, чище верхи, громче тихое видео — правишь вживую, всё остаётся на компьютере.',
    toolbarTip: 'Твоя панель — здесь, сверху',
    pinTitle: 'Закрепи Umbra — так до неё один клик',
    pinLead: 'Chrome прячет новые расширения за иконкой-пазлом на панели. Закрепи Umbra EQ один раз — и она всегда под рукой.',
    ddHeader: 'Расширения',
    step1: 'Нажми <b>иконку-пазл</b> справа вверху в Chrome.',
    step2: 'Найди <b>Umbra EQ</b> в списке и нажми на закрепление (пин).',
    step3: 'На любой вкладке со звуком нажми Umbra и <b>«Включить на вкладке»</b>.',
    priv: '<b>Звук остаётся на устройстве.</b> Umbra не записывает и не отправляет его. Сохранённые пресеты и правила сайтов могут использовать Chrome Sync, если включена синхронизация браузера.',
    gotit: 'Понятно',
    feedback: 'Вопросы / отзывы →'
  }
};

function detectLang() {
  try { const s = localStorage.UMBRA_LANG; if (s === 'en' || s === 'ru') return s; } catch (e) { /* ignore */ }
  try { if ((navigator.language || '').toLowerCase().startsWith('ru')) return 'ru'; } catch (e) { /* ignore */ }
  return 'en';
}

let lang = detectLang();

function apply() {
  const d = DICT[lang] || DICT.en;
  document.documentElement.lang = lang;
  document.title = d.pageTitle;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.getAttribute('data-i18n');
    if (d[k] != null) el.textContent = d[k];
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const k = el.getAttribute('data-i18n-html');
    if (d[k] != null) el.innerHTML = d[k];
  });
  document.querySelectorAll('[data-lang]').forEach((b) => {
    b.classList.toggle('on', b.getAttribute('data-lang') === lang);
    b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
  });
}

document.querySelectorAll('[data-lang]').forEach((b) => {
  b.addEventListener('click', () => {
    lang = b.getAttribute('data-lang');
    try { localStorage.UMBRA_LANG = lang; } catch (e) { /* ignore */ }
    apply();
  });
});

try {
  const v = chrome.runtime.getManifest().version;
  const verEl = document.getElementById('ver');
  if (verEl) verEl.textContent = 'v' + v;
} catch (e) { /* getManifest unavailable outside the extension context — ignore */ }

const closeBtn = document.getElementById('closeBtn');
if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    try { window.close(); } catch (e) { /* ignore */ }
  });
}

apply();
