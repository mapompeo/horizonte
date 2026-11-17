import { test, expect } from "@playwright/test";
test("fluxo real de modos, aprovacao e parada", async ({ page }) => {
  await page.goto("/");
  const app = page.frameLocator("#hero-app iframe");
  await expect(app.getByRole("heading", { name: "Aponte a câmera" })).toBeVisible();
  await app.getByRole("button", { name: "Receber", exact: true }).click();
  await app.getByRole("button", { name: /^Conectar a Desktop/ }).click();
  await expect(
    app.getByRole("heading", { name: "Recebendo a tela" }),
  ).toBeVisible();
  await app.getByRole("button", { name: "Parar Desktop", exact: true }).click();
  await app.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(app.getByRole("heading", { name: "Aponte a câmera" })).toBeVisible();
  await page
    .getByRole("button", { name: "Pedir conexão", exact: true })
    .click();
  await app.getByRole("button", { name: "Permitir", exact: true }).click();
  await expect(app.getByRole("heading", { name: "1 tela conectada" })).toBeVisible();
  await expect(app.getByText("Notebook", { exact: true })).toBeVisible();
  // O cartão do QR encolhe ao conectar e a lista sobe: espera a animação assentar antes de clicar.
  await page.waitForTimeout(600);
  await app.getByRole("button", { name: "Parar Notebook", exact: true }).click();
  await expect(app.getByRole("heading", { name: "Aponte a câmera" })).toBeVisible();
});
test("resumo interativo sem recortes nem erros", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#resumo");
  await page.locator('[data-preview="host"]').scrollIntoViewIfNeeded();
  const host = page.frameLocator('[data-preview="host"] iframe');
  await host.getByRole("button", { name: /^Conectar a Desktop/ }).click();
  await expect(
    host.getByText("Desktop conectado", { exact: true }),
  ).toBeVisible();
  // As animações de entrada das seções passam alguns pixels da borda por um instante: mede depois delas.
  await page.waitForTimeout(1000);
  const overflow = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    items: [...document.querySelectorAll("body *")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.right > innerWidth + 1 &&
          getComputedStyle(e).position !== "absolute"
        );
      })
      .map((e) => ({
        tag: e.tagName,
        cls: e.className,
        right: e.getBoundingClientRect().right,
      }))
      .slice(0, 20),
  }));
  if (overflow.scroll > overflow.width) console.log(JSON.stringify(overflow));
  expect(overflow.scroll <= overflow.width).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/resumo-${test.info().project.name}.png`,
  });
});
test("menos movimento mantem interface real", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/");
  await expect(
    page
      .frameLocator("#app iframe")
      .getByRole("heading", { name: "1 tela conectada" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      document.documentElement.classList.contains("motion"),
    ),
  ).toBe(false);
});

test("telas de tamanhos diferentes mantem passagem reta", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() =>
    document.documentElement.classList.contains("motion"),
  );
  await page.evaluate(() => {
    const story = document.querySelector("#story");
    scrollTo(0, story.offsetTop + (story.offsetHeight - innerHeight) * 0.7);
  });
  await expect(page.locator("#devices")).toHaveCSS("opacity", "1");
  const screens = await page.locator("#devices .screen").evaluateAll((items) =>
    items.map((e) => {
      const r = e.getBoundingClientRect();
      return { width: r.width, center: r.top + r.height / 2 };
    }),
  );
  expect(screens[0].width).toBeGreaterThan(screens[1].width);
  expect(screens[1].width).toBeGreaterThan(screens[2].width);
  expect(
    Math.max(...screens.map((s) => s.center)) -
      Math.min(...screens.map((s) => s.center)),
  ).toBeLessThan(1);
  await page.screenshot({
    path: `test-results/telas-${test.info().project.name}.png`,
  });
});

test("recomecar funciona a partir dos ajustes", async ({ page }) => {
  await page.goto("/");
  const app = page.frameLocator("#hero-app iframe");
  await app.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page.getByRole("button", { name: "Recomeçar", exact: true }).click();
  await expect(app.getByRole("heading", { name: "Aponte a câmera" })).toBeVisible();
});

for (const [lang, title, htmlLang] of [
  ["en", /Your second screen\.\s*Wireless\./, "en"],
  ["es", /Tu segunda pantalla\.\s*Sin cables\./, "es"],
]) {
  test(`?lang=${lang} traduz o título do hero e o seletor volta ao português`, async ({ page }) => {
    await page.goto(`/?lang=${lang}`);
    await expect(page.locator("#hero-title")).toHaveText(title);
    await expect(page.locator("html")).toHaveAttribute("lang", htmlLang);
    await page.locator('footer [data-lang="pt"]').click();
    await expect(page.locator("#hero-title")).toHaveText(/Sua segunda tela\.\s*Sem fio\./);
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    expect(page.url()).toContain("lang=pt");
  });
}

test("sem rolagem lateral e sem tabela de comparação", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator(".cmp")).toHaveCount(0);
});

test("história: ponto clicável leva à cena, lista e dica acompanham", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.documentElement.classList.contains("motion"));
  await expect(page.locator("#hint")).toHaveCSS("opacity", "1");
  await page.locator("#dots button").nth(2).click();
  await expect(page.locator("#captions .cap").nth(2)).toHaveCSS("opacity", "1", { timeout: 8000 });
  await expect(page.locator("#hint")).toHaveCSS("opacity", "0");
  expect(await page.locator("#sbar").evaluate((e) => getComputedStyle(e).getPropertyValue("--p"))).not.toBe("");
});

test("download: o sistema de quem visita fica no meio, em destaque", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#oses .os")).toHaveCount(3);
  await expect(page.locator("#oses .os").nth(1)).toHaveClass(/mine/);
  await expect(page.locator("#oses .os.mine .you")).toHaveCount(1);
});

test("apoiar abre o GitHub Sponsors", async ({ page }) => {
  await page.goto("/");
  const links = page.locator('a.support[href="https://github.com/sponsors/mapompeo"]');
  await expect(links).toHaveCount(2);
  await expect(links.first()).toHaveAttribute("rel", "noopener");
});
