import { test, expect } from '@playwright/test';

test('PIN é explicado quando necessário, sem promessa absoluta', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#rede')).toContainText('PIN');
  await expect(page.locator('#rede')).not.toContainText(/sem PIN/i);
  await expect(page.locator('#captions')).not.toContainText(/sem PIN/i);
});

test('Mac oferece escolha explícita de chip com links corretos', async ({ page }) => {
  await page.route('https://api.github.com/**', route => route.fulfill({ json: [{
    tag_name: 'v1.0.0', published_at: '2026-10-07T00:00:00Z', draft: false,
    html_url: 'https://github.com/mapompeo/horizonte/releases/tag/v1.0.0',
    assets: ['arm64', 'x64'].map(arch => ({ name: `Horizonte-${arch}.dmg`, size: 1000000,
      browser_download_url: `https://example.com/Horizonte-${arch}.dmg` }))
  }] }));
  await page.goto('/');
  const mac = page.locator('[data-os="mac"]');
  await expect(mac.getByRole('link', { name: 'Baixar para chip Apple (ARM64)' }))
    .toHaveAttribute('href', 'https://example.com/Horizonte-arm64.dmg');
  await expect(mac.getByRole('link', { name: 'Baixar para chip Intel (x64)' }))
    .toHaveAttribute('href', 'https://example.com/Horizonte-x64.dmg');
  await expect(mac.getByRole('link', { name: /^Baixar(?: ›)?$/ })).toHaveCount(0);
});

test('iframe carregado sem app mantém fallback e só aceita handshake do próprio frame', async ({ page }) => {
  await page.route('**/app/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Demo indisponível</p>' }));
  await page.goto('/');
  const root = page.locator('#hero-app');
  const frame = root.locator('iframe');
  await expect(page.frameLocator('#hero-app iframe').getByText('Demo indisponível')).toBeAttached();
  await expect(root.locator('.scr')).toHaveCount(1);
  await expect(frame).not.toHaveClass(/on/);
  await expect(frame).toHaveAttribute('inert', '');
  await page.evaluate(() => window.postMessage({ type: 'horizonte:demo-mounted' }, location.origin));
  await frame.evaluate(el => window.dispatchEvent(new MessageEvent('message', {
    source: el.contentWindow, origin: 'https://outro-site.example', data: { type: 'horizonte:demo-mounted' }
  })));
  await expect(root.locator('.scr')).toHaveCount(1);
  await frame.evaluate(el => el.contentWindow.eval(`parent.postMessage({type:'horizonte:demo-mounted'}, location.origin)`));
  await expect(frame).toHaveClass(/on/);
  await expect(root.locator('.scr')).toHaveCount(0);
  await expect(frame).not.toHaveAttribute('inert');
});

test('história interativa acessível fica inerte somente na cena oculta', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('#app');
  await expect(root.locator('iframe')).toHaveClass(/on/);
  await expect(root).not.toHaveAttribute('aria-hidden', 'true');
  await page.evaluate(() => {
    const story = document.querySelector('#story');
    scrollTo(0, story.offsetTop + (story.offsetHeight - innerHeight) * 0.7);
  });
  await expect(root).toHaveAttribute('inert', '');
  await page.locator('#demo-restart').evaluate(el => el.focus({ preventScroll: true }));
  await root.locator('iframe').evaluate(el => el.focus({ preventScroll: true }));
  await expect(page.locator('#demo-restart')).toBeFocused();
  await page.evaluate(() => {
    const story = document.querySelector('#story');
    scrollTo(0, story.offsetTop + (story.offsetHeight - innerHeight) * 0.9);
  });
  await expect(root).not.toHaveAttribute('inert');
});

test('API indisponível mantém duas escolhas Mac levando às releases', async ({ page }) => {
  await page.route('https://api.github.com/**', route => route.abort());
  await page.goto('/');
  const links = page.locator('[data-os="mac"] [data-chip]');
  await expect(links).toHaveCount(2);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('href', 'https://github.com/mapompeo/horizonte/releases');
  }
});

test('arquivo Intel ausente leva à release sem substituir por ARM64', async ({ page }) => {
  await page.route('https://api.github.com/**', route => route.fulfill({ json: [{
    tag_name: 'v1.0.0', published_at: '2026-10-07T00:00:00Z', draft: false,
    html_url: 'https://github.com/mapompeo/horizonte/releases/tag/v1.0.0',
    assets: [{ name: 'Horizonte-arm64.dmg', size: 1000000,
      browser_download_url: 'https://example.com/Horizonte-arm64.dmg' }]
  }] }));
  await page.goto('/');
  await expect(page.locator('[data-chip="x64"]')).toHaveAttribute('href',
    'https://github.com/mapompeo/horizonte/releases/tag/v1.0.0');
});

test('app real confirma montagem antes de substituir fallback', async ({ page }) => {
  await page.goto('/');
  await expect(page.frameLocator('#hero-app iframe').getByRole('heading', { name: 'Pronto.' })).toBeVisible();
  await expect(page.locator('#hero-app iframe')).toHaveClass(/on/);
  await expect(page.locator('#hero-app > .scr')).toHaveCount(0);
});
