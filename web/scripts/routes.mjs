// GitHub Pages serves files only: copy the app shell to each route.
import { copyFileSync, mkdirSync } from 'node:fs';
for (const r of ['c', 'w', 'chat', 'shop']) {
  mkdirSync(`dist/${r}`, { recursive: true });
  copyFileSync('dist/index.html', `dist/${r}/index.html`);
}
copyFileSync('dist/index.html', 'dist/404.html');
console.log('routes copied');
