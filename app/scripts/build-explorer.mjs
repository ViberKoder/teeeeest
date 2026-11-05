#!/usr/bin/env node
// Packs the explorer as a standalone static site (the hatch.tg root): explorer page as index.html + its assets.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url).pathname;
const out = new URL('../dist-explorer/', import.meta.url).pathname;
if (!existsSync(`${dist}explorer/index.html`)) throw new Error('run `vite build` first');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(`${dist}assets`, `${out}assets`, { recursive: true });
for (const f of ['icon.svg', 'icon.png', 'post-egg.jpg']) if (existsSync(`${dist}${f}`)) cpSync(`${dist}${f}`, `${out}${f}`);
let html = readFileSync(`${dist}explorer/index.html`, 'utf8');
html = html.replace('<title>Hatch Explorer</title>', '<title>hatch.tg — the EGG explorer</title>');
writeFileSync(`${out}index.html`, html);
// Cloudflare Pages / Netlify style: the explorer is the whole site
writeFileSync(`${out}_redirects`, '/explorer/*  /  301\n');
console.log('dist-explorer/ is ready — upload it to the host of hatch.tg');
