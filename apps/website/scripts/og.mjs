// Draws the English and Chinese social cards and the touch icons from the
// site's own pieces.
// Run `bun run og` after changing the look; the files in public/ are
// committed, so a build does not need Chrome or sips.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const website = path.resolve(scripts, '..');
const scratch = path.join(website, '.screenshots');
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const mark = readFileSync(path.join(website, 'public', 'favicon.svg'), 'utf8');
// The panel in a language's words, from `bun run screenshots`.
const shot = (name) => readFileSync(path.join(website, '..', '..', 'screenshots', `${name}.png`)).toString('base64');

const font =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', 'PingFang SC', 'Noto Sans SC', sans-serif";
const mono = "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace";

mkdirSync(scratch, { recursive: true });

function page(name, width, height, body, style = '') {
  const file = path.join(scratch, `${name}.html`);
  writeFileSync(
    file,
    `<!doctype html><html><head><meta charset="utf-8"><style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
      body { background: #08090c; color: #f1f3f7; font-family: ${font}; }
      ${style}
    </style></head><body>${body}</body></html>`,
  );
  return file;
}

function render(name, width, height, file) {
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${width},${height}`,
      `--screenshot=${path.join(website, 'public', name)}`,
      `file://${file}`,
    ],
    { stdio: 'ignore' },
  );
}

function socialCard({ name, locale, title, lede, titleStyle }) {
  const file = page(
    name,
    1200,
    630,
    `<div class="glow"></div>
    <div class="left">
      <div class="brand">${mark}<span>Umapp</span></div>
      <h1>${title}</h1>
      <p>${lede}</p>
      <div class="command">$ curl -fsSL …/install.sh | sh</div>
    </div>
    <div class="shot one"><img src="data:image/png;base64,${shot(`macos-list-${locale}-dark`)}" alt=""></div>
    <div class="shot two"><img src="data:image/png;base64,${shot(`macos-site-${locale}-dark`)}" alt=""></div>
    <div class="foot">oneo-me/nsgo-umapp · MIT</div>`,
    `
    .glow { position: absolute; left: 420px; top: -260px; width: 1000px; height: 900px;
      background: radial-gradient(closest-side, rgb(34 197 94 / 20%), transparent 70%); }
    .left { position: absolute; left: 64px; top: 58px; width: 520px; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand svg { width: 52px; height: 52px; filter: drop-shadow(0 10px 24px rgb(34 197 94 / 25%)); }
    .brand span { font-size: 34px; font-weight: 700; letter-spacing: -.04em; }
    h1 { margin: 52px 0 0; font-size: 56px; line-height: 1.05; letter-spacing: -.045em; ${titleStyle} }
    p { margin: 26px 0 0; width: 470px; color: #9aa1ad; font-size: 17px; line-height: 1.55; }
    .command { margin-top: 30px; display: inline-block; padding: 12px 16px; border: 1px solid #22262f;
      border-radius: 9px; background: #101319; color: #b9f0cc; font-family: ${mono}; font-size: 13px; }
    .shot { position: absolute; width: 300px; height: 467px; overflow: hidden;
      border: 1px solid #303643; border-radius: 14px; background: #101319;
      box-shadow: 0 40px 100px -30px #000; }
    .shot.one { left: 640px; top: 96px; transform: rotate(-2deg); }
    .shot.two { left: 862px; top: 70px; transform: rotate(2deg); }
    .shot img { width: 100%; height: auto; display: block; }
    .foot { position: absolute; left: 64px; bottom: 46px; color: #7f8794; font-family: ${mono}; font-size: 12px; }
    `,
  );
  render(`${name}.png`, 1200, 630, file);
}

socialCard({
  name: 'og',
  locale: 'en',
  title: 'Your Umami,<br>in the menu bar.',
  lede: 'Every website of an Umami account and who is on it now, in a native app for macOS and iPhone.',
  titleStyle: '',
});

socialCard({
  name: 'og-zh',
  locale: 'zh-Hans',
  title: '你的 Umami，<br>就在菜单栏。',
  lede: 'Umami 账户下的每个网站和此刻的在线访客，一个面向 macOS 和 iPhone 的原生应用。',
  titleStyle: 'font-size: 52px; letter-spacing: -.02em; line-height: 1.16;',
});

// The touch icon is square: iOS masks the corners itself, and a rounded
// mark inside a square would show two corner shapes.
const squareMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#f0ede8"/>
  <path fill="#86e6a8" d="M346 522H678A166 166 0 0 1 346 522Z"/>
  <path d="M282 268V535A230 230 0 0 0 742 535V268" fill="none" stroke="#222226" stroke-width="128" stroke-linecap="round"/>
  <circle cx="512" cy="402" r="78" fill="#22c55e"/>
</svg>`;
const icon = page(
  'icon',
  512,
  512,
  squareMark,
  `
  svg { display: block; width: 512px; height: 512px; }
  `,
);
render('icon.png', 512, 512, icon);
execFileSync('sips', ['-z', '180', '180', path.join(website, 'public', 'icon.png'), '--out', path.join(website, 'public', 'apple-touch-icon.png')], {
  stdio: 'ignore',
});
console.log('wrote public/og.png, public/og-zh.png and the icons');
