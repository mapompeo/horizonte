/** Largura e altura reais da janela do app (a mesma do Electron): o iframe tem este tamanho e é só escalado. */
export const APP_W = 760;
export const APP_H = 580;

/** Escala que cabe a janela inteira na largura disponível. */
export function scaleFor(width) {
  return width > 0 ? width / APP_W : 1;
}

/**
 * Põe o app de verdade (compilado em ./app/ a partir do próprio código do projeto) dentro da janela da página.
 * Enquanto ele carrega, fica o desenho estático que já estava lá; se não carregar, nada muda.
 */
export function mountLive(root, { hash = "", auto = true } = {}) {
  const frame = document.createElement("iframe");
  frame.className = "live";
  frame.title = "Horizonte, funcionando. Clique para experimentar.";
  frame.width = APP_W;
  frame.height = APP_H;
  frame.setAttribute("loading", "eager");
  frame.setAttribute("allow", "clipboard-write");
  frame.src = `./app/?auto=${auto ? 1 : 0}${hash ? "#" + hash : ""}`;

  const fit = () => {
    frame.style.transform = `scale(${scaleFor(root.clientWidth)})`;
  };
  const observer = new ResizeObserver(fit);
  observer.observe(root);
  fit();

  const loaded = new Promise((resolve) => {
    frame.addEventListener(
      "load",
      () => {
        // Só troca o desenho estático depois que o app apareceu de verdade.
        root
          .querySelectorAll(":scope > :not(.controls):not(iframe)")
          .forEach((el) => el.remove());
        frame.classList.add("on");
        resolve(frame);
      },
      { once: true },
    );
  });
  root.append(frame);
  return { frame, loaded };
}

/** Retângulo de um elemento do app, já na escala da página (relativo ao canto da janela). */
export function rectInApp(frame, selector, root) {
  const el = frame.contentDocument?.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const s = root.clientWidth / APP_W;
  return { x: r.left * s, y: r.top * s, w: r.width * s, h: r.height * s };
}
