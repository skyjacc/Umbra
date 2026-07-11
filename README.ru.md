<p align="center">
  <a href="https://github.com/skyjacc/Umbra/releases/latest"><img src="docs/banner.png" alt="Umbra EQ" width="820"></a>
</p>

<h1 align="center">Umbra EQ</h1>

<p align="center">
  <b>Параметрический эквалайзер и усиление баса для каждой вкладки — Chrome, Edge и Opera</b><br>
  11 полос &middot; один общий звук &middot; правила для сайтов &middot; 100% локально
</p>

<p align="center">
  <a href="https://github.com/skyjacc/Umbra/releases/latest"><img src="https://img.shields.io/github/v/release/skyjacc/Umbra?label=release&color=8b93c6" alt="Последний релиз"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/skyjacc/Umbra?color=8b93c6" alt="Лицензия MIT"></a>
  <a href="https://github.com/skyjacc/Umbra/actions/workflows/build.yml"><img src="https://github.com/skyjacc/Umbra/actions/workflows/build.yml/badge.svg" alt="Статус сборки"></a>
  <a href="https://github.com/skyjacc/Umbra/stargazers"><img src="https://img.shields.io/github/stars/skyjacc/Umbra?color=8b93c6" alt="Звёзды GitHub"></a>
  <a href="https://github.com/skyjacc/Umbra/commits"><img src="https://img.shields.io/github/last-commit/skyjacc/Umbra?color=8b93c6" alt="Последний коммит"></a>
  <img src="https://img.shields.io/badge/Manifest-V3-8b93c6" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Chrome-116%2B-8b93c6" alt="Chrome 116+">
</p>

<p align="center">
  <a href="https://github.com/skyjacc/Umbra/releases/latest"><img src="https://img.shields.io/badge/%D0%A1%D0%BA%D0%B0%D1%87%D0%B0%D1%82%D1%8C-%D0%9F%D0%BE%D1%81%D0%BB%D0%B5%D0%B4%D0%BD%D0%B8%D0%B9%20%D1%80%D0%B5%D0%BB%D0%B8%D0%B7-8b93c6?style=for-the-badge&logo=github&logoColor=white" alt="Скачать последний релиз" height="34"></a>
  &nbsp;
  <a href="README.md"><img src="https://img.shields.io/badge/English-README-4b5178?style=for-the-badge" alt="English README" height="34"></a>
</p>

<p align="center">
  Бесплатный эквалайзер вкладок с открытым исходным кодом для Chrome, Edge и Opera.<br>
  Поднимите бас, уберите резкий звук или сделайте тихое видео громче — и слышите изменение прямо во время перетаскивания.
</p>

<!--
  ДЕМО-GIF ЕЩЁ НЕ ЗАПИСАН.
  Запишите ~10-15 с работы попапа на вкладке с играющим звуком: перетащите кривую по нескольким
  полосам, примените пресет Bass Boost, затем добавьте правило для сайта. Сожмите до < 5 МБ
  (ScreenToGif / ShareX), сохраните как docs/demo.gif и раскомментируйте строку ниже.
  До этого два статичных скриншота служат запасным вариантом.
-->
<!-- <p align="center"><img src="docs/demo.gif" alt="Живое перетаскивание кривой Umbra EQ" width="740"></p> -->

<p align="center">
  <img src="docs/screenshot-eq.png" alt="Эквалайзер Umbra EQ" width="410">
  &nbsp;
  <img src="docs/screenshot-rules.png" alt="Правила для сайтов в Umbra EQ" width="410">
</p>

## Содержание

- [Зачем нужен Umbra EQ](#зачем-нужен-umbra-eq)
- [Установка](#установка)
- [Возможности](#возможности)
- [Как пользоваться](#как-пользоваться)
- [Поддержка браузеров](#поддержка-браузеров)
- [Сборка из исходников](#сборка-из-исходников)
- [Как это устроено](#как-это-устроено)
- [Приватность](#приватность)
- [Стек](#стек)
- [Звёзды](#звёзды)
- [Обратная связь](#обратная-связь)
- [Участие в разработке](#участие-в-разработке)
- [Авторство и лицензии](#авторство-и-лицензии)

## Зачем нужен Umbra EQ

Звук в браузере такой, какой есть: слабый бас на ноутбучных динамиках, одно видео сведено слишком тихо, у другого резкие верхи — а большинство эквалайзеров-расширений замолкают на стриминговых сайтах, которыми вы реально пользуетесь. Umbra правит звук той вкладки, которую вы слушаете, вживую, и всё остаётся на вашем компьютере. Настрой один раз на все вкладки или дай отдельным сайтам свой звук через правила.

## Установка

Страница в Chrome Web Store уже готовится. А пока установка занимает около минуты:

1. Скачайте последний `umbra-eq-<версия>.zip` со [страницы релизов](https://github.com/skyjacc/Umbra/releases/latest) и распакуйте, либо соберите из исходников (см. ниже).
2. Откройте `chrome://extensions` (или `edge://extensions`, `opera://extensions`) и включите **Режим разработчика**.
3. Нажмите **Загрузить распакованное расширение** и выберите распакованную папку (папку `dist`, если собирали сами). Нужен Chrome 116 или новее.

> [!NOTE]
> Если после загрузки иконка ничего не делает, убедитесь, что выбрали именно папку **`dist`** (результат сборки), а не корень репозитория, и что у вас Chrome 116+. Аудиодвижку Umbra нужен offscreen-document API, которого нет в старых сборках.

## Возможности

- **Параметрический EQ на 11 полос** — тяни кривую, поднимай или срезай любую частоту вживую.
- **Один общий звук + правила сайтов** — один EQ везде или переопределение по шаблону адреса (побеждает первое совпадение). У каждой вкладки своя цепочка — две вкладки звучат по-разному.
- **Работает на Netflix, Spotify** и других сайтах, где эквалайзеры-расширения замолкают.
- **Бас, громкость выше 100%, ограничитель на выходе** — сильные бусты остаются чистыми, без клиппинга.
- **Пресеты** — Bass Boost / Vocal / Movie / Warm + свои; экспорт файлом или кодом для копирования.
- **Живой спектр, гид по полосам, полноэкранный редактор.**
- **Клавиатура + скринридеры**, RU/EN, четыре темы. 100% локально — без аккаунта, сети и аналитики.

## Как пользоваться

1. Включи звук на вкладке, нажми иконку Umbra EQ, затем **EQ This Tab**.
2. Тяни точку (или жми стрелки): влево-вправо — частота, вверх-вниз — усиление/срез; Shift меняет ширину/Q, двойной клик сбрасывает. Полоса слева — громкость.
3. Добавь **правило** вроде `youtube.`, чтобы дать сайту свой звук; останови вкладку во **Tabs** или открой **Full window** для правки общего звука на большом графике.

Встроенный **Гид** (вкладка More) проходит по всему этому — на русском или английском.

## Поддержка браузеров

| Браузер | Статус | Примечания |
| ------- | ------ | ---------- |
| **Chrome** | Поддерживается | Chrome 116+ (offscreen document + захват вкладки) |
| **Edge** | Поддерживается | Chromium, тот же пакет |
| **Opera** | Поддерживается | Chromium, тот же пакет |
| **Firefox** | В планах | Нужен отдельный движок на content-script (в Firefox нет `tabCapture`/`offscreen`). См. [`FIREFOX_PORT.md`](FIREFOX_PORT.md). |

## Сборка из исходников

<details>
<summary><b>Для разработчиков</b></summary>

Попап — приложение на React и TypeScript, собранное Vite и [CRXJS](https://crxjs.dev). Аудиодвижок (service worker плюс offscreen-документ Web Audio) остаётся на чистом JS.

```bash
npm install
npm run build      # → dist/  (загружаемое, чистое по CSP расширение MV3)
npm run dev        # dev-сборка с HMR
npm test           # 64 модульных теста Vitest — аудио, пресеты, правила + инварианты
npm run typecheck  # tsc, также выполняется в CI
```

Затем загрузите папку **`dist`** как распакованное расширение (см. [Установка](#установка)).

Чтобы собрать загружаемый zip для магазина:

```bash
npm run build
powershell -ExecutionPolicy Bypass -File build-zip.ps1
# → release/umbra-eq-<версия>.zip
```

Тот же zip принимают Chrome Web Store, Microsoft Edge Add-ons и Opera.

> Цикл разработки: `npm run build` → **Reload** на карточке расширения → Ctrl+R попапа или полноэкранной страницы.
> После запуска `vite dev` удалите `node_modules/.vite` и `dist` перед настоящей сборкой, иначе `dist/` останется dev-заглушкой.

</details>

## Как это устроено

Manifest V3. **Попап** (React + TypeScript) — источник истины: вычисляет звук каждой вкладки (правило → общий профиль → плоский) и отправляет полосы движку. **Движок — на чистом JS**: service worker владеет offscreen-документом и выдаёт id захвата вкладок; offscreen держит цепочку из 11 biquad-фильтров на вкладку за ограничителем «кирпичная стена», плавно без щелчков. Математика аудио/пресетов/правил — в `src/lib` (покрыта тестами); строгий CSP, без удалённого кода и `eval`.

Полный справочник — в [`PROJECT.md`](PROJECT.md), как контрибьютить — в [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Приватность

100% локально — без сетевых запросов и аналитики; звук нигде не записывается и не отправляется, настройки и пресеты остаются в браузере. Подробности — в [`PRIVACY.md`](PRIVACY.md).

## Стек

| Слой | Технология |
| ---- | ---------- |
| Оболочка | Manifest V3 — service worker + offscreen-документ |
| Аудио | Web Audio API — 11 biquad-фильтров на вкладку + ограничитель |
| Попап | React 18, TypeScript |
| Сборка | Vite + CRXJS |
| UI | Tailwind CSS, shadcn/ui, иконки lucide |
| Тесты | Vitest (64) |
| CI/CD | GitHub Actions — собирает zip `dist/` на push, PR и тегах `v*` |

## Звёзды

Если Umbra починила твой звук — звезда помогает другим её найти.

<p align="center">
  <a href="https://github.com/skyjacc/Umbra/stargazers"><img src="https://img.shields.io/github/stars/skyjacc/Umbra?style=for-the-badge&label=Star&color=8b93c6&logo=github&logoColor=white" alt="Звёзды GitHub"></a>
  &nbsp;
  <a href="https://github.com/skyjacc/Umbra/releases"><img src="https://img.shields.io/github/downloads/skyjacc/Umbra/total?style=for-the-badge&label=Downloads&color=4b5178&logo=github&logoColor=white" alt="Скачивания релизов"></a>
</p>

<p align="center">
  <a href="https://www.star-history.com/#skyjacc/Umbra&Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=skyjacc/Umbra&type=date&theme=dark&legend=top-left&sealed_token=g8oK8FZvjws0UF1kQQqzzWABV38Kwr-DMPeX9tE_ZwzP7szhg6yh767ZwIDbnH6ofQuVPQfuA5sbCd6JdNvHml-d4ZqPSodkIzsvJf0fv5iKZrS52j5nSHELVC1EYBm8vVl7BCTxW9-AmWhKqQ0H6pZE4BJs_bdArQaXYUu_VI6sadUOPOBUd8f9Vm3a" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=skyjacc/Umbra&type=date&legend=top-left&sealed_token=g8oK8FZvjws0UF1kQQqzzWABV38Kwr-DMPeX9tE_ZwzP7szhg6yh767ZwIDbnH6ofQuVPQfuA5sbCd6JdNvHml-d4ZqPSodkIzsvJf0fv5iKZrS52j5nSHELVC1EYBm8vVl7BCTxW9-AmWhKqQ0H6pZE4BJs_bdArQaXYUu_VI6sadUOPOBUd8f9Vm3a" />
      <img alt="История звёзд Umbra EQ" src="https://api.star-history.com/chart?repos=skyjacc/Umbra&type=date&legend=top-left&sealed_token=g8oK8FZvjws0UF1kQQqzzWABV38Kwr-DMPeX9tE_ZwzP7szhg6yh767ZwIDbnH6ofQuVPQfuA5sbCd6JdNvHml-d4ZqPSodkIzsvJf0fv5iKZrS52j5nSHELVC1EYBm8vVl7BCTxW9-AmWhKqQ0H6pZE4BJs_bdArQaXYUu_VI6sadUOPOBUd8f9Vm3a" width="640" />
    </picture>
  </a>
</p>

## Обратная связь

| | |
| --- | --- |
| Предложить идею | [Открыть обсуждение](https://github.com/skyjacc/Umbra/discussions) |
| Что-то сломалось? | [Создать issue](https://github.com/skyjacc/Umbra/issues/new) |
| Нравится? | [Поставьте звезду](https://github.com/skyjacc/Umbra/stargazers) — это правда помогает |

## Участие в разработке

Issues и pull request'ы приветствуются. См. [`CONTRIBUTING.md`](CONTRIBUTING.md) или откройте issue на <https://github.com/skyjacc/Umbra/issues>.

## Авторство и лицензии

- Код приложения: **MIT**, см. [`LICENSE`](LICENSE).
- Шрифты: **Inter** и **Geist Mono** под лицензией SIL Open Font License 1.1 ([`public/fonts/OFL-Inter.txt`](public/fonts/OFL-Inter.txt), [`public/fonts/OFL-GeistMono.txt`](public/fonts/OFL-GeistMono.txt)).
- UI: **React**, **Tailwind CSS**, **shadcn/ui** (MIT), иконки **lucide-react** (ISC).
- Полные сведения о сторонних лицензиях: [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

Umbra EQ — независимый аудиоинструмент. Он не связан с Netflix, Spotify, YouTube, Google или любым сайтом, звук которого обрабатывает, не одобрен и не поддерживается ими. Все товарные знаки принадлежат их владельцам.

<p align="center">
  <code>эквалайзер для браузера</code> &middot; <code>эквалайзер chrome</code> &middot; <code>усиление баса</code> &middot; <code>параметрический эквалайзер</code> &middot; <code>эквалайзер для netflix</code> &middot; <code>эквалайзер для spotify</code> &middot; <code>chrome equalizer</code> &middot; <code>per-tab equalizer</code> &middot; <code>manifest v3 equalizer</code> &middot; <code>bass boost chrome</code>
</p>

<p align="center">
  <a href="https://github.com/skyjacc/Umbra/releases/latest"><img src="https://img.shields.io/badge/%D0%A1%D0%BA%D0%B0%D1%87%D0%B0%D1%82%D1%8C%20Umbra%20EQ-8b93c6?style=for-the-badge&logo=github&logoColor=white" alt="Скачать Umbra EQ" height="46"></a>
</p>