import { mountMatrix } from "./matrix.js";
import { mountSupport } from "./pix.js";
import { detectOs, OS_LABEL } from "./os.js";
import {
  buildDownloads,
  fileLabel,
  loadReleases,
  pickLatest,
} from "./releases.js";

// Textos que o script escreve passam pelo i18n.js (hzT); sem ele, ficam em português.
const t = (key, fallback) => globalThis.hzT?.(key, fallback) ?? fallback;
const FILE_KEY = {
  "Instalador .exe": "file.exe",
  "Mac com chip Apple (.dmg)": "file.macArm",
  "Mac com chip Intel (.dmg)": "file.macX64",
};
const fileText = (name) => {
  const label = fileLabel(name);
  return FILE_KEY[label] ? t(FILE_KEY[label], label) : label;
};

const os = detectOs(navigator.userAgent, navigator.maxTouchPoints);
const mineCard = document.querySelector(`.os[data-os="${os}"]`);
const mine = mineCard?.querySelector("h3");
if (mine)
  mine.insertAdjacentHTML(
    "afterend",
    `<span class="you" data-i18n="dl.you">${t("dl.you", "Seu sistema")}</span>`,
  );
// O cartão do sistema de quem visita vai para o meio e ganha destaque; os outros dois ficam nos lados.
if (mineCard) {
  const sides = [...document.querySelectorAll(".os")].filter((c) => c !== mineCard);
  mineCard.classList.add("mine");
  document.getElementById("oses").append(sides[0], mineCard, sides[1]);
}
// O comando do terminal é o do sistema de quem visita: no Linux, instalar o .deb; no Mac, liberar o app depois de
// arrastar para Aplicativos. No Windows (e no celular) não precisa de comando, então o terminal some.
const term = document.querySelector("#baixar .term");
const TERM = {
  linux: { key: "dl.termLinux", cmd: "sudo apt install ./horizonte_*.deb" },
  mac: { key: "dl.termMac", cmd: "xattr -cr /Applications/Horizonte.app" },
};
if (term) {
  const shown = TERM[os];
  term.hidden = !shown;
  if (shown) {
    const label = term.querySelector(".term-bar span");
    label.dataset.i18n = shown.key;
    label.textContent =
      os === "mac" ? t("dl.termMac", "macOS, depois de arrastar para Aplicativos") : t("dl.termLinux", "Linux (Ubuntu, Debian)");
    term.querySelector("#term-cmd").textContent = shown.cmd;
  }
}
if (['ios', 'android', 'chromeos'].includes(os)) {
  const guidance = document.createElement('p');
  guidance.id = 'browser-guidance';
  guidance.className = 'lede';
  guidance.dataset.i18n = 'dl.guidance';
  guidance.textContent = t('dl.guidance', 'Neste aparelho não precisa instalar nada: no computador com o Horizonte, aponte a câmera para o QR code e a segunda tela abre no navegador.');
  document.querySelector('#baixar .lede').after(guidance);
}

/** Uma linha por arquivo, cada uma com o próprio link (o Linux tem .AppImage e .deb). Montado com DOM, sem HTML em texto. */
function fillMeta(meta, files) {
  meta.replaceChildren();
  meta.dataset.live = "1"; // o i18n.js não sobrescreve os links
  files.forEach((f, i) => {
    if (i > 0) meta.append(document.createElement("br"));
    const link = document.createElement("a");
    link.href = f.url;
    link.textContent = `${fileText(f.name)} · ${f.mb} MB`;
    meta.append(link);
  });
}

let downloads = null;

async function fillDownloads() {
  downloads = buildDownloads(pickLatest(await loadReleases()));
  paintDownloads();
}

function paintDownloads() {
  if (!downloads || downloads.version === null) return; // sem API: ficam os links e textos fixos do HTML
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
    else if (meta) {
      delete meta.dataset.live;
      meta.dataset.i18n = "dl.release";
      meta.textContent = t("dl.release", "Veja na página da versão");
    }
  }
  document
    .querySelectorAll("[data-version]")
    .forEach((el) => (el.textContent = downloads.version));
}

fillDownloads();
document.addEventListener("hz:lang", paintDownloads);

// Fundo ASCII da primeira tela (com ou sem Motion).
import("./hero-bg.js")
  .then(({ mountHeroBackground }) =>
    mountHeroBackground(document.querySelector(".hero-bg")),
  )
  .catch(() => undefined);

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
  frame.dataset.i18nAttr = "title:iframe.host";
  frame.title = t("iframe.host", "Conectar ao Desktop");
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
      button.textContent = t("copy.done", "Copiado");
    } catch {
      button.textContent = t("copy.fail", "Selecione e copie");
    }
    setTimeout(() => (button.textContent = t("copy.label", "Copiar")), 2000);
  });
}

mountSupport();
