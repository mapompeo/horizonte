import { mountMatrix } from "./matrix.js";
import { detectOs, OS_LABEL } from "./os.js";
import {
  buildDownloads,
  fileLabel,
  loadReleases,
  pickLatest,
} from "./releases.js";

const os = detectOs(navigator.userAgent, navigator.maxTouchPoints);
const mine = document.querySelector(`.os[data-os="${os}"] h3`);
if (mine)
  mine.insertAdjacentHTML("afterend", '<span class="you">Seu sistema</span>');
if (['ios', 'android', 'chromeos'].includes(os)) {
  const guidance = document.createElement('p');
  guidance.id = 'browser-guidance';
  guidance.className = 'lede';
  guidance.textContent = 'Neste aparelho não precisa instalar nada: no computador com o Horizonte, aponte a câmera para o QR code e a segunda tela abre no navegador.';
  document.querySelector('#baixar .lede').after(guidance);
}

/** Uma linha por arquivo, cada uma com o próprio link (o Linux tem .AppImage e .deb). Montado com DOM, sem HTML em texto. */
function fillMeta(meta, files) {
  meta.replaceChildren();
  files.forEach((f, i) => {
    if (i > 0) meta.append(document.createElement("br"));
    const link = document.createElement("a");
    link.href = f.url;
    link.textContent = `${fileLabel(f.name)} · ${f.mb} MB`;
    meta.append(link);
  });
}

async function fillDownloads() {
  const downloads = buildDownloads(pickLatest(await loadReleases()));
  if (downloads.version === null) return; // sem API: ficam os links e textos fixos do HTML
  for (const key of Object.keys(OS_LABEL)) {
    document.querySelectorAll(`[data-dl="${key}"]`).forEach((link) => {
      link.href = link.dataset.chip
        ? downloads.mac[link.dataset.chip].href
        : downloads[key].href;
    });
    const meta = document.querySelector(`[data-dl-meta="${key}"]`);
    // Sem o arquivo desse sistema na versão, o link vai para a página da versão: o texto fixo mentiria.
    if (meta && downloads[key].files.length > 0)
      fillMeta(meta, downloads[key].files);
    else if (meta) meta.textContent = "Veja na página da versão";
  }
  document
    .querySelectorAll("[data-version]")
    .forEach((el) => (el.textContent = downloads.version));
}

fillDownloads();

// O app do topo é o app de verdade (compilado do código do projeto), rodando com um motor de mentira.
import("./live.js")
  .then(({ mountLive }) => {
    const root = document.getElementById("hero-app");
    if (root) {
      const demo = mountLive(root, { auto: false });
      demo.loaded.then(() => {
        document
          .getElementById("demo-restart")
          .addEventListener("click", () =>
            demo.frame.contentWindow.__demo?.reset({ screen: "ready", mode: "send" }),
          );
        document
          .getElementById("demo-connect")
          .addEventListener("click", () =>
            demo.frame.contentWindow.__demo?.requestConnection(),
          );
      });
    }
  })
  .catch(() => undefined);

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduce || !window.Motion)
  import("./live.js").then(({ mountLive }) =>
    mountLive(document.getElementById("app"), {
      hash: "connected",
      auto: false,
    }),
  );
if (window.Motion && !reduce) {
  import("./scenes.js")
    .then(({ startScenes }) => startScenes(window.Motion))
    .catch(() => undefined);
}

mountMatrix(document.getElementById("mx"));

// O resumo reutiliza o componente Svelte do produto, inclusive a interação.
document.querySelectorAll("[data-preview]").forEach((root) => {
  const frame = document.createElement("iframe");
  frame.title = "Conectar ao Desktop";
  frame.src = "./app/?auto=0&preview=host";
  frame.loading = "lazy";
  frame.width = 400;
  frame.height = 160;
  const fit = () => {
    frame.style.transform = `translate(-50%, -50%) scale(${Math.min(root.clientWidth / 400, root.clientHeight / 160)})`;
  };
  new ResizeObserver(fit).observe(root);
  root.append(frame);
  fit();
});

// Copiar o comando do terminal (seção de baixar).
for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const text = document.getElementById(button.dataset.copy)?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copiado";
    } catch {
      button.textContent = "Selecione e copie";
    }
    setTimeout(() => (button.textContent = "Copiar"), 2000);
  });
}
