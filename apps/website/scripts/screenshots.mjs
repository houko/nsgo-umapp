// Retakes the README's and the site's screenshots: the app's screenshot tests, on a made-up account, in each language and appearance, on macOS, the main window's too, and on the iPhone simulator. They save under apps/umapp's .nsgo/test/screenshots/; this copies them to the repository's screenshots/ under the names the READMEs and src/layouts/Home.astro use. Needs macOS, Go and Xcode.
import { execFileSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const app = path.join(root, 'apps', 'umapp');
const device = process.env.DEVICE ?? 'iPhone 18 Pro';
const targets = [
  { target: 'macos', name: 'macos', args: [], views: ['list', 'site', 'window'] },
  { target: 'ios_simulator', name: 'ios', args: ['-device', device], views: ['list', 'site'] },
];

for (const { target, name, args, views } of targets) {
  execFileSync('go', ['tool', 'nsgo', 'test', '-target', target, ...args, '-run', 'TestScreenshots'], {
    cwd: app,
    stdio: 'inherit',
  });
  for (const locale of ['en', 'zh-Hans']) {
    for (const view of views) {
      for (const suffix of ['', '-dark']) {
        copyFileSync(
          path.join(app, '.nsgo', 'test', 'screenshots', target, locale, `${view}${suffix}.png`),
          path.join(root, 'screenshots', `${name}-${view}-${locale}${suffix}.png`),
        );
      }
    }
  }
}
console.log('wrote screenshots/');
