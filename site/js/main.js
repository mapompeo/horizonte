import { mountMatrix } from "./matrix.js";
import { detectOs, OS_LABEL } from "./os.js";
import {
  buildDownloads,
  fileLabel,
  loadReleases,
  pickLatest,
} from "./releases.js";

const os = detectOs(navigator.userAgent);
const mine = document.querySelector(`.os[data-os="${os}"] h3`);
if (mine)
  mine.insertAdjacentHTML("afterend", '<span class="you">Seu sistema</span>');

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
            demo.frame.contentWindow.__demo?.reset({ screen: "install" }),
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

// O resumo reutiliza componentes Svelte do produto, inclusive suas interações.
document.querySelectorAll("[data-preview]").forEach((root) => {
  const frame = document.createElement("iframe");
  const kind = root.dataset.preview;
  frame.title = {
    pair: "Permitir dispositivo",
    quality: "Ajustar qualidade",
    mode: "Escolher modo",
    host: "Conectar ao Desktop",
  }[kind];
  frame.src = "./app/?auto=0&preview=" + kind;
  frame.loading = "lazy";
  frame.width = kind === "mode" ? 260 : 400;
  frame.height = kind === "pair" ? 220 : 160;
  const fit = () => {
    frame.style.transform = `translate(-50%, -50%) scale(${Math.min(root.clientWidth / Number(frame.width), root.clientHeight / Number(frame.height))})`;
  };
  new ResizeObserver(fit).observe(root);
  root.append(frame);
  fit();
});
