# Umbra EQ — аудит кода

> Внутренний документ. Не для стора. Обзор проекта, архитектура, безопасность,
> находки и разбор фич. Живой файл — дописывается по ходу.

- **Дата:** 2026-07-07
- **Версия:** 2.1.0 · **Ветка:** main (дерево чистое)
- **Объём:** ~4150 строк (`src/` + `public/`), 2 тест-файла, 35 тестов
- **Стек:** MV3 Chrome extension · React 18 + TS + Vite + Tailwind (попап) · vanilla JS (service worker + offscreen Web Audio)

---

## 1. Что за проект

Пер-табный эквалайзер. Каждой вкладке — своя цепь из 11 биквад-фильтров
(`MediaStreamSource(tab) → preGain → 11×biquad → postGain → speakers`). Две вкладки
держат две разные кривые одновременно (фильм и музыка звучат по-разному).

- **Пер-доменная память:** настроенная кривая пишется под hostname в `chrome.storage.local`
  (`DEQ.<host>`). При `AUTO_DOMAIN` захват вкладки применяет сохранённую кривую сайта.
- **Правила:** паттерн адреса → пресет/кривая, первое совпадение выигрывает.
- **Пресеты:** `chrome.storage.sync` (синк между браузерами).
- **Приоритет применения:** точечная правка хоста > правило домена > flat.
- Приватность: всё локально, ничего не пишется/не отправляется, аккаунта нет.

---

## 2. Архитектура

**Три контекста, обмен через `chrome.runtime.sendMessage`:**

```
popup (React)  ──►  background.js (service worker)  ──►  offscreen.js (Web Audio)
   ▲  target:'bg'                                          target:'offscreen'
   └──────────────  broadcast workspaceStatus  ◄───────────────┘
```

- **[background.js](../src/background.js)** — жизненный цикл offscreen-документа + tab capture.
  Минтит `streamId` через `chrome.tabCapture.getMediaStreamId`, шлёт в offscreen.
  Пинг offscreen (`pingOffscreen`) отличает живой документ от зомби. Бейдж = число захватов.
- **[offscreen.js](../public/offscreen.js)** — весь звук. Строит цепи, применяет фильтры,
  дебаунсит per-domain запись (250мс), FFT для визуализатора, presets/rules CRUD-чтение.
- **[popup/](../src/popup)** — UI. `useEngine.ts` — вся логика попапа (сообщения, состояние,
  оптимистичные апдейты). `App.tsx` — 5 вкладок (EQ / Presets / Rules / Tabs / More).

**Ключевые модули `src/lib/`:**
- [audio.ts](../src/lib/audio.ts) — чистая матеша графа (координатные трансформы, биквад-коэффициенты,
  магнитуда, `sanitizeFilter`/`sanitizeStatus`, клампы). Покрыто тестами.
- [presets.ts](../src/lib/presets.ts) — коэрция/нормализация пресетов, защита от прототип-полюции.
- [rules.ts](../src/lib/rules.ts) — язык паттернов + матчинг хоста. Покрыто тестами.
- [engine-io.ts](../src/lib/engine-io.ts) — сторона попапа: сообщения, хранилище, пресет-I/O, share-коды.

**Логика продублирована намеренно:** матчинг паттернов и чтение пресетов/правил есть и в
`rules.ts`/`engine-io.ts` (TS, попап) и в `offscreen.js` (JS, движок). Комментарии признают
«держится в синке руками». Риск дрейфа — см. находки.

---

## 3. Безопасность

**Полный проход по кодовой базе. Вердикт: крепко, реальных уязвимостей нет.**

Хорошо:
- **CSP** `script-src 'self'; object-src 'self'` — без eval/inline. [manifest.config.ts:31](../src/manifest.config.ts:31)
- **Права минимальны:** `activeTab, tabCapture, storage, offscreen`. Нет host_permissions,
  нет `<all_urls>`, нет content-scripts, нет `externally_connectable`.
- **Прототип-полюция закрыта** везде на входе недоверенных данных: null-proto аккумуляторы +
  `UNSAFE_KEYS`. [presets.ts:5](../src/lib/presets.ts:5), [presets.ts:37](../src/lib/presets.ts:37), [offscreen.js:170](../public/offscreen.js:170), [offscreen.js:552](../public/offscreen.js:552)
- **`dangerouslySetInnerHTML`** — единственное место ([RulesView.tsx:83](../src/popup/components/RulesView.tsx:83)) экранирует
  host через `escapeHtml`, шаблон — доверенная константа. Безопасно.
- **Импорт share-кода** (base64) зажимает все числа на `buildChain` независимо от payload.
- **favicon img** ограничен `^(https?:|data:)` ([App.tsx:259](../src/popup/App.tsx:259)) — `data:` в img не исполняется.

Мелочь, информационно (не эксплуатируется сегодня):
- `onMessage` в bg + offscreen не проверяет `sender`. Поверхности атаки нет (нет external connect /
  content scripts). Если когда-нибудь добавишь `externally_connectable` — сначала поставь
  `sender.id === chrome.runtime.id`. [background.js:170](../src/background.js:170), [offscreen.js:670](../public/offscreen.js:670)

> `/security-review` (скилл) смотрит только pending diff ветки. Дерево чистое → он бы ничего не нашёл.
> Выше — полный проход по всей базе (шире, чем скилл).

---

## 4. Находки

### Баги / корректность
1. **`npm run typecheck` сломан — 2 ошибки.** CI гоняет только `npm test` + `npm run build`
   (build через esbuild, типы не чекает) → гниёт молча.
   - [manifest.config.ts:12](../src/manifest.config.ts:12) — `author: 'skyjacc'` — crxjs-тип хочет `{ email: string }`.
   - [logic.test.ts:16](../src/lib/logic.test.ts:16) — каст `Coeff` → `Record<string,number>` требует `as unknown` сначала.
2. **Коллизия id правил.** Id строятся инлайн `'r_' + Date.now().toString(36)`
   ([useEngine.ts:356](../src/popup/useEngine.ts:356), [RulesView.tsx:46](../src/popup/components/RulesView.tsx:46)). Два правила в одну миллисекунду →
   одинаковый id → конфликт React key + `updateRule`/`deleteRule` бьют по обоим.

### Мёртвый код
1. **`persistEqState`** [engine-io.ts:120](../src/lib/engine-io.ts:120) — **ноль вызовов.** Единственный писатель
   `EQ_STATE_KEY` / `ACTIVE_PRESET_KEY` / `GAIN` / `filter0..10`. Раз никто не пишет — ветка
   восстановления в `readInitialState` ([engine-io.ts:152-166](../src/lib/engine-io.ts:152)) не может сработать, всегда flat.
   Реально работает только чтение пресетов (sync). Можно удалить + урезать `readInitialState`.
2. **`makeRuleId`** [rules.ts:83](../src/lib/rules.ts:83) — ноль вызовов, не тестируется.
3. **8 мёртвых i18n-ключей** (en+ru, ~16 строк) в [i18n.tsx](../src/popup/i18n.tsx): `more.remembered`,
   `more.clearAll`, `more.noRemembered`, `more.forgetTitle`, `more.shapeTitle`, `more.shapeDesc`,
   `more.engine`, `more.feedback`. Остатки от старого UI «запомненные сайты».
4. **Мёртвый guard** [background.js:28](../src/background.js:28) — `getContexts` < 116, но `minimum_chrome_version: 116`
   гарантирует наличие. Безвредно.

### Улучшить / изменить
- **Добавить `npm run typecheck` в CI** ([build.yml](../.github/workflows/build.yml)) — иначе регрессии типов уедут в релиз.
- **Дубль логики** `hostMatchesPattern` + матчинг — в `rules.ts` (тесты) и `offscreen.js` (без тестов).
  Дрейф = тихое расхождение превью и применённого EQ. Тест на паритет или общий модуль.
- **Устаревшая инструкция:** `C:\Users\oblako\CLAUDE.md` указывает на `graphify-out/` — **не существует.**
  Каждую сессию впустую тратит чтение. Убрать или пересобрать.
- **Id-ген:** заменить `Date.now()` на `crypto.randomUUID()` (есть в попапе) — убивает коллизию + мёртвый `makeRuleId`.

---

## 5. Разбор фичи «коды» (share codes)

Путь целиком: [engine-io.ts:245-305](../src/lib/engine-io.ts:245), [useEngine.ts:373-413](../src/popup/useEngine.ts:373),
[ShareRow.tsx](../src/popup/components/ShareRow.tsx), [presets.ts](../src/lib/presets.ts).

### Как работает (передача)

**Копировать (encode):**
```
{presets} или {rules} → JSON.stringify → TextEncoder UTF-8 байты
→ btoa(latin1) → "UMBRA1:" + base64 → буфер обмена
```

**Вставить (decode):**
```
срезать "UMBRA1:" → atob → Uint8Array → TextDecoder UTF-8 → JSON.parse
→ presets: importPresetsText → sync
→ rules:   filter+remap → append → sync
```

Без сервера/ссылки. Офлайн-строка через буфер. Пресеты и правила — разные коды, но один код
может нести оба ключа, импорт принимает любой.

### Happy path — корректно
UTF-8 безопасно. Наивный `btoa(JSON.stringify(...))` падает на кириллице/эмодзи в именах пресетов.
Связка `TextEncoder→latin1→btoa` / `atob→TextDecoder` держит. Честная передача (с не-ASCII именами)
round-trip-ит чисто. Числа вне диапазона зажимаются на `buildChain`.

### Что упустили — слабое место это импорт недоверенного кода
1. **(реально) `patterns` правил не приводятся к строкам при импорте → краш попапа.**
   [useEngine.ts:398](../src/popup/useEngine.ts:398). Фильтр проверяет только `Array.isArray(r.patterns)`, не типы.
   Код с `patterns:[123]` сохраняется → `hostMatchesPattern` делает `(123).trim()` → TypeError.
   `matchRule` в пути рендера попапа ([useEngine.ts:370](../src/popup/useEngine.ts:370)) без try/catch → белый экран,
   правило в sync → падает при каждом открытии. **Фикс: гнать импортные patterns через `parsePatterns`.**
2. **(мелочь) curve-правила не валидируются при импорте** — сохраняются, но `bandsFromRule` вернёт null,
   ничего не применит. Инертный мусор. [offscreen.js:228](../public/offscreen.js:228)
3. **(мелочь) Копирование всегда пишет «Скопировано», даже при провале записи.** [useEngine.ts:374](../src/popup/useEngine.ts:374)
4. **(мелочь) Конкретные ошибки импорта глотаются** в общее «нет корректного кода». [useEngine.ts:407](../src/popup/useEngine.ts:407)
5. **(пробел) Ноль тестов на encode/decode.** UTF-8-критичная фича с недоверенным вводом без round-trip теста.
6. **(инфо) Импорт правил только добавляет, без дедупа; RULES — один ключ sync на 8КБ.** Большие наборы
   превышают квоту → `writeRules` false → нотис, но оптимистичный `setRules` уже показал (исчезнут после reload). [engine-io.ts:235](../src/lib/engine-io.ts:235)

**Вердикт:** механизм спроектирован верно (UTF-8 — на чём большинство спотыкается — сделано правильно).
Для реальных юзеров ничего не сломано. Упущение — защита импорта: #1 реальный краш от кривого кода.

---

## 6. План фиксов

Исходный набор:
1. Починить 2 ошибки typecheck + добавить typecheck в CI.
2. Удалить `persistEqState` (+ урезать `readInitialState`), `makeRuleId`, 8 мёртвых i18n-ключей.
3. Id правил → `crypto.randomUUID()`.

Хардненинг кодов:
4. Приводить/парсить импортные `patterns` + валидировать curve-правила (инертные выкидывать).
5. Нотис «Скопировано» только при успешной записи в буфер.
6. Round-trip тест на `engine-io` (кириллица, presets+rules, мусор → null).

Статус: **не начато** (дерево чистое).

---

## 7. Сделано

**2026-07-07 — ловушка `www.` в правилах + Save Preset**

- **`www.` trap.** На `www.`-сайтах 2 из 3 quick-add кнопок делали правило, не совпадающее с
  текущей вкладкой (паттерн из хоста без `www.`, матчер сверял полный хост с `www.`).
  Фикс: `normHost` срезает ведущий `www.` → `www.youtube.com` == `youtube.com` при матчинге.
  Зеркало в offscreen (`normHostPat`). [rules.ts:28](../src/lib/rules.ts:28), [offscreen.js:185](../public/offscreen.js:185)
  + 4 assertion теста ([rules.test.ts:10](../src/lib/rules.test.ts:10)), + уточнён `guide.intro` (EN+RU):
  «только адрес сайта, не ссылка на страницу; www. не важен».
- **Save Preset (гонка).** Захваченный путь слал `savePreset` в offscreen (async), затем сразу
  `setPresets(await refreshPresets())` — refresh читал sync ДО записи offscreen → затирал новый
  пресет старым набором (флейки, пресет пропадал). Фикс: в захваченном пути — оптимистичный
  `setPresets(p => {...p, [name]: bandsToPreset(...)})`, refresh убран; `onChanged`/broadcast
  сверяют канон после. Прямой путь (без захвата) refresh сохранил — там запись уже завершена.
  [useEngine.ts:437](../src/popup/useEngine.ts:437)
- Тесты: 36 зелёных.

**2026-07-07 — батч «всё»**

- **typecheck починен + в CI.** `author` убран из manifest ([manifest.config.ts](../src/manifest.config.ts)), каст в
  [logic.test.ts:16](../src/lib/logic.test.ts:16). Добавлен `npm run typecheck` в [build.yml](../.github/workflows/build.yml). `tsc --noEmit` = 0 ошибок.
- **Мёртвый код удалён:** `persistEqState` + `EQ_STATE_KEY`/`ACTIVE_PRESET_KEY` + слит `readInitialState`
  до чтения только пресетов ([engine-io.ts](../src/lib/engine-io.ts)); `makeRuleId` → `newRuleId` ([rules.ts:81](../src/lib/rules.ts:81));
  8 i18n-ключей (en+ru); dead guard в [background.js](../src/background.js).
- **Id правил → `crypto.randomUUID()`** (`newRuleId`). Убрана коллизия. Использовано в
  useEngine (quickAdd), RulesView (addBlank), sanitizeImportedRules.
- **Хардненинг импорта кодов:** `sanitizeImportedRules` ([engine-io.ts](../src/lib/engine-io.ts)) — patterns→строки
  (краш matchRule закрыт), curve валидируется через `coerceBands`, preset-правила требуют имя,
  свежие id, мусор выкидывается. Копирование: `note.copyFailed` при провале буфера. Ошибки
  импорта пресетов теперь показываются конкретно. Round-trip тест [share.test.ts](../src/lib/share.test.ts) (9 тестов).
- **#7 www-ассиметрия DEQ закрыта:** `hostOf` (offscreen) + `getActiveTab` (background) срезают
  `www.` → пер-доменная память keys на нормализованный хост, как и правила.
- Тесты: **45 зелёных** · typecheck: 0 · build: ok.

**2026-07-07 — Apply Preset не менял звук** (репорт юзера)

- Симптом: применяешь пресет → график обновляется, звук нет; надо руками подвигать каждую точку.
- Причина: popup слал в offscreen только имя пресета, offscreen перечитывал его из sync по имени
  (`getPresets()[name]`); промах lookup → `if (!preset) return` — тихий no-op, звук остаётся плоским,
  а график уже показал пресет (обновился локально). Ручной драг работал, т.к. идёт через `applySettings`.
- Фикс: popup шлёт уже разрешённые bands (`eqFilters: nb`), offscreen применяет их напрямую
  (fallback на lookup по имени сохранён). Убран storage-round-trip из UI-действия.
  [useEngine.ts:427](../src/popup/useEngine.ts:427), [offscreen.js:508](../public/offscreen.js:508)
- tsc 0 · тесты 45 · build ok.

**2026-07-07 — пресет до захвата терялся при включении EQ**

- Симптом: не захвачено → кликаешь пресет P (график показывает P, в движок не шлётся) → жмёшь
  «EQ This Tab» → `startCapture` строит flat → broadcast → `handleStatus` адоптит flat → P пропал
  (и график, и звук). Домен-превью нельзя было использовать как сигнал (грузится и при autoDomain off).
- Фикс: `pendingApply` ref — пресет, применённый до захвата. `applyPreset` (не захвачено) его пишет;
  `handleStatus` при первом появлении вкладки в captured пушит его через `applyPreset` (bands+broadcast)
  вместо адопта flat. Свежий явный выбор перебивает домен. Без изменений offscreen.
  [useEngine.ts:128](../src/popup/useEngine.ts:128), [useEngine.ts:436](../src/popup/useEngine.ts:436)
- tsc 0 · тесты 45 · build ok.

**2026-07-07 — Fullscreen + #5 паритет + #2 мёртвые хендлеры**

- **Fullscreen в углу.** [index.css:80](../src/popup/index.css:80): `html,body{width:620px;margin:0}` → в широкой
  вкладке «Full window» 620px-тело прибито к краю. Фикс: `html` — тёмный фон на всю ширину,
  `body{width:620px; margin:0 auto}` — центр в вкладке, no-op в попапе (вьюпорт=620).
  Плюс `@media (min-height:700px)` (только full-window, попап капнут Chrome на 600): панель
  центрируется по обеим осям и оформлена карточкой (radius 18 + тень + рамка, `safe center`
  чтобы длинные виды не обрезались). Читается как намеренное окно, а не попап в пустоте.
- **#5 паритет** rules.ts ↔ offscreen.js — вместо рискованного рефактора offscreen сделан
  drift-guard тест: [parity.test.ts](../src/lib/parity.test.ts) извлекает чистый матчер из public/offscreen.js
  (`?raw` import) и через `new Function` сверяет `hostMatchesPattern`/`matchRule` с rules.ts на
  таблице host×pattern. Правка одной копии без другой → тест падает. (+ [raw.d.ts](../src/raw.d.ts) для `?raw`.)
- **#2 мёртвые хендлеры** после удаления «remembered sites» UI: убраны `resetEverything`,
  exposed `forgetHost` callback, `savedHosts` state + `SavedHost` type + чтение в handleStatus
  ([useEngine.ts](../src/popup/useEngine.ts)); offscreen backend `listSavedHosts`/`forgetAllHosts`/`resetAllTabs`
  + savedHosts в broadcast + case ([offscreen.js](../public/offscreen.js)); i18n `note.resetAll`/`note.forgot`.
  Ядро (DEQ save/load/auto-apply + одиночный forgetHost) не тронуто.
- tsc 0 · тесты **47** · build ok.

**2026-07-08 — релиз 2.2.0**

- **Угол full-window карточки.** BottomNav юзает `backdrop-filter`, Chrome не клипует его
  к скруглению карточки → квадратный угол торчал. Фикс: скруглены нижние углы самого `#root nav`
  (`@media min-height:700px`). [index.css](../src/popup/index.css)
- **Версия → 2.2.0** во всех 6 местах (package, manifest, 3× BUILD, CHANGELOG). Чеклист бампа
  добавлен в [DEPLOY.md](../DEPLOY.md) («Version bump»), т.к. BUILD-константы должны совпадать
  (иначе попап: «STALE — reload extension»).
- **Миграция www-ключей (2.1.x→2.2.0).** www-фикс сменил ключ памяти сайта (`DEQ.www.X`→`DEQ.X`),
  старые записи стали бы сиротами. `migrateWwwDomainKeys()` в `setupAudioNodes` разово переносит
  их (идемпотентно). Апдейт не теряет sticky-EQ. [offscreen.js:146](../public/offscreen.js:146)
- Данные при апдейте браузера/расширения НЕ сбрасываются (storage переживает; чистится только
  при полном uninstall). Единственный риск был www-ключи — закрыт миграцией.

**2026-07-08 — UX-полиш по разбору замысла (сверено с Ears)**

Ears (исходник идеи) подтвердил: авто-EQ при открытии попапа и пресеты без громкости —
это замысел, оставлены. Per-site память/правила/превью — добавки Umbra, по ним решения:

- **#4 прыжок панели.** `min-h-[470px]`→`[500px]` (все вкладки одной высоты) + full-window
  карточка прижата к верху (`align-items:flex-start`, было `safe center`) → не перецентрируется.
  [App.tsx](../src/popup/App.tsx), [index.css](../src/popup/index.css)
- **#5 превью только при autoDomain on.** `readAuto()` ([engine-io.ts](../src/lib/engine-io.ts)); boot рисует
  сохранённую кривую, лишь если она реально применится. Убрано мигание превью→flat.
- **#b правила развязаны от тумблера памяти.** `startCapture` ([offscreen.js](../public/offscreen.js)): DEQ-память
  под `if(autoDomain)`, а правило матчится ВСЕГДА (enabled). Приоритет: ручная правка (если
  память on) > правило > flat. Тумблер «Запоминать по сайтам» больше не глушит правила.
- **#2 честный Reset.** Тултип `eq.resetTitle` — «сбросит и забудет сохранённый звук».
- **#a hint при добавлении правила на захваченной вкладке** — `note.ruleAddedReeq` («нажми EQ ещё раз»).
- **#c hint «память перебивает правило».** `activeHostSaved` (useEngine) → `rules.shadowHint` в
  RulesView, когда у сайта своя DEQ-кривая затеняет матчащее правило. Приоритет не менялся —
  только видимость.
- Оставлено как замысел: авто-захват (1), пресет→память (3), пресет без громкости (4, Ears), приоритет DEQ>rule (c).
- tsc 0 · тесты 47 · build ok.

**2026-07-08 — встроенные пресеты (feature)**

- До этого `bassBoost` жил только в коде (rules-дропдаун + спецкейс offscreen) — во вкладке
  Presets его НЕ было, на свежей установке вкладка пустая. Фикс: [builtins.ts](../src/lib/builtins.ts) —
  4 curated пресета (**Bass Boost, Vocal, Movie, Warm**), обоснованные по ролям частот,
  умеренные гейны. Показаны первыми, accent-тинт, кликом применяются (`applyPreset` резолвит
  из `BUILTIN_PRESETS`, если нет в sync). Удаляемы через мелкую «×» (recoverable) → скрытые в
  `localStorage.HIDDEN_BUILTINS`; кнопка «Restore built-ins» (`Undo2`) возвращает.
  [App.tsx](../src/popup/App.tsx), [useEngine.ts](../src/popup/useEngine.ts), i18n.
- `bassBoost`-кривая обновлена (offscreen, оба места): 340/+5 → **100 Hz / +6** (угол ниже мути,
  чище). Совпадает с встроенным «Bass Boost».
- Тест на 11-полосность встроенных ([logic.test.ts](../src/lib/logic.test.ts)). tsc 0 · тесты 48 · build ok.
- Имена встроенных — английские (идентификаторы). Локализацию можно добавить позже.

**2026-07-08 — глобальный дефолт-звук (feature)**

- Запрос: чтоб выбранный звук работал на ВСЕХ сайтах без выбора на каждом; правило перебивает
  на своём сайте. Реализовано: `DEFAULT_EQ` в local ([engine-io.ts](../src/lib/engine-io.ts): `readDefaultEq`/
  `writeDefaultEq`/`clearDefaultEq`). `startCapture` ([offscreen.js](../public/offscreen.js): `loadDefaultEq`) —
  приоритет DEQ(если auto) → rule → **default** → flat. Popup: More → «Звук по умолчанию»
  (Set to current / Clear), `hasDefault`, превью дефолта в boot когда нет DEQ.
  [useEngine.ts](../src/popup/useEngine.ts), [App.tsx](../src/popup/App.tsx), i18n.
- tsc 0 · тесты 48 · build ok.

**2026-07-08 — лимитер + громче пресеты**

- Разбор юзерских пресетов (`121` = big bass+air smile, `hueta` = +29 по всем → клиппинг-ад)
  показал: стиль юзера = агрессивные бусты, мои +6 слишком тихие + без лимитера всё хрипит.
- **Лимитер** (`DynamicsCompressorNode`, threshold −1.5 / ratio 20 / knee 0) добавлен в
  `buildChain` перед destination ([offscreen.js](../public/offscreen.js)); отключается в `stopStream`. Большие
  бусты теперь чистые, не клипуют.
- **Пресеты перекалиброваны громче** ([builtins.ts](../src/lib/builtins.ts)): Bass Boost +6→**+10** shelf @90;
  Vocal/Movie/Warm усилены. offscreen `bassBoost` синхронизирован (90/+10).
- tsc 0 · тесты 48 · build ok.

**2026-07-08 — приоритет применяется LIVE (не только при захвате)**

- Жалоба «цепочка ручная→правило→дефолт→flat не работает». Порядок в коде был верный —
  но разрешение шло ТОЛЬКО в `startCapture`. Меняешь правило/дефолт на уже-захваченной
  вкладке → эффекта нет до Stop→EQ. А авто-захват при открытии = ты почти всегда уже внутри.
- Фикс: разрешение вынесено в `resolveBandsForHost(host)` (DEQ если auto → rule → default →
  flat), используется и в `startCapture`, и в новом `reresolveTab(tabId)`. Popup зовёт
  `reresolveTab` активной захваченной вкладки при смене правил (`persistRules`) и дефолта
  (`setDefaultToCurrent`/`clearDefault`) → эффект live. [offscreen.js](../public/offscreen.js), [useEngine.ts](../src/popup/useEngine.ts)
- Защита: флаг `entry.manual` (true при drag/preset/applySettings/modify*) — `reresolveTab`
  НЕ трогает вручную настроенную вкладку. `resetTab` ставит `manual=false` (возврат в авто).
- Осталось как есть: старая DEQ-память сайта всё равно затеняет rule/default (приоритет). Чтобы
  сайт подхватил правило/дефолт — Reset (забыть память), потом он в авто и reresolve сработает.
- tsc 0 · тесты 48 · build ok.

**2026-07-08 — фиксы аудита (5 агентов), по одной**

Полный трекер в vault `Audit 2026-07-08.md`. Статус:
- **H1** `reresolveTab` TOCTOU — FIXED: re-fetch + re-check `manual` после await. [offscreen.js](../public/offscreen.js) · tsc 0 · тесты 48 · build ok.
- **H2** `forgetHost` не гасил debounce-таймеры → воскрешение забытого хоста — FIXED: гасим `_saveTimers` всех вкладок этого host. · тесты 48 · build ok.
- **H3** правило на встроенный/удалённый пресет → тихий no-op — FIXED: миррор `BUILTIN_PRESETS` в offscreen + резолв в `bandsFromRule`/`applyPreset` + встроенные в дропдаун RulesView + parity-тест (миррор == builtins.ts). Удалённый юзер-пресет = graceful default/flat. · тесты 49 · build ok.

**2026-07-08 — ПИВОТ модели v2 «общий профиль + правила» (по просьбе юзера)**

Уходим от per-tab + per-site памяти к: один общий звук на всех вкладках, правило = исключение
на сайт; «правишь то, что слышишь» (сайт без правила → правишь общий профиль, сайт с правилом →
правишь его правило). Аудит-фиксы M4/M7/M11 и т.п. частично снимаются (DEQ/manual уходят).

- **S1 (движок + роутинг правок) — DONE.** offscreen `resolveBandsForHost` = rule→global→flat;
  `applySettings` без сохранения DEQ; новый `reapplyAll` (пере-резолв всех вкладок). useEngine:
  `commitTarget(bands,gain)` — правка идёт в общий профиль (`writeDefaultEq`) или в кривую
  матчащего правила; `onCommit`/`applyPreset`/`resetAll`/`persistRules` → `reapplyAll`.
  tsc 0 · тесты 49 · build ok.
- **S2 (UI-чистка) — DONE.** Убраны из UI: More→«Звук по умолчанию» карточка, тумблер
  «Запоминать по сайтам», shadow-hint, пер-таб Reset в Tabs. RulesView props siteSaved/
  autoDomain/onSetAutoDomain убраны. tsc 0 · тесты 49 · build ok. Модель тестируема.
- **S3a (попап мёртвый код) — DONE.** Вырезано из useEngine: autoDomain/activeHostSaved/
  hasDefault/pendingApply/setAutoDomain/setDefaultToCurrent/clearDefault/resetTabById + DEQ-превью;
  `savePreset` → sync-only; handleStatus/boot/return почищены. tsc 0 · тесты 49 · build ok.
- **S3b (движок мёртвый код) — TODO:** offscreen DEQ (load/save/queue/flush/forgetHost/migrate/
  DEQ_PREFIX/_saveTimers), autoDomain (loadAuto/setAuto/AUTO_KEY), manual-флаг, reresolveTab, мёртвые
  хендлеры (modifyFilter/resetFilter/applyPreset/saveCurrentAsPreset/deletePreset/importPresets/resetTab)
  + их router-cases; engine-io мёртвые экспорты (readAuto/readDomainEq/clearDefaultEq); мёртвые i18n.
- **S4 (vault-ноты) — TODO:** обновить Architecture/Audio Engine/Rules/Presets/Overview/Code Map под
  модель v2 (общий профиль + правила; убрать per-tab/DEQ описания).

**2026-07-08 — v2 баг: пресет слетает при смене вкладки / пресеты «мёртвые»**

- Причина: попап адоптит кривую из ЦЕПИ вкладки (движок streams), а не из общего профиля.
  Уже-захваченная вкладка держала старую цепь (flat); `reapplyAll` её не обновлял (попап
  закрылся при переключении) → открываешь → boot-превью показывает P, но handleStatus
  адоптит устаревший flat → пресет «слетал», клики снапали на flat.
- Фикс v1 (boot-reconcile на первом статусе) НЕ помог: reconcile стрелял ДО авто-захвата
  (`reapplyAll for 0 tabs`), потом вкладка захватывалась, но уже поздно → цепь flat при global=SET.
  Дебаг-кнопка (More → 🐞 Copy debug: снимок storage + ring-логи bg/offscreen) это показала.
- Фикс v2 (РАБОЧИЙ): reconcile стреляет, когда активная вкладка реально в захвате (`cur` есть) —
  тогда `reapplyAll` пере-резолвит её из текущего global/rules. [useEngine.ts](../src/popup/useEngine.ts).
  Плюс убран getFFT-спам из ring-буфера + dlog в `loadDefaultEq`. tsc 0 · build ok.

**2026-07-08 — КОРЕНЬ ВСЕХ баг резолва: offscreen без chrome.storage**

- Дебаг-лог показал: `loadDefaultEq: local=false chrome.storage=false` — **offscreen-документ НЕ имеет
  доступа к `chrome.storage`** (ограниченный API-набор). Значит движок НИКОГДА не читал storage:
  `resolveBandsForHost` всегда FLAT, `getRules`/`getPresets`/DEQ в движке — мёртвые. Это корень
  «правила не работают / пресет слетает / всё flat» на протяжении всей сессии (работало только пока
  попап пушил bands напрямую).
- **Фикс (архитектурный):** попап — источник истины. `globalRef` (общий профиль) + `resolvedFor(host)`
  (rule→global→flat, всё в попапе, он storage читает) + `applyEverywhere(tabs)` — пушит resolved-bands
  каждой захваченной вкладке (`applySettings`) и отражает активную в графике. Вызывается на каждом
  статусе (handleStatus), при правке (commitTarget), смене правил (persistRules), reset. Движок
  `reapplyAll`/`resolve` больше не используются попапом. [useEngine.ts](../src/popup/useEngine.ts). tsc 0 · тесты 49 · build ok.

**2026-07-08 — баг: Stop не держится (авто-захват пере-EQ-ит)**

- Лог показал цикл `stopCapture → startCapture` на одной вкладке: авто-захват при каждом
  открытии попапа заново захватывал Stop-нутую вкладку → Stop бесполезен.
- Фикс: `background.js` держит `stoppedTabs` (Set). `stopCaptureOnActiveTab` добавляет,
  `startCaptureOnActiveTab(auto)` при `auto` пропускает Stop-нутые, ручной EQ снимает метку.
  Навигация (`tabs.onUpdated` url) / закрытие (`onRemoved`) — чистят. Попап шлёт `auto:true`
  в авто-захвате. [background.js](../src/background.js), [useEngine.ts](../src/popup/useEngine.ts). tsc 0 · build ok.

**2026-07-08 — очистка перед релизом: убрана debug-кнопка**

- More → «🐞 Copy debug info» был dev-аид для отладки резолва (offscreen-без-storage баг).
  Задачу выполнил → убран из [App.tsx](../src/popup/App.tsx) + `copyDebug` из
  [useEngine.ts](../src/popup/useEngine.ts). `collectDebug` в [engine-io.ts](../src/lib/engine-io.ts)
  оставлен (dev-утилита, tree-shaken из prod-бандла, никто не импортит в рантайме). tsc 0 · build ok.
- Правый клик в попапе (Копировать / Найти в DuckDuckGo / Просмотреть код / AdBlock) — нативное
  контекст-меню Chrome, норма. «Просмотреть код» (Inspect) не дыра: код всё равно в `dist/`,
  попап смотрибельн у любого расширения. Оставляем. Опц. полиш — глушить `contextmenu` вне полей.

**2026-07-08 — S3b: движок = тупой applier (вырезан мёртвый резолв)**

Модель v2: попап — источник правды, резолвит и пушит `applySettings`; движок только строит/держит
пер-таб цепи + отдаёт status/FFT. Всё, что резолвило/писало в движке — мёртвое (нет senders,
сверено грепом попапа). Вырезано из [offscreen.js](../public/offscreen.js):
- Резолв: `resolveBandsForHost`, `reapplyAll`, `reresolveTab`, `loadDefaultEq`, `bandsFromRule`,
  `getRules` + матчер `normHostPat`/`hostMatchesPattern`/`matchRule` (зеркало rules.ts) + `BUILTIN_PRESETS` зеркало.
- DEQ-слой (пер-сайт память v1, ничего не читает в v2): `loadDomainEq`/`saveDomainEq`/
  `queueSaveDomainEq`/`flushSaveDomainEq`/`forgetHost`/`migrateWwwDomainKeys`/`DEQ_PREFIX`.
- Auto: `autoDomain`/`loadAuto`/`setAuto`/`AUTO_KEY` + поле `autoDomain` из status/getLogs.
- Хендлеры без senders: `modifyFilter`/`resetFilter`/`resetTab`/`applyPreset`/`saveCurrentAsPreset`/
  `deletePreset`/`importPresets` + их роут-кейсы. Поле `entry.manual` (читалось только резолвом).
- Диагностик-dlog'и (`resolve:`/`reapplyAll for`/`applySettings band0g`/`loadDefaultEq storage=`).

`startCapture` теперь строит flat → попап пушит реальные банды на следующем статусе (флэт-окно ~1
round-trip, глайд 12мс, незаметно; в v2 движок всё равно не резолвил — нет storage).
Оставлено: `getPresets` (эхо пресетов в status), лимитер, FFT, clamps, `hostOf`.
Каскад: **удалён** `parity.test.ts` (тестил удалённые зеркала), обновлён инвариант в
[CLAUDE.md](../CLAUDE.md). Роут движка теперь: `startCapture`/`stopCapture`/`disconnectTab`/
`modifyGain`/`applySettings`/`getStatus`/`getFFT`/`getLogs`. **tsc 0 · 46 тестов (было 49) · build ok ·
vanilla-JS syntax ok · грепа висячих ссылок = 0.**

**2026-07-08 — UI: preset-лейбл в EQ + тоггл «подсказка бэндов»**

- Хедер EQ показывает `Preset: <name>` (или `None`/`Нет`) — видно активный пресет (`eng.activePreset`).
  [App.tsx](../src/popup/App.tsx).
- Новая кнопка слева от Spectrum (иконка `Tags`): тоггл `showRoles` (persist `localStorage.SHOW_ROLES`,
  дефолт **off**). Включён → над каждой точкой текст-подпись зоны: Bass (0-2) / Mids (3-6) / Treble (7-8) /
  Air (9-10) (i18n `eq.zone*`; **БЕЗ эмодзи** — правило проекта). Чисто визуально, движка не касается.
  `showRoles`/`toggleRoles` в
  [useEngine.ts](../src/popup/useEngine.ts), рендер в [EqGraph.tsx](../src/popup/components/EqGraph.tsx).
- i18n: `eq.roles`/`eq.preset`/`eq.presetNone` (en+ru). tsc 0 · build ok.

**2026-07-08 — Full window = редактор глобального профиля**

Проблема (v2): «Full window» открывает `index.html` как отдельную вкладку. Она **сама себе
активная вкладка** (`chrome-extension://`, не capturable) → показывала глобал и была
**view-only** (`canEdit=false`, нет захвата). Разный EQ vs попап + бесполезна.

Фикс: full-window работает как **редактор глобального профиля**.
- Детект попап-vs-таб: `isFullWindowTab()` в [engine-io.ts](../src/lib/engine-io.ts) через
  `chrome.tabs.getCurrent` (в табе → tab, в попапе → undefined; guard на отсутствие API).
- [useEngine.ts](../src/popup/useEngine.ts): `globalEditor` state. При full → `activeTabId=null`,
  `activeHost=''` (резолв host `''` = глобал, без правила), `canEdit=true`, граф = глобал.
  Правка коммитит в глобал (`commitTarget` уже роутит не-ruled → `writeDefaultEq` + `applyEverywhere`
  пушит на реальные захваченные вкладки в других окнах). `maybeAutoCapture` сам no-op (гард
  `activeId==null` → не захватывает себя). `resetAll` теперь ставит граф явно (актив-таб не в
  списке пуша).
- [App.tsx](../src/popup/App.tsx): в режиме — баннер «Global profile · plays on every tab»
  (иконка `Globe`) вместо «EQ This Tab»; Reset-title `eq.resetGlobalTitle`.
- i18n: `eq.globalProfile`/`eq.resetGlobalTitle` (en+ru). tsc 0 · 46 тестов · build ok.

**2026-07-08 — пре-релиз: копирайт v1→v2 (блокер стора)**

Пивот v2 сменил поведение, но весь user-facing текст остался про v1 (per-site память,
«Remember EQ per site», «Default sound», «правку рукой перебивает правило»). Витрина бы врала.
Переписал под v2 (плоский голос, без эмодзи):
- **CHANGELOG [2.2.0]** — полностью переписан: общий звук на всех вкладках + правила-оверрайды,
  full-window глобал-редактор, band-guide, preset-лейбл, лимитер; секция **Removed** (per-site
  память, Remember-тумблер, Default-карточка, Remembered-sites).
- **STORE_LISTING** — summary + буллеты + how-to под v2 + «Works on Netflix & Spotify».
- **README** — фичи/how-to под v2 + Netflix/Spotify.
- **onboarding** (js+html, en+ru) — tip4 «per site» → «свой звук на выбранных сайтах».
- **i18n** (en+ru) — Guide (`howto.rules.*`, `guide.intro`, `guide.applyNote`), `eq.resetTitle`,
  `note.ruleAddedReeq`, `howto.tabs.p`. Удалены мёртвые ключи: `more.remember*`, `more.default*`,
  `note.default*`, `note.pressEq`, `rules.shadowHint`, `tabs.reset*`.
- **engine-io** — вырезан мёртвый v1: `readAuto`, `readDomainEq`, `DEQ_PREFIX` (аналог S3b в
  попап-слое; `collectDebug` дампит DEQ-leftover инлайн-литералом).
- **manifest description** — модель-агностик, не трогал. **DEPLOY** смок-шаги → v2.

tsc 0 · 46 тестов · build ok. Греп остатков v1 в витрине = только намеренные (что убрано) +
исторический CHANGELOG 2.1.0.

### Отложено (не мой вызов)
- **#6 глобальный `C:\Users\oblako\CLAUDE.md`** (graphify-out) — это твой глобальный конфиг, влияет
  на ВСЕ проекты. Не трогаю без явного «да». Рекоменд: убрать блок graphify или перенести в
  CLAUDE.md самого репо.

## 8. Заметки

<!-- сюда пишем дальше -->
