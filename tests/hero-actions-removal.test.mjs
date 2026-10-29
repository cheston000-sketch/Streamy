import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [indexHtml, appJs, routerJs, navigationJs, css] = await Promise.all([
    readFile(new URL('../www/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../www/js/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../www/js/router.js', import.meta.url), 'utf8'),
    readFile(new URL('../www/js/navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../www/tellyvo.css', import.meta.url), 'utf8')
]);

for (const source of [indexHtml, appJs, routerJs, navigationJs, css]) {
    assert.doesNotMatch(source, /hero-watch-btn|hero-info-btn|hero-actions/);
}

assert.match(
    routerJs,
    /routeKey === '#home'.*routeKey === '#movies'.*routeKey === '#tv'.*NavigationManager\.restoreFocus\(routeKey, '\.poster-card'\)/s,
    'Home, Movies, and Shows should all restore focus to a title card.'
);
assert.match(
    appJs,
    /isRowsRoute\(\) && focusIsStranded[\s\S]*querySelector\('\.poster-card'\)\?\.focus\(\)/,
    'A stranded remote focus should recover to the first visible title card.'
);

console.log('Hero action removal tests passed.');
