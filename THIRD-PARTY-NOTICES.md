# Third-party notices

Umbra EQ is licensed under the MIT License (see [LICENSE](LICENSE)). It bundles the
following third-party components, each under its own license.

`npm run build` generates `dist/THIRD-PARTY-NOTICES.txt` from the installed production
dependencies and their license files, includes Tailwind's generated CSS and the copied
shadcn/ui component license, and copies the application's `LICENSE` into `dist/`.
Both files are included in the store ZIP; packaging fails if either is absent.

## Fonts (shipped in the extension)

- **Inter** — SIL Open Font License 1.1 — (c) 2016 The Inter Project Authors.
  See [`public/fonts/OFL-Inter.txt`](public/fonts/OFL-Inter.txt).
- **Geist Mono** — SIL Open Font License 1.1 — (c) 2023 Vercel, Inc. / The Geist
  Project Authors. See [`public/fonts/OFL-GeistMono.txt`](public/fonts/OFL-GeistMono.txt).

## Libraries (bundled into the build)

- **React** and **React DOM** — MIT License — (c) Meta Platforms, Inc. and affiliates.
- **Tailwind CSS** — MIT License — (c) Tailwind Labs, Inc.
- **tailwindcss-animate** — MIT License — (c) Jamie Kyle.
- **shadcn/ui** — MIT License — (c) shadcn.
  See [`licenses/shadcn-ui.txt`](licenses/shadcn-ui.txt) for its full license, copied from
  the [upstream license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md).
- **lucide-react** — ISC License — (c) Lucide Contributors.
- **Radix UI** (`@radix-ui/react-slot`), **clsx**, **tailwind-merge** — MIT License.
- **class-variance-authority** — Apache License 2.0 — (c) 2022 Joe Bell.
  See http://www.apache.org/licenses/LICENSE-2.0.

Build tooling (Vite, CRXJS, TypeScript, Vitest, PostCSS, Autoprefixer) runs at build
time only and is not redistributed in the extension package.
