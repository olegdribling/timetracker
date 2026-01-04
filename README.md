# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
# Time Work Tracker

Одностраничное приложение на React/Vite для учёта смен, расчёта оплаты и просмотра итогов за неделю/месяц. Данные сохраняются локально в IndexedDB (Dexie) и в `localStorage` (тема/меню).

## Возможности
- Добавление/редактирование смен: дата, время начала/окончания, обед, комментарий, ставка.
- Расчёт длительности и оплаты; поддержка смен, переходящих через полночь.
- Фильтр итогов по неделе или месяцу, выбор дня начала недели.
- Сохранение настроек (ставка, период), темы (light/dark) и состояния меню.
- Светлая/тёмная тема, адаптация под мобильные размеры.

## Требования
- Node.js 20+
- npm

## Установка и запуск
```bash
npm install
npm run dev           # дев-сервер (обычно http://localhost:5173)
npm run build         # прод-сборка в dist
npm run preview       # локальный просмотр собранного (после build)
npm run lint          # ESLint
npm run test          # Vitest (проверка расчётов/периодов)
```

## Структура
- `src/App.tsx` — UI и логика состояний.
- `src/lib/calculations.ts` — расчёты длительности, итогов, диапазонов.
- `src/db.ts` — конфигурация Dexie/IndexedDB.
- `src/types.ts` — типы смен и настроек.
- `src/App.css`, `src/index.css` — стили, темы.

## Деплой
- GitHub Actions (`pages.yml`) собирает `npm run build` и публикует на GitHub Pages с базовым путём `/timetracker/` (см. `vite.config.ts`).
