import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'ru';

type Vars = Record<string, string | number>;

// Flat key -> string per language. {name} placeholders are filled by t(key, vars).
const DICT: Record<Lang, Record<string, string>> = {
  en: {
    'nav.eq': 'EQ',
    'nav.presets': 'Presets',
    'nav.rules': 'Rules',
    'nav.tabs': 'Tabs',
    'nav.more': 'More',

    'eq.spectrum': 'Spectrum',
    'eq.graphLabel': 'Equalizer bands — drag or use arrow keys',
    'eq.roles': 'Band guide — what each dot controls',
    'eq.preset': 'Preset',
    'eq.presetNone': 'None',
    'eq.zoneBass': 'Bass',
    'eq.zoneMid': 'Mids',
    'eq.zoneTreble': 'Treble',
    'eq.zoneAir': 'Air',
    'eq.loud': 'Loud audio can harm your hearing, so keep it sensible',
    'eq.eqThisTab': 'EQ This Tab',
    'eq.stop': 'Stop EQing',
    'eq.reset': 'Reset',
    'eq.resetTitle': 'Reset the current sound to flat',
    'eq.globalProfile': 'Global profile · plays on every tab',
    'eq.resetGlobalTitle': 'Reset the global profile to flat',

    'presets.title': 'Presets',
    'presets.placeholder': 'Name a preset…',
    'presets.save': '+ Save',
    'presets.update': 'Update "{name}"',
    'presets.none': 'No presets yet. Shape the EQ, type a name, then Save.',
    'presets.export': 'Export',
    'presets.import': 'Import',
    'presets.deleteTitle': 'Delete "{name}"',
    'presets.hideTitle': 'Hide (restore below)',
    'presets.restore': 'Restore built-ins',

    'tabs.title': 'Active tabs',
    'tabs.none': "No tabs are being EQ'd. Start with EQ This Tab.",
    'tabs.stop': 'Stop',
    'tabs.local': 'local',

    'more.title': 'More',
    'more.theme': 'Theme',
    'more.themeDesc': 'Color of the graph and accents',
    'more.language': 'Language',
    'more.languageDesc': 'Interface language',
    'more.fullWindow': 'Full window',
    'more.fullWindowDesc': 'Open the equalizer in its own tab (edits the global sound)',
    'more.custom': 'Custom',
    'more.guide': 'Guide',

    'share.copyCode': 'Copy code',
    'share.pasteCode': 'Paste code',

    'howto.title': 'How to use Umbra EQ',
    'howto.eq.h': 'The graph',
    'howto.eq.p':
      'Each dot is a filter. Drag it left/right to pick a frequency (bass on the left, treble on the right) and up/down to boost or cut it. The two end dots are shelves that lift or drop everything below or above them; the middle dots are bells. Shift-drag a dot to make its effect wider or narrower, and double-click a dot to reset it. The graph is read-only until you press "EQ This Tab".',
    'howto.vol.h': 'Volume',
    'howto.vol.p':
      'The strip on the left is master volume for the tab. Pull it up past 0 to make a quiet tab louder, or down to soften it. It snaps to 0 (unchanged) in the middle.',
    'howto.spectrum.h': 'Spectrum',
    'howto.spectrum.p':
      'The icon button in the top-right toggles a live spectrum behind the curve. It shows what you are hearing (bass on the left, treble on the right; louder = taller), and it is a visual aid only that does not change the sound.',
    'howto.presets.h': 'Presets',
    'howto.presets.p':
      'Shape a curve, type a name and Save to keep it. Tap a preset to apply it. Export/Import moves presets as a file, or use Copy code / Paste code to share them as text. Presets sync across your browsers.',
    'howto.rules.h': 'One sound everywhere + site rules',
    'howto.rules.p':
      'Umbra plays one sound on every tab — your global profile. A rule overrides it for the sites you choose, matched by address pattern (see the Guide inside the Rules tab). You just edit what you hear: on a site with a rule you change that rule, everywhere else you change the global sound. Open Full window to edit the global sound on a bigger graph.',
    'howto.tabs.h': 'Many tabs at once',
    'howto.tabs.p':
      'Every captured tab has its own EQ, so a film tab and a music tab can sound different at the same time. The Tabs list shows what is running; stop any of them from there.',
    'howto.privacy.h': 'Private by design',
    'howto.privacy.p':
      'Everything happens on your computer. Umbra never records your audio or sends it anywhere, and there is no account to sign up for.',

    'vol.vol': 'VOL',
    'vol.master': 'Master volume',

    'rules.title': 'Site rules',
    'rules.guide': 'Guide',
    'rules.ruleForUsing': 'Rule for {host} using the current sound:',
    'rules.quickExact': 'Exact address',
    'rules.quickAnyTld': 'Any ending',
    'rules.quickAnySub': 'Whole site',
    'rules.quickExactTip': 'Only this exact web address',
    'rules.quickAnyTldTip': 'Same name, any ending (.com, .ru, .gg…)',
    'rules.quickAnySubTip': 'Any page of this site (music., www., …)',
    'rules.none': 'No rules yet. Add one for the current site above, or a blank rule below. A rule applies a sound to sites automatically.',
    'rules.add': 'Add rule',
    'rules.placeholder': 'youtube.  •  film. kino.',
    'rules.customCurve': 'Custom sound',
    'rules.bassBoost': 'Bass boost',
    'rules.matches': '● matches this site',
    'rules.enabledLabel': 'Rule on / off',
    'rules.deleteTitle': 'Delete rule',

    'guide.intro':
      'Umbra plays one sound on every tab; a rule overrides it for the sites you pick. Type just the site address (youtube.com) — not the full page link; www. is ignored. The first rule that fits a site wins.',
    'guide.row.exact': 'only this exact address',
    'guide.row.anyEnd': 'youtube with any ending — .com, .ru, .gg…',
    'guide.row.anywhere': 'youtube anywhere — also music.youtube.com',
    'guide.row.anyPage': 'any page of youtube.com (music., www., …)',
    'guide.row.several': 'several sites in one rule — separate with a space',
    'guide.tip': 'Tip: to cover a site and its mirrors, list them: film. kino. flix.',
    'guide.applyNote': 'Rules take effect right away on tabs you have EQ on.',

    'note.saved': 'Saved preset "{name}".',
    'note.deleted': 'Deleted "{name}".',
    'note.imported': 'Imported {n} preset(s).',
    'note.importFailed': 'Import failed: {err}.',
    'note.saveFailed': 'Save failed (sync storage unavailable).',
    'note.notFound': 'Preset "{name}" not found.',
    'note.typeName': 'Type a name in the box, then Save.',
    'note.ruleAdded': 'Added rule "{pattern}".',
    'note.ruleAddedReeq': 'Added rule "{pattern}". Applied to matching tabs now.',
    'note.noSite': 'No site to add a rule for.',
    'note.rulesSaveFailed': 'Rules save failed (sync storage full?).',
    'note.couldNotEq': 'Could not EQ this tab: {err}',
    'note.codeCopied': 'Copied share code to clipboard.',
    'note.copyFailed': 'Copy failed — clipboard unavailable.',
    'note.codeImported': 'Imported from code: {p} preset(s), {r} rule(s).',
    'note.codeInvalid': 'Clipboard has no valid Umbra code.'
  },
  ru: {
    'nav.eq': 'Эквалайзер',
    'nav.presets': 'Пресеты',
    'nav.rules': 'Правила',
    'nav.tabs': 'Вкладки',
    'nav.more': 'Ещё',

    'eq.spectrum': 'Спектр',
    'eq.graphLabel': 'Полосы эквалайзера — тяни или стрелками',
    'eq.roles': 'Подсказка — за что отвечает точка',
    'eq.preset': 'Пресет',
    'eq.presetNone': 'Нет',
    'eq.zoneBass': 'Бас',
    'eq.zoneMid': 'Середина',
    'eq.zoneTreble': 'Верх',
    'eq.zoneAir': 'Воздух',
    'eq.loud': 'Громкий звук вредит слуху — не переусердствуй',
    'eq.eqThisTab': 'Включить на вкладке',
    'eq.stop': 'Выключить',
    'eq.reset': 'Сброс',
    'eq.resetTitle': 'Сбросить текущий звук в ноль',
    'eq.globalProfile': 'Общий профиль · звучит на всех вкладках',
    'eq.resetGlobalTitle': 'Сбросить общий профиль в ноль',

    'presets.title': 'Пресеты',
    'presets.placeholder': 'Название пресета…',
    'presets.save': '+ Сохранить',
    'presets.update': 'Обновить «{name}»',
    'presets.none': 'Пресетов пока нет. Настрой звук, впиши название и сохрани.',
    'presets.export': 'Экспорт',
    'presets.import': 'Импорт',
    'presets.deleteTitle': 'Удалить «{name}»',
    'presets.hideTitle': 'Скрыть (вернуть ниже)',
    'presets.restore': 'Вернуть встроенные',

    'tabs.title': 'Активные вкладки',
    'tabs.none': 'Ни одна вкладка не эквализируется. Нажми «Включить на вкладке».',
    'tabs.stop': 'Стоп',
    'tabs.local': 'локально',

    'more.title': 'Ещё',
    'more.theme': 'Тема',
    'more.themeDesc': 'Цвет графика и акцентов',
    'more.language': 'Язык',
    'more.languageDesc': 'Язык интерфейса',
    'more.fullWindow': 'Во всё окно',
    'more.fullWindowDesc': 'Открыть эквалайзер в отдельной вкладке (правит общий звук)',
    'more.custom': 'Свой цвет',
    'more.guide': 'Как пользоваться',

    'share.copyCode': 'Копировать код',
    'share.pasteCode': 'Вставить код',

    'howto.title': 'Как пользоваться Umbra EQ',
    'howto.eq.h': 'График',
    'howto.eq.p':
      'Каждая точка — фильтр. Тяни влево/вправо, чтобы выбрать частоту (бас слева, высокие справа), и вверх/вниз, чтобы усилить или убрать её. Две крайние точки — «полки»: поднимают или опускают всё ниже/выше себя; средние — «колокола». Shift+тяни — шире или уже действие. Двойной клик — сброс точки. Сначала нажми «Включить на вкладке» — до этого график только для чтения.',
    'howto.vol.h': 'Громкость',
    'howto.vol.p':
      'Полоса слева — общая громкость вкладки. Подними выше 0, чтобы сделать тихую вкладку громче, или опусти, чтобы приглушить. В середине прилипает к 0 (без изменений).',
    'howto.spectrum.h': 'Спектр',
    'howto.spectrum.p':
      'Кнопка-иконка справа сверху включает живой спектр за кривой — он показывает, что ты слышишь (бас слева, высокие справа; громче = выше). Это только визуализация, на звук не влияет.',
    'howto.presets.h': 'Пресеты',
    'howto.presets.p':
      'Настрой кривую, впиши название и сохрани. Нажми на пресет, чтобы применить. Экспорт/Импорт переносит пресеты файлом, а «Копировать код» / «Вставить код» — текстом. Пресеты синхронизируются между твоими браузерами.',
    'howto.rules.h': 'Один звук везде + правила сайтов',
    'howto.rules.p':
      'Umbra играет один звук на всех вкладках — твой общий профиль. Правило перебивает его для выбранных сайтов, по шаблону адреса (см. Гайд во вкладке Правила). Ты просто правишь то, что слышишь: на сайте с правилом меняешь это правило, везде остальном — общий звук. Открой «Во всё окно», чтобы править общий звук на большом графике.',
    'howto.tabs.h': 'Много вкладок сразу',
    'howto.tabs.p':
      'У каждой захваченной вкладки свой эквалайзер, поэтому вкладка с фильмом и вкладка с музыкой могут звучать по-разному одновременно. Список «Вкладки» показывает активные; любую можно остановить оттуда.',
    'howto.privacy.h': 'Приватность в основе',
    'howto.privacy.p':
      'Всё происходит на твоём компьютере. Umbra не записывает звук и никуда его не отправляет, и никакой аккаунт не нужен.',

    'vol.vol': 'ГРОМ',
    'vol.master': 'Общая громкость',

    'rules.title': 'Правила сайтов',
    'rules.guide': 'Гайд',
    'rules.ruleForUsing': 'Правило для {host} с текущим звуком:',
    'rules.quickExact': 'Точный адрес',
    'rules.quickAnyTld': 'Любое окончание',
    'rules.quickAnySub': 'Весь сайт',
    'rules.quickExactTip': 'Только этот точный адрес',
    'rules.quickAnyTldTip': 'То же имя, любое окончание (.com, .ru, .gg…)',
    'rules.quickAnySubTip': 'Любая страница сайта (music., www., …)',
    'rules.none': 'Правил пока нет. Добавь для текущего сайта сверху или пустое снизу. Правило применяет звук к сайтам само.',
    'rules.add': 'Добавить правило',
    'rules.placeholder': 'youtube.  •  film. kino.',
    'rules.customCurve': 'Свой звук',
    'rules.bassBoost': 'Усиление баса',
    'rules.matches': '● подходит этому сайту',
    'rules.enabledLabel': 'Правило вкл / выкл',
    'rules.deleteTitle': 'Удалить правило',

    'guide.intro':
      'Umbra играет один звук на всех вкладках; правило перебивает его для выбранных сайтов. Впиши только адрес сайта (youtube.com), не всю ссылку на страницу; www. не важен. Срабатывает первое подходящее правило.',
    'guide.row.exact': 'только этот точный адрес',
    'guide.row.anyEnd': 'youtube с любым окончанием — .com, .ru, .gg…',
    'guide.row.anywhere': 'youtube где угодно — и music.youtube.com',
    'guide.row.anyPage': 'любая страница youtube.com (music., www., …)',
    'guide.row.several': 'несколько сайтов в одном правиле — через пробел',
    'guide.tip': 'Совет: чтобы покрыть сайт и его зеркала, перечисли: film. kino. flix.',
    'guide.applyNote': 'Правила срабатывают сразу на вкладках, где включён EQ.',

    'note.saved': 'Пресет «{name}» сохранён.',
    'note.deleted': '«{name}» удалён.',
    'note.imported': 'Импортировано пресетов: {n}.',
    'note.importFailed': 'Импорт не удался: {err}.',
    'note.saveFailed': 'Сохранение не удалось (sync-хранилище недоступно).',
    'note.notFound': 'Пресет «{name}» не найден.',
    'note.typeName': 'Впиши название в поле и сохрани.',
    'note.ruleAdded': 'Добавлено правило «{pattern}».',
    'note.ruleAddedReeq': 'Добавлено правило «{pattern}». Применено к подходящим вкладкам.',
    'note.noSite': 'Нет сайта для правила.',
    'note.rulesSaveFailed': 'Не удалось сохранить правила (sync-хранилище переполнено?).',
    'note.couldNotEq': 'Не удалось включить на вкладке: {err}',
    'note.codeCopied': 'Код скопирован в буфер обмена.',
    'note.copyFailed': 'Копирование не удалось — буфер недоступен.',
    'note.codeImported': 'Из кода импортировано: пресетов {p}, правил {r}.',
    'note.codeInvalid': 'В буфере нет корректного кода Umbra.'
  }
};

// Module-level current language so non-React code (useEngine callbacks) can call t().
let _lang: Lang = 'en';

export function getLang(): Lang {
  return _lang;
}

export function t(key: string, vars?: Vars): string {
  let s = DICT[_lang][key] ?? DICT.en[key] ?? key;
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', String(vars[k]));
  return s;
}

function detectLang(): Lang {
  try {
    const saved = localStorage.UMBRA_LANG;
    if (saved === 'en' || saved === 'ru') return saved;
  } catch {
    /* ignore */
  }
  try {
    if ((navigator.language || '').toLowerCase().startsWith('ru')) return 'ru';
  } catch {
    /* ignore */
  }
  return 'en';
}

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const l = detectLang();
    _lang = l; // sync module before first render
    return l;
  });
  useEffect(() => {
    _lang = lang;
  }, [lang]);
  const setLang = (l: Lang) => {
    _lang = l;
    try {
      localStorage.UMBRA_LANG = l;
    } catch {
      /* ignore */
    }
    setLangState(l);
  };
  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export function useLang() {
  return useContext(LangCtx);
}

// Subscribe to language changes (re-render on switch) and return the t function.
export function useT() {
  useContext(LangCtx);
  return t;
}
