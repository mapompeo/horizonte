import { defineConfig } from "@playwright/test";
import { createServer } from "node:net";
const port = process.env.SITE_TEST_PORT
  ? Number(process.env.SITE_TEST_PORT)
  : await new Promise((resolve, reject) => {
      const s = createServer();
      s.once("error", reject);
      s.listen(0, "127.0.0.1", () => {
        const p = s.address().port;
        s.close(() => resolve(p));
      });
    });
process.env.SITE_TEST_PORT = String(port);
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node e2e/server.mjs",
    env: { SITE_TEST_PORT: String(port) },
    url: `http://127.0.0.1:${port}`,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "celular", use: { viewport: { width: 390, height: 844 } } },
  ],
});
