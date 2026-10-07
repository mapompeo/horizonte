import { test, expect } from '@playwright/test';

for (const width of [768, 900, 1024]) {
  test(`resumo mantém colunas e cartões utilizáveis a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1024 });
    await page.goto('/');
    const grid = page.locator('#recap');
    const layout = await grid.evaluate(el => ({
      columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
      widths: [...el.children].map(child => child.getBoundingClientRect().width),
      overflow: el.scrollWidth > el.clientWidth,
    }));
    expect(layout.columns).toBe(width <= 900 ? 2 : 6);
    expect(Math.min(...layout.widths)).toBeGreaterThan(width <= 900 ? 300 : 130);
    expect(layout.overflow).toBe(false);
  });
}

for (const [name, userAgent, touches] of [
  ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5],
  ['iPad desktop', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 5],
  ['Android', 'Mozilla/5.0 (Linux; Android 14)', 5],
  ['ChromeOS', 'Mozilla/5.0 (X11; CrOS x86_64 15000.0.0)', 0],
]) {
  test(`${name} recebe orientação de navegador sem instalador destacado`, async ({ browser }) => {
    const context = await browser.newContext({ userAgent });
    try {
      await context.addInitScript(touches => Object.defineProperty(navigator, 'maxTouchPoints', { value: touches }), touches);
      const page = await context.newPage();
      await page.goto(test.info().project.use.baseURL);
      await expect(page.locator('#baixar .you')).toHaveCount(0);
      const guidance = page.locator('#browser-guidance');
      await expect(guidance).toBeVisible();
      await expect(guidance).toContainText('Neste dispositivo, receba pelo navegador.');
      await expect(guidance).toContainText('Windows');
      await expect(guidance).toContainText('mesma rede');
      await expect(guidance).toContainText('Receber pelo navegador');
    } finally {
      await context.close();
    }
  });
}

test('desktop continua com download destacado e sem orientação móvel', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#baixar .you')).toHaveCount(1);
  await expect(page.locator('#browser-guidance')).toBeHidden();
});
