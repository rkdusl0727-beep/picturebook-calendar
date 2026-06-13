import { access } from 'node:fs/promises';

await access('site/index.html');
await access('site/app.js');
await access('site/styles.css');

console.log('Static site is ready in site/.');

