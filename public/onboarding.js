// Onboarding page logic. Separate file (not inline) to satisfy the extension CSP
// (script-src 'self' forbids inline <script>). Handles the version tag, the close
// button, RU/EN localization (data-i18n / data-i18n-html), and the reduced-motion
// switch that freezes the pin-flow demo on its end state.
'use strict';

const DICT = {
  en: {
    tag: 'An equalizer for every tab. Boost the bass, tame harsh highs, or make a quiet video louder — all on your computer.',
    toolbarTip: 'Your toolbar is up here',
    pinTitle: 'Pin Umbra so it is one click away',
    pinLead: 'Chrome hides new extensions behind the puzzle icon in the toolbar. Pin Umbra EQ once and it stays in reach.',
    ddHeader: 'Extensions',
    step1: 'Click the <b>puzzle icon</b> at the top-right of Chrome.',
    step2: 'Find <b>Umbra EQ</b> in the list and click its pin.',
    step3: 'On any tab with sound, click Umbra and press <b>EQ This Tab</b>.',
    priv: '<b>Everything happens on your computer.</b> Umbra never records your audio or sends it anywhere, and there is no account to sign up for.',
    gotit: 'Got it',
    feedback: 'Questions / feedback →'
  },
  ru: {
    tag: 'Эквалайзер для каждой вкладки. Добавь баса, убери резкие верхи или сделай тихое видео громче — всё на твоём компьютере.',
    toolbarTip: 'Твоя панель — здесь, сверху',
    pinTitle: 'Закрепи Umbra — так до неё один клик',
    pinLead: 'Chrome прячет новые расширения за иконкой-пазлом на панели. Закрепи Umbra EQ один раз — и она всегда под рукой.',
    ddHeader: 'Расширения',
    step1: 'Нажми <b>иконку-пазл</b> справа вверху в Chrome.',
    step2: 'Найди <b>Umbra EQ</b> в списке и нажми на закрепление (пин).',
    step3: 'На любой вкладке со звуком нажми Umbra и <b>«Включить на вкладке»</b>.',
    priv: '<b>Всё происходит на твоём компьютере.</b> Umbra не записывает звук и никуда его не отправляет, и никакой аккаунт не нужен.',
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
