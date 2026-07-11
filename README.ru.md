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
  <img src="https://img.shields.io/badge/Manifest-V3-8b93c6" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Chrome-116%2B-8b93c6" alt="Chrome 116+">
</p>

<p align="center">
  <a href="https://github.com/skyjacc/Umbra/releases/latest"><img src="https://img.shields.io/badge/%D0%A1%D0%BA%D0%B0%D1%87%D0%B0%D1%82%D1%8C-%D0%9F%D0%BE%D1%81%D0%BB%D0%B5%D0%B4%D0%BD%D0%B8%D0%B9%20%D1%80%D0%B5%D0%BB%D0%B8%D0%B7-8b93c6?style=for-the-badge&logo=github&logoColor=white" alt="Скачать последний релиз" height="34"></a>
  &nbsp;
  <a href="README.md"><img src="https://img.shields.io/badge/English-README-4b5178?style=for-the-badge" alt="English README" height="34"></a>
</p>

<p align="center">
  <img src="docs/screenshot-eq.png" alt="Эквалайзер Umbra EQ" width="410">
  &nbsp;
  <img src="docs/screenshot-rules.png" alt="Правила для сайтов в Umbra EQ" width="410">
</p>

## Зачем нужен Umbra EQ

Слабый бас на ноутбучных динамиках, одно видео сведено слишком тихо, другое — слишком резко, а большинство эквалайзеров-расширений замолкают на стриминге, которым вы реально пользуетесь. Umbra правит звук вкладки, которую вы слушаете, вживую — и всё остаётся на вашем компьютере. Один звук на все вкладки или свой звук отдельным сайтам через правила.

## Установка

Страница в Chrome Web Store готовится. А пока — около минуты:

1. Скачай последний `umbra-eq-<версия>.zip` со [страницы релизов](https://github.com/skyjacc/Umbra/releases/latest) и распакуй (или собери из исходников ниже).
2. Открой `chrome://extensions` (или `edge://`, `opera://`) и включи **Режим разработчика**.
3. **Загрузить распакованное** → выбери распакованную папку `dist`. Chrome 116+.

> [!NOTE]
> Иконка не реагирует? Убедись, что выбрал папку **`dist`** (результат сборки), а не корень репозитория, на Chrome 116+ — движку нужен offscreen-document API.

## Возможности

- **Параметрический EQ на 11 полос** — тяни кривую, поднимай или срезай любую частоту вживую.
- **Один общий звук + правила сайтов** — один EQ везде или переопределение по шаблону адреса (побеждает первое совпадение). У каждой вкладки своя цепочка.
- **Работает на Netflix, Spotify** и других сайтах, где эквалайзеры-расширения замолкают.
- **Бас, громкость выше 100%, ограничитель** — сильные бусты остаются чистыми, без клиппинга.
- **Пресеты** — Bass Boost / Vocal / Movie / Warm + свои; экспорт файлом или кодом.
- **Живой спектр, гид по полосам, полноэкранный редактор.**
- **Клавиатура + скринридеры**, RU/EN, четыре темы. Без аккаунта, сети и аналитики.

## Как пользоваться

1. Включи звук на вкладке, нажми иконку Umbra EQ, затем **EQ This Tab**.
2. Тяни точку (или стрелки): влево-вправо — частота, вверх-вниз — усиление/срез, Shift — ширина/Q, двойной клик сбрасывает. Полоса слева — громкость.
3. Добавь **правило** вроде `youtube.` для звука сайта; останови вкладку во **Tabs** или открой **Full window** для большого графика.

Встроенный **Гид** (вкладка More) проходит по всему — на русском или английском.

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

Попап — приложение на React и TypeScript, собранное Vite и [CRXJS](https://crxjs.dev). Аудиодвижок (service worker + offscreen-документ Web Audio) остаётся на чистом JS.

```bash
npm install
npm run build      # → dist/  (загружаемое, чистое по CSP расширение MV3)
npm run dev        # dev-сборка с HMR
npm test           # 64 модульных теста Vitest
npm run typecheck  # tsc, также в CI
```

Затем загрузи папку **`dist`** как распакованное расширение (см. [Установка](#установка)). Для zip магазина:

```bash
npm run build
powershell -ExecutionPolicy Bypass -File build-zip.ps1
# → release/umbra-eq-<версия>.zip
```

Тот же zip принимают Chrome Web Store, Edge Add-ons и Opera.

> Цикл разработки: `npm run build` → **Reload** на карточке расширения → Ctrl+R попапа.
> После `vite dev` удали `node_modules/.vite` и `dist` перед настоящей сборкой, иначе `dist/` останется dev-заглушкой.

</details>

## Как это устроено

Manifest V3. **Попап** (React + TypeScript) — источник истины: вычисляет звук каждой вкладки (правило → общий профиль → плоский) и отправляет полосы движку. **Движок — на чистом JS**: service worker владеет offscreen-документом и выдаёт id захвата вкладок; offscreen держит цепочку из 11 biquad-фильтров на вкладку за ограничителем «кирпичная стена», плавно без щелчков. Математика аудио/пресетов/правил — в `src/lib` (покрыта тестами); строгий CSP, без удалённого кода и `eval`.

Архитектура — в [`PROJECT.md`](PROJECT.md), как контрибьютить — в [`CONTRIBUTING.md`](CONTRIBUTING.md).

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

<a href="https://www.star-history.com/?repos=skyjacc%2FUmbra&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=skyjacc/Umbra&type=date&theme=dark&legend=top-left&sealed_token=5nsh_UHuzblZshtMf4C7j-zWnbA-LWyY6-LLQIzwh1MXehy-MxC_4vmIVqEk8ndH6zdj1JQ-kukR9mEB_843GXROAtzjeqD8ixp7dm939x0g3KxKxIeYps8NhWb8CWkyKJ1fnLStM4FTiU52ng2gk-dTKEzBCNWqRQtuvRDUpWtioYV4eFKxRwXAVMTM" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=skyjacc/Umbra&type=date&legend=top-left&sealed_token=5nsh_UHuzblZshtMf4C7j-zWnbA-LWyY6-LLQIzwh1MXehy-MxC_4vmIVqEk8ndH6zdj1JQ-kukR9mEB_843GXROAtzjeqD8ixp7dm939x0g3KxKxIeYps8NhWb8CWkyKJ1fnLStM4FTiU52ng2gk-dTKEzBCNWqRQtuvRDUpWtioYV4eFKxRwXAVMTM" />
   <img alt="История звёзд Umbra EQ" src="https://api.star-history.com/chart?repos=skyjacc/Umbra&type=date&legend=top-left&sealed_token=5nsh_UHuzblZshtMf4C7j-zWnbA-LWyY6-LLQIzwh1MXehy-MxC_4vmIVqEk8ndH6zdj1JQ-kukR9mEB_843GXROAtzjeqD8ixp7dm939x0g3KxKxIeYps8NhWb8CWkyKJ1fnLStM4FTiU52ng2gk-dTKEzBCNWqRQtuvRDUpWtioYV4eFKxRwXAVMTM" />
 </picture>
</a>

## Обратная связь

| | |
| --- | --- |
| Предложить идею | [Открыть обсуждение](https://github.com/skyjacc/Umbra/discussions) |
| Что-то сломалось? | [Создать issue](https://github.com/skyjacc/Umbra/issues/new) |
| Нравится? | [Поставьте звезду](https://github.com/skyjacc/Umbra/stargazers) |

## Участие в разработке

Issues и pull request'ы приветствуются — см. [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Авторство и лицензии

- Код приложения: **MIT** ([`LICENSE`](LICENSE)).
- Шрифты: **Inter** и **Geist Mono** под SIL Open Font License 1.1.
- UI: **React**, **Tailwind CSS**, **shadcn/ui** (MIT), иконки **lucide-react** (ISC). Полный список: [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

Umbra EQ — независимый аудиоинструмент, не связанный с Netflix, Spotify, YouTube, Google или сайтами, звук которых обрабатывает, и не одобренный ими. Все товарные знаки принадлежат их владельцам.
