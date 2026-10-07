import { test, expect } from "@playwright/test";
test("fluxo real de modos, aprovacao, qualidade e parada", async ({ page }) => {
  await page.goto("/");
  const app = page.frameLocator("#hero-app iframe");
  await expect(app.getByRole("heading", { name: "Pronto." })).toBeVisible();
  await app.getByRole("button", { name: "Mostrar", exact: true }).click();
  await app.getByRole("button", { name: "Estender", exact: true }).click();
  await expect(
    app.getByRole("heading", { name: "Recebendo a tela." }),
  ).toBeVisible();
  await app.getByRole("button", { name: "Aumentar qualidade" }).click();
  await expect(app.getByText("40 Mbps", { exact: true })).toBeVisible();
  await app.getByRole("button", { name: "Sair", exact: true }).click();
  await app.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(app.getByRole("heading", { name: "Pronto." })).toBeVisible();
  await page
    .getByRole("button", { name: "Pedir conexão", exact: true })
    .click();
  await app.getByRole("button", { name: "Permitir", exact: true }).click();
  await expect(
    app.getByText("Notebook conectado", { exact: true }),
  ).toBeVisible();
  await app.getByRole("button", { name: "Parar", exact: true }).click();
  await expect(app.getByRole("heading", { name: "Pronto." })).toBeVisible();
});
test("resumo interativo sem recortes nem erros", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#resumo");
  await page.locator('[data-preview="quality"]').scrollIntoViewIfNeeded();
  const quality = page.frameLocator('[data-preview="quality"] iframe');
  await quality.getByRole("button", { name: "Aumentar qualidade" }).click();
  await expect(quality.getByText("40 Mbps", { exact: true })).toBeVisible();
  await page.locator('[data-preview="pair"]').scrollIntoViewIfNeeded();
  const pair = page.frameLocator('[data-preview="pair"] iframe');
  await pair.getByRole("button", { name: "Permitir", exact: true }).click();
  await expect(
    pair.getByText("Notebook conectado", { exact: true }),
  ).toBeVisible();
  await page.locator('[data-preview="host"]').scrollIntoViewIfNeeded();
  const host = page.frameLocator('[data-preview="host"] iframe');
  await host.getByRole("button", { name: "Estender", exact: true }).click();
  await expect(
    host.getByText("Desktop conectado", { exact: true }),
  ).toBeVisible();
  await page.locator('[data-preview="mode"]').scrollIntoViewIfNeeded();
  const mode = page.frameLocator('[data-preview="mode"] iframe');
  await mode.getByRole("button", { name: "Mostrar", exact: true }).click();
  await expect(
    mode.getByRole("button", { name: "Mostrar", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
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
      .getByRole("heading", { name: "Tela estendida." }),
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
