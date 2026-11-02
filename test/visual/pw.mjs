// Finds Playwright: the project's own copy first, then a global one. Prints how to install it if missing.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const req = createRequire(import.meta.url);
export function loadPlaywright() {
  const tries = [() => req('playwright'), () => req(execSync('npm root -g', { encoding: 'utf8' }).trim() + '/playwright')];
  for (const t of tries) {
    try {
      return t();
    } catch {}
  }
  console.error('Playwright is not installed. Run:  npm i -D playwright pngjs pixelmatch && npx playwright install chromium');
  process.exit(2);
}
