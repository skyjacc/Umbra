// Onboarding page logic. Separate file (not inline) to satisfy the extension CSP
// (script-src 'self' forbids inline <script>). Handles the version tag, the close
// button, and RU/EN localization driven by data-i18n / data-i18n-html attributes.
'use strict';

const DICT = {
  en: {
    tag: 'A live 11-band equalizer & bass boost for any browser tab — 100% local, no tracking.',
    quickstart: 'Quick start',
    s1h: 'Play some audio',
    s1p: 'Open any tab with sound — music, a video, a stream or a call.',
    s2h: 'Turn it on',
    s2p: 'Click the Umbra EQ icon in the toolbar, then press <b>EQ This Tab</b>. That tab is now equalized.',
    s3h: 'Shape the sound',
    s3p: 'Drag the dots on the curve to boost or cut any frequency, live. The strip on the left is master volume.',
    tip1: '<b>Shift-drag</b> a dot = change width',
    tip2: '<b>Double-click</b> a dot = reset it',
    tip3: '<b>Presets</b> — save, apply &amp; share by code',
    tip4: '<b>Rules</b> — auto-apply your sound per site',
    tip5: '<b>Every tab</b> keeps its own EQ',
    tip6: "<b>Spectrum</b> — see what you're hearing",
    priv: '<b>Your audio never leaves your computer.</b> Umbra processes sound on your device and never records, stores, or sends it anywhere — no account, no ads, no tracking.',
    gotit: 'Got it',
    feedback: 'Questions / feedback →'
  },
  ru: {
    tag: 'Живой 11-полосный эквалайзер и усиление баса для любой вкладки — 100% локально, без слежки.',
    quickstart: 'Быстрый старт',
    s1h: 'Включи звук',
    s1p: 'Открой любую вкладку со звуком — музыка, видео, стрим или звонок.',
    s2h: 'Включи Umbra',
    s2p: 'Нажми иконку Umbra EQ на панели, затем <b>«Включить на вкладке»</b>. Вкладка теперь эквализируется.',
    s3h: 'Настрой звук',
    s3p: 'Тяни точки на кривой, чтобы усилить или убрать любую частоту вживую. Полоса слева — общая громкость.',
    tip1: '<b>Shift+тяни</b> точку — ширина',
    tip2: '<b>Двойной клик</b> — сброс точки',
    tip3: '<b>Пресеты</b> — сохраняй, применяй, делись кодом',
    tip4: '<b>Правила</b> — авто-звук по сайтам',
    tip5: '<b>Каждая вкладка</b> хранит свой EQ',
    tip6: '<b>Спектр</b> — видно, что слышишь',
    priv: '<b>Твой звук не покидает компьютер.</b> Umbra обрабатывает его на устройстве — ничего не записывает, не хранит и никуда не отправляет. Без аккаунта, рекламы и слежки.',
    gotit: 'Понятно',
    feedback: 'Вопросы / отзывы →'
  }
};

function detectLang() {
  try {
    const s = localStorage.UMBRA_LANG;
    if (s === 'en' || s === 'ru') return s;
  } catch (e) {
    /* ignore */
  }
  try {
    if ((navigator.language || '').toLowerCase().startsWith('ru')) return 'ru';
  } catch (e) {
    /* ignore */
  }
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
    try {
      localStorage.UMBRA_LANG = lang;
    } catch (e) {
      /* ignore */
    }
    apply();
  });
});

try {
  const v = chrome.runtime.getManifest().version;
  const verEl = document.getElementById('ver');
  if (verEl) verEl.textContent = 'v' + v;
} catch (e) {
  /* getManifest unavailable outside the extension context — ignore */
}

const closeBtn = document.getElementById('closeBtn');
if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    try {
      window.close();
    } catch (e) {
      /* ignore */
    }
  });
}

apply();
