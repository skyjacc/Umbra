# Обновление Umbra EQ до 2.5.0 в Chrome Web Store

Подготовлено 2026-11-08. Это инструкция и тексты для ручного заполнения. Она не подтверждает загрузку пакета, изменение dashboard, публикацию GitHub или одобрение Google.

Обновляем **существующий** item `plkncppcgglcjdkmcdeajhbfccbnnoee`. Не создавайте новый item: у обновления должны сохраниться текущий адрес, пользователи и отзывы. Публичная карточка: [Umbra EQ](https://chromewebstore.google.com/detail/plkncppcgglcjdkmcdeajhbfccbnnoee).

## 1. Подготовьте пакет и публичную privacy policy

1. Используйте финальный проверенный `release/umbra-eq-2.5.0.zip`. Это весь production-пакет: `manifest.json` находится в корне ZIP, внутри есть `_locales/en/messages.json` и `_locales/ru/messages.json`. Не загружайте ZIP исходного репозитория с GitHub.
2. В пакете должна быть версия **2.5.0**. Перед загрузкой посмотрите последнюю версию в dashboard: новый номер должен быть выше уже опубликованного; если там уже опубликована 2.5.0 или выше, сначала потребуется согласованное повышение версии и новая сборка.
3. Откройте публичный [PRIVACY.md](https://github.com/skyjacc/Umbra/blob/main/PRIVACY.md). До отправки он должен совпадать с подготовленной политикой: локальная обработка аудио, Chrome Sync для пресетов/правил, URL/title и временные диагностические логи до 400 записей на контекст, включая полные URL. Сначала опубликуйте эту редакцию по указанному URL, если там ещё старый текст. Наличие локального файла этого не делает.
4. Проверьте, что публичный [репозиторий](https://github.com/skyjacc/Umbra) и будущая ссылка на релиз соответствуют реально опубликованному состоянию. GitHub Release и выпуск в Chrome Web Store — отдельные действия.

## 2. Загрузите новую версию в существующий item

Откройте [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) под аккаунтом владельца → выберите Umbra с ID **plkncppcgglcjdkmcdeajhbfccbnnoee** → **Package / Пакет** → **Upload New Package / Загрузить новый пакет** → выберите `umbra-eq-2.5.0.zip`.

Дождитесь завершения проверки загрузки. Убедитесь, что dashboard показывает версию 2.5.0 и четыре разрешения: `activeTab`, `tabCapture`, `storage`, `offscreen`. Загрузка черновика сама по себе не заменяет опубликованную версию. [Официальный порядок обновления](https://developer.chrome.com/docs/webstore/update).

Если на этом item ранее включили **Verified CRX Uploads**, dashboard потребует CRX, подписанный зарегистрированным ключом, вместо обычного ZIP. Не включайте и не отключайте этот режим ради инструкции; используйте действующий процесс подписи аккаунта. Состояние этой настройки здесь не проверено. [Правила Verified CRX Uploads](https://developer.chrome.com/docs/webstore/update#protect-your-package-updates).

## 3. Заполните Store listing / Описание в магазине

### Название и краткое описание

Название и summary приходят из загруженного пакета, из `extensionName` и `extensionDescription` в `_locales`. Их не нужно вставлять в длинное описание. После загрузки проверьте ожидаемые значения:

| Язык | Название | Краткое описание |
|---|---|---|
| English | Equalizer + Bass Boost, per Tab — Umbra EQ | 11-band equalizer, bass boost and volume control for each tab. Save presets and site profiles. Audio stays on your device. |
| Русский | Эквалайзер и усиление баса — Umbra EQ | Эквалайзер на 11 полос, усиление баса и громкости для вкладок. Пресеты и настройки сайтов. Звук обрабатывается на устройстве. |

Пакет использует `default_locale: en`. Для названия действует максимум 75 символов, для summary — 132. [Название](https://developer.chrome.com/docs/extensions/reference/manifest/name), [summary](https://developer.chrome.com/docs/extensions/reference/manifest/description).

### Category / Категория

Выберите **Tools / Инструменты**. Это рекомендуемая категория для текущего аудиоинструмента, а не утверждение о ранее выбранном значении.

### Description → English

В переключателе языка listing выберите **English**. В поле **Description / Подробное описание** вставьте весь блок ниже, без строк ограждения блока. Источник: [en-description.txt](en-description.txt).

```text
Umbra EQ gives each browser tab its own sound. Use its 11-band parametric equalizer and volume booster to adjust music, videos, streams and podcasts while they play. Add bass, soften harsh treble or shape the frequencies that make speech easier to hear.

CONTROL THE SOUND
• Move each band's frequency and gain on the graph, or enter exact values. Adjust width (Q) for bell filters.
• Start with Bass Boost, Vocal, Movie or Warm, then save your own presets.
• Adjust the volume of a captured tab, including boosting quiet audio above its original level.
• Watch a live spectrum while adjusting the curve. An output limiter reduces excessive signal peaks.

KEEP YOUR SETTINGS
• Use one global sound, with saved rules for individual websites.
• Give a music tab and a video tab different settings at the same time.
• Import and export presets, or share them with a copy-and-paste code.
• Use keyboard controls, a larger editor window, four themes and English or Russian interface text.

GET STARTED
1. Play audio in a normal web tab.
2. Open Umbra EQ and select EQ This Tab.
3. Choose a preset or adjust the graph and volume.
4. Add a site rule if you want to reuse that sound on the website.

AUDIO AND PRIVACY
Audio is processed on your device. Umbra does not save audio recordings or send your audio to its developer. No account, ads or usage analytics are built into the extension.

The extension reads tab information, including the address and title, to apply site rules and identify captured tabs. Global settings stay local; saved presets and site rules can sync through your Google account when Chrome Sync is enabled. Details: https://github.com/skyjacc/Umbra/blob/main/PRIVACY.md

BEFORE YOU INSTALL
Umbra processes browser-tab audio, not system-wide sound or microphone input. It requires Chrome 116 or later. Chrome displays a sharing indicator during capture and can restrict fullscreen while capture is active. Protected media and browser-internal pages may not support capture. Boosting audio cannot repair distortion already present in a recording. This version does not automatically equalize loudness between videos or isolate voices from background music.

Free and open source. Source code: https://github.com/skyjacc/Umbra
Help and bug reports: https://github.com/skyjacc/Umbra/issues
```

### Description → Русский

Переключите язык listing на **Русский**. В соответствующее поле **Description / Подробное описание** вставьте весь блок ниже. Источник: [ru-description.txt](ru-description.txt).

```text
Umbra EQ позволяет настроить звук каждой вкладки отдельно. Параметрический эквалайзер на 11 полос и усилитель громкости работают во время воспроизведения музыки, видео, стримов и подкастов. Добавьте бас, смягчите резкие высокие частоты или настройте частоты, помогающие различать речь.

УПРАВЛЯЙТЕ ЗВУКОМ
• Меняйте частоту и усиление каждой полосы на графике или вводите точные значения. Для колокольных фильтров доступна настройка ширины (Q).
• Начните с Bass Boost, Vocal, Movie или Warm, затем сохраните собственный пресет.
• Регулируйте громкость обрабатываемой вкладки, в том числе усиливайте тихий звук выше исходного уровня.
• Наблюдайте за спектром во время настройки. Выходной лимитер уменьшает чрезмерные пики сигнала.

СОХРАНЯЙТЕ НАСТРОЙКИ
• Используйте общий профиль звука и отдельные правила для сайтов.
• Одновременно применяйте разные настройки к вкладке с музыкой и вкладке с видео.
• Импортируйте и экспортируйте пресеты или делитесь ими с помощью текстового кода.
• Пользуйтесь клавиатурным управлением, большим окном редактора, четырьмя темами и интерфейсом на русском или английском языке.

КАК НАЧАТЬ
1. Включите звук в обычной веб-вкладке.
2. Откройте Umbra EQ и включите обработку этой вкладки.
3. Выберите пресет или настройте график и громкость.
4. Добавьте правило сайта, чтобы повторно использовать выбранное звучание.

ЗВУК И КОНФИДЕНЦИАЛЬНОСТЬ
Звук обрабатывается на вашем устройстве. Umbra не сохраняет аудиозаписи и не отправляет звук разработчику. В расширении нет аккаунтов, рекламы или аналитики использования.

Расширение читает сведения о вкладке, включая адрес и заголовок, чтобы применять правила сайтов и показывать обрабатываемые вкладки. Общие настройки хранятся локально. Сохранённые пресеты и правила сайтов могут синхронизироваться через ваш аккаунт Google, если включён Chrome Sync. Подробнее: https://github.com/skyjacc/Umbra/blob/main/PRIVACY.md

ПЕРЕД УСТАНОВКОЙ
Umbra обрабатывает звук вкладок браузера, а не всей системы или микрофона. Требуется Chrome 116 или новее. Во время захвата Chrome показывает индикатор общего доступа и может ограничивать полноэкранный режим. Захват может быть недоступен для защищённых материалов и внутренних страниц браузера. Усиление не исправляет искажения в исходной записи. Эта версия не выравнивает громкость между видео автоматически и не отделяет голос от фоновой музыки.

Бесплатно, с открытым исходным кодом: https://github.com/skyjacc/Umbra
Помощь и сообщения об ошибках: https://github.com/skyjacc/Umbra/issues
```

Сохраните обе локали. Если русского языка нет в переключателе, сначала проверьте, что загружен новый пакет с `_locales/ru`; не заменяйте английское описание русским. Перевод manifest не заполняет длинное описание и screenshots автоматически. [Локализованные listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing).

### Ссылки и графика

| Поле, если оно доступно в форме | Значение |
|---|---|
| Website / Сайт | `https://github.com/skyjacc/Umbra` |
| Support / Поддержка | `https://github.com/skyjacc/Umbra/issues` |
| Privacy policy / Политика конфиденциальности | `https://github.com/skyjacc/Umbra/blob/main/PRIVACY.md` |

Для скриншотов используйте [assets-brief.md](assets-brief.md): реальный EQ, правила сайтов, пресеты; отдельно EN и RU. Требуется 1–5 изображений, предпочтительно 1280 × 800; также допустимо 640 × 400. Нужны прямые углы и заполненный кадр без внешних полей. Не растягивайте popup под другой aspect ratio и не показывайте нереализованные функции. Small promo 440 × 280 и marquee 1400 × 560 — отдельные глобальные изображения. [Официальные требования к изображениям](https://developer.chrome.com/docs/webstore/images).

## 4. Заполните Privacy practices / Конфиденциальность

Тексты ниже точно повторяют подготовленные блоки [privacy-fields.md](privacy-fields.md). Вставляйте сам текст без строк ограждения блока.

### Single purpose / Единственное назначение

```text
Umbra EQ has a single purpose: to equalize and adjust the volume of the audio playing in the user's browser tabs, in real time.
```

### Permission justification → activeTab

```text
Umbra uses activeTab after the user invokes the extension to read the tab's URL, title and favicon URL. The URL is used to check whether capture is supported and to match the hostname against saved site rules; the title and favicon identify captured tabs in the interface. Umbra does not read page DOM content or the browser's history database. Audio capture is performed separately through tabCapture.
```

### Permission justification → tabCapture

```text
Umbra uses tabCapture to obtain the audio stream of a tab after the user invokes the extension for that tab. Each captured tab is processed by its own equalizer and played back locally in real time. Only audio is requested, not video or microphone input. Audio is held only in transient processing buffers; it is not saved as a recording or uploaded.
```

### Permission justification → storage

```text
Umbra uses chrome.storage.local to save the global EQ profile and chrome.storage.session to remember tabs the user stopped. Named presets and site rules, including saved hostname patterns, use chrome.storage.sync. If browser sync is enabled, Chrome may synchronize these settings across the user's devices. Umbra has no server and does not send these settings to its developer.
```

### Permission justification → offscreen

```text
Umbra uses a bundled offscreen document to consume tab audio streams and run the Web Audio processing and playback graph while the popup is closed. This work requires document APIs unavailable in the Manifest V3 service worker. The document is created for USER_MEDIA and AUDIO_PLAYBACK, uses only packaged scripts, and performs audio processing locally.
```

### Remote code / Удалённый код

Выберите **No, I am not using remote code / Нет, я не использую удалённый код** для проверенного production-пакета. JS и audio worklet включены в пакет; Chrome Sync передаёт настройки, а не исполняемый код. Объяснение для ответа «да» здесь не требуется. Выбор нужно пересмотреть, если состав финального пакета изменится. [Декларация remote code](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [правило Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code).

### Data usage / Какие данные обрабатываются

Это рекомендации по проверенному поведению, а не восстановленные состояния старых checkbox. Отсутствие передачи разработчику не означает отсутствия обработки данных: Google требует disclosure и при локальной обработке. [User Data FAQ, вопросы 3 и 14](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

| Категория в форме | Что выбрать / проверить |
|---|---|
| Website content / Содержимое сайтов | **Отметить.** Обрабатывается звук вкладки; официальная категория включает sounds. Аудиозаписи не сохраняются и звук не загружается на сервер. |
| Web history / История веб-поиска | **Рекомендуется отметить консервативно.** Расширение читает URL/title, правила сохраняют hostname, временные логи могут содержать полные URL. Это не доступ к базе истории Chrome. Документация не даёт отдельного однозначного решения именно для такого сочетания временных данных и настроек. |
| Personal communications / Личная коммуникация | **Не пропустить при проверке.** Старое описание рекламировало звонки, а категория включает conference calls. Если обработка браузерных звонков остаётся поддерживаемым сценарием, консервативно отметить и пояснить, что обрабатывается только воспроизводимый вкладкой звук. Новое описание не рекламирует звонки, но это само по себе не исключает их аудио из runtime. Для случайного воспроизведения звонка через универсальный EQ явного решения CWS не найдено. До отправки зафиксируйте фактический scope и соответствующий выбор; не ставьте «нет» только из-за удаления слова «звонки». |
| Остальные категории | В проверенном коде не обнаружено целевого сбора идентификационных, медицинских, финансовых, аутентификационных данных, геолокации или аналитики действий пользователя. Не отмечайте категории автоматически только потому, что произвольная аудиозапись может упоминать такие сведения. Пересмотрите выбор, если в финальный пакет добавлены другие источники данных. |

Определения приведены в [официальной форме Google](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) и [иллюстрации категорий](https://developer.chrome.com/static/docs/webstore/cws-dashboard-privacy/image/screenshot-data-certifi-1955439870c37.png). Эта рекомендация не гарантирует результат review. Не вставляйте прежние обобщения «Nothing uploaded», «No browsing data» или «No data collected».

### Три подтверждения использования данных

Для проверенного поведения отметьте три декларации, соответствующие следующим утверждениям; прочитайте фактический текст checkbox в текущей форме:

1. Данные не продаются и не передаются третьим сторонам вне разрешённых случаев. У Umbra нет продажи данных; настройки могут синхронизироваться самим Chrome, как раскрыто в policy.
2. Данные не используются и не передаются для целей, не связанных с единственным назначением расширения.
3. Данные не используются для определения кредитоспособности или принятия решений о кредитовании.

Это заявления издателя о реальном поведении, а не необязательные маркетинговые галочки. Проверенный код соответствует этим утверждениям. [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use).

### Privacy policy URL

Вставьте:

```text
https://github.com/skyjacc/Umbra/blob/main/PRIVACY.md
```

Перед отправкой откройте ссылку без авторизации и проверьте опубликованную редакцию. В policy должны оставаться пояснения о Chrome Sync и локальных логах с URL; не заменяйте их общей фразой «всё хранится локально».

## 5. Distribution / Распространение

Проверьте реальные переключатели в dashboard:

- **Pricing / Цена: Free / Бесплатно**, пока у этого релиза нет платных функций или покупок. Если форма отдельно спрашивает о покупках, отвечайте по текущему продукту; в проверенном Umbra их нет.
- **Visibility / Видимость: Public / Общедоступно** для обычного публичного обновления. Не переводите существующий item в Private или Unlisted для этой публикации.
- **Regions / Регионы:** сохраните фактически выбранные страны, если намерение издателя не изменилось. Список названий стран в текстовой выгрузке не доказывает, что они отмечены. Не выбирайте All regions автоматически и не исключайте страны только из-за небольшого числа установок.

Эта инструкция не утверждает, что такие значения уже выставлены. [Видимость и регионы](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution).

## 6. Test instructions / Инструкции для проверки

Umbra не требует аккаунта, пароля, оплаты или отдельного backend. Поля учётных данных оставьте пустыми; если форма предлагает вариант «account not required», выберите его. Сам раздел необязателен, но сценарий ниже помогает проверить audio capture. [Официальное назначение раздела](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions).

### Короткий текст для поля Additional instructions

Фактический лимит поля **Additional instructions / Инструкции для тестирования — 500 символов**, проверено в интерфейсе Chrome Web Store 8 ноября 2026 года. Вставьте следующий блок целиком (464 символа):

```text
Umbra EQ 2.5.0 needs no account/payment. Chrome 116+. Play public non-DRM audio in a tab, click Umbra's toolbar icon and EQ This Tab. Apply Vocal, move a band and change volume; use Bypass to compare. Save for this site; check Rules. On another site, start audio and capture, then choose Bass Boost. Verify both tabs sound different. Save/reapply a custom preset. Stop the second tab; the first should continue. Stop all. Browser pages/DRM may not support capture.
```

### Расширенная ручная проверка

Следующий сценарий предназначен для полной ручной проверки перед отправкой. Он превышает лимит поля Additional instructions и в это поле не вставляется.

```text
Umbra EQ 2.5.0 does not require an account, password, payment, API key, or developer server. All features can be tested in Chrome 116 or later.

1. Open a normal HTTPS tab with public, unprotected audio and start playback manually. Example audio A: https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3 . It is a short sample; enable Loop in the browser's audio-player context menu or replay it while testing. These sample URLs are external test media, not dependencies of Umbra; any accessible non-DRM audio on two different websites can be used instead.
2. Invoke Umbra using its toolbar icon for that tab. If capture is not already active, press EQ This Tab. Chrome should show its tab-capture indicator. Choose the Vocal preset and change a band or the master volume; the playing audio should respond. Use Bypass to compare with the EQ curve bypassed, then turn Bypass off.
3. Use Save for this site to save the current sound as a site rule. Open Rules and confirm the rule for the first hostname. Rules are evaluated in order; the first enabled matching rule wins. A rule chooses settings after capture starts; it does not grant capture permission for every new tab.
4. Open a second tab on a different hostname and start public, unprotected audio. Example audio B: https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg . Invoke Umbra on this second tab and start capture if needed. With no rule matching this second site, choose Bass Boost for the global profile. The second tab uses the global sound while the first tab keeps its saved site-rule sound. Reopen each tab's popup to inspect its selected scope and settings.
5. In Presets, save a named custom preset, then apply another preset and reapply the saved preset. Close and reopen the popup: the named preset and site rule should still be present. Saving and using settings does not require signing into Chrome; synchronization between devices additionally depends on Chrome Sync being enabled.
6. Stop the second tab from the captured-tabs list. Its capture indicator should disappear while the first tab continues processing. Stop the first tab to end the test. Delete the test rule and custom preset if desired.

Only tab playback audio is captured, not microphone input or system-wide sound. Browser-internal pages and protected/DRM media may not support capture. Chrome can restrict fullscreen during capture; this is a browser/player limitation. The extension does not automatically normalize loudness between different videos or separate voices from background music.

Audio processing is local. No recording or audio upload is made. Saved presets and site rules can use Chrome Sync. Temporary in-memory diagnostics can include full tab URLs and are not uploaded. Privacy policy: https://github.com/skyjacc/Umbra/blob/main/PRIVACY.md
```

Оба примера аудио ответили HTTP 200 при подготовке инструкции; это не результат проверки playback в браузере и не гарантия их будущей доступности. Не используйте внутренние страницы браузера как положительный тест захвата.

## 7. Сохраните черновик и проверьте его перед отправкой

Сохраните изменения формы. На этом этапе пакет и тексты должны быть доступны для финального просмотра; эта инструкция сама ничего не отправляет.

Проверьте в черновике: тот же item ID, версия 2.5.0, обе локали description, четыре обоснования разрешений, реальные состояния privacy checkbox, актуальная публичная policy, корректные screenshots и желаемая география.

Перед отправкой пройдите сценарий раздела 6 на финальном пакете и на тех обычных сайтах, поддержку которых хотите заявлять. Нативные проверки реального захвата двух вкладок, работы после закрытия popup и независимого Stop не доказывают совместимость с каждым сервисом. Платные DRM-сервисы и субъективное прослушивание в подготовке этого релиза не проверены; не добавляйте обещания их полной поддержки.

Когда издатель готов отправить обновление, действие в dashboard — **Submit for Review / Отправить на проверку**. В диалоге выберите нужный режим: автоматическая публикация после одобрения либо отложенная публикация вручную. Для отдельного финального выпуска после review используйте отложенную публикацию. Сама отправка не означает одобрения или немедленной замены версии в магазине. [Отправка и deferred publishing](https://developer.chrome.com/docs/webstore/update#submit-the-update).

Английские заметки для GitHub Release подготовлены отдельно: [release-notes-2.5.0.md](release-notes-2.5.0.md). Не вставляйте их вместо локализованных подробных описаний CWS. Публикация GitHub Release не подтверждает ни отправку, ни одобрение Chrome Web Store.
