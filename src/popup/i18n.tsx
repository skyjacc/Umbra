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
    'eq.loud': 'Loud audio can harm hearing — keep it sensible',
    'eq.eqThisTab': 'EQ This Tab',
    'eq.stop': 'Stop EQing',
    'eq.reset': 'Reset',

    'presets.title': 'Presets',
    'presets.placeholder': 'Name a preset…',
    'presets.save': '+ Save',
    'presets.update': 'Update "{name}"',
    'presets.none': 'No presets yet. Shape the EQ, type a name, then Save.',
    'presets.export': 'Export',
    'presets.import': 'Import',
    'presets.deleteTitle': 'Delete "{name}"',

    'tabs.title': 'Active tabs',
    'tabs.none': "No tabs are being EQ'd. Start with EQ This Tab.",
    'tabs.reset': 'Reset',
    'tabs.resetTitle': 'Reset this tab & forget its saved EQ',
    'tabs.stop': 'Stop',
    'tabs.local': 'local',

    'more.title': 'More',
    'more.rememberTitle': 'Remember EQ per site',
    'more.rememberDesc': "Auto-apply a site's saved sound when you EQ its tab",
    'more.remembered': 'Remembered sites',
    'more.clearAll': 'Clear all',
    'more.noRemembered': 'Sites you EQ are saved here and re-applied automatically next time.',
    'more.forgetTitle': 'Forget {host}',
    'more.theme': 'Theme',
    'more.themeDesc': 'Color of the graph and accents',
    'more.language': 'Language',
    'more.languageDesc': 'Interface language',
    'more.fullWindow': 'Full window',
    'more.fullWindowDesc': 'Open the equalizer in its own tab',
    'more.shapeTitle': 'Shape the sound',
    'more.shapeDesc':
      'Drag a dot: left/right = frequency, up/down = boost/cut. **Shift-drag** = width. **Double-click** resets a band. The strip on the left is master volume.',
    'more.engine': 'Umbra EQ · engine: {status}',
    'more.feedback': 'Questions / feedback →',

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
      'Rules apply your sound to websites automatically. Type part of a web address; the first rule that fits a site wins. If you tweak a site by hand, that always beats its rule.',
    'guide.row.exact': 'only this exact address',
    'guide.row.anyEnd': 'youtube with any ending — .com, .ru, .gg…',
    'guide.row.anywhere': 'youtube anywhere — also music.youtube.com',
    'guide.row.anyPage': 'any page of youtube.com (music., www., …)',
    'guide.row.several': 'several sites in one rule — separate with a space',
    'guide.tip': 'Tip: to cover a site and its mirrors, list them: film. kino. flix.',
    'guide.applyNote': 'Rules take effect the next time you EQ a tab.',

    'note.saved': 'Saved preset "{name}".',
    'note.deleted': 'Deleted "{name}".',
    'note.imported': 'Imported {n} preset(s).',
    'note.importFailed': 'Import failed: {err}.',
    'note.saveFailed': 'Save failed (sync storage unavailable).',
    'note.notFound': 'Preset "{name}" not found.',
    'note.pressEq': 'Press "EQ This Tab" to hear this preset.',
    'note.typeName': 'Type a name in the box, then Save.',
    'note.ruleAdded': 'Added rule "{pattern}".',
    'note.noSite': 'No site to add a rule for.',
    'note.forgot': 'Forgot "{host}".',
    'note.rulesSaveFailed': 'Rules save failed (sync storage full?).',
    'note.resetAll': 'Reset all tabs and cleared remembered sites.',
    'note.couldNotEq': 'Could not EQ this tab: {err}'
  },
  ru: {
    'nav.eq': 'Эквалайзер',
    'nav.presets': 'Пресеты',
    'nav.rules': 'Правила',
    'nav.tabs': 'Вкладки',
    'nav.more': 'Ещё',

    'eq.spectrum': 'Спектр',
    'eq.loud': 'Громкий звук вредит слуху — не переусердствуй',
    'eq.eqThisTab': 'Включить на вкладке',
    'eq.stop': 'Выключить',
    'eq.reset': 'Сброс',

    'presets.title': 'Пресеты',
    'presets.placeholder': 'Название пресета…',
    'presets.save': '+ Сохранить',
    'presets.update': 'Обновить «{name}»',
    'presets.none': 'Пресетов пока нет. Настрой звук, впиши название и сохрани.',
    'presets.export': 'Экспорт',
    'presets.import': 'Импорт',
    'presets.deleteTitle': 'Удалить «{name}»',

    'tabs.title': 'Активные вкладки',
    'tabs.none': 'Ни одна вкладка не эквализируется. Нажми «Включить на вкладке».',
    'tabs.reset': 'Сброс',
    'tabs.resetTitle': 'Сбросить вкладку и забыть её звук',
    'tabs.stop': 'Стоп',
    'tabs.local': 'локально',

    'more.title': 'Ещё',
    'more.rememberTitle': 'Запоминать звук по сайтам',
    'more.rememberDesc': 'Сам применяет сохранённый звук сайта при включении на вкладке',
    'more.remembered': 'Запомненные сайты',
    'more.clearAll': 'Очистить всё',
    'more.noRemembered': 'Сайты, которые ты настроил, сохраняются тут и применяются автоматически.',
    'more.forgetTitle': 'Забыть {host}',
    'more.theme': 'Тема',
    'more.themeDesc': 'Цвет графика и акцентов',
    'more.language': 'Язык',
    'more.languageDesc': 'Язык интерфейса',
    'more.fullWindow': 'Во всё окно',
    'more.fullWindowDesc': 'Открыть эквалайзер в отдельной вкладке',
    'more.shapeTitle': 'Как настраивать',
    'more.shapeDesc':
      'Тяни точку: влево/вправо — частота, вверх/вниз — усилить/убрать. **Shift+тяни** — ширина. **Двойной клик** — сброс точки. Полоса слева — общая громкость.',
    'more.engine': 'Umbra EQ · движок: {status}',
    'more.feedback': 'Вопросы / отзывы →',

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
      'Правила применяют твой звук к сайтам сами. Впиши часть адреса сайта; срабатывает первое подходящее правило. Если покрутишь сайт вручную — это всегда важнее правила.',
    'guide.row.exact': 'только этот точный адрес',
    'guide.row.anyEnd': 'youtube с любым окончанием — .com, .ru, .gg…',
    'guide.row.anywhere': 'youtube где угодно — и music.youtube.com',
    'guide.row.anyPage': 'любая страница youtube.com (music., www., …)',
    'guide.row.several': 'несколько сайтов в одном правиле — через пробел',
    'guide.tip': 'Совет: чтобы покрыть сайт и его зеркала, перечисли: film. kino. flix.',
    'guide.applyNote': 'Правила срабатывают при следующем включении на вкладке.',

    'note.saved': 'Пресет «{name}» сохранён.',
    'note.deleted': '«{name}» удалён.',
    'note.imported': 'Импортировано пресетов: {n}.',
    'note.importFailed': 'Импорт не удался: {err}.',
    'note.saveFailed': 'Сохранение не удалось (sync-хранилище недоступно).',
    'note.notFound': 'Пресет «{name}» не найден.',
    'note.pressEq': 'Нажми «Включить на вкладке», чтобы услышать пресет.',
    'note.typeName': 'Впиши название в поле и сохрани.',
    'note.ruleAdded': 'Добавлено правило «{pattern}».',
    'note.noSite': 'Нет сайта для правила.',
    'note.forgot': '«{host}» забыт.',
    'note.rulesSaveFailed': 'Не удалось сохранить правила (sync-хранилище переполнено?).',
    'note.resetAll': 'Все вкладки сброшены, запомненные сайты очищены.',
    'note.couldNotEq': 'Не удалось включить на вкладке: {err}'
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
