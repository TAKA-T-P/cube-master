import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// GitHub Pages（https://<user>.github.io/cube-master/）で公開するためのパス。
// リポジトリ名を変える場合は環境変数 BASE_PATH で上書きできる（例：BASE_PATH=/my-repo/）。
const PAGES_BASE = process.env.BASE_PATH ?? '/cube-master/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? PAGES_BASE : '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    // three.js はアプリ本体と分けて、更新時もブラウザのキャッシュを効かせる
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
    // three.js 単体で 500kB を超えるため、警告の基準を調整
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
}));
