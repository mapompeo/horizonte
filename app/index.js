"use strict";
const electron = require("electron");
const node_child_process = require("node:child_process");
const node_crypto = require("node:crypto");
const node_fs = require("node:fs");
const promises = require("node:fs/promises");
const node_os = require("node:os");
const node_path = require("node:path");
const electronUpdater = require("electron-updater");
const utils = require("@electron-toolkit/utils");
const path = require("path");
const node_net = require("node:net");
const node_http = require("node:http");
const node_stream = require("node:stream");
const promises$1 = require("node:stream/promises");
const bonjourService = require("bonjour-service");
const https = require("node:https");
const icon = path.join(__dirname, "../../resources/icon.png");
const trayTemplate = path.join(__dirname, "../../resources/trayTemplate.png");
const trayTemplate2x = path.join(__dirname, "../../resources/trayTemplate@2x.png");
const CHANNELS = {
  snapshot: "horizonte:snapshot",
  dispatch: "horizonte:dispatch",
  updateSettings: "horizonte:update-settings",
  hosts: "horizonte:hosts",
  mousePeers: "horizonte:mouse-peers",
  mouseScreen: "horizonte:mouse-screen",
  videoHint: "horizonte:video-hint",
  deviceKind: "horizonte:device-kind",
  webAccess: "horizonte:web-access",
  setWebAccess: "horizonte:set-web-access",
  openRepo: "horizonte:open-repo",
  copyDiagnostic: "horizonte:copy-diagnostic",
  uninstall: "horizonte:uninstall",
  diagnosticDraft: "horizonte:diagnostic-draft",
  reportDiagnostic: "horizonte:report-diagnostic",
  push: "horizonte:push",
  update: "horizonte:update",
  updateStatus: "horizonte:update-status",
  updatePush: "horizonte:update-push"
};
const REPO_URL = "https://github.com/mapompeo/horizonte";
const HOST_ADDRESS = /^[A-Za-z0-9._:%[\]-]{1,255}$/;
function isHostAddress(value) {
  return typeof value === "string" && HOST_ADDRESS.test(value) && !value.startsWith("-");
}
const PIN_PATTERN = /^\d{4}$/;
function isValidPin(value) {
  return typeof value === "string" && PIN_PATTERN.test(value);
}
function isUiEvent(value) {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value;
  switch (candidate.type) {
    case "INSTALL_DONE":
    case "DENY":
    case "STOP":
    case "RETRY":
      return true;
    case "APPROVE":
      return (candidate.pin === void 0 || isValidPin(candidate.pin)) && (candidate.trust === void 0 || typeof candidate.trust === "boolean");
    case "MOUSE_ACCEPT":
    case "MOUSE_DENY":
      return true;
    case "MOUSE_SHARE":
      return Array.isArray(candidate.peers) && candidate.peers.length > 0 && candidate.peers.length <= 8 && candidate.peers.every(
        (peer) => typeof peer === "object" && peer !== null && typeof peer.address === "string" && isHostAddress(peer.address) && typeof peer.name === "string" && peer.name.length <= 200
      );
    case "CHOOSE":
      return candidate.mode === "send" || candidate.mode === "receive" || candidate.mode === "mouse";
    case "CONNECT":
      return typeof candidate.host === "string" && isHostAddress(candidate.host) && typeof candidate.name === "string" && candidate.name.length <= 200;
    default:
      return false;
  }
}
function cleanName(raw, maxLength = 40) {
  const cleaned = raw.replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
  return Array.from(cleaned).slice(0, maxLength).join("");
}
function approvalPin(state, event) {
  const pin2 = event.pin ?? state.pin;
  return pin2 !== null && isValidPin(pin2) ? pin2 : null;
}
function startFor$1(mode) {
  if (mode === "mouse") return { screen: "mouse", mode: "mouse" };
  return mode === "send" ? { screen: "preparing", mode: "send", step: "engine" } : { screen: "discover", mode: "receive" };
}
function modeOf(state) {
  return "mode" in state ? state.mode : null;
}
function reduce(state, event) {
  if (event.type === "FAIL") {
    return { screen: "error", mode: modeOf(state) ?? "send", error: event.error };
  }
  if (event.type === "CHOOSE") {
    if (state.screen === "install") return state;
    if (state.screen === "choose") return startFor$1(event.mode);
    return modeOf(state) === event.mode ? state : startFor$1(event.mode);
  }
  switch (state.screen) {
    case "install":
      return event.type === "INSTALL_DONE" ? { screen: "choose" } : state;
    case "choose":
      return state;
    case "preparing":
      if (event.type === "PREP_STEP") {
        const kept = state.progress ? { note: "", fraction: state.progress.fraction } : void 0;
        return {
          screen: "preparing",
          mode: "send",
          step: event.step,
          progress: kept
        };
      }
      if (event.type === "PREP_PROGRESS") {
        const before = state.progress?.fraction ?? 0;
        return {
          ...state,
          progress: { ...event.progress, fraction: Math.max(before, event.progress.fraction) }
        };
      }
      if (event.type === "PREP_DONE") {
        return { screen: "ready", mode: "send" };
      }
      return state;
    case "ready":
      if (event.type === "PAIR_REQUEST") {
        const pin2 = event.pin !== void 0 && isValidPin(event.pin) ? event.pin : null;
        return {
          screen: "approve",
          mode: "send",
          device: event.device,
          pairingId: event.pairingId,
          pin: pin2,
          ...event.address ? { address: event.address } : {},
          ...event.fingerprint ? { fingerprint: event.fingerprint } : {},
          ...event.deviceId ? { deviceId: event.deviceId } : {},
          ...event.screen ? { peerScreen: event.screen } : {}
        };
      }
      if (event.type === "CLIENT_CONNECTED")
        return {
          screen: "connected",
          mode: "send",
          device: event.device,
          ...event.fingerprint ? { fingerprint: event.fingerprint } : {},
          ...event.screen ? { peerScreen: event.screen } : {}
        };
      return state;
    case "approve":
      if (event.type === "APPROVE") {
        if (state.fingerprint) return { screen: "ready", mode: "send" };
        return approvalPin(state, event) === null ? state : { screen: "ready", mode: "send" };
      }
      if (event.type === "DENY") return { screen: "ready", mode: "send" };
      if (event.type === "PAIR_CANCELLED") {
        return event.pairingId === state.pairingId ? { screen: "ready", mode: "send" } : state;
      }
      return state;
    case "connected":
      return event.type === "CLIENT_DISCONNECTED" || event.type === "STOP" ? { screen: "ready", mode: "send" } : state;
    case "discover":
      return event.type === "CONNECT" ? { screen: "receiving", mode: "receive", host: event.host, name: event.name } : state;
    case "receiving":
      return event.type === "STREAM_ENDED" || event.type === "STOP" ? { screen: "discover", mode: "receive" } : state;
    case "mouse":
      if (event.type === "MOUSE_SHARE")
        return {
          screen: "mouse-active",
          mode: "mouse",
          device: event.peers.map((peer) => peer.name).join(" e "),
          role: "share"
        };
      if (event.type === "MOUSE_REQUEST")
        return {
          screen: "mouse-request",
          mode: "mouse",
          device: event.device,
          address: event.address
        };
      return state;
    case "mouse-request":
      if (event.type === "MOUSE_ACCEPT")
        return { screen: "mouse-active", mode: "mouse", device: state.device, role: "follow" };
      return event.type === "MOUSE_DENY" || event.type === "MOUSE_ENDED" ? { screen: "mouse", mode: "mouse" } : state;
    case "mouse-active":
      return event.type === "STOP" || event.type === "MOUSE_ENDED" ? { screen: "mouse", mode: "mouse" } : state;
    case "error":
      return event.type === "RETRY" ? startFor$1(state.mode) : state;
  }
}
const DEVICE_KINDS = ["desktop", "laptop", "tablet", "phone", "tv"];
const isDeviceKind = (value) => DEVICE_KINDS.includes(value);
function kindFromChassis(code) {
  if ([8, 9, 10, 14, 31, 32].includes(code)) return "laptop";
  if (code === 30) return "tablet";
  if ([3, 4, 5, 6, 7, 13, 15, 16, 24, 35, 36].includes(code)) return "desktop";
  return null;
}
function guessKind(name) {
  const n = name.toLowerCase();
  if (/\b(tv|shield|chromecast|fire ?tv|roku|bravia|webos|tizen|televis)/.test(n)) return "tv";
  if (/\b(ipad|tablet|galaxy tab|tab s\d|mediapad|surface go)/.test(n)) return "tablet";
  if (/\b(iphone|android|pixel|galaxy|celular|phone|moto|redmi|xiaomi|poco)/.test(n)) return "phone";
  if (/\b(notebook|laptop|macbook|thinkpad|xps|zenbook|vivobook|ideapad|chromebook)/.test(n))
    return "laptop";
  return "desktop";
}
const PROTOCOL_VERSION = 1;
const SIGNALING_PORT = 47910;
const SIGNALING_PORT_LAST = 47919;
const MAX_LINE_BYTES = 64 * 1024;
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const DEVICE_ID = /^[0-9a-f-]{8,64}$/;
const MIME = /^video\/[A-Za-z0-9-]{2,16}$/;
const MAX_SDP = 32 * 1024;
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const isNumber = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const isText = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max;
const isFingerprint = (value) => typeof value === "string" && FINGERPRINT.test(value);
function parseScreen(value) {
  if (value === void 0) return void 0;
  if (!isObject(value) || !isInt(value.width, 1, 32768) || !isInt(value.height, 1, 32768))
    return null;
  return { width: value.width, height: value.height };
}
function parseHello(raw) {
  const { v, id, name, kind, fp } = raw;
  if (!isInt(v, 1, 1e3) || typeof id !== "string" || !DEVICE_ID.test(id)) return null;
  if (typeof name !== "string" || !isDeviceKind(kind) || !isFingerprint(fp)) return null;
  const clean = cleanName(name);
  if (!clean) return null;
  const screen = parseScreen(raw.screen);
  if (screen === null) return null;
  return { t: "hello", v, id, name: clean, kind, fp, ...screen ? { screen } : {} };
}
function parseWant(raw) {
  const { width, height, fps, bitrate, codecs, scale } = raw;
  if (scale !== void 0 && !isNumber(scale, 1, 4)) return null;
  if (!isInt(width, 160, 8192) || !isInt(height, 120, 8192) || !isInt(fps, 1, 240)) return null;
  if (!isNumber(bitrate, 0.5, 500)) return null;
  if (!Array.isArray(codecs) || codecs.length > 16) return null;
  if (!codecs.every((c) => typeof c === "string" && MIME.test(c))) return null;
  return {
    t: "want",
    width,
    height,
    fps,
    bitrate,
    codecs: [...new Set(codecs)],
    ...scale !== void 0 ? { scale } : {}
  };
}
function parseMessage(line) {
  let raw;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObject(raw)) return null;
  switch (raw.t) {
    case "hello":
      return parseHello(raw);
    case "pending":
      return { t: "pending" };
    case "accepted":
      return typeof raw.trusted === "boolean" ? { t: "accepted", trusted: raw.trusted } : null;
    case "denied":
      return raw.reason === "user" || raw.reason === "busy" || raw.reason === "version" ? { t: "denied", reason: raw.reason } : null;
    case "cancel":
      return { t: "cancel" };
    case "want":
      return parseWant(raw);
    case "offer":
    case "answer":
      return isText(raw.sdp, MAX_SDP) ? { t: raw.t, sdp: raw.sdp } : null;
    case "ice": {
      const { candidate, sdpMid, sdpMLineIndex } = raw;
      if (typeof candidate !== "string" || candidate.length > 2048) return null;
      if (sdpMid !== null && !isText(sdpMid, 64)) return null;
      if (sdpMLineIndex !== null && !isInt(sdpMLineIndex, 0, 64)) return null;
      return { t: "ice", candidate, sdpMid, sdpMLineIndex };
    }
    case "bitrate":
      return isNumber(raw.mbps, 0.5, 500) ? { t: "bitrate", mbps: raw.mbps } : null;
    case "bye":
      return raw.reason === "user" || raw.reason === "error" || raw.reason === "quit" ? { t: "bye", reason: raw.reason } : null;
    case "ping":
    case "pong":
      return isNumber(raw.at, 0, Number.MAX_SAFE_INTEGER) ? { t: raw.t, at: raw.at } : null;
    default:
      return null;
  }
}
function encodeMessage(message) {
  return JSON.stringify(message) + "\n";
}
const BITRATE_MIN = 5;
const BITRATE_MAX = 80;
const PROFILES = { economico: 10, equilibrado: 30, maximo: 60 };
function clampBitrate(value) {
  if (!Number.isFinite(value)) return PROFILES.equilibrado;
  return Math.min(BITRATE_MAX, Math.max(BITRATE_MIN, Math.round(value)));
}
function profileFor(bitrate) {
  const value = clampBitrate(bitrate);
  if (value === PROFILES.economico) return "economico";
  if (value === PROFILES.equilibrado) return "equilibrado";
  if (value === PROFILES.maximo) return "maximo";
  return "custom";
}
const DEFAULT_SETTINGS = {
  profile: "equilibrado",
  bitrate: 30,
  resolution: "1080p",
  fps: 60,
  encoding: "auto",
  codec: "h264",
  autostart: true,
  deviceName: "Dispositivo",
  extendSide: "right",
  mouseSides: {},
  mouseOffsets: {},
  trusted: [],
  screenPlacements: {},
  mode: null
};
const LEGACY_DEFAULT_NAMES = ["Computador"];
function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}
function parseMouseSides(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const entries = Object.entries(raw).filter(
    (entry) => entry[0].length > 0 && entry[0].length <= 200 && ["left", "right", "above", "below"].includes(entry[1])
  );
  return Object.fromEntries(entries.slice(0, 20));
}
function parseScreenPlacements(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const entries = Object.entries(raw).flatMap(
    ([key, value]) => {
      if (!isFingerprint(key) || typeof value !== "object" || value === null) return [];
      const { side, offset } = value;
      if (!["left", "right", "above", "below"].includes(side)) return [];
      const valid = typeof offset === "number" && Number.isFinite(offset) && Math.abs(offset) <= 4;
      return [[key, { side, ...valid ? { offset } : {} }]];
    }
  );
  return Object.fromEntries(entries.slice(0, 20));
}
function parseMouseOffsets(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const entries = Object.entries(raw).filter(
    (entry) => entry[0].length > 0 && entry[0].length <= 200 && typeof entry[1] === "number" && Number.isFinite(entry[1]) && Math.abs(entry[1]) <= 2
  );
  return Object.fromEntries(entries.slice(0, 20));
}
function parseTrusted(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { name, address, fingerprint, deviceId, screen } = item;
    const size = screen;
    const validSize = !!size && Number.isInteger(size.width) && Number.isInteger(size.height) && size.width > 0 && size.height > 0 && size.width <= 32768 && size.height <= 32768;
    const clean = typeof name === "string" ? cleanName(name) : "";
    if (!clean || typeof address !== "string" || !isHostAddress(address)) return [];
    return [
      {
        name: clean,
        address,
        ...isFingerprint(fingerprint) ? { fingerprint } : {},
        ...typeof deviceId === "string" && /^[0-9a-f-]{8,64}$/.test(deviceId) ? { deviceId } : {},
        ...validSize ? { screen: { width: size.width, height: size.height } } : {}
      }
    ];
  }).slice(0, 20);
}
function parseSettings(raw, defaultName = DEFAULT_SETTINGS.deviceName) {
  const input = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
  const bitrate = clampBitrate(
    typeof input.bitrate === "number" ? input.bitrate : DEFAULT_SETTINGS.bitrate
  );
  const saved = typeof input.deviceName === "string" ? cleanName(input.deviceName) : "";
  const name = LEGACY_DEFAULT_NAMES.includes(saved) ? "" : saved;
  return {
    bitrate,
    profile: profileFor(bitrate),
    resolution: oneOf(
      input.resolution,
      ["720p", "1080p", "1440p"],
      DEFAULT_SETTINGS.resolution
    ),
    fps: oneOf(input.fps, [30, 60, 120], DEFAULT_SETTINGS.fps),
    encoding: oneOf(input.encoding, ["auto", "gpu", "cpu"], DEFAULT_SETTINGS.encoding),
    codec: oneOf(input.codec, ["h264", "hevc", "av1"], DEFAULT_SETTINGS.codec),
    autostart: typeof input.autostart === "boolean" ? input.autostart : DEFAULT_SETTINGS.autostart,
    trusted: parseTrusted(input.trusted),
    screenPlacements: parseScreenPlacements(input.screenPlacements),
    extendSide: oneOf(
      input.extendSide,
      ["left", "right", "above"],
      DEFAULT_SETTINGS.extendSide
    ),
    mouseSides: parseMouseSides(input.mouseSides),
    mouseOffsets: parseMouseOffsets(input.mouseOffsets),
    deviceName: name || defaultName,
    mode: input.mode === "send" || input.mode === "receive" || input.mode === "mouse" ? input.mode : null
  };
}
function createSettingsStore(file, defaultName = DEFAULT_SETTINGS.deviceName) {
  let queue = Promise.resolve();
  let counter = 0;
  return {
    async load() {
      try {
        return parseSettings(JSON.parse(await promises.readFile(file, "utf8")), defaultName);
      } catch {
        return { ...DEFAULT_SETTINGS, deviceName: defaultName };
      }
    },
    save(settings) {
      const write = async () => {
        await promises.mkdir(node_path.dirname(file), { recursive: true });
        const temporary = `${file}.${process.pid}.${counter++}.tmp`;
        try {
          await promises.writeFile(temporary, JSON.stringify(settings, null, 2), "utf8");
          await promises.rename(temporary, file);
        } catch (cause) {
          await promises.rm(temporary, { force: true });
          throw cause;
        }
      };
      const run2 = queue.then(write);
      queue = run2.catch(() => void 0);
      return run2;
    }
  };
}
const isSendIdle = (state) => state.screen === "preparing" || state.screen === "ready" || state.screen === "approve";
const isSendLive = (state) => isSendIdle(state) || state.screen === "connected";
function startFor(mode) {
  if (mode === "send") return { screen: "preparing", mode: "send", step: "engine" };
  if (mode === "receive") return { screen: "discover", mode: "receive" };
  if (mode === "mouse") return { screen: "mouse", mode: "mouse" };
  return { screen: "install" };
}
function describeError(cause) {
  return cause instanceof Error ? cause.message : String(cause);
}
async function createController({
  engine,
  mouse,
  store,
  initial
}) {
  let settings = await store.load();
  let state = initial ?? startFor(settings.mode);
  let prepareRun = 0;
  let queuedPairs = [];
  const listeners2 = /* @__PURE__ */ new Set();
  let settingsQueue = Promise.resolve();
  const snapshot = () => ({ state, settings });
  function notify() {
    const current = snapshot();
    for (const listener of [...listeners2]) listener(current);
  }
  function fail(message, cause) {
    if (state.screen === "error") return;
    dispatch({ type: "FAIL", error: { message, detail: describeError(cause) } });
  }
  function failIfStill(target, message) {
    return (cause) => {
      if (state === target && target.screen !== "error") fail(message, cause);
    };
  }
  let sharingWith = [];
  const placementsFor = (hosts) => hosts.map((host) => ({
    host,
    side: settings.mouseSides[host.name] ?? "right",
    offset: settings.mouseOffsets[host.name]
  }));
  function runMouseEffects(prev, next, event) {
    const wasMouse = "mode" in prev && prev.mode === "mouse";
    const isMouse = "mode" in next && next.mode === "mouse";
    if (!mouse) {
      if (isMouse && !wasMouse)
        fail("O compartilhamento de mouse ainda não está disponível neste sistema.", "");
      return;
    }
    if (isMouse && !wasMouse) {
      mouse.start(settings.deviceName).catch(failIfStill(next, "Não consegui ligar o modo Mouse."));
    }
    if (wasMouse && !isMouse) mouse.stop().catch(() => void 0);
    if (next.screen === "mouse-active" && prev.screen === "mouse" && event.type === "MOUSE_SHARE") {
      sharingWith = event.peers;
      mouse.share(placementsFor(event.peers), settings.deviceName).catch(failIfStill(next, "Não consegui compartilhar o mouse."));
    }
    if (prev.screen === "mouse-request") {
      if (event.type === "MOUSE_ACCEPT") {
        mouse.accept(settings.deviceName).catch(failIfStill(next, "Não consegui me conectar ao mouse do outro computador."));
      } else if (event.type === "MOUSE_DENY") mouse.deny().catch(() => void 0);
    }
    if (prev.screen === "mouse-active" && next.screen !== "mouse-active" && event.type !== "MOUSE_ENDED") {
      mouse.end().catch(() => void 0);
    }
  }
  function runEffects(prev, next, event) {
    runMouseEffects(prev, next, event);
    if (prev.screen === "preparing" && next.screen !== "preparing") prepareRun++;
    if (next.screen === "preparing" && prev.screen !== "preparing") {
      const run2 = ++prepareRun;
      const live = () => run2 === prepareRun;
      engine.prepare(
        (step) => {
          if (live()) dispatch({ type: "PREP_STEP", step });
        },
        settings,
        (progress) => {
          if (live()) dispatch({ type: "PREP_PROGRESS", progress });
        }
      ).then(() => {
        if (live()) dispatch({ type: "PREP_DONE" });
      }).catch((cause) => {
        if (live()) fail("Não consegui preparar este dispositivo.", cause);
      });
    }
    if (isSendIdle(prev) && !isSendLive(next)) {
      engine.abort().catch(() => void 0);
    }
    if (prev.screen === "approve" && next.screen === "ready") {
      if (event.type === "APPROVE") {
        const pin2 = approvalPin(prev, event);
        if (pin2 !== null || prev.fingerprint) {
          engine.approve({
            pairingId: prev.pairingId,
            ...pin2 !== null ? { pin: pin2 } : {},
            name: prev.device
          }).catch(failIfStill(next, "Não consegui responder ao pedido."));
        }
        if (event.trust && prev.address)
          trust({
            name: prev.device,
            address: prev.address,
            ...prev.fingerprint ? { fingerprint: prev.fingerprint } : {},
            ...prev.deviceId ? { deviceId: prev.deviceId } : {},
            ...prev.peerScreen ? { screen: prev.peerScreen } : {}
          });
      } else if (event.type === "DENY") {
        engine.deny(prev.pairingId).catch(failIfStill(next, "Não consegui responder ao pedido."));
      }
    }
    if (prev.screen === "connected" && next.screen !== "connected" && event.type !== "CLIENT_DISCONNECTED") {
      engine.stopSending().catch(failIfStill(next, "Não consegui parar o envio."));
    }
    if (next.screen === "receiving" && prev.screen !== "receiving") {
      engine.connect(next.host, settings).catch(failIfStill(next, "Não consegui conectar a esse computador."));
    }
    if (prev.screen === "receiving" && next.screen !== "receiving" && event.type !== "STREAM_ENDED") {
      engine.disconnect().catch(failIfStill(next, "Não consegui encerrar a conexão."));
    }
  }
  function dispatch(event) {
    const prev = state;
    const next = reduce(prev, event);
    if (next === prev) return;
    state = next;
    if (event.type === "CHOOSE") {
      settings = { ...settings, mode: event.mode };
      settingsQueue = settingsQueue.then(() => store.save(settings)).catch(() => void 0);
    }
    notify();
    runEffects(prev, next, event);
    if (!isSendLive(next)) queuedPairs = [];
    else if (next.screen === "ready") {
      const queued = queuedPairs.shift();
      if (queued !== void 0) dispatch(queued);
    }
  }
  function trust(device) {
    const others = settings.trusted.filter(
      (known) => (known.name !== device.name || known.address !== device.address) && (!device.fingerprint || known.fingerprint !== device.fingerprint)
    );
    settings = {
      ...parseSettings({ ...settings, trusted: [device, ...others] }),
      mode: settings.mode
    };
    notify();
    settingsQueue = settingsQueue.then(() => store.save(settings)).catch(() => void 0);
  }
  const isTrusted = (request) => request.fingerprint ? settings.trusted.some((known) => known.fingerprint === request.fingerprint) : settings.trusted.some(
    (known) => !known.fingerprint && known.name === request.device && known.address === request.address
  );
  function onPairRequest(request) {
    const event = { type: "PAIR_REQUEST", ...request };
    const verified = request.fingerprint || request.pin && isValidPin(request.pin);
    if (state.screen === "ready" && verified && isTrusted(request)) {
      engine.approve({
        pairingId: request.pairingId,
        ...request.pin ? { pin: request.pin } : {},
        name: request.device
      }).catch(() => dispatch(event));
      return;
    }
    if (state.screen !== "approve" && state.screen !== "connected") return dispatch(event);
    const shown = state.screen === "approve" && state.pairingId === request.pairingId;
    if (!shown && !queuedPairs.some((queued) => queued.pairingId === request.pairingId)) {
      queuedPairs.push(event);
    }
  }
  engine.onPairRequest(onPairRequest);
  engine.onPairCancelled((pairingId) => {
    queuedPairs = queuedPairs.filter((queued) => queued.pairingId !== pairingId);
    dispatch({ type: "PAIR_CANCELLED", pairingId });
  });
  engine.onClientConnected((device, peer) => {
    dispatch({ type: "CLIENT_CONNECTED", device, ...peer ?? {} });
    const known = peer?.fingerprint ? settings.trusted.find((t) => t.fingerprint === peer.fingerprint) : void 0;
    const size = peer?.screen;
    if (known && size && (known.screen?.width !== size.width || known.screen?.height !== size.height))
      trust({ ...known, screen: size });
  });
  engine.onClientDisconnected(() => dispatch({ type: "CLIENT_DISCONNECTED" }));
  engine.onStreamEnded(() => dispatch({ type: "STREAM_ENDED" }));
  mouse?.onRequest((request) => dispatch({ type: "MOUSE_REQUEST", ...request }));
  mouse?.onEnded(() => dispatch({ type: "MOUSE_ENDED" }));
  if (state.screen === "preparing")
    runEffects({ screen: "choose" }, state, { type: "CHOOSE" });
  if (state.screen === "mouse")
    runEffects({ screen: "choose" }, state, { type: "CHOOSE" });
  return {
    getSnapshot: snapshot,
    dispatch,
    updateSettings(patch) {
      const update = settingsQueue.then(async () => {
        const next = parseSettings({ ...settings, ...patch });
        const moved = next.extendSide !== settings.extendSide;
        const viewer = state.screen === "connected" ? state.fingerprint : void 0;
        const placement = viewer ? next.screenPlacements[viewer] : void 0;
        const replaced = viewer !== void 0 && placement !== void 0 && JSON.stringify(placement) !== JSON.stringify(settings.screenPlacements[viewer]);
        const sharing = state.screen === "mouse-active" && state.role === "share";
        const mouseMoved = sharing && sharingWith.some(
          ({ name }) => next.mouseSides[name] !== settings.mouseSides[name] || next.mouseOffsets[name] !== settings.mouseOffsets[name]
        );
        await store.save(next);
        settings = { ...next, mode: settings.mode };
        notify();
        if (moved) await engine.placeDisplay?.(settings.extendSide).catch(() => void 0);
        if (replaced && placement) await engine.placeScreen?.(placement).catch(() => void 0);
        if (mouseMoved) await mouse?.setLayout(placementsFor(sharingWith)).catch(() => void 0);
        if (state.screen === "connected" || state.screen === "receiving") {
          await engine.applyBitrate(settings.bitrate).catch(() => void 0);
        }
        return settings;
      });
      settingsQueue = update.catch(() => void 0);
      return update;
    },
    listHosts: () => engine.listHosts(),
    listMousePeers: async () => mouse ? mouse.listPeers() : [],
    subscribe(listener) {
      listeners2.add(listener);
      return () => {
        listeners2.delete(listener);
      };
    }
  };
}
function createUpdater(deps) {
  let state = {
    phase: deps.supported ? "idle" : "unavailable",
    currentVersion: deps.currentVersion
  };
  const listeners2 = /* @__PURE__ */ new Set();
  const set = (patch) => {
    state = { ...state, message: void 0, ...patch };
    listeners2.forEach((listener) => listener(state));
  };
  const fail = () => set({ phase: "error", message: "Não consegui atualizar. Confira a conexão e tente de novo." });
  const startDownload = async () => {
    set({ phase: "downloading", percent: 0 });
    try {
      await deps.download();
    } catch {
      fail();
    }
  };
  deps.listen({
    available: (version) => {
      if (state.phase === "downloading" || state.phase === "ready") return;
      set({ phase: "available", version });
      if (deps.autoDownload) void startDownload();
    },
    current: () => set({ phase: "current" }),
    progress: (percent) => set({ phase: "downloading", percent: Math.min(100, Math.max(0, percent)) }),
    downloaded: () => set({ phase: "ready", percent: 100 }),
    error: fail
  });
  return {
    status: () => state,
    subscribe(listener) {
      listeners2.add(listener);
      return () => {
        listeners2.delete(listener);
      };
    },
    async perform(action) {
      if (!deps.supported || state.phase === "checking" || state.phase === "downloading")
        return state;
      try {
        if (action === "check" && state.phase !== "ready") {
          set({ phase: "checking" });
          await deps.check();
          if (state.phase === "checking") set({ phase: "current" });
        } else if (action === "download" && state.phase === "available") {
          await startDownload();
        } else if (action === "install" && state.phase === "ready") {
          if (deps.canInstall()) deps.install();
          else set({ message: "Encerre a conexão antes de instalar a atualização." });
        }
      } catch {
        fail();
      }
      return state;
    }
  };
}
const belongsInTray = (state) => state.screen === "connected" || state.screen === "receiving" || state.screen === "mouse-active";
function createTrayFollower(window, tray) {
  let away = false;
  return (state) => {
    const toTray = belongsInTray(state);
    if (toTray && !away) {
      away = true;
      tray.open();
      window.hide();
    } else if (!toTray && away) {
      away = false;
      window.show();
      tray.close();
    }
  };
}
function createUninstaller(deps) {
  let pending;
  async function run2() {
    if (!deps.packaged) return "unavailable";
    if (deps.busy()) return "busy";
    if (deps.platform !== "win32") return "manual";
    const executable = node_path.win32.join(node_path.win32.dirname(deps.executable), "Uninstall Horizonte.exe");
    if (!deps.exists(executable)) return "unavailable";
    try {
      if (!await deps.confirm()) return "cancelled";
      if (deps.busy()) return "busy";
      await deps.launch(executable);
      deps.quit();
      return "started";
    } catch {
      return "failed";
    }
  }
  return () => {
    pending ??= run2().finally(() => {
      pending = void 0;
    });
    return pending;
  };
}
function diagnosticErrorCode(text) {
  if (/Não achei o monitor virtual no (?:motor de transmissão|Sunshine)\./i.test(text))
    return "MONITOR_VIRTUAL_NAO_ENCONTRADO";
  if (/O motor de transmissão (?:não respondeu|não está pronto ainda)\./i.test(text))
    return "SUNSHINE_INDISPONIVEL";
  if (/O pareamento não foi concluído\.|Moonlight (?:falhou|encerrou com código)/i.test(text))
    return "MOONLIGHT_FALHOU";
  if (/O pacote do driver veio incompleto\.|Sem a sua autorização para o certificado do monitor virtual, não consigo instalá-lo\./i.test(
    text
  ))
    return "DRIVER_INSTALACAO_FALHOU";
  return "ERRO_NAO_CLASSIFICADO";
}
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function hideHome(text, home) {
  const clean = home.replace(/[\\/]+$/, "");
  if (clean.length < 4) return text;
  const flexible = escapeRegExp(clean).replace(/\\\\|\//g, "[\\\\/]");
  return text.replace(new RegExp(flexible, "gi"), "~");
}
function hideCredentials(text) {
  const argument = String.raw`(?:'(?:[^']|'')*'|"(?:\\.|\x60.|[^"\\])*"|[\\\x60][^\r\n]|[^\s'"\\\x60;|&])+`;
  return text.replace(
    new RegExp(String.raw`(--creds)[\t ]+${argument}[\t ]+${argument}`, "gi"),
    "$1 [oculto] [oculto]"
  ).replace(/([a-z][a-z\d+.-]{0,31}:\/\/)[^\s/?#]+@/gi, "$1[oculto]@").replace(
    /(\bAuthorization["']?[\t ]*[:=][\t ]*["']?(?:Basic|Bearer)[\t ]+)[a-z\d._~+/=-]+/gi,
    "$1[oculto]"
  );
}
function buildDiagnostic(env, snapshot) {
  const { state, settings } = snapshot;
  const mode = "mode" in state ? ` (modo ${state.mode})` : "";
  const lines = [
    `Horizonte ${env.version}`,
    `Sistema: ${env.platform} ${env.arch} (${env.osRelease})`,
    `Electron ${env.electron}`,
    `Tela: ${state.screen}${mode}`
  ];
  if (state.screen === "error") {
    lines.push(`Erro: ${hideCredentials(state.error.message)}`);
    if (state.error.detail) lines.push(`Detalhe: ${hideCredentials(state.error.detail)}`);
  }
  lines.push(
    `Qualidade: ${settings.bitrate} Mbps, ${settings.resolution}, ${settings.fps} fps, ${settings.codec}, codificação ${settings.encoding}`
  );
  return hideHome(lines.join("\n"), env.home);
}
const ISSUE_URL = `${REPO_URL}/issues/new?labels=diagnostico`;
const MAX_URL = 6e3;
const ERROR_LINE = /^Erro: (?:MONITOR_VIRTUAL_NAO_ENCONTRADO|SUNSHINE_INDISPONIVEL|MOONLIGHT_FALHOU|DRIVER_INSTALACAO_FALHOU|ERRO_NAO_CLASSIFICADO)$/;
function buildReportDiagnostic(env, snapshot) {
  if (snapshot.state.screen !== "error") return buildDiagnostic(env, snapshot);
  const { message, detail } = snapshot.state.error;
  return buildDiagnostic(env, {
    ...snapshot,
    state: {
      ...snapshot.state,
      error: { message: diagnosticErrorCode(`${message}
${detail ?? ""}`) }
    }
  });
}
function reportSummary(text) {
  return text.split("\n").filter(
    (line) => /^(Horizonte |Sistema: |Electron |Tela: |Qualidade: |\d{4}-\d{2}-\d{2}T\d{2}:)/.test(
      line
    ) || ERROR_LINE.test(line)
  ).join("\n");
}
function createDiagnosticReporter(deps) {
  let reviewed = null;
  return {
    async prepare(includeHistory) {
      reviewed = null;
      if (typeof includeHistory !== "boolean") throw new Error("Opção de histórico inválida.");
      const text = reportSummary(await deps.text(includeHistory));
      reviewed = text;
      return text;
    },
    async report(text) {
      if (typeof text !== "string" || !text || text !== reviewed)
        throw new Error("Revise o diagnóstico antes de abrir o GitHub.");
      const url = new URL(ISSUE_URL);
      url.searchParams.set("title", "Diagnóstico do Horizonte");
      url.searchParams.set("body", text);
      if (url.href.length > MAX_URL) {
        deps.copy(text);
        await deps.open(ISSUE_URL);
        return "copied";
      }
      await deps.open(url.href);
      return "opened";
    }
  };
}
const MAX_ENTRIES = 10;
const MAX_TEXT = 8192;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1e3;
function createDiagnosticHistory(file, env, now = Date.now) {
  let writes = Promise.resolve();
  const read = async () => {
    try {
      const raw = JSON.parse(await promises.readFile(file, "utf8"));
      if (!Array.isArray(raw)) return [];
      const cutoff = now() - RETENTION_MS;
      return raw.filter(
        (item) => typeof item === "object" && item !== null && Number.isFinite(item.at) && item.at >= cutoff && item.at <= now() && typeof item.text === "string" && item.text.length <= MAX_TEXT
      ).slice(-MAX_ENTRIES);
    } catch {
      return [];
    }
  };
  return {
    async summary() {
      await writes;
      return (await read()).map(
        (entry) => `${new Date(entry.at).toISOString()}
${entry.text.split("\n").slice(0, 4).join("\n")}
Erro: ${diagnosticErrorCode(entry.text.split("\n").slice(4).join("\n"))}`
      ).join("\n\n");
    },
    record(snapshot) {
      if (snapshot.state.screen !== "error") return Promise.resolve();
      const entry = { at: now(), text: buildDiagnostic(env, snapshot).slice(0, MAX_TEXT) };
      const write = writes.then(async () => {
        const entries = [...await read(), entry].slice(-MAX_ENTRIES);
        await promises.mkdir(node_path.dirname(file), { recursive: true });
        const temporary = `${file}.${process.pid}.tmp`;
        try {
          await promises.writeFile(temporary, JSON.stringify(entries), { encoding: "utf8", mode: 384 });
          await promises.rename(temporary, file);
        } catch (cause) {
          await promises.rm(temporary, { force: true });
          throw cause;
        }
      });
      writes = write.catch(() => void 0);
      return write;
    },
    async text() {
      await writes;
      return (await read()).map((entry) => `${new Date(entry.at).toISOString()}
${entry.text}`).join("\n\n");
    }
  };
}
function desktopEntry(executable) {
  if (/[\r\n\0=]/.test(executable)) throw new Error("Caminho inválido para abrir com o sistema.");
  const quoted = executable.replace(/%/g, "%%").replace(/[\\"`$]/g, "\\$&").replace(/\\/g, "\\\\");
  return `[Desktop Entry]
Type=Application
Name=Horizonte
Exec="${quoted}"
Terminal=false
`;
}
function createAutostart(deps) {
  return {
    async set(on) {
      if (deps.platform === "linux") {
        const dir = node_path.join(deps.configDir, "autostart");
        const file = node_path.join(dir, "com.horizonte.app.desktop");
        if (on) {
          await promises.mkdir(dir, { recursive: true });
          await promises.writeFile(file, desktopEntry(deps.executable), { encoding: "utf8", mode: 384 });
        } else await promises.rm(file, { force: true });
      } else deps.native(on);
    }
  };
}
const WIFI_POWER_COMMAND = "printf '[connection]\\nwifi.powersave = 2\\n' | sudo tee /etc/NetworkManager/conf.d/horizonte-wifi.conf && sudo systemctl restart NetworkManager";
function wifiPowerHint(facts) {
  if (!facts.interfaces.some((i) => i.powerSave === true)) return null;
  return {
    message: "A economia de energia do Wi-Fi está ligada neste computador e atrasa a imagem em até meio segundo. Desligue com o comando abaixo (a rede cai por um instante).",
    command: WIFI_POWER_COMMAND
  };
}
function parsePowerSave(output) {
  const match = /Power save:\s*(on|off)/i.exec(output);
  return match ? match[1].toLowerCase() === "on" : null;
}
async function finishStartup(deps) {
  deps.createWindow();
  try {
    await deps.syncAutostart?.();
  } catch (cause) {
    deps.reportError(
      new Error(
        "O Horizonte abriu, mas não consegui configurar a abertura junto com o sistema. Confira as permissões da pasta de configuração e tente alterar essa opção em Ajustes.",
        { cause }
      )
    );
  }
}
async function runStartup(boot2, reportFatal) {
  try {
    await boot2();
  } catch (cause) {
    reportFatal(
      new Error(
        "Não consegui iniciar o Horizonte. Confira as permissões das pastas de configuração e tente abrir o aplicativo novamente. Se o problema continuar, envie o detalhe abaixo ao suporte.",
        { cause }
      )
    );
  }
}
function runDevDemo(controller, engine) {
  let pairRequested = false;
  let connectedOnce = false;
  controller.subscribe(({ state }) => {
    if (state.screen !== "ready") return;
    if (!pairRequested) {
      pairRequested = true;
      setTimeout(() => engine.simulatePairRequest("Notebook", "p1", "4821"), 3e3);
      return;
    }
    if (!connectedOnce) {
      setTimeout(() => {
        if (connectedOnce || !engine.calls.includes("approve")) return;
        connectedOnce = true;
        engine.simulateClientConnected("Notebook");
      }, 1500);
    }
  });
}
const MOTOR_USAGE = [
  "Teste do motor novo (sem a interface do app):",
  "  --motor-send                   envia a tela principal",
  "      [--motor-extend]           cria uma tela extra e envia só ela (estender, em vez de espelhar)",
  "      [--motor-clock]            abre um relógio em milissegundos (medição de atraso por foto)",
  "      [--motor-synthetic]        envia um quadro de teste no lugar da tela",
  "      [--motor-browser]          abre a página de receber pelo navegador (porta 47920)",
  "      [--motor-port=47910]",
  "  --motor-receive=IP[:PORTA]     mostra a tela de outro aparelho",
  "      [--motor-fps=60] [--motor-bitrate=30] [--motor-size=1920x1080]",
  "      [--motor-test-frames=120]  confere o quadro de teste e sai (0 = ok)"
].join("\n");
function flag(argv, name) {
  for (const arg of argv) {
    if (arg === `--${name}`) return true;
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3);
  }
  return void 0;
}
function int(value, name, min, max) {
  if (value === void 0) return void 0;
  const n = Number(value);
  if (value === true || !Number.isInteger(n) || n < min || n > max)
    throw new Error(`--${name} precisa ser um número entre ${min} e ${max}.`);
  return n;
}
function parseMotorArgs(argv) {
  const send = flag(argv, "motor-send");
  const receive = flag(argv, "motor-receive");
  if (send === void 0 && receive === void 0) return null;
  if (send !== void 0 && receive !== void 0)
    throw new Error("Use --motor-send ou --motor-receive, não os dois.");
  const port = int(flag(argv, "motor-port"), "motor-port", 1, 65535);
  if (send !== void 0)
    return {
      role: "send",
      ...port !== void 0 ? { port } : {},
      synthetic: flag(argv, "motor-synthetic") !== void 0,
      clock: flag(argv, "motor-clock") !== void 0,
      extend: flag(argv, "motor-extend") !== void 0,
      browser: flag(argv, "motor-browser") !== void 0
    };
  if (typeof receive !== "string")
    throw new Error("--motor-receive precisa do endereço: --motor-receive=192.168.1.3");
  const match = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(receive);
  const host = match?.[1].replace(/^\[|\]$/g, "") ?? "";
  if (!match || !node_net.isIP(host) && !/^[a-z0-9.-]+$/i.test(host))
    throw new Error(`Endereço inválido: ${receive}`);
  const hostPort = int(match[2], "motor-receive", 1, 65535) ?? port;
  const sizeArg = flag(argv, "motor-size");
  let size;
  if (sizeArg !== void 0) {
    const m = typeof sizeArg === "string" ? /^(\d{3,5})x(\d{3,5})$/.exec(sizeArg) : null;
    if (!m) throw new Error("--motor-size precisa ser LARGURAxALTURA, como 1920x1080.");
    size = { width: Number(m[1]), height: Number(m[2]) };
  }
  return {
    role: "receive",
    host,
    ...hostPort !== void 0 ? { port: hostPort } : {},
    fps: int(flag(argv, "motor-fps"), "motor-fps", 1, 240) ?? 60,
    bitrate: int(flag(argv, "motor-bitrate"), "motor-bitrate", 1, 500) ?? 30,
    ...size ? { size } : {},
    testFrames: int(flag(argv, "motor-test-frames"), "motor-test-frames", 1, 1e5) ?? null
  };
}
function percentiles(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q2) => sorted[Math.min(sorted.length - 1, Math.floor(q2 * sorted.length))];
  return { median: at(0.5), p95: at(0.95) };
}
const MOTOR_CHANNELS = {
  config: "motor:config",
  signal: "motor:signal",
  report: "motor:report",
  push: "motor:push",
  input: "motor:input"
};
function placeCommand(placement) {
  const start = placement.offset === void 0 ? "" : ` ${placement.offset.toFixed(4)}`;
  return `place ${placement.side}${start}
`;
}
function createGnomeDisplay(deps) {
  let running = null;
  const same = (a, b) => a.width === b.width && a.height === b.height && a.fps === b.fps && (a.scale ?? 1) === (b.scale ?? 1);
  return {
    async ensure(request) {
      if (running && same(running.request, request)) return running.id;
      running?.helper.stop();
      running = null;
      const before = new Set(deps.displays());
      const helper = await deps.startHelper(request);
      running = { helper, request, id: null };
      const polls = Math.ceil((deps.appearTimeoutMs ?? 3e3) / 100);
      for (let i = 0; i < polls && running?.helper === helper; i++) {
        const added = deps.displays().find((id) => !before.has(id));
        if (added !== void 0) {
          running.id = added;
          break;
        }
        await deps.sleep(100);
      }
      return running?.helper === helper ? running.id : null;
    },
    async release() {
      running?.helper.stop();
      running = null;
    },
    async place(placement) {
      running?.helper.send?.(placeCommand(placement));
    },
    input(line) {
      running?.helper.send?.(line);
    }
  };
}
function startDisplayHelper(spawn, timeoutMs = 2e4, ready = /DISPLAY_ID (\d+)\n/) {
  return new Promise((resolve, reject) => {
    const child = spawn();
    let stdout = "";
    let stderr = "";
    let settled = false;
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      child.kill();
    };
    const fail = (message) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stop();
      reject(new Error(message));
    };
    const timer = setTimeout(
      () => fail(`o auxiliar do monitor virtual não respondeu em ${Math.round(timeoutMs / 1e3)} s`),
      timeoutMs
    );
    child.onError(
      (error) => fail(`não consegui iniciar o auxiliar do monitor virtual: ${error.message}`)
    );
    child.onStderr((text) => {
      stderr += text;
    });
    child.onStdout((text) => {
      if (settled) return;
      stdout += text;
      const found = ready.exec(stdout);
      if (!found) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        displayId: Number(found[1] ?? 0),
        stop,
        ...child.write ? { send: (line) => !stopped && child.write?.(line) } : {}
      });
    });
    child.onExit((code) => {
      stopped = true;
      fail(
        stderr.trim() || `o auxiliar do monitor virtual encerrou com código ${code ?? "desconhecido"}`
      );
    });
  });
}
const log$2 = (...parts) => console.log("[motor]", ...parts);
function prepareMotorSwitches() {
  electron.app.commandLine.appendSwitch("disable-features", "WebRtcHideLocalIpsWithMdns");
  electron.app.commandLine.appendSwitch(
    "force-fieldtrials",
    "WebRTC-FlexFEC-03/Enabled/WebRTC-FlexFEC-03-Advertised/Enabled/"
  );
  if (process.platform === "linux")
    electron.app.commandLine.appendSwitch("enable-features", "AcceleratedVideoEncoder,VaapiVideoEncoder");
}
function primarySize() {
  const { size, scaleFactor } = electron.screen.getPrimaryDisplay();
  return {
    width: Math.round(size.width * scaleFactor),
    height: Math.round(size.height * scaleFactor)
  };
}
const configs = /* @__PURE__ */ new Map();
const signalTargets = /* @__PURE__ */ new Map();
const reportListeners = /* @__PURE__ */ new Map();
const inputTargets = /* @__PURE__ */ new Map();
let ipcWired = false;
function wireMotorIpc() {
  if (ipcWired) return;
  ipcWired = true;
  electron.ipcMain.handle(MOTOR_CHANNELS.config, (event) => configs.get(event.sender.id));
  electron.ipcMain.on(
    MOTOR_CHANNELS.signal,
    (event, message) => signalTargets.get(event.sender.id)?.(message)
  );
  electron.ipcMain.on(
    MOTOR_CHANNELS.report,
    (event, report) => reportListeners.get(event.sender.id)?.(report)
  );
  electron.ipcMain.on(MOTOR_CHANNELS.input, (event, raw) => {
    if (typeof raw === "string") inputTargets.get(event.sender.id)?.(raw);
  });
}
function motorWindow(config, options) {
  wireMotorIpc();
  const sending = config.role === "send";
  const window = new electron.BrowserWindow({
    title: "Horizonte",
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    ...options,
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/motor.js"),
      contextIsolation: !sending,
      sandbox: !sending,
      nodeIntegration: false,
      // A janela que envia fica oculta e precisa continuar a todo vapor.
      backgroundThrottling: false
    }
  });
  const id = window.webContents.id;
  configs.set(id, config);
  window.on("closed", () => {
    configs.delete(id);
    signalTargets.delete(id);
    reportListeners.delete(id);
    inputTargets.delete(id);
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"])
    void window.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/motor.html`);
  else void window.loadFile(node_path.join(__dirname, "../renderer/motor.html"));
  return window;
}
function listenReports(contents, onReport) {
  let identity = null;
  let codecs = null;
  const waiters = [];
  reportListeners.set(contents.id, (report) => {
    if (report.type === "identity") identity = { id: report.id, fp: report.fp };
    else if (report.type === "ready") codecs = report.codecs;
    else if (report.type === "error") log$2("erro na janela:", report.message);
    onReport(report);
    for (const wake of waiters.splice(0)) wake();
  });
  const until = (read) => new Promise((resolve) => {
    const check = () => {
      const value = read();
      if (value !== null) resolve(value);
      else waiters.push(check);
    };
    check();
  });
  return {
    identity: () => until(() => identity),
    codecs: () => until(() => codecs)
  };
}
function windowMedia(window, hooks = {}) {
  const id = window.webContents.id;
  let run2 = 0;
  const push = (message) => {
    if (!window.isDestroyed()) window.webContents.send(MOTOR_CHANNELS.push, message);
  };
  return {
    start(send, want) {
      const mine = ++run2;
      signalTargets.set(id, send);
      if (hooks.onInput) inputTargets.set(id, hooks.onInput);
      void (hooks.beforeStart?.(want) ?? Promise.resolve()).then(
        (extra) => mine === run2 && push({ t: "start", want, ...extra ?? {} }),
        (error) => {
          const failure = error instanceof Error ? error : new Error(String(error));
          log$2("não consegui preparar a tela:", failure.message);
          hooks.onError?.(failure);
        }
      );
    },
    deliver: (message) => push(message),
    stop() {
      run2 += 1;
      signalTargets.delete(id);
      inputTargets.delete(id);
      push({ t: "stop" });
      hooks.afterStop?.();
    }
  };
}
function handleCaptureRequests(target) {
  electron.session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void electron.desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } }).then((sources) => {
      const wanted = String(target() ?? electron.screen.getPrimaryDisplay().id);
      const source = sources.find((s) => s.display_id === wanted) ?? sources[0];
      if (!source) throw new Error("Nenhuma tela para capturar.");
      log$2(`capturando ${source.name}`);
      callback({ video: source });
    }).catch((error) => {
      log$2("não consegui capturar a tela:", error);
      callback({});
    });
  });
}
function linuxHelperPath() {
  return electron.app.isPackaged ? node_path.join(process.resourcesPath, "horizonte-display") : node_path.join(electron.app.getAppPath(), "native", "linux", "build", "horizonte-display");
}
function framesSocket() {
  return node_path.join(
    process.env.XDG_RUNTIME_DIR ?? electron.app.getPath("temp"),
    `horizonte-tela-${process.pid}.sock`
  );
}
const gnomeFrames = () => process.platform === "linux" && Boolean(process.env.WAYLAND_DISPLAY) && /gnome/i.test(process.env.XDG_CURRENT_DESKTOP ?? "");
function createLinuxVirtualScreen(frames) {
  return createGnomeDisplay({
    startHelper: (request) => startDisplayHelper(
      () => {
        const child = node_child_process.spawn(linuxHelperPath(), [
          "--width",
          String(request.width),
          "--height",
          String(request.height),
          "--refresh",
          String(request.fps),
          ...frames ? ["--frames", frames] : [],
          ...request.scale && request.scale > 1 ? ["--scale", String(request.scale)] : [],
          // Mouse, teclado e toque de quem mostra agem nesta tela (sessão de controle remoto do GNOME).
          "--input"
        ]);
        return {
          onStdout: (callback) => child.stdout.on("data", (chunk) => callback(String(chunk))),
          onStderr: (callback) => child.stderr.on("data", (chunk) => callback(String(chunk))),
          onExit: (callback) => child.on("exit", callback),
          onError: (callback) => child.on("error", callback),
          kill: () => child.kill("SIGTERM"),
          write: (line) => void child.stdin.write(line)
        };
      },
      1e4,
      /^READY /m
    ),
    displays: () => electron.screen.getAllDisplays().map((d) => d.id),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  });
}
function helloFor(identity, name = cleanName(node_os.hostname()) || "Computador", kind = guessKind(name)) {
  return {
    t: "hello",
    v: PROTOCOL_VERSION,
    id: identity.id,
    name,
    kind,
    fp: identity.fp,
    screen: primarySize()
  };
}
function sdpFingerprint(sdp) {
  const found = /* @__PURE__ */ new Set();
  for (const line of sdp.split(/\r?\n/)) {
    const match = /^a=fingerprint:(\S+) (\S+)$/i.exec(line.trim());
    if (!match) continue;
    if (match[1].toLowerCase() !== "sha-256") return null;
    found.add(match[2].toUpperCase());
  }
  if (found.size !== 1) return null;
  const [fingerprint] = found;
  return isFingerprint(fingerprint) ? fingerprint : null;
}
const normalizeAddress = (address) => (address ?? "").replace(/^::ffff:/i, "");
function wrapSocket(socket, options = {}) {
  const pingMs = options.pingMs ?? 5e3;
  const maxMissed = options.maxMissed ?? 3;
  const now = options.now ?? Date.now;
  const messageListeners = /* @__PURE__ */ new Set();
  const closeListeners = /* @__PURE__ */ new Set();
  const queued = [];
  let buffer = "";
  let closed = false;
  let missed = 0;
  let closeReason = "fechada";
  socket.setEncoding("utf8");
  socket.setNoDelay(true);
  const finish = (reason) => {
    if (closed) return;
    closed = true;
    closeReason = reason;
    clearInterval(timer);
    socket.destroy();
    for (const callback of [...closeListeners]) callback(closeReason);
  };
  const send = (message) => {
    if (closed) return;
    socket.write(encodeMessage(message));
  };
  const deliver = (message) => {
    if (messageListeners.size === 0) {
      if (queued.length >= 64) return finish("mensagens demais");
      queued.push(message);
      return;
    }
    for (const callback of [...messageListeners]) callback(message);
  };
  const timer = pingMs > 0 ? setInterval(() => {
    if (missed >= maxMissed) return finish("sem resposta");
    missed += 1;
    send({ t: "ping", at: now() });
  }, pingMs) : void 0;
  timer?.unref?.();
  socket.on("data", (chunk) => {
    buffer += chunk;
    if (Buffer.byteLength(buffer) > MAX_LINE_BYTES && !buffer.includes("\n"))
      return finish("mensagem grande demais");
    let newline = buffer.indexOf("\n");
    while (newline !== -1 && !closed) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) return finish("mensagem grande demais");
      const message = parseMessage(line);
      if (!message) return finish("mensagem inválida");
      missed = 0;
      if (message.t === "ping") send({ t: "pong", at: message.at });
      else if (message.t !== "pong") deliver(message);
      newline = buffer.indexOf("\n");
    }
  });
  socket.on("error", (error) => finish(error.message));
  socket.on("close", () => finish("fechada pelo outro lado"));
  return {
    remoteAddress: normalizeAddress(socket.remoteAddress),
    send,
    onMessage(callback) {
      messageListeners.add(callback);
      if (queued.length > 0)
        queueMicrotask(() => {
          while (queued.length > 0 && messageListeners.size > 0 && !closed)
            deliver(queued.shift());
        });
      return () => messageListeners.delete(callback);
    },
    onClose(callback) {
      if (closed) {
        callback(closeReason);
        return () => void 0;
      }
      closeListeners.add(callback);
      return () => closeListeners.delete(callback);
    },
    close(reason = "encerrada") {
      if (closed) return;
      socket.end(() => finish(reason));
      setTimeout(() => finish(reason), 1e3).unref?.();
    },
    get closed() {
      return closed;
    }
  };
}
function waitHello(link, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      done();
      link.close("sem hello");
      reject(new Error("O outro aparelho não se apresentou a tempo."));
    }, timeoutMs);
    const stopMessage = link.onMessage((message) => {
      done();
      if (message.t === "hello") return resolve(message);
      link.close("esperava hello");
      reject(new Error("O outro aparelho não seguiu o protocolo do Horizonte."));
    });
    const stopClose = link.onClose(() => {
      done();
      reject(new Error("O outro aparelho fechou a conexão."));
    });
    function done() {
      clearTimeout(timer);
      stopMessage();
      stopClose();
    }
  });
}
function listenOn(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}
async function listen(options) {
  const maxConnections = options.maxConnections ?? 4;
  const helloTimeoutMs = options.helloTimeoutMs ?? 3e4;
  const links = /* @__PURE__ */ new Set();
  const server = node_net.createServer((socket) => {
    if (links.size >= maxConnections) {
      socket.destroy();
      return;
    }
    const link = wrapSocket(socket, options);
    links.add(link);
    link.onClose(() => links.delete(link));
    waitHello(link, helloTimeoutMs).then(
      (peer) => {
        if (peer.v !== PROTOCOL_VERSION) {
          link.send(options.hello());
          link.send({ t: "denied", reason: "version" });
          link.close("versão diferente");
          return;
        }
        link.send(options.hello());
        options.onLink(link, peer);
      },
      (error) => options.onError?.(error)
    );
  });
  server.on("error", (error) => options.onError?.(error));
  let port = null;
  const candidates = options.port !== void 0 ? [options.port] : Array.from(
    { length: SIGNALING_PORT_LAST - SIGNALING_PORT + 1 },
    (_, i) => SIGNALING_PORT + i
  );
  let lastError = null;
  for (const candidate of candidates) {
    try {
      port = await listenOn(server, candidate, options.host);
      break;
    } catch (error) {
      lastError = error;
      if (error.code !== "EADDRINUSE") break;
    }
  }
  if (port === null) {
    server.close();
    throw new Error("Não consegui abrir a porta da conexão. Outro programa pode estar usando.", {
      cause: lastError
    });
  }
  return {
    port,
    close: () => new Promise((resolve) => {
      for (const link of links) link.close("servidor fechado");
      server.close(() => resolve());
    })
  };
}
function dial(host, port, options = {}) {
  return new Promise((resolve, reject) => {
    const socket = node_net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`${host} não respondeu.`));
    }, options.timeoutMs ?? 1e4);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.removeAllListeners("error");
      resolve(wrapSocket(socket, options));
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(
        new Error(
          error.code === "ECONNREFUSED" ? `${host} não está esperando conexão. Escolha Enviar no outro aparelho.` : `Não consegui falar com ${host}.`,
          { cause: error }
        )
      );
    });
  });
}
const isMedia = (message) => message.t === "offer" || message.t === "answer" || message.t === "ice" || message.t === "bitrate";
function bridge(link, peer, media, want) {
  const endedListeners = /* @__PURE__ */ new Set();
  let ended = false;
  const finish = (reason) => {
    if (ended) return;
    ended = true;
    stopMessages();
    stopClose();
    media.stop();
    link.close(reason);
    for (const callback of [...endedListeners]) callback(reason);
  };
  const stopMessages = link.onMessage((message) => {
    if (message.t === "bye") return finish(message.reason === "user" ? "encerrada" : message.reason);
    if (!isMedia(message)) return;
    if (message.t === "offer" || message.t === "answer") {
      if (sdpFingerprint(message.sdp) !== peer.fp) {
        link.send({ t: "bye", reason: "error" });
        return finish("certificado diferente");
      }
    }
    media.deliver(message);
  });
  const stopClose = link.onClose((reason) => finish(reason));
  media.start((message) => link.send(message), want);
  return {
    peer,
    send(message) {
      if (!ended) link.send(message);
    },
    end(reason = "user") {
      if (ended) return;
      link.send({ t: "bye", reason });
      finish("encerrada");
    },
    onEnded(callback) {
      if (ended) {
        callback("encerrada");
        return () => void 0;
      }
      endedListeners.add(callback);
      return () => endedListeners.delete(callback);
    }
  };
}
async function startSender(options) {
  let busy = false;
  let current = null;
  const server = await listen({
    ...options,
    onLink(link, peer) {
      if (busy) {
        link.send({ t: "denied", reason: "busy" });
        link.close("ocupado");
        return;
      }
      busy = true;
      void serve(link, peer).finally(() => {
        if (!current) busy = false;
      });
    }
  });
  async function serve(link, peer) {
    const cancelled = new Promise((resolve) => {
      link.onMessage((message) => message.t === "cancel" && resolve());
      link.onClose(() => resolve());
    });
    link.send({ t: "pending" });
    const approved = await Promise.race([
      options.approve(peer, link.remoteAddress, cancelled),
      cancelled.then(() => null)
    ]);
    if (approved === null || link.closed) return link.close("desistiu");
    if (!approved) {
      link.send({ t: "denied", reason: "user" });
      return link.close("recusado");
    }
    link.send({ t: "accepted", trusted: false });
    const session = await new Promise((resolve) => {
      const stop = link.onMessage((message) => {
        if (message.t !== "want") return;
        stop();
        resolve(bridge(link, peer, options.media(peer), message));
      });
      link.onClose(() => resolve(null));
    });
    if (!session) return;
    current = session;
    session.onEnded(() => {
      current = null;
      busy = false;
    });
    options.onSession(session, link.remoteAddress);
  }
  return {
    port: server.port,
    async stop() {
      current?.end("quit");
      await server.close();
    }
  };
}
const DENIED = {
  user: "O outro aparelho não permitiu a conexão.",
  busy: "O outro aparelho já está mostrando a tela em outro lugar.",
  version: "Os dois aparelhos estão com versões diferentes do Horizonte. Atualize os dois."
};
async function connect(options) {
  const link = await dial(options.host, options.port, options);
  const abort = () => {
    link.send({ t: "cancel" });
    link.close("cancelado");
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    link.send(options.hello);
    const peer = await waitHello(link, options.helloTimeoutMs ?? 1e4);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        link.send({ t: "cancel" });
        link.close("sem resposta");
        reject(new Error("O outro aparelho não respondeu ao pedido a tempo."));
      }, options.approvalTimeoutMs ?? 12e4);
      const done = () => {
        clearTimeout(timer);
        stopMessage();
        stopClose();
      };
      const stopMessage = link.onMessage((message) => {
        if (message.t === "pending") return options.onPending?.(peer);
        if (message.t === "accepted") {
          done();
          return resolve();
        }
        if (message.t === "denied") {
          done();
          link.close("recusado");
          return reject(new Error(DENIED[message.reason]));
        }
      });
      const stopClose = link.onClose(() => {
        done();
        reject(
          new Error(options.signal?.aborted ? "Cancelado." : "O outro aparelho fechou a conexão.")
        );
      });
    });
    link.send(options.want);
    return bridge(link, peer, options.media(), options.want);
  } finally {
    options.signal?.removeEventListener("abort", abort);
  }
}
const BROWSER_PORT = 47920;
const BROWSER_PORT_LAST = 47929;
const MAX_WRONG = 5;
const LOCK_MS = 6e4;
const IDLE_MS = 3e4;
const KEEPALIVE_MS = 15e3;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2"
};
const sixDigits = () => String(node_crypto.randomInt(0, 1e6)).padStart(6, "0");
function sameCode(given, code) {
  if (typeof given !== "string" || !/^\d{6}$/.test(given)) return false;
  return node_crypto.timingSafeEqual(Buffer.from(given), Buffer.from(code));
}
async function readBody(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function reply(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body === void 0 ? "" : JSON.stringify(body));
}
async function startBrowserBridge(options) {
  const code = (options.generateCode ?? sixDigits)();
  const now = options.now ?? Date.now;
  const tunnels = /* @__PURE__ */ new Map();
  let wrong = 0;
  let lockedUntil = 0;
  const close = (id) => {
    const tunnel = tunnels.get(id);
    if (!tunnel) return;
    tunnels.delete(id);
    clearTimeout(tunnel.idle);
    tunnel.socket.destroy();
    tunnel.events?.end();
  };
  function push(tunnel, line) {
    if (tunnel.events) tunnel.events.write(`data: ${line}

`);
    else tunnel.backlog.push(line);
  }
  async function open(req, res) {
    if (now() < lockedUntil)
      return reply(res, 429, { erro: "Muitas tentativas. Espere um minuto." });
    const body = await readBody(req, 256);
    let given;
    try {
      given = body ? JSON.parse(body).codigo : void 0;
    } catch {
      given = void 0;
    }
    if (!sameCode(given, code)) {
      wrong++;
      if (wrong >= MAX_WRONG) {
        wrong = 0;
        lockedUntil = now() + LOCK_MS;
      }
      return reply(res, 403, { erro: "Código errado." });
    }
    wrong = 0;
    const port2 = options.signalingPort();
    if (port2 === null)
      return reply(res, 409, {
        erro: "O computador não está esperando conexão. Escolha Enviar nele."
      });
    const id = node_crypto.randomBytes(16).toString("hex");
    const socket = node_net.connect({ host: "127.0.0.1", port: port2 });
    const tunnel = {
      socket,
      events: null,
      backlog: [],
      idle: setTimeout(() => close(id), IDLE_MS)
    };
    tunnels.set(id, tunnel);
    let pending = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      pending += chunk;
      if (pending.length > MAX_LINE_BYTES * 4) return close(id);
      let at;
      while ((at = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, at);
        pending = pending.slice(at + 1);
        if (line) push(tunnel, line);
      }
    });
    socket.on("error", () => close(id));
    socket.on("close", () => {
      if (tunnel.events) tunnel.events.write("event: fim\ndata: {}\n\n");
      close(id);
    });
    reply(res, 200, { sessao: id });
  }
  function events(id, res) {
    const tunnel = tunnels.get(id);
    if (!tunnel || tunnel.events) return reply(res, 404);
    clearTimeout(tunnel.idle);
    tunnel.events = res;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive"
    });
    res.write(": conectado\n\n");
    for (const line of tunnel.backlog.splice(0)) res.write(`data: ${line}

`);
    const keepalive = setInterval(() => res.write(": ainda aqui\n\n"), KEEPALIVE_MS);
    res.on("close", () => {
      clearInterval(keepalive);
      close(id);
    });
  }
  async function send(id, req, res) {
    const tunnel = tunnels.get(id);
    if (!tunnel) return reply(res, 404);
    const body = await readBody(req, MAX_LINE_BYTES);
    const message = body ? parseMessage(body) : null;
    if (!message) return reply(res, 400, { erro: "Mensagem fora do formato." });
    tunnel.socket.write(JSON.stringify(message) + "\n");
    reply(res, 204);
  }
  async function page(path2, res) {
    const relative = path2 === "/" ? "web.html" : node_path.normalize(path2.slice(1));
    const allowed = relative === "web.html" || relative.startsWith(`assets${node_path.sep}`) && !relative.includes("..") && node_path.extname(relative) in TYPES;
    if (!allowed) return reply(res, 404);
    try {
      const data = await promises.readFile(node_path.join(options.pagesDir, relative));
      res.writeHead(200, {
        "content-type": TYPES[node_path.extname(relative)] ?? "application/octet-stream",
        "cache-control": relative === "web.html" ? "no-store" : "max-age=3600",
        // A página só fala com este mesmo endereço.
        "content-security-policy": "default-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'",
        "x-content-type-options": "nosniff"
      });
      res.end(data);
    } catch {
      reply(res, 404);
    }
  }
  const server = node_http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://horizonte");
    const id = url.searchParams.get("sessao") ?? "";
    const route = `${req.method} ${url.pathname}`;
    const done = (promise) => {
      promise.catch(() => {
        if (!res.headersSent) reply(res, 500);
        else res.end();
      });
    };
    if (route === "POST /api/abrir") return done(open(req, res));
    if (route === "GET /api/eventos") return events(id, res);
    if (route === "POST /api/enviar") return done(send(id, req, res));
    if (route === "POST /api/fechar") {
      close(id);
      return reply(res, 204);
    }
    if (req.method === "GET") return done(page(url.pathname, res));
    reply(res, 404);
  });
  const listenOn2 = (candidate) => new Promise((resolve, reject) => {
    const fail = (error) => reject(error);
    server.once("error", fail);
    server.listen(candidate, options.host, () => {
      server.off("error", fail);
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : candidate);
    });
  });
  const candidates = options.port !== void 0 ? [options.port] : Array.from({ length: BROWSER_PORT_LAST - BROWSER_PORT + 1 }, (_, i) => BROWSER_PORT + i);
  let port = 0;
  for (const [i, candidate] of candidates.entries()) {
    try {
      port = await listenOn2(candidate);
      break;
    } catch (error) {
      const busy = error.code === "EADDRINUSE";
      if (!busy || i === candidates.length - 1) throw error;
    }
  }
  return {
    port,
    code,
    async stop() {
      for (const id of [...tunnels.keys()]) close(id);
      await new Promise((resolve) => server.close(() => resolve()));
    }
  };
}
function createBrowserAccess(options) {
  let bridge2 = null;
  const status = async () => {
    if (!bridge2) return { on: false };
    const address = options.lanAddress();
    return {
      on: true,
      code: bridge2.code,
      ...address ? { url: `http://${address}:${bridge2.port}` } : {}
    };
  };
  return {
    status,
    async start() {
      try {
        bridge2 ??= await (options.start ?? startBrowserBridge)({
          pagesDir: options.pagesDir,
          signalingPort: options.signalingPort
        });
        return status();
      } catch (error) {
        const busy = error.code === "EADDRINUSE";
        return {
          on: false,
          error: busy ? `As portas ${BROWSER_PORT} a ${BROWSER_PORT_LAST} estão em uso por outros programas.` : "Não consegui abrir a página para o navegador."
        };
      }
    },
    async stop() {
      const current = bridge2;
      bridge2 = null;
      await current?.stop();
    }
  };
}
const TEST_TIMEOUT_MS = 6e4;
const log$1 = (...parts) => console.log("[motor]", ...parts);
const lanAddresses = () => Object.values(node_os.networkInterfaces()).flat().flatMap((info) => info && info.family === "IPv4" && !info.internal ? [info.address] : []);
function recorder(role) {
  const file = node_path.join(electron.app.getPath("userData"), "motor-medidas.jsonl");
  const samples = [];
  let lastLog = 0;
  return {
    file,
    add(stats) {
      samples.push(stats);
      void promises.appendFile(file, JSON.stringify({ role, ...stats }) + "\n").catch(() => void 0);
      if (stats.at - lastLog >= 5e3) {
        lastLog = stats.at;
        log$1(
          `${stats.width}x${stats.height} ${stats.fps} fps ${stats.mbps} Mbps ${stats.codec} (${stats.implementation}${stats.hardware === null ? "" : stats.hardware ? ", placa de vídeo" : ", software"}) ida e volta ${stats.rttMs ?? "?"} ms` + (stats.fecPackets ? ` correção ${stats.fecPackets} pacotes` : "") + (stats.displayMs !== null ? ` recebido até a tela ${stats.displayMs} ms` : "") + (stats.latencyMs !== null ? ` captura até a tela ${stats.latencyMs} ms` : "") + (stats.qualityLimitation && stats.qualityLimitation !== "none" ? ` limitado por ${stats.qualityLimitation}` : "")
        );
      }
    },
    summary() {
      const series = (pick) => {
        const p = percentiles(samples.map(pick).filter((v) => v !== null));
        return p ? `mediana ${Math.round(p.median * 10) / 10}, p95 ${Math.round(p.p95 * 10) / 10}` : "?";
      };
      return [
        `${samples.length} s de sessão`,
        `fps: ${series((s) => s.fps)}`,
        `Mbps: ${series((s) => s.mbps)}`,
        `captura até a tela (ms): ${series((s) => s.latencyMs)}`,
        `recebido até a tela (ms): ${series((s) => s.displayMs)}`,
        `ida e volta (ms): ${series((s) => s.rttMs)}`,
        `descartados: ${samples.at(-1)?.framesDropped ?? 0}, perdidos: ${samples.at(-1)?.packetsLost ?? 0}`,
        `números de cada segundo em ${file}`
      ].join("\n  ");
    }
  };
}
async function runSend(args) {
  if (args.extend && process.platform !== "linux")
    throw new Error("O modo estender do teste ainda só existe no Linux com GNOME.");
  const frames = args.extend && gnomeFrames() ? framesSocket() : null;
  const virtual = args.extend ? createLinuxVirtualScreen(frames) : null;
  let target = null;
  const wayland = process.platform === "linux" && Boolean(process.env.WAYLAND_DISPLAY);
  if (wayland && virtual && !frames)
    log$1('no seletor do GNOME, escolha a tela "MetaVendor" (a tela nova).');
  handleCaptureRequests(() => target);
  const records = recorder("send");
  const window = motorWindow(
    { role: "send", synthetic: args.synthetic, testFrames: null, showStats: false },
    { show: false, width: 320, height: 200 }
  );
  const reports = listenReports(window.webContents, (report) => {
    if (report.type === "stats") records.add(report.stats);
  });
  const identity = await reports.identity();
  let clock = null;
  const openClock = (displayId) => {
    const display = electron.screen.getAllDisplays().find((d) => d.id === displayId) ?? electron.screen.getPrimaryDisplay();
    clock?.destroy();
    clock = motorWindow(
      { role: "clock", synthetic: false, testFrames: null, showStats: false },
      { ...display.bounds, fullscreen: true }
    );
  };
  if (args.clock && !args.extend) openClock(null);
  const sender = await startSender({
    ...args.port !== void 0 ? { port: args.port } : {},
    hello: () => helloFor(identity),
    // Teste do motor: aceita qualquer um, e avisa. A aprovação de verdade entra na Fase 3.
    approve: async (peer, address) => {
      log$1(`${peer.name} (${address}) pediu para ver a tela: aceito sem perguntar (teste do motor).`);
      return true;
    },
    media: () => windowMedia(window, {
      beforeStart: async (want) => {
        if (!virtual) return;
        target = await virtual.ensure({ width: want.width, height: want.height, fps: want.fps });
        log$1(`tela estendida criada: ${want.width}x${want.height}`);
        if (args.clock) openClock(target);
        return frames ? { frames } : void 0;
      },
      afterStop: () => {
        target = null;
        clock?.destroy();
        clock = null;
        void virtual?.release();
      }
    }),
    onSession(session, address) {
      log$1(`mostrando a tela para ${session.peer.name} (${address})`);
      session.onEnded((reason) => log$1(`sessão encerrada: ${reason}
  ${records.summary()}`));
    },
    onError: (error) => log$1(error.message)
  });
  const blocker = electron.powerSaveBlocker.start("prevent-app-suspension");
  electron.app.once("before-quit", () => {
    electron.powerSaveBlocker.stop(blocker);
    void sender.stop();
    void virtual?.release();
  });
  if (args.browser) {
    const page = await startBrowserBridge({
      pagesDir: node_path.join(__dirname, "../renderer"),
      signalingPort: () => sender.port
    });
    electron.app.once("before-quit", () => void page.stop());
    log$1(`no navegador: http://${lanAddresses()[0] ?? "127.0.0.1"}:${page.port} código ${page.code}`);
  }
  const addresses = lanAddresses();
  log$1(`pronto para enviar. Impressão digital: ${identity.fp.slice(0, 23)}…`);
  log$1(
    `no outro aparelho: --motor-receive=${addresses[0] ?? "IP-DESTE-PC"}:${sender.port}` + (addresses.length > 1 ? `  (outros endereços: ${addresses.slice(1).join(", ")})` : "")
  );
  log$1(
    "qualquer aparelho da rede pode ver esta tela enquanto este teste estiver aberto. Feche para parar."
  );
}
async function runReceive(args) {
  const testing = args.testFrames !== null;
  const records = recorder("receive");
  const display = electron.screen.getPrimaryDisplay();
  const window = motorWindow(
    { role: "receive", synthetic: false, testFrames: args.testFrames, showStats: true },
    testing ? { width: 960, height: 540, show: true } : { ...display.bounds, fullscreen: true, frame: false, show: true }
  );
  const began = Date.now();
  let finished = false;
  const finish = (code) => {
    if (finished) return;
    finished = true;
    electron.app.exit(code);
  };
  if (testing)
    setTimeout(() => {
      log$1(`teste: nenhum resultado em ${TEST_TIMEOUT_MS / 1e3} s`);
      finish(1);
    }, TEST_TIMEOUT_MS).unref();
  let end = () => finish(0);
  const reports = listenReports(window.webContents, (report) => {
    if (report.type === "first-frame") log$1(`primeiro quadro em ${Date.now() - began} ms`);
    else if (report.type === "stats") records.add(report.stats);
    else if (report.type === "test-result") {
      log$1(`teste: ${report.ok ? "ok" : "FALHOU"} (${report.detail})`);
      finish(report.ok ? 0 : 1);
    } else if (report.type === "quit") end();
  });
  const [identity, codecs] = await Promise.all([reports.identity(), reports.codecs()]);
  const size = args.size ?? primarySize();
  const want = { t: "want", ...size, fps: args.fps, bitrate: args.bitrate, codecs };
  const port = args.port ?? SIGNALING_PORT;
  log$1(
    `conectando a ${args.host}:${port} (${size.width}x${size.height}, ${args.fps} fps, ${args.bitrate} Mbps)`
  );
  const session = await connect({
    host: args.host,
    port,
    hello: helloFor(identity),
    want,
    media: () => windowMedia(window),
    onPending: (peer) => log$1(`esperando ${peer.name} permitir…`)
  });
  log$1(`conectado a ${session.peer.name}`);
  const blocker = electron.powerSaveBlocker.start("prevent-display-sleep");
  end = () => session.end();
  session.onEnded((reason) => {
    electron.powerSaveBlocker.stop(blocker);
    log$1(`sessão encerrada: ${reason}
  ${records.summary()}`);
    finish(testing ? 1 : 0);
  });
  window.on("closed", () => session.end());
}
async function runMotorBench(args) {
  await electron.app.whenReady();
  try {
    if (args.role === "send") await runSend(args);
    else await runReceive(args);
  } catch (error) {
    log$1(error instanceof Error ? error.message : String(error));
    electron.app.exit(1);
  }
}
const MOTOR_FIREWALL_SCRIPT = [
  "for net in 192.168.0.0/16 10.0.0.0/8 172.16.0.0/12; do",
  `  ufw allow from "$net" to any port ${SIGNALING_PORT}:${SIGNALING_PORT_LAST} proto tcp`,
  "done"
].join("\n");
async function ensureMotorFirewall(deps) {
  if (await deps.marked()) return "open";
  const config = await deps.readConfig();
  if (!config || !/^\s*ENABLED\s*=\s*yes\s*$/m.test(config)) return "open";
  try {
    await deps.runPrivileged(MOTOR_FIREWALL_SCRIPT);
  } catch (cause) {
    throw new Error(
      "O firewall (ufw) está ligado e não foi liberado. Sem isso, o outro aparelho não consegue se conectar.",
      { cause }
    );
  }
  await deps.mark();
  return "opened";
}
const BUTTONS = {
  left: 272,
  right: 273,
  middle: 274,
  back: 275,
  forward: 276
};
const EVDEV_KEYS = (() => {
  const map = {
    Escape: 1,
    Digit1: 2,
    Digit2: 3,
    Digit3: 4,
    Digit4: 5,
    Digit5: 6,
    Digit6: 7,
    Digit7: 8,
    Digit8: 9,
    Digit9: 10,
    Digit0: 11,
    Minus: 12,
    Equal: 13,
    Backspace: 14,
    Tab: 15,
    BracketLeft: 26,
    BracketRight: 27,
    Enter: 28,
    ControlLeft: 29,
    Semicolon: 39,
    Quote: 40,
    Backquote: 41,
    ShiftLeft: 42,
    Backslash: 43,
    Comma: 51,
    Period: 52,
    Slash: 53,
    ShiftRight: 54,
    NumpadMultiply: 55,
    AltLeft: 56,
    Space: 57,
    CapsLock: 58,
    NumLock: 69,
    ScrollLock: 70,
    Numpad7: 71,
    Numpad8: 72,
    Numpad9: 73,
    NumpadSubtract: 74,
    Numpad4: 75,
    Numpad5: 76,
    Numpad6: 77,
    NumpadAdd: 78,
    Numpad1: 79,
    Numpad2: 80,
    Numpad3: 81,
    Numpad0: 82,
    NumpadDecimal: 83,
    IntlBackslash: 86,
    F11: 87,
    F12: 88,
    IntlRo: 89,
    NumpadEnter: 96,
    ControlRight: 97,
    NumpadDivide: 98,
    PrintScreen: 99,
    AltRight: 100,
    Home: 102,
    ArrowUp: 103,
    PageUp: 104,
    ArrowLeft: 105,
    ArrowRight: 106,
    End: 107,
    ArrowDown: 108,
    PageDown: 109,
    Insert: 110,
    Delete: 111,
    NumpadEqual: 117,
    Pause: 119,
    NumpadComma: 121,
    MetaLeft: 125,
    MetaRight: 126,
    ContextMenu: 127
  };
  const rows = [
    ["QWERTYUIOP", 16],
    ["ASDFGHJKL", 30],
    ["ZXCVBNM", 44]
  ];
  for (const [letters, start] of rows)
    [...letters].forEach((letter, i) => map[`Key${letter}`] = start + i);
  for (let i = 1; i <= 10; i++) map[`F${i}`] = 58 + i;
  return map;
})();
const isFraction = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const isSteps = (value) => Number.isInteger(value) && Math.abs(value) <= 20;
function parseInput(raw) {
  if (raw.length > 200) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const m = data;
  switch (m.t) {
    case "move":
      return isFraction(m.x) && isFraction(m.y) ? { t: "move", x: m.x, y: m.y } : null;
    case "button":
      return typeof m.button === "string" && Object.hasOwn(BUTTONS, m.button) && typeof m.down === "boolean" ? { t: "button", button: m.button, down: m.down } : null;
    case "wheel":
      return isSteps(m.dx) && isSteps(m.dy) && (m.dx !== 0 || m.dy !== 0) ? { t: "wheel", dx: m.dx, dy: m.dy } : null;
    case "key":
      return typeof m.code === "string" && Object.hasOwn(EVDEV_KEYS, m.code) && typeof m.down === "boolean" ? { t: "key", code: m.code, down: m.down } : null;
    case "touch":
      return Number.isInteger(m.id) && m.id >= 0 && m.id < 10 && (m.phase === "down" || m.phase === "move" || m.phase === "up") && isFraction(m.x) && isFraction(m.y) ? { t: "touch", id: m.id, phase: m.phase, x: m.x, y: m.y } : null;
    default:
      return null;
  }
}
const fraction = (value) => value.toFixed(5);
function helperCommand(event) {
  switch (event.t) {
    case "move":
      return `move ${fraction(event.x)} ${fraction(event.y)}
`;
    case "button":
      return `button ${BUTTONS[event.button]} ${event.down ? 1 : 0}
`;
    case "wheel":
      return `wheel ${event.dx} ${event.dy}
`;
    case "key":
      return `key ${EVDEV_KEYS[event.code]} ${event.down ? 1 : 0}
`;
    case "touch":
      return `touch ${event.phase} ${event.id} ${fraction(event.x)} ${fraction(event.y)}
`;
  }
}
function listeners() {
  const set = /* @__PURE__ */ new Set();
  return {
    on(callback) {
      set.add(callback);
      return () => set.delete(callback);
    },
    emit(...args) {
      for (const callback of [...set]) callback(...args);
    }
  };
}
class WebRtcEngine {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  sender = null;
  starting = null;
  identity = null;
  sending = null;
  receiving = null;
  pending = /* @__PURE__ */ new Map();
  ports = /* @__PURE__ */ new Map();
  captureTarget = null;
  nextPairing = 0;
  pairRequested = listeners();
  pairCancelled = listeners();
  clientConnected = listeners();
  clientDisconnected = listeners();
  streamEnded = listeners();
  /** A tela que a janela de envio captura (a do monitor virtual, quando há); null: a principal. */
  target() {
    return this.captureTarget;
  }
  log(...parts) {
    this.deps.log?.(...parts);
  }
  hello(identity) {
    return {
      t: "hello",
      v: PROTOCOL_VERSION,
      id: identity.id,
      name: this.deps.deviceName(),
      kind: this.deps.kind(),
      fp: identity.fp,
      screen: this.deps.screenSize()
    };
  }
  async ownIdentity() {
    this.identity ??= await this.deps.windows.identity();
    return this.identity;
  }
  // ---------- quem envia ----------
  async prepare(onStep, _settings, onProgress) {
    onStep("engine");
    onProgress?.({ note: "Abrindo o motor de transmissão", fraction: 0.2 });
    const identity = await this.ownIdentity();
    onProgress?.({ note: "Conferindo o firewall", fraction: 0.35 });
    await this.deps.prepareSystem?.();
    onStep("display");
    onProgress?.({ note: "Preparando a tela estendida", fraction: 0.5 });
    onStep("encoder");
    onProgress?.({ note: "Esperando conexão", fraction: 0.9 });
    const sender = await this.listen(identity);
    this.deps.presence.setSending({ port: sender.port, id: identity.id, fp: identity.fp });
  }
  listen(identity) {
    if (this.sender) return Promise.resolve(this.sender);
    this.starting ??= startSender({
      ...this.deps.signaling,
      hello: () => this.hello(identity),
      approve: (peer, address, cancelled) => this.ask(peer, address, cancelled),
      media: (peer) => this.sendMedia(peer),
      onSession: (session) => this.onSending(session),
      onError: (error) => this.log("sinalização:", error.message)
    }).then(
      (sender) => {
        this.sender = sender;
        this.starting = null;
        return sender;
      },
      (error) => {
        this.starting = null;
        throw error;
      }
    );
    return this.starting;
  }
  /** Pergunta à pessoa (pelo núcleo) se este aparelho pode ver a tela. */
  ask(peer, address, cancelled) {
    const pairingId = `p${++this.nextPairing}`;
    return new Promise((resolve) => {
      this.pending.set(pairingId, resolve);
      void cancelled.then(() => {
        if (!this.pending.delete(pairingId)) return;
        this.pairCancelled.emit(pairingId);
      });
      this.pairRequested.emit({
        device: peer.name,
        pairingId,
        address,
        deviceId: peer.id,
        fingerprint: peer.fp,
        ...peer.screen ? { screen: peer.screen } : {}
      });
    });
  }
  sendMedia(peer) {
    const virtual = this.deps.virtualScreen;
    return this.deps.windows.sendMedia({
      beforeStart: async (want) => {
        if (!virtual) return;
        this.captureTarget = await virtual.ensure({
          width: want.width,
          height: want.height,
          fps: want.fps,
          ...want.scale !== void 0 ? { scale: want.scale } : {}
        });
        const placement = this.deps.placementFor?.(peer.fp);
        if (placement) await virtual.place?.(placement);
        return this.deps.frames ? { frames: this.deps.frames } : void 0;
      },
      afterStop: () => {
        this.captureTarget = null;
        void virtual?.release();
      },
      onError: (error) => {
        this.log("tela estendida:", error.message);
        this.sending?.end("error");
      },
      onInput: (raw) => this.input(raw)
    });
  }
  onSending(session) {
    this.sending = session;
    session.onEnded(() => {
      if (this.sending !== session) return;
      this.sending = null;
      this.clientDisconnected.emit();
    });
    this.clientConnected.emit(session.peer.name, {
      fingerprint: session.peer.fp,
      ...session.peer.screen ? { screen: session.peer.screen } : {}
    });
  }
  async approve(request) {
    const resolve = this.pending.get(request.pairingId);
    if (!resolve) throw new Error("Esse pedido não está mais esperando resposta.");
    this.pending.delete(request.pairingId);
    resolve(true);
  }
  async deny(pairingId) {
    const resolve = this.pending.get(pairingId);
    this.pending.delete(pairingId);
    resolve?.(false);
  }
  async stopSending() {
    const session = this.sending;
    this.sending = null;
    session?.end("user");
  }
  /** Porta em que este aparelho espera conexão (para a página do navegador); null se não está esperando. */
  signalingPort() {
    return this.sender?.port ?? null;
  }
  async abort() {
    for (const resolve of this.pending.values()) resolve(false);
    this.pending.clear();
    this.deps.presence.setSending(null);
    await this.stopSending();
    const sender = this.sender ?? await this.starting?.catch(() => null);
    this.sender = null;
    await sender?.stop();
  }
  // ---------- quem mostra ----------
  async listHosts() {
    const hosts = await this.deps.presence.hosts();
    for (const host of hosts) this.ports.set(host.address, host.port);
    return hosts.map((host) => ({ name: host.name, address: host.address, kind: host.kind }));
  }
  async connect(host, settings) {
    await this.disconnect();
    const identity = await this.ownIdentity();
    const window = await this.deps.windows.openReceiver();
    const abort = new AbortController();
    const current = { session: null, window, abort };
    this.receiving = current;
    window.onQuit(() => {
      if (this.receiving !== current) return;
      void this.disconnect().then(() => this.streamEnded.emit());
    });
    const want = {
      t: "want",
      width: window.size.width,
      height: window.size.height,
      fps: settings.fps,
      bitrate: settings.bitrate,
      codecs: window.codecs,
      ...window.scale && window.scale > 1 ? { scale: window.scale } : {}
    };
    try {
      const session = await connect({
        ...this.deps.signaling,
        host,
        port: this.ports.get(host) ?? SIGNALING_PORT,
        hello: this.hello(identity),
        want,
        media: () => window.media(),
        signal: abort.signal
      });
      if (this.receiving !== current) {
        session.end("user");
        return;
      }
      current.session = session;
      session.onEnded(() => {
        if (this.receiving !== current) return;
        this.receiving = null;
        window.close();
        this.streamEnded.emit();
      });
    } catch (error) {
      if (this.receiving === current) {
        this.receiving = null;
        window.close();
      }
      throw error;
    }
  }
  async disconnect() {
    const current = this.receiving;
    if (!current) return;
    this.receiving = null;
    current.abort.abort();
    current.session?.end("user");
    current.window.close();
  }
  async applyBitrate(mbps) {
    this.receiving?.session?.send({ t: "bitrate", mbps });
  }
  onPairRequest(callback) {
    return this.pairRequested.on(callback);
  }
  onPairCancelled(callback) {
    return this.pairCancelled.on(callback);
  }
  onClientConnected(callback) {
    return this.clientConnected.on(callback);
  }
  /**
   * Entrada de quem mostra (mouse, teclado, toque): só com uma sessão aprovada em andamento, e só o que passa pela
   * conferência do protocolo vira comando para a tela estendida.
   */
  input(raw) {
    if (!this.sending) return;
    const event = parseInput(raw);
    if (event) this.deps.virtualScreen?.input?.(helperCommand(event));
  }
  /** Muda na hora a posição da tela de quem está conectado. */
  async placeScreen(placement) {
    if (this.sending) await this.deps.virtualScreen?.place?.(placement);
  }
  onClientDisconnected(callback) {
    return this.clientDisconnected.on(callback);
  }
  onStreamEnded(callback) {
    return this.streamEnded.on(callback);
  }
}
const log = (...parts) => console.log("[motor]", ...parts);
async function linuxFirewall() {
  const marker = node_path.join(electron.app.getPath("userData"), "firewall-motor-v1");
  const result = await ensureMotorFirewall({
    readConfig: () => promises.readFile("/etc/ufw/ufw.conf", "utf8").catch(() => null),
    marked: async () => node_fs.existsSync(marker),
    mark: () => promises.writeFile(marker, ""),
    runPrivileged: (script) => new Promise(
      (resolve, reject) => node_child_process.execFile(
        "pkexec",
        ["sh", "-c", script],
        { timeout: 3e5 },
        (error) => error ? reject(error) : resolve()
      )
    )
  });
  if (result === "opened") log("firewall liberado para a conexão");
}
function appWindows() {
  let sender = null;
  const sendWindow = () => {
    if (sender && !sender.window.isDestroyed()) return sender;
    const window = motorWindow(
      { role: "send", synthetic: false, testFrames: null, showStats: false },
      { show: false, width: 320, height: 200 }
    );
    sender = { window, reports: listenReports(window.webContents, () => void 0) };
    return sender;
  };
  return {
    identity: () => sendWindow().reports.identity(),
    sendMedia: (hooks) => windowMedia(sendWindow().window, hooks),
    async openReceiver() {
      const display = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint());
      const window = motorWindow(
        { role: "receive", synthetic: false, testFrames: null, showStats: false },
        { ...display.bounds, fullscreen: true, frame: false, show: true }
      );
      const quitListeners = [];
      const reports = listenReports(window.webContents, (report) => {
        if (report.type === "quit") quitListeners.forEach((quit) => quit());
      });
      const blocker = electron.powerSaveBlocker.start("prevent-display-sleep");
      let closing = false;
      window.on("closed", () => {
        electron.powerSaveBlocker.stop(blocker);
        if (!closing) quitListeners.forEach((quit) => quit());
      });
      const codecs = await reports.codecs();
      return {
        codecs,
        size: {
          width: Math.round(display.size.width * display.scaleFactor),
          height: Math.round(display.size.height * display.scaleFactor)
        },
        scale: display.scaleFactor,
        media: () => windowMedia(window),
        onQuit: (callback) => quitListeners.push(callback),
        close: () => {
          closing = true;
          if (!window.isDestroyed()) window.close();
        }
      };
    }
  };
}
function createAppWebRtcEngine(deps) {
  const frames = gnomeFrames() ? framesSocket() : null;
  const gnome = process.platform === "linux" && /gnome/i.test(process.env.XDG_CURRENT_DESKTOP ?? "");
  const virtualScreen = gnome ? createLinuxVirtualScreen(frames) : null;
  const engine = new WebRtcEngine({
    windows: appWindows(),
    presence: {
      setSending: (info) => deps.presence.setSending(info),
      hosts: () => deps.presence.senders()
    },
    virtualScreen,
    frames,
    deviceName: deps.deviceName,
    kind: deps.kind,
    placementFor: deps.placementFor,
    screenSize: primarySize,
    ...process.platform === "linux" ? { prepareSystem: linuxFirewall } : {},
    log
  });
  handleCaptureRequests(() => engine.target());
  return engine;
}
const INTEL = "0x8086";
const AMD = "0x1002";
const PACKAGES$1 = {
  intel: {
    debian: "intel-media-va-driver",
    fedora: "intel-media-driver",
    arch: "intel-media-driver",
    suse: "intel-media-driver"
  },
  amd: {
    debian: "mesa-va-drivers",
    fedora: "mesa-va-drivers",
    arch: "libva-mesa-driver",
    suse: "libva-mesa-driver"
  }
};
const INSTALL$1 = {
  debian: (pkg) => `sudo apt install -y ${pkg}`,
  fedora: (pkg) => `sudo dnf install -y ${pkg}`,
  arch: (pkg) => `sudo pacman -S --needed ${pkg}`,
  suse: (pkg) => `sudo zypper install ${pkg}`
};
function family(os) {
  const ids = [os.id, ...os.like].map((id) => id.toLowerCase());
  if (ids.some((id) => ["debian", "ubuntu", "linuxmint", "pop"].includes(id))) return "debian";
  if (ids.some((id) => ["fedora", "rhel", "centos"].includes(id))) return "fedora";
  if (ids.some((id) => ["arch", "manjaro", "endeavouros"].includes(id))) return "arch";
  if (ids.some((id) => id.includes("suse"))) return "suse";
  return null;
}
function videoDriverHint(facts) {
  const vendors = new Set(facts.vendors.map((v) => v.trim().toLowerCase()));
  const has = (...names) => names.some((name2) => facts.drivers.includes(name2));
  const brand = vendors.has(INTEL) ? has("iHD_drv_video.so", "i965_drv_video.so") ? null : "intel" : vendors.has(AMD) ? has("radeonsi_drv_video.so") ? null : "amd" : null;
  if (!brand) return null;
  const fam = family(facts.os);
  const pkg = fam ? PACKAGES$1[brand][fam] : null;
  const name = brand === "intel" ? "Intel" : "AMD";
  return {
    message: `Falta o driver de vídeo da placa ${name}. Sem ele, a imagem pode atrasar mais de 1 segundo.` + (pkg ? ` Instale o pacote ${pkg} e abra o Horizonte de novo.` : ""),
    command: fam && pkg ? INSTALL$1[fam](pkg) : null
  };
}
function parseOsRelease(text) {
  const value = (key) => new RegExp(`^${key}=(.*)$`, "m").exec(text)?.[1]?.replace(/^["']|["']$/g, "") ?? "";
  return { id: value("ID"), like: value("ID_LIKE").split(/\s+/).filter(Boolean) };
}
const DRIVER_DIRS = [
  "/usr/lib/x86_64-linux-gnu/dri",
  "/usr/lib/aarch64-linux-gnu/dri",
  "/usr/lib64/dri",
  "/usr/lib/dri"
];
function composeEngine(server, client) {
  return {
    prepare: (onStep, settings, onProgress) => server.prepare(onStep, settings, onProgress),
    abort: () => server.abort(),
    approve: (request) => server.approve(request),
    deny: (pairingId) => server.deny(pairingId),
    stopSending: () => server.stopSending(),
    applyBitrate: async (mbps) => {
      await Promise.allSettled([server.applyBitrate(mbps), client.applyBitrate(mbps)]);
    },
    placeDisplay: async (side) => {
      await server.placeDisplay?.(side);
    },
    onPairRequest: (callback) => server.onPairRequest(callback),
    onPairCancelled: (callback) => server.onPairCancelled(callback),
    onClientConnected: (callback) => server.onClientConnected(callback),
    onClientDisconnected: (callback) => server.onClientDisconnected(callback),
    listHosts: () => client.listHosts(),
    connect: (host, settings) => client.connect(host, settings),
    disconnect: () => client.disconnect(),
    onStreamEnded: (callback) => client.onStreamEnded(callback)
  };
}
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
function toNumber(ip) {
  return ip.split(".").reduce((total, part) => total * 256 + Number(part), 0);
}
function sameNetwork(a, b, netmask) {
  const mask = toNumber(netmask);
  return (toNumber(a) & mask) === (toNumber(b) & mask);
}
function createDiscovery(deps) {
  return {
    listHosts: () => new Promise((resolve) => {
      const own = new Set(deps.ownAddresses());
      const networks = deps.localNetworks?.() ?? [];
      const found = /* @__PURE__ */ new Map();
      const interfaces = [...new Set(networks.map((n) => n.address))].filter(
        (address) => IPV4.test(address) && !address.startsWith("127.") && !address.startsWith("169.254.")
      );
      const browsers = (interfaces.length ? interfaces : [void 0]).flatMap((address) => {
        try {
          return [deps.find(address)];
        } catch {
          return [];
        }
      });
      for (const browser of browsers)
        browser.on("up", (service) => {
          const candidates = [
            ...service.addresses ?? [],
            service.referer?.address ?? ""
          ].filter((a) => IPV4.test(a) && !own.has(a));
          const address = candidates.find((a) => networks.some((n) => sameNetwork(a, n.address, n.netmask))) ?? candidates[0];
          if (!address) return;
          found.set(address, { name: service.name, address });
        });
      setTimeout(() => {
        for (const browser of browsers) browser.stop();
        resolve([...found.values()].sort((a, b) => a.name.localeCompare(b.name)));
      }, deps.listenMs ?? 1500);
    })
  };
}
const ownAddresses = () => new Set(
  Object.values(node_os.networkInterfaces()).flat().map((info) => info?.address ?? "")
);
const lanInterfaces = () => Object.values(node_os.networkInterfaces()).flat().flatMap((info) => info && info.family === "IPv4" && !info.internal ? [info.address] : []);
function safeBonjour(interfaceAddress) {
  const options = { port: 5353, bind: "0.0.0.0", interface: interfaceAddress };
  const report = (error) => console.warn(`[rede local] ${interfaceAddress ?? "padrão"}: ${error.message}`);
  const bonjour = new bonjourService.Bonjour(options, report);
  const mdns = bonjour.server?.mdns;
  mdns?.on("error", report);
  mdns?.on("warning", report);
  return bonjour;
}
const perInterface = () => lanInterfaces().map(safeBonjour);
async function browseService(type) {
  const own = ownAddresses();
  const found = /* @__PURE__ */ new Map();
  const instances = perInterface();
  const browsers = instances.map(
    (bonjour) => bonjour.find({ type }, (service) => {
      const address = [service.referer?.address ?? "", ...service.addresses ?? []].find(
        (candidate) => /^\d+\.\d+\.\d+\.\d+$/.test(candidate) && !own.has(candidate)
      );
      if (!address) return;
      const txt = Object.fromEntries(
        Object.entries(service.txt ?? {}).map(([key, value]) => [
          key,
          String(value)
        ])
      );
      found.set(address, { name: service.name, address, txt });
    })
  );
  await new Promise((resolve) => setTimeout(resolve, 1500));
  browsers.forEach((browser) => browser.stop());
  instances.forEach((bonjour) => bonjour.destroy());
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function advertiseService(name, type, port, txt) {
  const instances = perInterface();
  const services = instances.map(
    (bonjour) => (
      // Sem sondagem: os anúncios das outras interfaces deste PC contariam como "nome já em uso".
      bonjour.publish({ name, type, port, probe: false, txt })
    )
  );
  return () => {
    services.forEach((service) => service.stop?.());
    instances.forEach((bonjour) => bonjour.destroy());
  };
}
const MAX_TOTAL_BYTES = 2 * 1024 ** 3;
function createFileClipboard(deps) {
  let peers = [];
  let unwatch = null;
  let offered = /* @__PURE__ */ new Map();
  let placedByUs = "";
  async function onCopied(paths) {
    const key = paths.join("\n");
    if (peers.length === 0 || paths.length === 0 || key === placedByUs) return;
    const files = [];
    const next = /* @__PURE__ */ new Map();
    let total = 0;
    for (const path2 of paths) {
      const size = await deps.sizeOf(path2);
      if (size === null) continue;
      total += size;
      if (total > MAX_TOTAL_BYTES) return;
      const id = node_crypto.randomUUID();
      next.set(id, path2);
      files.push({ id, name: deps.baseName(path2), size });
    }
    if (files.length === 0) return;
    offered = next;
    await Promise.all(peers.map((to) => deps.offer(to, files).catch(() => void 0)));
  }
  return {
    start(peerAddresses) {
      peers = [...peerAddresses];
      unwatch?.();
      unwatch = deps.watch((paths) => void onCopied(paths));
    },
    stop() {
      peers = [];
      unwatch?.();
      unwatch = null;
      offered = /* @__PURE__ */ new Map();
    },
    served(id, from) {
      return peers.includes(from) ? offered.get(id) ?? null : null;
    },
    async receive(files, from) {
      if (!peers.includes(from) || files.length === 0) return;
      const inbox = await deps.newInbox();
      const paths = [];
      for (const file of files) {
        const safe = [...deps.baseName(file.name)].map((char) => char < " " || '<>:"/\\|?*'.includes(char) ? "_" : char).join("") || "arquivo";
        const dest = deps.join(inbox, safe);
        await deps.download(from, file, dest);
        paths.push(dest);
      }
      placedByUs = paths.join("\n");
      await deps.setClipboard(paths);
    }
  };
}
const LINUX_TEXT_SCRIPT = String.raw`
import os, sys, json, select, gi
gi.require_version('Gio', '2.0')
from gi.repository import Gio, GLib
bus = Gio.bus_get_sync(Gio.BusType.SESSION)
RD = 'org.gnome.Mutter.RemoteDesktop'
S = RD + '.Session'
TEXT = ['text/plain;charset=utf-8', 'UTF8_STRING', 'text/plain']
LIMIT = int(sys.argv[1])

def call(path, iface, method, args=None, rtype=None):
    return bus.call_with_unix_fd_list_sync(RD, path, iface, method, args, rtype, 0, 5000, None, None)

session = call('/org/gnome/Mutter/RemoteDesktop', RD, 'CreateSession', None, GLib.VariantType('(o)'))[0].unpack()[0]
call(session, S, 'EnableClipboard', GLib.Variant('(a{sv})', ({},)))
call(session, S, 'Start')

def read(mime):
    try:
        res, fds = call(session, S, 'SelectionRead', GLib.Variant('(s)', (mime,)), GLib.VariantType('(h)'))
        fd = fds.get(res.unpack()[0])
        data = b''
        while len(data) <= LIMIT * 4:
            ready, _, _ = select.select([fd], [], [], 3)
            if not ready: break
            chunk = os.read(fd, 65536)
            if not chunk: break
            data += chunk
        os.close(fd)
        text = data.decode('utf-8', 'replace')
        if text and len(text) <= LIMIT: print(json.dumps({'text': text}), flush=True)
    except Exception as error:
        print(error, file=sys.stderr, flush=True)

def changed(conn, sender, path, iface, signal, params):
    opts = params.unpack()[0]
    if opts.get('session-is-owner'): return
    # Vem como uma tupla com a lista dentro: (['text/plain', ...],)
    mimes = opts.get('mime-types') or ([],)
    mimes = mimes[0] if isinstance(mimes, tuple) else mimes
    mime = next((m for m in TEXT if m in mimes), None)
    # Ler dentro do próprio aviso trava: o Mutter ainda está trocando de dono.
    if mime: GLib.timeout_add(50, lambda: (read(mime), False)[1])

bus.signal_subscribe(RD, S, 'SelectionOwnerChanged', session, None, 0, changed)
loop = GLib.MainLoop()
GLib.io_add_watch(GLib.IOChannel.unix_new(0), GLib.PRIORITY_DEFAULT, GLib.IO_IN | GLib.IO_HUP, lambda *_: (loop.quit(), False)[1])
loop.run()
`;
const DESKFLOW_PORT = 24800;
const EDGE = { left: "left", right: "right", above: "up", below: "down" };
const OPPOSITE = {
  left: "right",
  right: "left",
  above: "down",
  below: "up"
};
function computerName(name) {
  const clean = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
  return clean || "Horizonte";
}
const horizontal = (side) => side === "above" || side === "below";
function edgeRanges(side, own, peer, offset) {
  const ownEdge = horizontal(side) ? own.width : own.height;
  const peerEdge = horizontal(side) ? peer.width : peer.height;
  const centered = (ownEdge - peerEdge) / 2;
  const minimum = Math.min(ownEdge, peerEdge) * 0.05;
  const start = Math.min(
    Math.max(offset === void 0 ? centered : offset * ownEdge, minimum - peerEdge),
    ownEdge - minimum
  );
  const from = Math.max(0, start);
  const to = Math.min(ownEdge, start + peerEdge);
  const pct = (value, edge) => Math.min(100, Math.max(0, Math.round(value / edge * 100)));
  return {
    own: [pct(from, ownEdge), pct(to, ownEdge)],
    peer: [pct(from - start, peerEdge), pct(to - start, peerEdge)]
  };
}
const range = ([from, to]) => from === 0 && to === 100 ? "" : `(${from},${to})`;
function linksConfig(server, links) {
  const full = { own: [0, 100], peer: [0, 100] };
  const lines = ["section: links", `	${server}:`];
  for (const { name, side, ranges = full } of links)
    lines.push(`		${EDGE[side]}${range(ranges.own)} = ${name}${range(ranges.peer)}`);
  for (const { name, side, ranges = full } of links)
    lines.push(
      `	${name}:`,
      `		${OPPOSITE[side]}${range(ranges.peer)} = ${server}${range(ranges.own)}`
    );
  lines.push("end", "");
  return lines.join("\n");
}
function deskflowSettings(input) {
  const lines = [
    "[core]",
    `coreMode=${input.role === "server" ? 2 : 1}`,
    `computerName=${computerName(input.name)}`,
    `port=${DESKFLOW_PORT}`,
    "enableUpdateCheck=false"
  ];
  if (input.role === "server") {
    lines.push(
      "[server]",
      "externalConfig=true",
      `externalConfigFile=${input.linksFile.replace(/\\/g, "/")}`,
      "enableClipboard=true"
    );
    for (const name of [input.name, ...input.peerNames].map(computerName))
      lines.push(`[computer_${name}]`, `name=${name}`);
  } else {
    lines.push("[client]", `remoteHost=${input.serverAddress}`);
  }
  lines.push("[security]", "tlsEnabled=false", "checkPeerFingerprints=false", "");
  return lines.join("\n");
}
const MOUSE_CHANNEL_PORT = 47901;
const MAX_TEXT_CHARS = 2e5;
const normalize = (address) => address.replace(/^::ffff:/i, "");
function createMouseEngine(deps) {
  let unadvertise = null;
  let pending = null;
  let pendingAs = "";
  const peers = /* @__PURE__ */ new Map();
  let serving = null;
  const screens = /* @__PURE__ */ new Map();
  const requestListeners = /* @__PURE__ */ new Set();
  const endedListeners = /* @__PURE__ */ new Set();
  function linksFor(placements) {
    const own = deps.ownScreen?.();
    return placements.map(({ host, side, offset }) => {
      const screen = host.screen ?? screens.get(host.address);
      return {
        name: host.name,
        side,
        ...own ? { ranges: edgeRanges(side, own, screen ?? own, offset) } : {}
      };
    });
  }
  function startClipboards() {
    const addresses = [...peers.keys()];
    deps.files?.start(addresses);
    deps.text?.start((text) => {
      if (text.length > MAX_TEXT_CHARS) return;
      for (const address of peers.keys())
        void deps.channel.send(address, "/mouse/text", { text }).catch(() => void 0);
    });
  }
  function stopClipboards() {
    deps.files?.stop();
    deps.text?.stop();
  }
  const notifyEnded = () => {
    for (const listener of [...endedListeners]) listener();
  };
  async function finish(tell) {
    deps.share.stop();
    stopClipboards();
    const others = [...peers.keys()];
    peers.clear();
    serving = null;
    if (tell)
      await Promise.all(
        others.map((address) => deps.channel.send(address, "/mouse/end", {}).catch(() => void 0))
      );
  }
  async function leave(address) {
    if (!serving) return;
    peers.delete(address);
    serving.placements = serving.placements.filter((p) => p.host.address !== address);
    if (serving.placements.length === 0) {
      await finish(false);
      notifyEnded();
      return;
    }
    await deps.share.share({ name: serving.name, links: linksFor(serving.placements) });
    startClipboards();
  }
  function onMessage(path2, body, from) {
    const address = normalize(from);
    if (path2 === "/mouse/request") {
      const device = typeof body === "object" && body !== null ? cleanName(String(body.device ?? "")) : "";
      if (!device) return false;
      pending = { name: device, address };
      pendingAs = cleanName(String(body.as ?? ""));
      for (const listener of [...requestListeners]) listener({ device, address });
      return true;
    }
    if (path2 === "/mouse/files") {
      const list = typeof body === "object" && body !== null ? body.files : null;
      const files = Array.isArray(list) ? list.filter(
        (file) => typeof file === "object" && file !== null && typeof file.id === "string" && typeof file.name === "string" && Number.isFinite(file.size)
      ) : [];
      if (files.length === 0 || !peers.has(address)) return false;
      void deps.files?.receive(files, address).catch(() => void 0);
      return true;
    }
    if (path2 === "/mouse/text") {
      const text = typeof body === "object" && body !== null ? body.text : null;
      if (typeof text !== "string" || text.length > MAX_TEXT_CHARS || !peers.has(address))
        return false;
      deps.text?.write(text);
      return true;
    }
    if (path2 === "/mouse/end") {
      if (serving && peers.has(address)) {
        void leave(address).catch(() => void 0);
      } else if (peers.has(address) || pending?.address === address) {
        pending = null;
        void finish(false).then(notifyEnded);
      }
      return true;
    }
    return false;
  }
  deps.share.onEnded(() => {
    void finish(true).then(notifyEnded);
  });
  return {
    async start(name) {
      await deps.channel.listen(onMessage, (path2, from) => {
        const id = /^\/mouse\/file\/([\w-]+)$/.exec(path2)?.[1];
        return id ? deps.files?.served(id, normalize(from)) ?? null : null;
      });
      unadvertise?.();
      unadvertise = deps.advertise(name);
    },
    async stop() {
      await finish(true);
      pending = null;
      unadvertise?.();
      unadvertise = null;
      await deps.channel.close();
    },
    async listPeers() {
      const found = await deps.browse();
      for (const host of found) if (host.screen) screens.set(host.address, host.screen);
      return found;
    },
    async share(placements, ownName) {
      if (placements.length === 0) throw new Error("Arraste um computador para perto deste.");
      await deps.share.share({ name: ownName, links: linksFor(placements) });
      serving = { name: ownName, placements: [...placements] };
      for (const { host } of placements) peers.set(host.address, host);
      startClipboards();
      const answers = await Promise.all(
        placements.map(
          ({ host }) => deps.channel.send(host.address, "/mouse/request", { device: ownName, as: host.name }).then(() => true).catch(() => false)
        )
      );
      const silent = placements.filter((_, index) => !answers[index]);
      if (silent.length === placements.length) {
        await finish(false);
        throw new Error(
          silent.length === 1 ? "O outro computador não respondeu. Confira se o Horizonte está aberto no modo Mouse lá." : "Nenhum computador respondeu. Confira se o Horizonte está aberto no modo Mouse neles."
        );
      }
      for (const { host } of silent) await leave(host.address);
    },
    async accept(ownName) {
      const other = pending;
      if (!other) throw new Error("O pedido já não está mais valendo.");
      pending = null;
      peers.clear();
      peers.set(other.address, other);
      startClipboards();
      await deps.share.follow({ name: pendingAs || ownName, serverAddress: other.address });
    },
    async deny() {
      const other = pending;
      pending = null;
      if (other) await deps.channel.send(other.address, "/mouse/end", {}).catch(() => void 0);
    },
    async setLayout(placements) {
      if (!serving) return;
      const current = serving.placements.map(
        (p) => placements.find((next) => next.host.address === p.host.address) ?? p
      );
      serving.placements = current;
      await deps.share.share({ name: serving.name, links: linksFor(current) });
    },
    end: () => finish(true),
    onRequest(callback) {
      requestListeners.add(callback);
      return () => requestListeners.delete(callback);
    },
    onEnded(callback) {
      endedListeners.add(callback);
      return () => endedListeners.delete(callback);
    }
  };
}
function createMouseShare(deps) {
  let current = null;
  const ended = /* @__PURE__ */ new Set();
  async function run2(mode, settings) {
    stopCurrent();
    const file = deps.join(deps.dir, `${mode}.conf`);
    await deps.writeFile(file, settings);
    const { command, prefix } = await deps.command();
    const child = await deps.spawn(command, [...prefix, mode, "--new-instance", "-s", file]);
    current = child;
    child.onExit(() => {
      if (current !== child) return;
      current = null;
      for (const listener of [...ended]) listener();
    });
  }
  function stopCurrent() {
    const child = current;
    current = null;
    child?.kill();
  }
  return {
    async share({ name, links }) {
      const linksFile = deps.join(deps.dir, "links.conf");
      await deps.writeFile(
        linksFile,
        linksConfig(
          computerName(name),
          links.map((link) => ({ ...link, name: computerName(link.name) }))
        )
      );
      const peerNames = links.map((link) => link.name);
      await run2("server", deskflowSettings({ role: "server", name, peerNames, linksFile }));
    },
    async follow({ name, serverAddress }) {
      await run2("client", deskflowSettings({ role: "client", name, serverAddress }));
    },
    stop: stopCurrent,
    onEnded(listener) {
      ended.add(listener);
      return () => ended.delete(listener);
    }
  };
}
class DownloadError extends Error {
  constructor(kind, message, options) {
    super(message, options);
    this.kind = kind;
    this.name = "DownloadError";
  }
  kind;
}
async function downloadVerified(artifact, dest, onProgress, signal, stallTimeoutMs = 3e4) {
  const part = `${dest}.part`;
  const stalled = new AbortController();
  const combined = signal ? AbortSignal.any([signal, stalled.signal]) : stalled.signal;
  let timer;
  const keepAlive = () => {
    clearTimeout(timer);
    timer = setTimeout(() => stalled.abort(), stallTimeoutMs);
  };
  keepAlive();
  try {
    const response = await fetch(artifact.url, { signal: combined });
    keepAlive();
    if (!response.ok || response.body === null) {
      throw new DownloadError(
        "network",
        `O servidor recusou o download (código ${response.status}).`
      );
    }
    const total = Number(response.headers.get("content-length")) || 0;
    const hash = node_crypto.createHash("sha256");
    let received = 0;
    const measure = new node_stream.Transform({
      transform(chunk, _encoding, done) {
        keepAlive();
        hash.update(chunk);
        received += chunk.length;
        if (total > 0) onProgress?.(Math.min(received / total, 1));
        done(null, chunk);
      }
    });
    await promises$1.pipeline(
      node_stream.Readable.fromWeb(response.body),
      measure,
      node_fs.createWriteStream(part),
      { signal: combined }
    );
    if (hash.digest("hex") !== artifact.sha256.toLowerCase()) {
      throw new DownloadError(
        "hash",
        "O arquivo baixado não passou na conferência de integridade, então não vou usá-lo."
      );
    }
    await promises.rename(part, dest);
    onProgress?.(1);
  } catch (cause) {
    await promises.rm(part, { force: true });
    if (cause instanceof DownloadError) throw cause;
    if (signal?.aborted) throw new DownloadError("cancelled", "Download cancelado.", { cause });
    if (stalled.signal.aborted) {
      throw new DownloadError(
        "network",
        "O download parou de responder. Confira a conexão e tente de novo.",
        { cause }
      );
    }
    throw new DownloadError(
      "network",
      "Não consegui baixar. Confira a conexão com a internet e tente de novo.",
      { cause }
    );
  } finally {
    clearTimeout(timer);
  }
}
const FLATPAK_APP = "org.deskflow.deskflow";
const flatpak = (configDir) => ({
  command: "flatpak",
  prefix: ["run", `--filesystem=${configDir}`, "--command=deskflow-core", FLATPAK_APP]
});
const NATIVE = { command: "deskflow-core", prefix: [] };
const q = (value) => `'${value.replace(/'/g, `'\\''`)}'`;
const INSTALL = {
  deb: 'DEBIAN_FRONTEND=noninteractive apt-get install -y "$stage/$pkg"',
  "rpm-dnf": 'dnf install -y --nogpgcheck "$stage/$pkg"',
  "rpm-zypper": 'zypper --non-interactive install --allow-unsigned-rpm "$stage/$pkg"',
  pacman: 'pacman -U --noconfirm "$stage/$pkg"'
};
const INSTALL_FLATPAK = [
  "set -e",
  "if command -v apt-get >/dev/null; then DEBIAN_FRONTEND=noninteractive apt-get install -y flatpak",
  "elif command -v dnf >/dev/null; then dnf install -y flatpak",
  "elif command -v zypper >/dev/null; then zypper --non-interactive install flatpak",
  "elif command -v pacman >/dev/null; then pacman -S --noconfirm flatpak",
  'else echo "Não sei instalar o Flatpak nesta distribuição." >&2; exit 1; fi'
].join("\n");
async function ensureDeskflowLinux(deps) {
  if (await deps.has("deskflow-core")) return NATIVE;
  if (await deps.has("flatpak") && await deps.flatpakHasApp()) return flatpak(deps.configDir);
  const pkg = deps.pkg();
  const file = `${deps.workDir}/${pkg.fileName}`;
  await deps.download(pkg, file);
  if (pkg.kind !== "flatpak") {
    await deps.runPrivileged(
      [
        "set -e",
        "stage=/var/lib/horizonte/stage",
        `pkg=${q(pkg.fileName)}`,
        'mkdir -p "$stage"',
        `install -m 600 ${q(file)} "$stage/$pkg"`,
        `echo ${q(`${pkg.sha256}  `)}"$stage/$pkg" | sha256sum -c - >/dev/null`,
        INSTALL[pkg.kind],
        'rm -f "$stage/$pkg"'
      ].join("\n")
    );
    return NATIVE;
  }
  if (!await deps.has("flatpak")) await deps.runPrivileged(INSTALL_FLATPAK);
  await deps.runUser(
    [
      "set -e",
      "flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo",
      `flatpak install --user -y --noninteractive ${q(file)}`
    ].join("\n")
  );
  return flatpak(deps.configDir);
}
const VERSION$1 = "1.27.0";
const base$2 = `https://github.com/deskflow/deskflow/releases/download/v${VERSION$1}`;
const pin$1 = (fileName, sha256) => ({
  version: VERSION$1,
  fileName,
  url: `${base$2}/${fileName}`,
  sha256
});
const DESKFLOW_WINDOWS = pin$1(
  `deskflow-${VERSION$1}-win-x64-portable.zip`,
  "8d19004cc3625623489d96580c1b58fd13ee78185689907fd4478595f93fab9a"
);
const linux = (kind, suffix, sha256) => ({
  kind,
  ...pin$1(`deskflow-${VERSION$1}-${suffix}`, sha256)
});
const PACKAGES = {
  ubuntu2604: linux(
    "deb",
    "ubuntu-resolute-x86_64.deb",
    "b8972871a0a1d9958968696bceafb28571ad50d17b2d35ae8149a95a28fd7fa3"
  ),
  ubuntu2610: linux(
    "deb",
    "ubuntu-stonking-x86_64.deb",
    "9922237b12cbeeafdb81f4a3cef6fb1609cd25ee1791f976e4938715babd67b5"
  ),
  debian13: linux(
    "deb",
    "debian-trixie-x86_64.deb",
    "1f7de2f1fbc68de410339dbdb11ed0e5439bd49bfbfbf66f4467def1c6bb5f96"
  ),
  debian14: linux(
    "deb",
    "debian-forky-x86_64.deb",
    "5d0777b490de392df72aba98cccc9b05b7079d2f05d37753930767b4d26f3485"
  ),
  fedora44: linux(
    "rpm-dnf",
    "fedora-44-x86_64.rpm",
    "71cdeec92e4351fced4cf907db5e936959a0923b2855284ca52d8cf1088205a9"
  ),
  fedora46: linux(
    "rpm-dnf",
    "fedora-46-x86_64.rpm",
    "dd1d4a8f8cc0752649d58d890c2bbe30d76b6c89bbd4ce747417af2aee9e0008"
  ),
  tumbleweed: linux(
    "rpm-zypper",
    "opensuse-tumbleweed-x86_64.rpm",
    "0e0c3996e068603e379586134f894fb3c44ec3b32ed1696a7fb75113ec7ac633"
  ),
  arch: linux(
    "pacman",
    "arch-x86_64.pkg.tar.zst",
    "0e07acfe1b1d2e65338ac6ee4d9c607566c7d71c4f88bce7a91b3e77b1a06252"
  ),
  flatpak: linux(
    "flatpak",
    "linux-x86_64.flatpak",
    "9fd7cac6a036f915c9c4775391c6bee0e04a8de9453bc27091499c2b0a19a5eb"
  )
};
function deskflowLinuxFor(osRelease, arch) {
  if (arch !== "x64")
    throw new Error("Por enquanto o Horizonte no Linux só instala em processador x64.");
  const field = (name) => new RegExp(`^${name}="?([^"\\n]*)"?$`, "m").exec(osRelease)?.[1] ?? "";
  const id = field("ID");
  const version = field("VERSION_ID");
  if (id === "ubuntu" && version === "26.04") return PACKAGES.ubuntu2604;
  if (id === "ubuntu" && version === "26.10") return PACKAGES.ubuntu2610;
  if (id === "debian" && version.startsWith("13")) return PACKAGES.debian13;
  if (id === "debian" && version.startsWith("14")) return PACKAGES.debian14;
  if (id === "fedora" && version === "44") return PACKAGES.fedora44;
  if (id === "fedora" && version === "46") return PACKAGES.fedora46;
  if (id === "opensuse-tumbleweed") return PACKAGES.tumbleweed;
  if (id === "arch") return PACKAGES.arch;
  return PACKAGES.flatpak;
}
const SERVICE_TYPE = "horizonte-mouse";
const MAX_BODY$1 = 2e6;
function createChannel() {
  let server = null;
  return {
    async listen(onMessage, serve) {
      if (server) return;
      const created = node_http.createServer((request, response) => {
        if (request.method === "GET") {
          const file = serve?.(request.url ?? "", request.socket.remoteAddress ?? "") ?? null;
          if (!file) return void response.writeHead(404).end();
          response.writeHead(200, { "Content-Type": "application/octet-stream" });
          return void node_fs.createReadStream(file).on("error", () => response.destroy()).pipe(response);
        }
        if (request.method !== "POST") return void response.writeHead(405).end();
        let raw = "";
        request.on("data", (chunk) => {
          raw += chunk.toString("utf8");
          if (raw.length > MAX_BODY$1) request.destroy();
        });
        request.on("end", () => {
          let body = null;
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch {
            return void response.writeHead(400).end();
          }
          const ok = onMessage(request.url ?? "", body, request.socket.remoteAddress ?? "");
          response.writeHead(ok ? 204 : 400).end();
        });
      });
      await new Promise((resolve, reject) => {
        created.once("error", reject);
        created.listen(MOUSE_CHANNEL_PORT, () => resolve());
      });
      server = created;
    },
    async close() {
      const current = server;
      server = null;
      if (current) await new Promise((resolve) => current.close(() => resolve()));
    },
    async send(address, path2, body) {
      const host = address.includes(":") ? `[${address}]` : address;
      const response = await fetch(`http://${host}:${MOUSE_CHANNEL_PORT}${path2}`, {
        method: "POST",
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5e3)
      });
      if (!response.ok) throw new Error(`o outro computador respondeu ${response.status}`);
    }
  };
}
async function browse() {
  const found = await browseService(SERVICE_TYPE);
  return found.map(({ name, address, txt }) => {
    const width = Number(txt.w);
    const height = Number(txt.h);
    const screen = width > 0 && height > 0 && width < 1e5 && height < 1e5 ? { width, height } : void 0;
    return {
      name,
      address,
      ...screen ? { screen } : {},
      ...isDeviceKind(txt.k) ? { kind: txt.k } : {}
    };
  });
}
function advertise(name, screen, kind) {
  return advertiseService(name, SERVICE_TYPE, MOUSE_CHANNEL_PORT, {
    w: String(screen.width),
    h: String(screen.height),
    k: kind
  });
}
const run = (command, args, timeout) => new Promise(
  (resolve, reject) => node_child_process.execFile(
    command,
    args,
    { timeout },
    (error, _out, stderr) => error ? reject(new Error(String(stderr).trim() || error.message)) : resolve()
  )
);
const succeeds$2 = (command, args) => new Promise((resolve) => node_child_process.execFile(command, args, { timeout: 15e3 }, (error) => resolve(!error)));
function deskflowCommand(deps) {
  return async () => {
    if (process.platform === "win32") {
      const into = node_path.join(deps.dir, DESKFLOW_WINDOWS.version);
      const find = () => {
        if (!node_fs.existsSync(into)) return null;
        for (const entry of node_fs.readdirSync(into)) {
          const exe2 = node_path.join(into, entry, "deskflow-core.exe");
          if (node_fs.existsSync(exe2)) return exe2;
        }
        return null;
      };
      let exe = find();
      if (!exe) {
        const zip = node_path.join(deps.dir, DESKFLOW_WINDOWS.fileName);
        await promises.mkdir(deps.dir, { recursive: true });
        await deps.download(zip);
        await deps.extract(zip, into);
        exe = find();
      }
      if (!exe) throw new Error("O pacote do Deskflow veio sem o deskflow-core.exe.");
      return { command: exe, prefix: [] };
    }
    return ensureDeskflowLinux({
      has: (command) => succeeds$2("sh", ["-c", `command -v ${command}`]),
      flatpakHasApp: () => succeeds$2("flatpak", ["info", FLATPAK_APP]),
      // Lido só na hora de instalar: o arquivo existe apenas no Linux.
      pkg: () => deskflowLinuxFor(node_fs.readFileSync("/etc/os-release", "utf8"), process.arch),
      download: (pkg, dest) => downloadVerified(pkg, dest),
      // O pkexec mostra o aviso de senha do sistema (polkit) uma única vez.
      runPrivileged: (script) => run("pkexec", ["sh", "-c", script], 6e5),
      runUser: (script) => run("sh", ["-c", script], 6e5),
      workDir: node_os.tmpdir(),
      configDir: deps.dir
    });
  };
}
const WATCH_SCRIPT = [
  "$last = ''",
  "while ($true) {",
  "  $files = ''",
  "  try { $files = @((Get-Clipboard -Format FileDropList -ErrorAction SilentlyContinue).FullName) -join '|' } catch { }",
  "  if ($files -ne $last) { [Console]::Out.WriteLine($files); [Console]::Out.Flush(); $last = $files }",
  "  Start-Sleep -Milliseconds 800",
  "}"
].join("\n");
function windowsClipboard(runPowerShell2) {
  if (process.platform !== "win32") {
    return { watch: () => () => void 0, setClipboard: async () => void 0 };
  }
  return {
    watch(onChange) {
      const child = node_child_process.spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-STA", "-Command", WATCH_SCRIPT],
        {
          stdio: ["ignore", "pipe", "ignore"],
          windowsHide: true
        }
      );
      let buffer = "";
      child.stdout.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        let line;
        while ((line = buffer.indexOf("\n")) >= 0) {
          const text = buffer.slice(0, line).trim();
          buffer = buffer.slice(line + 1);
          onChange(text ? text.split("|") : []);
        }
      });
      return () => void child.kill();
    },
    async setClipboard(paths) {
      const list = paths.map((path2) => `'${path2.replace(/'/g, "''")}'`).join(",");
      await runPowerShell2(`Set-Clipboard -Path ${list}`);
    }
  };
}
function textClipboard(deps) {
  if (process.platform !== "linux") {
    return {
      start: () => void 0,
      stop: () => void 0,
      // Igual ao que já está: não escreve de novo, senão o Deskflow manda de volta a cada troca de tela.
      write: (text) => void Promise.resolve(deps.readText()).then((current) => current !== text && deps.writeText(text)).catch(() => void 0)
    };
  }
  let child = null;
  return {
    start(onCopied) {
      child?.kill();
      const current = node_child_process.spawn("python3", ["-c", LINUX_TEXT_SCRIPT, String(MAX_TEXT_CHARS)], {
        stdio: ["pipe", "pipe", "ignore"]
      });
      current.on("error", () => void 0);
      let buffer = "";
      current.stdout?.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        let line;
        while ((line = buffer.indexOf("\n")) >= 0) {
          const raw = buffer.slice(0, line);
          buffer = buffer.slice(line + 1);
          try {
            const { text } = JSON.parse(raw);
            if (typeof text === "string") onCopied(text);
          } catch {
          }
        }
      });
      child = current;
    },
    stop() {
      child?.kill();
      child = null;
    },
    write: () => void 0
  };
}
function createRealMouseEngine(deps) {
  const dir = node_path.join(deps.userData, "deskflow");
  const share = createMouseShare({
    command: deskflowCommand({ dir, download: deps.download, extract: deps.extract }),
    dir,
    writeFile: async (path2, text2) => {
      await promises.mkdir(dir, { recursive: true });
      await promises.writeFile(path2, text2);
    },
    join: node_path.join,
    spawn: async (command, args) => {
      await promises.mkdir(dir, { recursive: true });
      const log2 = node_fs.createWriteStream(
        node_path.join(dir, `${args.includes("server") ? "server" : "client"}.log`)
      );
      const child = node_child_process.spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      child.stdout?.pipe(log2);
      child.stderr?.pipe(log2);
      await new Promise((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      return {
        kill: () => void child.kill(),
        onExit: (listener) => void child.once("exit", listener)
      };
    }
  });
  const channel = createChannel();
  const files = createFileClipboard({
    ...windowsClipboard(deps.runPowerShell),
    sizeOf: async (path2) => {
      const info = await promises.stat(path2).catch(() => null);
      return info?.isFile() ? info.size : null;
    },
    baseName: (path2) => node_path.basename(path2),
    newInbox: async () => {
      const inbox = node_path.join(dir, "recebidos", String(Date.now()));
      await promises.mkdir(inbox, { recursive: true });
      return inbox;
    },
    join: node_path.join,
    download: async (from, file, dest) => {
      const host = from.includes(":") ? `[${from}]` : from;
      const response = await fetch(`http://${host}:${MOUSE_CHANNEL_PORT}/mouse/file/${file.id}`);
      if (!response.ok || !response.body)
        throw new Error(`o outro computador respondeu ${response.status}`);
      await promises$1.pipeline(node_stream.Readable.fromWeb(response.body), node_fs.createWriteStream(dest));
      if ((await promises.stat(dest)).size !== file.size) {
        await promises.rm(dest, { force: true });
        throw new Error("O arquivo chegou incompleto.");
      }
    },
    offer: (to, offered) => channel.send(to, "/mouse/files", { files: offered })
  });
  const text = textClipboard(deps);
  return createMouseEngine({
    share,
    channel,
    advertise: (name) => advertise(name, deps.ownScreen(), deps.ownKind()),
    browse,
    files,
    text,
    ownScreen: deps.ownScreen
  });
}
const PRESENCE_TYPE = "horizonte";
const PRESENCE_PORT = 47900;
function createPresence(deps) {
  let unannounce = null;
  let current = null;
  let sending = null;
  const kinds = /* @__PURE__ */ new Map();
  const kindOf = (address, name) => (address ? kinds.get(address) : void 0) ?? guessKind(name);
  return {
    announce(name, kind) {
      unannounce?.();
      current = { name, kind };
      unannounce = sending ? deps.advertise(name, PRESENCE_TYPE, sending.port, {
        k: kind,
        v: String(PROTOCOL_VERSION),
        m: "send",
        p: String(sending.port),
        id: sending.id,
        fp: sending.fp.replace(/:/g, "").slice(0, 16)
      }) : deps.advertise(name, PRESENCE_TYPE, PRESENCE_PORT, { k: kind });
    },
    setSending(info) {
      sending = info;
      if (current) this.announce(current.name, current.kind);
    },
    async senders() {
      const found = await deps.browse(PRESENCE_TYPE);
      for (const { address, txt } of found) if (isDeviceKind(txt.k)) kinds.set(address, txt.k);
      return found.flatMap(({ name, address, txt }) => {
        const port = Number(txt.p);
        if (txt.m !== "send" || txt.v !== String(PROTOCOL_VERSION)) return [];
        if (!Number.isInteger(port) || port < 1 || port > 65535) return [];
        return [{ name, address, port, kind: kindOf(address, name) }];
      });
    },
    stop() {
      unannounce?.();
      unannounce = null;
      current = null;
    },
    async refresh() {
      for (const { address, txt } of await deps.browse(PRESENCE_TYPE))
        if (isDeviceKind(txt.k)) kinds.set(address, txt.k);
    },
    kindOf,
    withKinds: (hosts) => hosts.map((host) => ({ ...host, kind: host.kind ?? kindOf(host.address, host.name) }))
  };
}
const WINDOWS_KIND_SCRIPT = `"$((Get-CimInstance Win32_SystemEnclosure).ChassisTypes -join ','),$(@(Get-CimInstance Win32_Battery).Count)"`;
function decide(chassis, hasBattery) {
  for (const code of chassis) {
    const kind = kindFromChassis(code);
    if (kind) return kind;
  }
  return hasBattery ? "laptop" : "desktop";
}
async function detectDeviceKind(deps) {
  try {
    if (deps.platform === "win32") {
      const out = (await deps.runPowerShell(WINDOWS_KIND_SCRIPT)).trim();
      const parts = out.split(",").map(Number);
      const batteries = parts.pop() ?? 0;
      return decide(parts.filter(Number.isFinite), batteries > 0);
    }
    if (deps.platform === "linux") {
      const chassis = Number((await deps.readText("/sys/class/dmi/id/chassis_type"))?.trim());
      const supplies = await deps.listDir("/sys/class/power_supply").catch(() => []);
      return decide(
        Number.isFinite(chassis) ? [chassis] : [],
        supplies.some((s) => /^BAT/i.test(s))
      );
    }
    if (deps.platform === "darwin") {
      const model = await deps.run("sysctl", ["-n", "hw.model"]) ?? "";
      return /macbook/i.test(model) ? "laptop" : "desktop";
    }
  } catch {
  }
  return "desktop";
}
const PIN_CHANNEL_PORT = 47900;
const PIN_TTL_MS = 2 * 6e4;
const MAX_BODY = 512;
const MAX_PINS = 16;
function createPinChannel(options = {}) {
  const now = options.now ?? Date.now;
  const pins = /* @__PURE__ */ new Map();
  let server = null;
  let opening = null;
  const key = (device) => cleanName(device).toLowerCase();
  const normalizeAddress2 = (address) => address.replace(/^::ffff:/i, "").toLowerCase();
  const fresh = () => {
    for (const [id, entry] of pins) if (now() - entry.at > PIN_TTL_MS) pins.delete(id);
    return [...pins];
  };
  function handle(raw, remoteAddress) {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return false;
    }
    const { device, pin: pin2 } = body ?? {};
    if (typeof device !== "string" || typeof pin2 !== "string" || !/^\d{4}$/.test(pin2)) return false;
    const name = key(device);
    if (!name) return false;
    const address = normalizeAddress2(remoteAddress);
    if (!node_net.isIP(address)) return false;
    const id = `${address}|${name}`;
    if (!pins.has(id) && pins.size >= MAX_PINS) pins.delete(pins.keys().next().value);
    pins.set(id, { device: cleanName(device), address, pin: pin2, at: now() });
    return true;
  }
  return {
    port: () => server?.address()?.port ?? options.port ?? PIN_CHANNEL_PORT,
    start() {
      if (opening) return opening;
      if (server) return Promise.resolve();
      const created = node_http.createServer((request, response) => {
        if (request.method !== "POST" || request.url !== "/pin") {
          response.writeHead(404).end();
          return;
        }
        let raw = "";
        request.on("data", (chunk) => {
          raw += chunk.toString("utf8");
          if (raw.length > MAX_BODY) request.destroy();
        });
        request.on(
          "end",
          () => response.writeHead(handle(raw, request.socket.remoteAddress ?? "") ? 204 : 400).end()
        );
      });
      server = created;
      const pending = new Promise((resolve, reject) => {
        created.once("error", (error) => {
          if (server === created) server = null;
          reject(error);
        });
        created.listen(options.port ?? PIN_CHANNEL_PORT, () => {
          resolve();
        });
      });
      opening = pending;
      const clearOpening = () => {
        if (opening === pending) opening = null;
      };
      void pending.then(clearOpening, clearOpening);
      return pending;
    },
    stop() {
      pins.clear();
      const closing = server;
      const pending = opening;
      server = null;
      opening = null;
      return (pending ?? Promise.resolve()).catch(() => void 0).then(
        () => new Promise((resolve) => closing ? closing.close(() => resolve()) : resolve())
      );
    },
    take(device) {
      const matches = fresh().filter(([, entry2]) => key(entry2.device) === key(device));
      if (matches.length !== 1) return void 0;
      const [id, entry] = matches[0];
      pins.delete(id);
      return entry.pin;
    },
    takeByAddress(remoteAddress) {
      const address = normalizeAddress2(remoteAddress);
      if (!node_net.isIP(address)) return void 0;
      const matches = fresh().filter(([, entry2]) => entry2.address === address);
      if (matches.length !== 1) return void 0;
      const [id, entry] = matches[0];
      pins.delete(id);
      return { device: entry.device, pin: entry.pin };
    }
  };
}
async function sendPin(host, device, pin2) {
  const response = await fetch(`http://${host}:${PIN_CHANNEL_PORT}/pin`, {
    method: "POST",
    body: JSON.stringify({ device, pin: pin2 }),
    signal: AbortSignal.timeout(5e3)
  });
  if (!response.ok) throw new Error("O outro dispositivo não aceitou o pedido de pareamento.");
}
function emitter() {
  const subscribers = /* @__PURE__ */ new Set();
  return {
    on(callback) {
      subscribers.add(callback);
      return () => {
        subscribers.delete(callback);
      };
    },
    emit(...args) {
      for (const callback of [...subscribers]) callback(...args);
    }
  };
}
class FakeEngine {
  constructor(delayMs = 0) {
    this.delayMs = delayMs;
  }
  delayMs;
  calls = [];
  failPrepare = null;
  failConnect = null;
  failApprove = null;
  failDisconnect = null;
  hosts = [{ name: "Desktop", address: "192.168.1.3" }];
  lastApprove = null;
  lastDeny = null;
  pair = emitter();
  pairCancelled = emitter();
  connected = emitter();
  disconnected = emitter();
  ended = emitter();
  wait() {
    return new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }
  async prepare(onStep) {
    this.calls.push("prepare");
    for (const step of ["engine", "display", "encoder"]) {
      onStep(step);
      await this.wait();
    }
    if (this.failPrepare) {
      const message = this.failPrepare;
      this.failPrepare = null;
      throw new Error(message);
    }
  }
  async abort() {
    this.calls.push("abort");
  }
  async approve(request) {
    this.calls.push("approve");
    this.lastApprove = request;
    await this.wait();
    if (this.failApprove) {
      const message = this.failApprove;
      this.failApprove = null;
      throw new Error(message);
    }
  }
  lastPlacement = null;
  async placeScreen(placement) {
    this.calls.push("placeScreen");
    this.lastPlacement = placement;
  }
  async deny(pairingId) {
    this.calls.push("deny");
    this.lastDeny = pairingId;
  }
  async stopSending() {
    this.calls.push("stopSending");
  }
  async listHosts() {
    return this.hosts;
  }
  async connect(host) {
    this.calls.push(`connect:${host}`);
    await this.wait();
    if (this.failConnect) {
      const message = this.failConnect;
      this.failConnect = null;
      throw new Error(message);
    }
  }
  async disconnect() {
    this.calls.push("disconnect");
    if (this.failDisconnect) {
      const message = this.failDisconnect;
      this.failDisconnect = null;
      throw new Error(message);
    }
  }
  async applyBitrate(mbps) {
    this.calls.push(`bitrate:${mbps}`);
  }
  async placeDisplay(side) {
    this.calls.push(`place:${side}`);
  }
  onPairRequest(callback) {
    return this.pair.on(callback);
  }
  onPairCancelled(callback) {
    return this.pairCancelled.on(callback);
  }
  onClientConnected(callback) {
    return this.connected.on(callback);
  }
  onClientDisconnected(callback) {
    return this.disconnected.on(callback);
  }
  onStreamEnded(callback) {
    return this.ended.on(callback);
  }
  simulatePairRequest(device, pairingId = "p1", pin2, address) {
    this.pair.emit({
      device,
      pairingId,
      ...pin2 === void 0 ? {} : { pin: pin2 },
      ...address === void 0 ? {} : { address }
    });
  }
  /** Pedido do motor próprio: sem PIN, com a impressão digital do certificado. */
  simulateVerifiedRequest(device, fingerprint, pairingId = "p1", address = "192.168.1.6") {
    this.pair.emit({ device, pairingId, address, fingerprint, deviceId: "0f8fad5b-d9cb-469f" });
  }
  simulatePairCancelled(pairingId) {
    this.pairCancelled.emit(pairingId);
  }
  simulateClientConnected(device, peer) {
    this.connected.emit(device, peer);
  }
  simulateClientDisconnected() {
    this.disconnected.emit();
  }
  simulateStreamEnded() {
    this.ended.emit();
  }
}
function waitForExit(child, timeoutMs, onError) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, timeoutMs);
    const done = (code) => {
      clearTimeout(timer);
      resolve(code);
    };
    child.onExit(done);
    onError?.(() => done(null));
  });
}
const SIZE = {
  "720p": "1280x720",
  "1080p": "1920x1080",
  "1440p": "2560x1440"
};
const CODEC = { h264: "H.264", hevc: "HEVC", av1: "AV1" };
function buildStreamArgs(host, settings) {
  return [
    "stream",
    host,
    "Desktop",
    "--resolution",
    SIZE[settings.resolution],
    "--fps",
    String(settings.fps),
    "--bitrate",
    String(Math.round(settings.bitrate * 1e3)),
    // o Moonlight conta em kbps
    "--video-codec",
    CODEC[settings.codec],
    "--display-mode",
    "borderless",
    // O som continua no aparelho que envia a tela: sem isto o Sunshine troca a saída de áudio dele.
    "--audio-on-host",
    "--quit-after"
  ];
}
const EARLY_FAILURE_MS = 15e3;
function createMoonlightClient(deps) {
  let current = null;
  let generation = 0;
  let connecting = null;
  let retries = 0;
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const ended = /* @__PURE__ */ new Set();
  const paired = /* @__PURE__ */ new Set();
  const verified = /* @__PURE__ */ new Set();
  const now = deps.now ?? Date.now;
  let loaded = null;
  const remember = () => deps.pairedHosts?.save([...paired]);
  const load = () => loaded ??= (async () => {
    for (const host of await deps.pairedHosts?.load().catch(() => []) ?? []) paired.add(host);
  })();
  const client = {
    listHosts: () => deps.listHosts(),
    async connect(host, settings) {
      if (current || connecting !== null)
        throw new Error("Já existe uma transmissão sendo recebida.");
      const run2 = ++generation;
      connecting = run2;
      const cancelled = () => run2 !== generation;
      try {
        await load();
        if (cancelled()) return;
        if (!verified.has(host)) {
          const alreadyPaired = await deps.run(["list", host]) === 0;
          if (cancelled()) return;
          if (!alreadyPaired) {
            const pin2 = deps.randomPin();
            await deps.sendPin(host, deps.deviceName(), pin2).catch(() => {
              throw new Error(
                "Não consegui falar com o outro dispositivo. Confira se o Horizonte está aberto em Enviar lá."
              );
            });
            if (cancelled()) return;
            const pairCode = await deps.run(["pair", host, "--pin", pin2]);
            if (cancelled()) return;
            if (pairCode !== 0 && await deps.run(["list", host]) !== 0) {
              throw new Error(
                "O pareamento não foi concluído. Aprove o pedido no outro dispositivo e tente de novo."
              );
            }
          }
          paired.add(host);
          verified.add(host);
          await remember();
        }
        if (cancelled()) return;
        const child = await deps.spawn(buildStreamArgs(host, settings));
        if (cancelled()) {
          child.kill();
          return;
        }
        const startedAt = now();
        current = child;
        child.onExit((code) => {
          if (current !== child) return;
          const duration = now() - startedAt;
          if (code !== 0 && duration < EARLY_FAILURE_MS && verified.delete(host)) {
            paired.delete(host);
            void remember()?.catch(() => void 0);
          }
          current = null;
          if (duration >= 6e4) retries = 0;
          if (code !== 0 && duration >= EARLY_FAILURE_MS && retries < 3) {
            const token = generation;
            retries++;
            void sleep(1e3 * 2 ** (retries - 1)).then(async () => {
              if (token !== generation) return;
              try {
                await client.connect(host, settings);
              } catch {
                if (generation === token + 1) ended.forEach((listener) => listener());
              }
            }).catch(() => {
              if (token === generation) ended.forEach((listener) => listener());
            });
            return;
          }
          ended.forEach((listener) => listener());
        });
      } finally {
        if (connecting === run2) connecting = null;
      }
    },
    async disconnect() {
      generation++;
      connecting = null;
      retries = 0;
      const child = current;
      current = null;
      child?.kill();
    },
    // O Moonlight só lê o bitrate ao iniciar: o valor novo vale na próxima conexão.
    applyBitrate: async () => void 0,
    onStreamEnded(callback) {
      ended.add(callback);
      return () => ended.delete(callback);
    }
  };
  return client;
}
function createPairedHostsStore(file) {
  let saves = Promise.resolve();
  return {
    async load() {
      try {
        const data = JSON.parse(await promises.readFile(file, "utf8"));
        return Array.isArray(data) ? data.filter((host) => typeof host === "string") : [];
      } catch {
        return [];
      }
    },
    async save(hosts) {
      const snapshot = [...hosts];
      const save = saves.then(async () => {
        await promises.mkdir(node_path.dirname(file), { recursive: true });
        const temporary = `${file}.${process.pid}.tmp`;
        await promises.writeFile(temporary, JSON.stringify(snapshot), "utf8");
        await promises.rename(temporary, file);
      });
      saves = save.catch(() => void 0);
      await save;
    }
  };
}
async function ensureMoonlight(deps, onProgress) {
  const exe = node_path.join(deps.dir, "Moonlight.exe");
  if (await deps.exists(exe)) return exe;
  const zip = await deps.download(onProgress);
  await deps.extract(zip, deps.dir);
  if (!await deps.exists(exe)) throw new Error("O pacote do Moonlight veio sem o Moonlight.exe.");
  return exe;
}
const LOOPBACK = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "::1"]);
const MAX_BODY_BYTES = 1e6;
class SunshineApiError extends Error {
  constructor(kind, message, status) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.name = "SunshineApiError";
  }
  kind;
  status;
}
const READ_ONLY_KEYS = ["platform", "status", "version"];
const isRecord$1 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
class SunshineApi {
  agent = new https.Agent({ rejectUnauthorized: false });
  host;
  webPort;
  authorization;
  configWrites = Promise.resolve();
  timeoutMs;
  constructor(options) {
    const host = options.host ?? "127.0.0.1";
    if (!LOOPBACK.has(host)) {
      throw new Error("A API do motor de transmissão só pode ser acessada no próprio computador.");
    }
    this.host = host;
    this.webPort = options.port + 1;
    this.timeoutMs = options.timeoutMs ?? 5e3;
    this.authorization = "Basic " + Buffer.from(`${options.username}:${options.password}`).toString("base64");
  }
  async listPairings() {
    const data = await this.request("GET", "/api/pin");
    if (!isRecord$1(data) || !Array.isArray(data.pairings)) {
      throw new SunshineApiError(
        "invalid-response",
        "O motor de transmissão mandou uma lista de pareamentos inesperada."
      );
    }
    return data.pairings.flatMap((item) => {
      if (!isRecord$1(item)) return [];
      if (typeof item.id !== "string" && typeof item.id !== "number") return [];
      return [
        {
          id: String(item.id),
          name: typeof item.name === "string" ? item.name : "",
          address: typeof item.address === "string" ? item.address : ""
        }
      ];
    });
  }
  /** Nomes dos aparelhos que já foram pareados com este Sunshine. */
  async listClientNames() {
    const data = await this.request("GET", "/api/clients/list");
    if (!isRecord$1(data) || !Array.isArray(data.named_certs)) {
      throw new SunshineApiError(
        "invalid-response",
        "O motor de transmissão mandou uma lista de aparelhos pareados inesperada."
      );
    }
    return data.named_certs.flatMap(
      (item) => isRecord$1(item) && typeof item.name === "string" && item.name !== "" ? [item.name] : []
    );
  }
  async submitPin(request) {
    const data = await this.request(
      "POST",
      "/api/pin",
      {
        pairing_id: request.pairingId,
        pin: request.pin,
        name: request.name
      },
      Math.max(this.timeoutMs, 3e4)
    );
    return isRecord$1(data) && data.status === true;
  }
  async cancelPairing(pairingId) {
    await this.request("DELETE", "/api/pin", { pairing_id: pairingId });
  }
  async getConfig() {
    const data = await this.request("GET", "/api/config");
    if (!isRecord$1(data)) {
      throw new SunshineApiError(
        "invalid-response",
        "O motor de transmissão mandou uma configuração inesperada."
      );
    }
    const config = { ...data };
    for (const key of READ_ONLY_KEYS) delete config[key];
    return config;
  }
  /**
   * O Sunshine pode tratar o corpo como a configuração inteira. Por isso lemos tudo,
   * mesclamos o trecho novo por cima e gravamos o conjunto, sem nunca apagar o resto.
   */
  async saveConfig(patch, alive = () => true) {
    const write = this.configWrites.then(async () => {
      if (!alive()) return;
      const current = await this.getConfig();
      if (!alive()) return;
      await this.request("POST", "/api/config", { ...current, ...patch });
    });
    this.configWrites = write.catch(() => void 0);
    await write;
  }
  /** O reinício derruba a própria conexão; isso não é falha. */
  async restart() {
    try {
      await this.request("POST", "/api/restart", {});
    } catch (cause) {
      if (cause instanceof SunshineApiError && (cause.kind === "unreachable" || cause.kind === "timeout")) {
        return;
      }
      throw cause;
    }
  }
  async closeApp() {
    await this.request("POST", "/api/apps/close", {});
  }
  request(method, path2, body, timeoutMs = this.timeoutMs) {
    return new Promise((resolve, reject) => {
      const payload = body === void 0 ? void 0 : JSON.stringify(body);
      const request = https.request(
        {
          host: this.host,
          port: this.webPort,
          path: path2,
          method,
          agent: this.agent,
          headers: {
            Authorization: this.authorization,
            ...payload === void 0 ? {} : {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload)
            }
          }
        },
        (response) => this.collect(response, resolve, reject)
      );
      request.setTimeout(timeoutMs, () => {
        request.destroy(new SunshineApiError("timeout", "O Sunshine não respondeu a tempo."));
      });
      request.on("error", (cause) => {
        reject(
          cause instanceof SunshineApiError ? cause : new SunshineApiError("unreachable", "Não consegui falar com o Sunshine.")
        );
      });
      if (payload !== void 0) request.write(payload);
      request.end();
    });
  }
  collect(response, resolve, reject) {
    const chunks = [];
    let size = 0;
    response.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        response.destroy();
        reject(
          new SunshineApiError("invalid-response", "O Sunshine mandou uma resposta grande demais.")
        );
        return;
      }
      chunks.push(chunk);
    });
    response.on(
      "error",
      () => reject(new SunshineApiError("unreachable", "A conexão com o Sunshine caiu."))
    );
    response.on("end", () => {
      const status = response.statusCode ?? 0;
      if (status === 401 || status === 403) {
        reject(
          new SunshineApiError("unauthorized", "O Sunshine recusou o usuário ou a senha.", status)
        );
        return;
      }
      if (status < 200 || status >= 300) {
        reject(new SunshineApiError("server", `O Sunshine respondeu com o erro ${status}.`, status));
        return;
      }
      const text = Buffer.concat(chunks).toString("utf8");
      if (text.trim() === "") {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(
          new SunshineApiError(
            "invalid-response",
            "O motor de transmissão mandou uma resposta ilegível.",
            status
          )
        );
      }
    });
  }
}
const GPU_ENCODERS = [
  { id: "gpu-lowlatency_high_quality", kind: "gpu", amdUsage: "lowlatency_high_quality" },
  { id: "gpu-transcoding", kind: "gpu", amdUsage: "transcoding" }
];
const CPU_ENCODER = { id: "cpu", kind: "cpu" };
function attempt(probe, candidate, timeoutMs) {
  return new Promise((resolve) => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      abort.abort();
      resolve("unknown");
    }, timeoutMs);
    const finish = (verdict) => {
      clearTimeout(timer);
      resolve(verdict);
    };
    Promise.resolve().then(() => probe(candidate, abort.signal)).then(
      (ok) => finish(ok === true ? "yes" : "no"),
      () => finish("unknown")
    );
  });
}
async function chooseEncoder(probe, preference = "auto", timeoutMs = 8e3) {
  if (preference === "cpu") return { candidate: CPU_ENCODER, fellBack: false, inconclusive: false };
  let inconclusive = false;
  for (const candidate of GPU_ENCODERS) {
    const verdict = await attempt(probe, candidate, timeoutMs);
    if (verdict === "yes") return { candidate, fellBack: false, inconclusive: false };
    if (verdict === "unknown") inconclusive = true;
  }
  return { candidate: CPU_ENCODER, fellBack: true, inconclusive };
}
const ENCODER_TEST_MARKER = "Testing for available encoders";
const DISPLAY_MARKER = "Currently available display devices:";
const STARTUP_MARKER = "Configuration UI available at";
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function parseFoundEncoder(log2) {
  const start = log2.lastIndexOf(ENCODER_TEST_MARKER);
  if (start < 0) return null;
  const match = /Found H\.264 encoder: (\S+) \[(\w+)\]/.exec(log2.slice(start));
  if (!match) return null;
  const [, name, backend] = match;
  if (name === void 0 || backend === void 0) return null;
  return { name, backend, hardware: backend !== "software" };
}
const KMS_START = "Start of KMS monitor list";
const KMS_END = "End of KMS monitor list";
function parseKmsDisplays(log2) {
  const start = log2.lastIndexOf(KMS_START);
  if (start < 0) return [];
  const end = log2.indexOf(KMS_END, start);
  const block = log2.slice(start, end < 0 ? void 0 : end);
  return [...block.matchAll(/Monitor (\d+) is ([^:\r\n]+):[ \t]*([^\r\n]*)/g)].map((match) => ({
    deviceId: match[1] ?? "",
    displayName: match[2] ?? "",
    friendlyName: (match[3] ?? "").trim() || (match[2] ?? ""),
    width: 0,
    height: 0,
    primary: match[1] === "0",
    originX: 0
  }));
}
function parseDisplays(log2) {
  const found = parseJsonDisplays(log2);
  return found.length > 0 ? found : parseKmsDisplays(log2);
}
function parseJsonDisplays(log2) {
  const marker = log2.lastIndexOf(DISPLAY_MARKER);
  if (marker < 0) return [];
  const rest = log2.slice(marker + DISPLAY_MARKER.length);
  const open = rest.indexOf("\n[");
  if (open < 0) return [];
  const close = rest.indexOf("\n]", open + 1);
  if (close < 0) return [];
  let data;
  try {
    data = JSON.parse(rest.slice(open + 1, close + 2));
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    if (!isRecord(item) || typeof item.device_id !== "string") return [];
    const info = isRecord(item.info) ? item.info : {};
    const resolution = isRecord(info.resolution) ? info.resolution : {};
    const origin = isRecord(info.origin_point) ? info.origin_point : {};
    return [
      {
        deviceId: item.device_id,
        displayName: typeof item.display_name === "string" ? item.display_name : "",
        friendlyName: typeof item.friendly_name === "string" ? item.friendly_name : "",
        width: typeof resolution.width === "number" ? resolution.width : 0,
        height: typeof resolution.height === "number" ? resolution.height : 0,
        primary: info.primary === true,
        originX: typeof origin.x === "number" ? origin.x : 0
      }
    ];
  });
}
const isStartupComplete = (log2) => log2.includes(STARTUP_MARKER);
const countStartups = (log2) => log2.split(STARTUP_MARKER).length - 1;
const RUN_MARKER = "Sunshine version:";
function logSignature(log2) {
  const at = log2.lastIndexOf(RUN_MARKER);
  if (at < 0) return "";
  const start = log2.lastIndexOf("\n", at) + 1;
  return (log2.slice(start).split(/\r?\n/, 1)[0] ?? "").slice(0, 160);
}
function sessionEvents(log2) {
  const events = [];
  for (const match of log2.matchAll(/: CLIENT (CONNECTED|DISCONNECTED)[ \t]*\r?$/gm)) {
    events.push(match[1] === "CONNECTED" ? "connected" : "disconnected");
  }
  return events;
}
function amdConfig(candidate) {
  if (candidate.kind !== "gpu" || candidate.amdUsage === void 0) return {};
  return {
    amd_usage: candidate.amdUsage,
    amd_rc: "cbr",
    amd_quality: "speed",
    amd_enforce_hrd: "disabled",
    amd_preanalysis: "disabled",
    amd_vbaq: "disabled"
  };
}
function createLogEncoderProbe(deps) {
  return async (candidate, signal) => {
    const alive = () => signal?.aborted !== true && (deps.alive?.() ?? true);
    if (!alive()) return false;
    await deps.api.saveConfig(amdConfig(candidate), alive);
    if (!alive()) throw new Error("Sondagem do encoder cancelada.");
    const log2 = await deps.restartAndRead(alive);
    if (!alive()) throw new Error("Sondagem do encoder cancelada.");
    return parseFoundEncoder(log2)?.hardware === true;
  };
}
function createPairingWatcher(options) {
  const interval = options.intervalMs ?? 2e3;
  const maxBackoff = options.maxBackoffMs ?? 1e4;
  const known = /* @__PURE__ */ new Map();
  let timer = null;
  let active = false;
  let run2 = 0;
  let failures = 0;
  const report = (cause) => {
    try {
      options.onError?.(cause);
    } catch {
    }
  };
  const guarded = (callback) => {
    try {
      callback();
    } catch (cause) {
      report(cause);
    }
  };
  function schedule(token, delay) {
    if (token !== run2) return;
    timer = setTimeout(() => void poll(token), delay);
  }
  async function poll(token) {
    let list;
    try {
      list = await options.api.listPairings();
    } catch (cause) {
      if (token !== run2) return;
      failures++;
      report(cause);
      schedule(token, Math.min(interval * 2 ** failures, maxBackoff));
      return;
    }
    if (token !== run2) return;
    failures = 0;
    const present = new Set(list.map((pairing) => pairing.id));
    for (const pairing of list) {
      if (known.has(pairing.id)) continue;
      known.set(pairing.id, pairing);
      guarded(() => options.onRequest(pairing));
    }
    for (const id of [...known.keys()]) {
      if (present.has(id)) continue;
      known.delete(id);
      guarded(() => options.onCancelled(id));
    }
    schedule(token, interval);
  }
  return {
    start() {
      if (active) return;
      active = true;
      void poll(++run2);
    },
    stop() {
      active = false;
      run2++;
      known.clear();
      failures = 0;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    }
  };
}
function createRestarter(deps) {
  const timeoutMs = deps.timeoutMs ?? 45e3;
  const pollMs = deps.pollMs ?? 500;
  return async (alive = () => true) => {
    if (!alive()) return "";
    const beforeLog = await deps.readLog();
    if (!alive()) return "";
    const before = { signature: logSignature(beforeLog), startups: countStartups(beforeLog) };
    await (deps.restart ?? (() => deps.api.restart()))();
    if (!alive()) return "";
    const polls = Math.max(1, Math.ceil(timeoutMs / pollMs));
    for (let i = 0; i < polls; i++) {
      await deps.sleep(pollMs);
      if (!alive()) return "";
      const log2 = await deps.readLog();
      if (!alive()) return "";
      const fresh = logSignature(log2) !== before.signature || countStartups(log2) > before.startups;
      if (!fresh || !isStartupComplete(log2)) continue;
      try {
        await deps.api.getConfig();
      } catch {
        continue;
      }
      if (!alive()) return "";
      return log2;
    }
    throw new Error(
      "O motor de transmissão não voltou depois de reiniciar. Feche o Horizonte, abra de novo e tente outra vez."
    );
  };
}
const MAX_EVENTS_PER_POLL = 5;
function createSessionWatcher(options) {
  const interval = options.intervalMs ?? 1e3;
  let timer = null;
  let active = false;
  let run2 = 0;
  const report = (cause) => {
    try {
      options.onError?.(cause);
    } catch {
    }
  };
  async function poll(token, baseline) {
    let next = baseline;
    try {
      const log2 = await options.readLog();
      if (token !== run2) return;
      if (log2 !== "") {
        const events = sessionEvents(log2);
        const signature = logSignature(log2);
        if (next === null) {
          next = { signature, seen: events.length };
        } else {
          const restarted = signature !== "" && next.signature !== "" && signature !== next.signature || events.length < next.seen;
          const fresh = events.slice(restarted ? 0 : next.seen).slice(-MAX_EVENTS_PER_POLL);
          next = { signature: signature || next.signature, seen: events.length };
          for (const event of fresh) {
            try {
              if (event === "connected") {
                const device = await options.deviceName();
                if (token !== run2) return;
                options.onConnected(device);
              } else options.onDisconnected();
            } catch (cause) {
              report(cause);
            }
          }
        }
      }
    } catch (cause) {
      if (token !== run2) return;
      report(cause);
    }
    if (token !== run2) return;
    timer = setTimeout(() => void poll(token, next), interval);
  }
  return {
    start() {
      if (active) return;
      active = true;
      void poll(++run2, null);
    },
    stop() {
      active = false;
      run2++;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    }
  };
}
const GENERIC_DEVICE = "Outro computador";
const PROGRESS_AFTER_INSTALL = 0.55;
function friendly(cause) {
  if (cause instanceof SunshineApiError) {
    if (cause.kind === "unauthorized") {
      return new Error(
        "O motor de transmissão recusou o usuário ou a senha. Confira as credenciais."
      );
    }
    return new Error(cause.message);
  }
  return cause instanceof Error ? cause : new Error(String(cause));
}
class SunshineEngine {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  api = null;
  run = 0;
  preparation = null;
  pairing = null;
  session = null;
  lastApprovedName = GENERIC_DEVICE;
  pairListeners = /* @__PURE__ */ new Set();
  cancelListeners = /* @__PURE__ */ new Set();
  connectedListeners = /* @__PURE__ */ new Set();
  disconnectedListeners = /* @__PURE__ */ new Set();
  get timing() {
    const t = this.deps.timing ?? {};
    return {
      reachableTimeoutMs: t.reachableTimeoutMs ?? 3e4,
      pollMs: t.pollMs ?? 500,
      restartTimeoutMs: t.restartTimeoutMs ?? 45e3,
      probeTimeoutMs: t.probeTimeoutMs ?? 6e4,
      pairingIntervalMs: t.pairingIntervalMs ?? 2e3,
      sessionIntervalMs: t.sessionIntervalMs ?? 1e3
    };
  }
  async prepare(onStep, settings, onProgress) {
    this.preparation?.abort();
    const preparation = new AbortController();
    this.preparation = preparation;
    const run2 = ++this.run;
    const alive = () => run2 === this.run;
    this.stopWatchers();
    const known = this.known;
    if (known !== null && this.api !== null && known.encoding === settings.encoding) {
      const api2 = this.api;
      try {
        await api2.getConfig();
        if (!alive()) return;
        const changed2 = await this.ensureConfig(
          api2,
          this.desiredConfig(settings, known.displayId, known.chosen),
          alive
        );
        if (!alive()) return;
        if (changed2) await this.restarter(api2)(alive);
        if (!alive()) return;
        this.startWatchers(api2);
        return;
      } catch {
        if (!alive()) return;
        this.known = null;
      }
    }
    const report = (note, fraction2) => onProgress?.({ note, fraction: fraction2 });
    onStep("engine");
    await this.deps.installer.ensureInstalled((p) => {
      if (alive()) onProgress?.({ ...p, fraction: p.fraction * PROGRESS_AFTER_INSTALL });
    }, preparation.signal);
    if (!alive()) return;
    report("Conectando ao motor de transmissão", PROGRESS_AFTER_INSTALL);
    const credentials = await this.deps.credentials();
    if (!alive()) return;
    const api = this.deps.createApi(credentials);
    this.api = api;
    await this.waitUntilReachable(api, alive);
    if (!alive()) return;
    onStep("display");
    report("Procurando o monitor virtual", PROGRESS_AFTER_INSTALL);
    await this.deps.display.ensureVirtualDisplay(preparation.signal);
    if (!alive()) return;
    await this.placeDisplay(settings.extendSide).catch(() => void 0);
    if (!alive()) return;
    const restartAndRead = this.restarter(api);
    const displayId = await this.findVirtualDisplay(restartAndRead, alive);
    if (!alive()) return;
    onStep("encoder");
    const chosen = await this.resolveEncoder(api, restartAndRead, settings, alive);
    if (!alive()) return;
    const changed = await this.ensureConfig(
      api,
      this.desiredConfig(settings, displayId, chosen),
      alive
    );
    if (!alive()) return;
    if (changed) await restartAndRead(alive);
    if (!alive()) return;
    this.known = { displayId, chosen, encoding: settings.encoding };
    this.startWatchers(api);
  }
  /** O que a última preparação completa descobriu; permite as próximas serem quase instantâneas. */
  known = null;
  restarter(api) {
    return createRestarter({
      api,
      restart: this.deps.restart,
      readLog: this.deps.readLog,
      sleep: this.deps.sleep,
      timeoutMs: this.timing.restartTimeoutMs,
      pollMs: this.timing.pollMs
    });
  }
  async waitUntilReachable(api, alive) {
    const polls = Math.max(1, Math.ceil(this.timing.reachableTimeoutMs / this.timing.pollMs));
    for (let i = 0; i < polls; i++) {
      try {
        await api.getConfig();
        return;
      } catch (cause) {
        if (cause instanceof SunshineApiError && cause.kind === "unauthorized")
          throw friendly(cause);
        await this.deps.sleep(this.timing.pollMs);
        if (!alive()) return;
      }
    }
    throw new Error("O motor de transmissão não respondeu. Confira se ele está instalado e aberto.");
  }
  async findVirtualDisplay(restartAndRead, alive) {
    const find = (log2) => parseDisplays(log2).find((display) => this.deps.display.isVirtual(display))?.deviceId ?? null;
    const known = this.deps.display.outputName?.();
    if (known != null) return known;
    let id = find(await this.deps.readLog());
    if (!alive()) return "";
    if (id === null) {
      const log2 = await restartAndRead(alive);
      if (!alive()) return "";
      id = find(log2);
    }
    if (id === null) throw new Error("Não achei o monitor virtual no motor de transmissão.");
    return id;
  }
  async resolveEncoder(api, restartAndRead, settings, alive) {
    if (settings.encoding === "cpu") return null;
    const remembered = await this.deps.memory.load();
    if (!alive()) return null;
    if (remembered !== null) {
      const candidate = GPU_ENCODERS.find((item) => item.id === remembered.encoder);
      return candidate ? { candidate, fellBack: false, inconclusive: false } : null;
    }
    const proven = await this.provenCandidate(api);
    if (!alive()) return null;
    if (proven !== null) {
      await this.deps.memory.save({ encoder: proven.id });
      return { candidate: proven, fellBack: false, inconclusive: false };
    }
    const probe = createLogEncoderProbe({
      api,
      alive,
      restartAndRead: (stillWanted) => restartAndRead(() => alive() && (stillWanted?.() ?? true))
    });
    const chosen = await chooseEncoder(probe, settings.encoding, this.timing.probeTimeoutMs);
    if (!alive()) return null;
    if (!chosen.fellBack || !chosen.inconclusive) {
      await this.deps.memory.save({ encoder: chosen.fellBack ? null : chosen.candidate.id });
    }
    return chosen.fellBack ? null : chosen;
  }
  async provenCandidate(api) {
    if (parseFoundEncoder(await this.deps.readLog())?.hardware !== true) return null;
    const usage = (await api.getConfig()).amd_usage;
    return GPU_ENCODERS.find((candidate) => candidate.amdUsage === usage) ?? null;
  }
  desiredConfig(settings, displayId, chosen) {
    const base2 = {
      sunshine_name: settings.deviceName,
      output_name: displayId,
      ...this.deps.display.config?.()
    };
    if (settings.encoding === "cpu") return { ...base2, encoder: "software" };
    const candidate = chosen?.candidate ?? GPU_ENCODERS[0];
    return { ...base2, encoder: "", ...amdConfig(candidate) };
  }
  /** Grava só o que mudou. Devolve verdadeiro se mudou algo (e portanto precisa reiniciar). */
  async ensureConfig(api, desired, alive) {
    const current = await api.getConfig();
    if (!alive()) return false;
    const diff = Object.fromEntries(
      Object.entries(desired).filter(([key, value]) => {
        if (String(current[key] ?? "") === value) return false;
        return !(key === "sunshine_name" && !(key in current) && value === DEFAULT_SETTINGS.deviceName);
      })
    );
    if (Object.keys(diff).length === 0) return false;
    await api.saveConfig(diff, alive);
    return true;
  }
  startWatchers(api) {
    this.stopWatchers();
    this.pairing = createPairingWatcher({
      api,
      intervalMs: this.timing.pairingIntervalMs,
      onRequest: (pairing) => {
        const request = this.deps.pins?.takeByAddress?.(pairing.address);
        const device = cleanName(request?.device ?? pairing.name) || GENERIC_DEVICE;
        const pin2 = request?.pin ?? (this.deps.pins?.takeByAddress ? void 0 : this.deps.pins?.take(device));
        for (const listener of [...this.pairListeners])
          listener({ device, pairingId: pairing.id, pin: pin2, address: pairing.address });
      },
      onCancelled: (pairingId) => {
        for (const listener of [...this.cancelListeners]) listener(pairingId);
      }
    });
    this.session = createSessionWatcher({
      readLog: this.deps.readLog,
      intervalMs: this.timing.sessionIntervalMs,
      deviceName: () => this.connectedName(api),
      onConnected: (device) => {
        for (const listener of [...this.connectedListeners]) listener(device);
      },
      onDisconnected: () => {
        for (const listener of [...this.disconnectedListeners]) listener();
      }
    });
    void this.deps.pins?.start().catch(() => void 0);
    this.pairing.start();
    this.session.start();
  }
  /**
   * O log do Sunshine não diz quem conectou. Quem acabou de ser aprovado vale; senão, se só há um aparelho
   * pareado, é ele; com vários não dá para saber e ficamos com o nome genérico.
   */
  async connectedName(api) {
    if (this.lastApprovedName !== GENERIC_DEVICE) return this.lastApprovedName;
    try {
      const names = (await api.listClientNames()).map((name) => cleanName(name)).filter((name) => name !== "");
      return names.length === 1 ? names[0] : GENERIC_DEVICE;
    } catch {
      return GENERIC_DEVICE;
    }
  }
  stopWatchers() {
    void this.deps.pins?.stop();
    this.pairing?.stop();
    this.session?.stop();
    this.pairing = null;
    this.session = null;
  }
  requireApi() {
    if (this.api === null) throw new Error("O motor de transmissão não está pronto ainda.");
    return this.api;
  }
  async abort() {
    this.preparation?.abort();
    this.run++;
    this.stopWatchers();
  }
  async approve(request) {
    const api = this.requireApi();
    if (!isValidPin(request.pin)) throw new Error("O PIN precisa ter 4 números.");
    const name = cleanName(request.name) || GENERIC_DEVICE;
    let accepted;
    try {
      accepted = await api.submitPin({ pairingId: request.pairingId, pin: request.pin, name });
    } catch (cause) {
      throw friendly(cause);
    }
    if (!accepted) {
      throw new Error("O PIN não confere. Confira o número que aparece no outro dispositivo.");
    }
    this.lastApprovedName = name;
  }
  async deny(pairingId) {
    try {
      await this.requireApi().cancelPairing(pairingId);
    } catch (cause) {
      throw friendly(cause);
    }
  }
  async stopSending() {
    try {
      await this.requireApi().closeApp();
    } catch (cause) {
      throw friendly(cause);
    }
  }
  async placeDisplay(side) {
    await this.deps.display.place?.(side);
  }
  /** O Sunshine só lê o limite ao iniciar uma sessão; vale na próxima conexão. */
  async applyBitrate(mbps) {
    if (this.api === null) return;
    try {
      await this.api.saveConfig({ max_bitrate: String(Math.round(mbps * 1e3)) });
    } catch (cause) {
      throw friendly(cause);
    }
  }
  onPairRequest(callback) {
    this.pairListeners.add(callback);
    return () => void this.pairListeners.delete(callback);
  }
  onPairCancelled(callback) {
    this.cancelListeners.add(callback);
    return () => void this.cancelListeners.delete(callback);
  }
  onClientConnected(callback) {
    this.connectedListeners.add(callback);
    return () => void this.connectedListeners.delete(callback);
  }
  onClientDisconnected(callback) {
    this.disconnectedListeners.add(callback);
    return () => void this.disconnectedListeners.delete(callback);
  }
}
async function readLogTail(path2, maxBytes = 2e6) {
  let handle;
  try {
    handle = await promises.open(path2, "r");
    const { size } = await handle.stat();
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    return buffer.toString("utf8");
  } catch {
    return "";
  } finally {
    await handle?.close();
  }
}
function createEngineMemory(file) {
  let writes = Promise.resolve();
  return {
    async load() {
      try {
        const data = JSON.parse(await promises.readFile(file, "utf8"));
        if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
        const encoder = data.encoder;
        if (encoder === null || typeof encoder === "string") return { encoder };
        return null;
      } catch {
        return null;
      }
    },
    save(value) {
      const data = JSON.stringify(value);
      const write = writes.then(async () => {
        await promises.mkdir(node_path.dirname(file), { recursive: true });
        const temporary = `${file}.${process.pid}.tmp`;
        try {
          await promises.writeFile(temporary, data, "utf8");
          await promises.rename(temporary, file);
        } catch (cause) {
          await promises.rm(temporary, { force: true });
          throw cause;
        }
      });
      writes = write.catch(() => void 0);
      return write;
    }
  };
}
class ElevationError extends Error {
  constructor(kind, message, options) {
    super(message, options);
    this.kind = kind;
    this.name = "ElevationError";
  }
  kind;
}
const MAX_ENCODED_LENGTH = 24e3;
const BOM = String.fromCharCode(65279);
const psQuote = (value) => `'${value.replace(/'/g, "''")}'`;
function buildScript(steps, resultPath) {
  const body = steps.map((step, index) => `$step = ${index}
${step.script}`).join("\n");
  return [
    "$ErrorActionPreference = 'Stop'",
    `$result = ${psQuote(resultPath)}`,
    "$step = 0",
    "try {",
    body,
    "    Set-Content -LiteralPath $result -Value 'ok' -Encoding ascii",
    "} catch {",
    '    $message = ($_.Exception.Message -replace "[\\r\\n]+", " ")',
    '    Set-Content -LiteralPath $result -Value ("fail:" + $step + ":" + $message) -Encoding utf8',
    "}"
  ].join("\n");
}
const encodeCommand = (script) => Buffer.from(script, "utf16le").toString("base64");
function createElevation(deps) {
  return {
    async runElevated(steps) {
      if (steps.length === 0) return;
      const folder = await promises.mkdtemp(node_path.join(deps.tmpDir, "horizonte-uac-"));
      try {
        const resultPath = node_path.join(folder, "result.txt");
        const encoded = encodeCommand(buildScript(steps, resultPath));
        if (encoded.length > MAX_ENCODED_LENGTH) {
          throw new ElevationError("failed", "Os passos de instalação ficaram grandes demais.");
        }
        await deps.run({ encoded, resultPath });
        const raw = await promises.readFile(resultPath, "utf8").catch(() => null);
        if (raw === null) {
          throw new ElevationError(
            "denied",
            "Preciso da permissão de administrador para instalar. Tente de novo e aceite o aviso do Windows."
          );
        }
        const text = (raw.startsWith(BOM) ? raw.slice(1) : raw).trim();
        if (text === "ok") return;
        const failed = /^fail:(\d+):(.*)$/s.exec(text);
        const step = failed ? steps[Number(failed[1])] : void 0;
        throw new ElevationError(
          "failed",
          step ? `Não consegui concluir o passo "${step.description}": ${failed?.[2]?.trim() ?? ""}` : "A instalação terminou de um jeito que não consegui entender."
        );
      } finally {
        await promises.rm(folder, { recursive: true, force: true });
      }
    }
  };
}
const runWithUac = ({ encoded }) => new Promise((resolve) => {
  const launcher = `Start-Process -FilePath powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'`;
  node_child_process.execFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", launcher],
    () => resolve()
  );
});
async function setupStep(signal, action) {
  signal?.throwIfAborted();
  const result = await action();
  signal?.throwIfAborted();
  return result;
}
function createSetupTask(run2) {
  let inFlight = null;
  return async (onReport, signal) => {
    signal?.throwIfAborted();
    while (inFlight) {
      if (inFlight.signal === signal) {
        if (onReport) inFlight.report = onReport;
        return inFlight.promise;
      }
      await inFlight.promise.catch(() => void 0);
      signal?.throwIfAborted();
    }
    const task = { signal, report: onReport ?? (() => void 0), promise: Promise.resolve() };
    inFlight = task;
    task.promise = Promise.resolve().then(
      () => setupStep(
        signal,
        () => run2((progress) => {
          if (!signal?.aborted) task.report(progress);
        }, signal)
      )
    ).finally(() => {
      if (inFlight === task) inFlight = null;
    });
    return task.promise;
  };
}
const DEVICE_API = `Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class HzDev {
  [StructLayout(LayoutKind.Sequential)] public struct Info { public int cbSize; public Guid ClassGuid; public int DevInst; public IntPtr Reserved; }
  [DllImport("setupapi.dll", SetLastError=true)] public static extern IntPtr SetupDiCreateDeviceInfoList(ref Guid g, IntPtr h);
  [DllImport("setupapi.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool SetupDiCreateDeviceInfoW(IntPtr s, string n, ref Guid g, string d, IntPtr h, int f, ref Info i);
  [DllImport("setupapi.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool SetupDiSetDeviceRegistryPropertyW(IntPtr s, ref Info i, int p, byte[] b, int n);
  [DllImport("setupapi.dll", SetLastError=true)] public static extern bool SetupDiCallClassInstaller(int f, IntPtr s, ref Info i);
  [DllImport("setupapi.dll")] public static extern bool SetupDiDestroyDeviceInfoList(IntPtr s);
  [DllImport("newdev.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool UpdateDriverForPlugAndPlayDevicesW(IntPtr h, string id, string inf, int f, out bool reboot);
}
'@`;
const DRIVER_INSTALL_SCRIPT = [
  DEVICE_API,
  "$thumb = (Get-PfxCertificate -FilePath $cer.FullName).Thumbprint",
  `$rootPath = "Cert:\\LocalMachine\\Root\\$thumb"`,
  "$rootWasThere = Test-Path $rootPath",
  "try {",
  `  Import-Certificate -FilePath $cer.FullName -CertStoreLocation 'Cert:\\LocalMachine\\TrustedPublisher' | Out-Null`,
  `  if (-not $rootWasThere) { Import-Certificate -FilePath $cer.FullName -CertStoreLocation 'Cert:\\LocalMachine\\Root' | Out-Null }`,
  "  pnputil.exe /add-driver $inf.FullName /install | Out-Null",
  '  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) { throw "pnputil terminou com o código $LASTEXITCODE" }',
  `  if (-not (Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.HardwareID -contains 'Root\\MttVDD' })) {`,
  `    $guid = [Guid]'4d36e968-e325-11ce-bfc1-08002be10318'`,
  "    $set = [HzDev]::SetupDiCreateDeviceInfoList([ref]$guid, [IntPtr]::Zero)",
  "    $info = New-Object HzDev+Info",
  "    $info.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($info)",
  `    if (-not [HzDev]::SetupDiCreateDeviceInfoW($set, 'Display', [ref]$guid, $null, [IntPtr]::Zero, 1, [ref]$info)) { throw 'Não consegui criar o monitor virtual.' }`,
  '    $hw = [Text.Encoding]::Unicode.GetBytes("Root\\MttVDD`0`0")',
  "    [HzDev]::SetupDiSetDeviceRegistryPropertyW($set, [ref]$info, 1, $hw, $hw.Length) | Out-Null",
  `    if (-not [HzDev]::SetupDiCallClassInstaller(0x19, $set, [ref]$info)) { throw 'Não consegui registrar o monitor virtual.' }`,
  "    [HzDev]::SetupDiDestroyDeviceInfoList($set) | Out-Null",
  "  }",
  // Um dispositivo órfão pode existir depois da desinstalação do pacote. Vincular também nesse caso.
  "  $reboot = $false",
  `  if (-not [HzDev]::UpdateDriverForPlugAndPlayDevicesW([IntPtr]::Zero, 'Root\\MttVDD', $inf.FullName, 1, [ref]$reboot)) { throw 'O Windows recusou o driver do monitor virtual.' }`,
  "} finally {",
  "  if (-not $rootWasThere) { Remove-Item -Path $rootPath -ErrorAction SilentlyContinue }",
  "}"
].join("\n");
const SUNSHINE = {
  version: "2026.914.233613",
  fileName: "Sunshine-Windows-AMD64-installer.msi",
  url: "https://github.com/LizardByte/Sunshine/releases/download/v2026.914.233613/Sunshine-Windows-AMD64-installer.msi",
  sha256: "1d7fed8beecd5889dc7ff14cf9f42d6d38f37c3066c13c6c2a5f4e91847e0ccf"
};
const VIRTUAL_DISPLAY_DRIVER = {
  version: "24.10.27",
  fileName: "VirtualDisplayDriver-x64.zip",
  url: "https://github.com/VirtualDrivers/Virtual-Display-Driver/releases/download/24.10.27/VirtualDisplayDriver-x64.zip",
  sha256: "b7a36f341f2a0ce43cc2afe7894d30dd8fef7b6f60ef9491aab2ef77663a42fd"
};
const MOONLIGHT = {
  version: "6.1.0-hz1",
  fileName: "MoonlightPortable-horizonte-x64.zip",
  url: "https://github.com/mapompeo/horizonte/releases/download/motores-hz1/MoonlightPortable-horizonte-x64.zip",
  sha256: "48322a9ebbc0cd7449d474917687b0614524d99299edb7207516f8c1c2d20853"
};
const MOONLIGHT_WEB = {
  version: "2.10.0",
  fileName: "moonlight-web-x86_64-pc-windows-gnu.zip",
  url: "https://github.com/MrCreativ3001/moonlight-web-stream/releases/download/v2.10.0/moonlight-web-x86_64-pc-windows-gnu.zip",
  sha256: "1dc3019952c610fbd7deb76dc84e3c4c6f26458ebb44823ea1f02ad883a36da9"
};
const MOONLIGHT_WEB_LINUX = {
  version: "2.10.0",
  fileName: "moonlight-web-x86_64-unknown-linux-gnu.tar.gz",
  url: "https://github.com/MrCreativ3001/moonlight-web-stream/releases/download/v2.10.0/moonlight-web-x86_64-unknown-linux-gnu.tar.gz",
  sha256: "b17fa535676a1c118bc1eb009134644cab98190b36a0776fb1b4a505d569f5eb"
};
const GATEWAY_PORT = 8080;
const WEBRTC_PORTS = { min: 4e4, max: 40010 };
const GATEWAY_USER = "horizonte";
function buildGatewayConfig(options) {
  const base2 = options.baseConfig;
  return {
    ...options.baseConfig,
    data_storage: { ...base2.data_storage, path: options.dataPath },
    webrtc: {
      ...base2.webrtc,
      ice_servers: [],
      port_range: WEBRTC_PORTS,
      include_loopback_candidates: false
    },
    web_server: { ...base2.web_server, bind_address: options.bindAddress },
    moonlight: { ...base2.moonlight, pair_device_name: options.deviceName }
  };
}
async function waitUp(deps, url) {
  for (let attempt2 = 0; attempt2 < 40; attempt2 += 1) {
    try {
      await deps.ping(url);
      return;
    } catch {
      await deps.sleep(250);
    }
  }
  throw new Error("O servidor do navegador não respondeu. Tente de novo.");
}
function createGateway(deps) {
  let child = null;
  let access = { on: false };
  let generation = 0;
  let pending = null;
  const check = (run2) => {
    if (run2 !== generation) throw new Error("Abertura cancelada.");
  };
  const stopChild = () => {
    const running = child;
    child = null;
    running?.kill();
  };
  async function launch(packageDir, bind, run2) {
    const configPath = node_path.join(deps.dir, "config.json");
    const config = buildGatewayConfig({
      baseConfig: await deps.defaultConfig(packageDir),
      bindAddress: bind,
      dataPath: node_path.join(deps.dir, "data.json"),
      deviceName: deps.deviceName()
    });
    await deps.writeConfig(configPath, config);
    check(run2);
    const running = deps.spawn(packageDir, configPath);
    child = running;
    running.onExit(() => {
      if (child !== running) return;
      child = null;
      access = {
        on: false,
        error: "O acesso pelo navegador foi interrompido. Ative-o de novo para tentar novamente."
      };
    });
    await waitUp(deps, `http://127.0.0.1:${GATEWAY_PORT}/`);
    check(run2);
    if (child !== running) throw new Error("O servidor do navegador encerrou durante a abertura.");
  }
  async function start(run2) {
    try {
      const packageDir = await deps.ensureFiles();
      check(run2);
      let credentials = await deps.vault.load();
      check(run2);
      if (!credentials) {
        const code = deps.generateCode();
        await launch(packageDir, `127.0.0.1:${GATEWAY_PORT}`, run2);
        const status = await deps.post(`http://127.0.0.1:${GATEWAY_PORT}/api/login`, {
          name: GATEWAY_USER,
          password: code
        });
        if (status !== 200) throw new Error("Não consegui criar o acesso do navegador.");
        check(run2);
        credentials = { username: GATEWAY_USER, password: code, port: GATEWAY_PORT };
        await deps.vault.save(credentials);
        check(run2);
        stopChild();
        await deps.sleep(500);
      }
      check(run2);
      await launch(packageDir, `0.0.0.0:${GATEWAY_PORT}`, run2);
      const address = deps.lanAddress();
      access = {
        on: true,
        url: address ? `http://${address}:${GATEWAY_PORT}` : void 0,
        user: credentials.username,
        code: credentials.password
      };
    } catch (cause) {
      if (run2 !== generation) return access;
      stopChild();
      access = { on: false, error: cause instanceof Error ? cause.message : String(cause) };
    }
    return access;
  }
  return {
    status: () => access,
    start() {
      if (pending) return pending;
      if (child) return Promise.resolve(access);
      const opening = start(++generation).finally(() => {
        if (pending === opening) pending = null;
      });
      pending = opening;
      return opening;
    },
    async stop() {
      generation++;
      pending = null;
      stopChild();
      access = { on: false };
    }
  };
}
const FIREWALL_RULE = "Horizonte (rede local) v2";
const USERNAME$2 = "horizonte";
const DOWNLOAD_SHARE$2 = 0.6;
const INSTALL_SHARE$2 = 0.9;
function stage(artifact, downloaded, variable) {
  return [
    `$stage = Join-Path $env:ProgramData 'Horizonte\\stage'`,
    "New-Item -ItemType Directory -Force -Path $stage | Out-Null",
    `$${variable} = Join-Path $stage ${psQuote(artifact.fileName)}`,
    `Copy-Item -LiteralPath ${psQuote(downloaded)} -Destination $${variable} -Force`,
    `if ((Get-FileHash -LiteralPath $${variable} -Algorithm SHA256).Hash -ne ${psQuote(artifact.sha256)}) { throw 'O arquivo mudou depois da conferência.' }`
  ];
}
const nativeCheck = (what, ok = "0") => `if (${ok.split(",").map((code) => `$LASTEXITCODE -ne ${code}`).join(" -and ")}) { throw "${what} terminou com o código $LASTEXITCODE" }`;
function createWindowsSetup(deps) {
  const sunshineExe = node_path.win32.join(deps.sunshineDir, "sunshine.exe");
  const sunshineConf = node_path.win32.join(deps.sunshineDir, "config", "sunshine.conf");
  async function run2(report, signal) {
    const step = (action) => setupStep(signal, action);
    const [running, responding, controllable, driverPresent, stored, portOpen, outdated] = await step(
      () => Promise.all([
        deps.probe.sunshineRunning(),
        deps.probe.sunshineResponding(),
        deps.probe.serviceControllable(),
        deps.probe.driverPresent(),
        deps.vault.load(),
        deps.probe.pairingPortOpen?.() ?? Promise.resolve(true),
        deps.probe.sunshineOutdated?.() ?? Promise.resolve(false)
      ])
    );
    const needSunshine = !running;
    const needMsi = needSunshine || outdated;
    const needCredentials = needSunshine || stored === null;
    const needDriver = !driverPresent;
    const needRestart = !needSunshine && !needCredentials && !responding;
    const needAccess = needMsi || !controllable;
    const needFirewall = !portOpen;
    if (!needMsi && !needCredentials && !needDriver && !needRestart && !needAccess && !needFirewall)
      return;
    if (needDriver && !await step(() => deps.confirmDriverTrust())) {
      throw new Error(
        "Sem a sua autorização para o certificado do monitor virtual, não consigo instalá-lo."
      );
    }
    const downloads = [];
    if (needMsi) downloads.push(SUNSHINE);
    if (needDriver) downloads.push(VIRTUAL_DISPLAY_DRIVER);
    const paths = /* @__PURE__ */ new Map();
    for (const [index, artifact] of downloads.entries()) {
      const dest = node_path.win32.join(deps.workDir, artifact.fileName);
      paths.set(artifact.fileName, dest);
      const what = artifact === SUNSHINE ? "o motor de transmissão" : "o monitor virtual";
      await step(
        () => deps.download(
          artifact,
          dest,
          (fraction2) => report({
            note: `Baixando ${what}`,
            fraction: (index + fraction2) / downloads.length * DOWNLOAD_SHARE$2
          }),
          signal
        )
      );
    }
    signal?.throwIfAborted();
    const credentials = needCredentials ? { username: USERNAME$2, password: deps.generatePassword(), port: deps.port } : stored;
    const steps = [];
    if (needMsi) {
      steps.push({
        description: "Instalar o motor de transmissão",
        script: [
          ...stage(SUNSHINE, paths.get(SUNSHINE.fileName), "msi"),
          `$p = Start-Process -FilePath msiexec.exe -ArgumentList '/i', $msi, '/qn', '/norestart' -Wait -PassThru`,
          'if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw "msiexec terminou com o código $($p.ExitCode)" }'
        ].join("\n")
      });
    }
    if (needAccess) {
      steps.push({
        description: "Permitir que o Horizonte reinicie o motor",
        script: [
          `$sddl = (sc.exe sdshow SunshineService | Where-Object { $_ -match '^D:' }) -join ''`,
          `if (-not $sddl) { throw 'Não consegui ler as permissões do serviço.' }`,
          `if ($sddl -notmatch '[(]A;;[A-Z]*WP[A-Z]*;;;IU[)]') {`,
          `  sc.exe sdset SunshineService ('D:(A;;RPWPLCLORC;;;IU)' + $sddl.Substring(2)) | Out-Null`,
          nativeCheck("sc sdset"),
          "}"
        ].join("\n")
      });
    }
    if (needFirewall) {
      steps.push({
        description: "Liberar o pareamento e o navegador na rede local",
        script: [
          `Get-NetFirewallRule -DisplayName ${psQuote(FIREWALL_RULE)} -ErrorAction SilentlyContinue | Remove-NetFirewallRule`,
          `New-NetFirewallRule -DisplayName ${psQuote(FIREWALL_RULE)} -Direction Inbound -Protocol TCP -LocalPort ${PIN_CHANNEL_PORT},${GATEWAY_PORT} -Profile Private -Action Allow | Out-Null`,
          `New-NetFirewallRule -DisplayName ${psQuote(FIREWALL_RULE)} -Direction Inbound -Protocol UDP -LocalPort ${WEBRTC_PORTS.min}-${WEBRTC_PORTS.max} -Profile Private -Action Allow | Out-Null`
        ].join("\n")
      });
    }
    if (needCredentials) {
      steps.push({
        description: "Criar o acesso do Horizonte ao motor",
        script: [
          `& ${psQuote(sunshineExe)} ${psQuote(sunshineConf)} --creds ${psQuote(credentials.username)} ${psQuote(credentials.password)}`,
          nativeCheck("sunshine --creds"),
          "Restart-Service -Name SunshineService -ErrorAction Stop"
        ].join("\n")
      });
    }
    if (needRestart) {
      steps.push({
        description: "Reiniciar o motor",
        script: "Restart-Service -Name SunshineService -ErrorAction Stop"
      });
    }
    if (needDriver) {
      steps.push({
        description: "Instalar o monitor virtual",
        script: [
          ...stage(
            VIRTUAL_DISPLAY_DRIVER,
            paths.get(VIRTUAL_DISPLAY_DRIVER.fileName),
            "zip"
          ),
          `$dir = Join-Path $stage 'driver'`,
          "Expand-Archive -LiteralPath $zip -DestinationPath $dir -Force",
          `$inf = Get-ChildItem -LiteralPath $dir -Recurse -Filter 'MttVDD.inf' | Select-Object -First 1`,
          `$cer = Get-ChildItem -LiteralPath $dir -Recurse -Filter 'Virtual_Display_Driver.cer' | Select-Object -First 1`,
          `if (-not $inf -or -not $cer) { throw 'O pacote do driver veio incompleto.' }`,
          DRIVER_INSTALL_SCRIPT
        ].join("\n")
      });
    }
    steps.push({
      description: "Limpar arquivos temporários",
      script: `Remove-Item -Recurse -Force -LiteralPath (Join-Path $env:ProgramData 'Horizonte\\stage') -ErrorAction SilentlyContinue`
    });
    report({
      note: needMsi ? "Instalando o motor de transmissão (confirme o aviso do Windows)" : needDriver ? "Instalando o monitor virtual (confirme o aviso do Windows)" : "Ajustando o motor (confirme o aviso do Windows)",
      fraction: DOWNLOAD_SHARE$2,
      permission: true
    });
    await step(() => deps.elevation.runElevated(steps));
    if (needCredentials) await step(() => deps.vault.save(credentials));
    if (needMsi || needCredentials || needRestart) {
      report({ note: "Esperando o motor ligar", fraction: INSTALL_SHARE$2 });
      await step(() => deps.waitForApi());
    }
    report({ note: "Motor pronto", fraction: 1 });
  }
  const ensure = createSetupTask(run2);
  return {
    installer: { ensureInstalled: ensure },
    display: {
      ensureVirtualDisplay: (signal) => ensure(void 0, signal),
      isVirtual: (display) => /vdd|virtual/i.test(display.friendlyName)
    }
  };
}
function isOlder(installed, pinned) {
  const parse = (v) => /^\d+(\.\d+)*$/.test(v) ? v.split(".").map(Number) : null;
  const a = parse(installed);
  const b = parse(pinned);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
const runPowerShell = (script, timeoutMs = 2e4) => new Promise((resolve, reject) => {
  node_child_process.execFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { timeout: timeoutMs, windowsHide: true },
    (error, stdout) => error ? reject(error) : resolve(stdout)
  );
});
function createProbe$2(run2) {
  const ask = async (script) => {
    try {
      return (await run2(script)).trim();
    } catch {
      return "";
    }
  };
  return {
    sunshineRunning: async () => await ask("(Get-Service -Name SunshineService -ErrorAction SilentlyContinue).Status") === "Running",
    sunshineResponding: async () => await ask(
      "[bool](Get-NetTCPConnection -LocalPort 47990 -State Listen -ErrorAction SilentlyContinue)"
    ) === "True",
    serviceControllable: async () => (
      // O padrão do Windows já traz uma regra para IU (só leitura); o que importa é ela poder parar (WP).
      /[(]A;;[A-Z]*WP[A-Z]*;;;IU[)]/.test(await ask('(sc.exe sdshow SunshineService) -join " "'))
    ),
    pairingPortOpen: async () => await ask(
      `[bool](Get-NetFirewallRule -DisplayName '${FIREWALL_RULE}' -ErrorAction SilentlyContinue)`
    ) === "True",
    sunshineOutdated: async () => {
      const installed = await ask(
        "(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'Sunshine' } | Select-Object -First 1).DisplayVersion"
      );
      return isOlder(installed.trim(), SUNSHINE.version);
    },
    driverPresent: async () => await ask(
      "[bool](Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.Class -eq 'Display' -and $_.Status -eq 'OK' -and ($_.HardwareID -contains 'Root\\MttVDD' -or $_.FriendlyName -match 'Virtual Display Driver|VDD by MTT') })"
    ) === "True"
  };
}
const isCredentials = (value) => {
  if (typeof value !== "object" || value === null) return false;
  const v = value;
  return typeof v["username"] === "string" && typeof v["password"] === "string" && typeof v["port"] === "number" && Number.isInteger(v["port"]) && v["port"] > 0 && v["port"] < 65535;
};
function createCredentialVault(deps) {
  let writes = Promise.resolve();
  const enqueue = (write) => {
    const pending = writes.then(write);
    writes = pending.catch(() => void 0);
    return pending;
  };
  return {
    save(credentials) {
      const value = { ...credentials };
      return enqueue(async () => {
        if (!deps.cipher.isAvailable()) {
          throw new Error("O cofre de senhas do sistema não está disponível para guardar a senha.");
        }
        const data = deps.cipher.encrypt(JSON.stringify(value));
        const temp = `${deps.file}.tmp`;
        try {
          await promises.mkdir(node_path.dirname(deps.file), { recursive: true });
          await promises.writeFile(temp, data);
          await promises.rename(temp, deps.file);
        } catch {
          await promises.rm(temp, { force: true });
          throw new Error("Não consegui gravar a senha do motor de transmissão no cofre.");
        }
      });
    },
    async load() {
      try {
        if (!deps.cipher.isAvailable()) return null;
        const raw = await promises.readFile(deps.file);
        const parsed = JSON.parse(deps.cipher.decrypt(raw));
        return isCredentials(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    clear() {
      return enqueue(() => promises.rm(deps.file, { force: true }));
    }
  };
}
function placementScript(side) {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class HzPlace {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DISPLAY_DEVICE {
    public int cb; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceString; public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceKey; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmDeviceName; public short dmSpecVersion;
    public short dmDriverVersion; public short dmSize; public short dmDriverExtra; public int dmFields;
    public int dmPositionX; public int dmPositionY; public int dmDisplayOrientation; public int dmDisplayFixedOutput;
    public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmFormName; public short dmLogPixels;
    public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight; public int dmDisplayFlags;
    public int dmDisplayFrequency; public int dmICMMethod; public int dmICMIntent; public int dmMediaType;
    public int dmDitherType; public int dmReserved1; public int dmReserved2; public int dmPanningWidth; public int dmPanningHeight; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool EnumDisplayDevices(string dev, uint i, ref DISPLAY_DEVICE d, uint f);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool EnumDisplaySettings(string dev, int mode, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int ChangeDisplaySettingsEx(string dev, ref DEVMODE dm, IntPtr hwnd, uint flags, IntPtr param);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int ChangeDisplaySettingsEx(string dev, IntPtr dm, IntPtr hwnd, uint flags, IntPtr param);
}
'@
$virtual = $null; $others = @()
for ($i = 0; $i -lt 32; $i++) {
  $a = New-Object HzPlace+DISPLAY_DEVICE; $a.cb = [Runtime.InteropServices.Marshal]::SizeOf($a)
  # [NullString]::Value: o PowerShell troca $null por texto vazio, e a API então não lista nada.
  if (-not [HzPlace]::EnumDisplayDevices([NullString]::Value, $i, [ref]$a, 0)) { break }
  if (($a.StateFlags -band 1) -eq 0) { continue }
  $m = New-Object HzPlace+DISPLAY_DEVICE; $m.cb = [Runtime.InteropServices.Marshal]::SizeOf($m)
  [void][HzPlace]::EnumDisplayDevices($a.DeviceName, 0, [ref]$m, 0)
  $dm = New-Object HzPlace+DEVMODE; $dm.dmSize = [Runtime.InteropServices.Marshal]::SizeOf($dm)
  if (-not [HzPlace]::EnumDisplaySettings($a.DeviceName, -1, [ref]$dm)) { continue }
  $entry = [pscustomobject]@{ Name = $a.DeviceName; Mode = $dm }
  if ($m.DeviceID -match 'MTT1337') { $virtual = $entry } else { $others += $entry }
}
if (-not $virtual -or $others.Count -eq 0) { 'sem-virtual'; exit 0 }
$left = ($others | ForEach-Object { $_.Mode.dmPositionX } | Measure-Object -Minimum).Minimum
$right = ($others | ForEach-Object { $_.Mode.dmPositionX + $_.Mode.dmPelsWidth } | Measure-Object -Maximum).Maximum
$top = ($others | ForEach-Object { $_.Mode.dmPositionY } | Measure-Object -Minimum).Minimum
$dm = $virtual.Mode
switch ('${side}') {
  'left' { $x = $left - $dm.dmPelsWidth; $y = $top }
  'above' { $x = $left; $y = $top - $dm.dmPelsHeight }
  default { $x = $right; $y = $top }
}
if ($dm.dmPositionX -eq $x -and $dm.dmPositionY -eq $y) { 'ja'; exit 0 }
$dm.dmPositionX = $x; $dm.dmPositionY = $y; $dm.dmFields = 0x20
# CDS_UPDATEREGISTRY | CDS_NORESET: grava e só aplica no fim, tudo de uma vez.
$r = [HzPlace]::ChangeDisplaySettingsEx($virtual.Name, [ref]$dm, [IntPtr]::Zero, 0x10000001, [IntPtr]::Zero)
if ($r -ne 0) { throw "ChangeDisplaySettingsEx: $r" }
[void][HzPlace]::ChangeDisplaySettingsEx([NullString]::Value, [IntPtr]::Zero, [IntPtr]::Zero, 0, [IntPtr]::Zero)
'ok'
`;
}
const SUNSHINE_DIR = "C:\\Program Files\\Sunshine";
const PORT$2 = 47989;
const SUNSHINE_LOG$2 = node_path.join(SUNSHINE_DIR, "config", "sunshine.log");
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const generatePassword = () => Array.from(node_crypto.randomBytes(32), (byte) => ALPHABET[byte % ALPHABET.length]).join("");
async function waitForApi(ping, sleep, attempts = 40) {
  for (let attempt2 = 0; attempt2 < attempts; attempt2 += 1) {
    try {
      await ping();
      return;
    } catch {
      await sleep(1500);
    }
  }
  throw new Error(
    "O motor de transmissão não respondeu depois de instalado. Tente de novo em instantes."
  );
}
const toCipher = (storage) => ({
  isAvailable: () => storage.isEncryptionAvailable() && storage.getSelectedStorageBackend?.() !== "basic_text",
  encrypt: (plain) => storage.encryptString(plain),
  decrypt: (data) => storage.decryptString(data)
});
function createWindowsPlatform(deps) {
  const vault = createCredentialVault({
    file: node_path.join(deps.userData, "sunshine.bin"),
    cipher: deps.cipher
  });
  const createApi = (c) => new SunshineApi({ port: c.port, username: c.username, password: c.password });
  const setup = createWindowsSetup({
    probe: createProbe$2(runPowerShell),
    vault,
    download: downloadVerified,
    elevation: createElevation({ run: runWithUac, tmpDir: node_os.tmpdir() }),
    confirmDriverTrust: deps.confirmDriverTrust,
    waitForApi: async () => {
      const credentials = await vault.load();
      if (!credentials) throw new Error("A senha do motor de transmissão não foi guardada.");
      await waitForApi(() => createApi(credentials).getConfig(), deps.sleep);
    },
    generatePassword,
    workDir: node_os.tmpdir(),
    sunshineDir: SUNSHINE_DIR,
    port: PORT$2
  });
  const restart = async () => {
    await runPowerShell("Restart-Service -Name SunshineService -ErrorAction Stop", 9e4);
  };
  return {
    ...setup,
    display: {
      ...setup.display,
      place: async (side) => {
        await runPowerShell(placementScript(side), 3e4);
      }
    },
    restart,
    createApi,
    credentials: async () => {
      const stored = await vault.load();
      if (!stored)
        throw new Error("O motor de transmissão ainda não foi configurado pelo Horizonte.");
      return stored;
    }
  };
}
function sessionKind(env) {
  const type = (env.XDG_SESSION_TYPE ?? "").toLowerCase();
  if (type === "x11") return "x11";
  if (type === "wayland") return "wayland";
  return env.WAYLAND_DISPLAY ? "wayland" : env.DISPLAY ? "x11" : "unknown";
}
const join$3 = node_path.posix.join;
const SUNSHINE_UNIT = "app-dev.lizardbyte.app.Sunshine.service";
const MONITOR_NAME = "HorizonteVirtual";
const USERNAME$1 = "horizonte";
const DOWNLOAD_SHARE$1 = 0.6;
const INSTALL_SHARE$1 = 0.9;
const shQuote = (value) => `'${value.replace(/'/g, `'\\''`)}'`;
const INSTALL_COMMAND = {
  deb: 'DEBIAN_FRONTEND=noninteractive apt-get install -y "$stage/$pkg"',
  "rpm-dnf": 'dnf install -y --nogpgcheck "$stage/$pkg"',
  "rpm-zypper": 'zypper --non-interactive install --allow-unsigned-rpm "$stage/$pkg"',
  pacman: 'pacman -U --noconfirm "$stage/$pkg"'
};
const FIREWALL_SCRIPT = [
  "if command -v ufw >/dev/null && systemctl is-active --quiet ufw; then",
  "  for net in 192.168.0.0/16 10.0.0.0/8 172.16.0.0/12; do",
  '    ufw allow from "$net" to any port 24800,47900,47901,47984,47989,48010 proto tcp',
  '    ufw allow from "$net" to any port 47998,47999,48000,48002,48010 proto udp',
  "  done",
  "fi"
].join("\n");
const MARK_FIREWALL = "mkdir -p ~/.config/horizonte && touch ~/.config/horizonte/firewall-ok-v2";
const PORTAL_VIRTUAL_SCRIPT = [
  `dir=~/.config/systemd/user/${SUNSHINE_UNIT}.d`,
  'file="$dir/horizonte.conf"',
  "line='Environment=SUNSHINE_PORTAL_VIRTUAL=1'",
  'if ! grep -qx "$line" "$file" 2>/dev/null; then',
  '  mkdir -p "$dir"',
  `  printf '[Service]\\n%s\\n' "$line" > "$file"`,
  "  systemctl --user daemon-reload",
  `  systemctl --user try-restart ${SUNSHINE_UNIT}`,
  "fi"
].join("\n");
const MIRROR_NOTE = "Sem monitor extra neste sistema: vou espelhar a tela principal no outro dispositivo.";
const VIRTUAL_MONITOR_SCRIPT = [
  "set -e",
  "size=$(xrandr --current | sed -n 's/^Screen 0:.*current \\([0-9]*\\) x \\([0-9]*\\).*/\\1 \\2/p')",
  "set -- $size",
  '[ -n "$1" ] || { echo "Não consegui ler o tamanho da tela" >&2; exit 1; }',
  "xrandr --fb $(($1 + 1920))x$(($2 > 1080 ? $2 : 1080))",
  `xrandr --setmonitor ${MONITOR_NAME} 1920/508x1080/286+$1+0 none`
].join("\n");
function createLinuxSetup(deps) {
  let mirror = false;
  let portal = false;
  async function run2(report, signal) {
    signal?.throwIfAborted();
    const step = (action) => setupStep(signal, action);
    const [installed, active, responding, stored, monitor, firewall] = await step(
      () => Promise.all([
        deps.probe.sunshineInstalled(),
        deps.probe.serviceActive(),
        deps.probe.sunshineResponding(),
        deps.vault.load(),
        sessionKind(deps.env) === "wayland" ? false : deps.probe.monitorPresent(),
        deps.probe.firewallReady()
      ])
    );
    let upgrade = false;
    if (installed && !await step(() => deps.probe.sunshinePatched())) {
      try {
        upgrade = deps.packageForThisSystem().horizonte === true;
      } catch {
      }
    }
    const needInstall = !installed || upgrade;
    const needCredentials = needInstall || stored === null;
    const needStart = !active || !responding;
    if (needInstall) {
      const pkg = deps.packageForThisSystem();
      const file = join$3(deps.workDir, pkg.fileName);
      report({ note: "Baixando o motor de transmissão", fraction: 0 });
      await step(
        () => deps.download(
          pkg,
          file,
          (f) => report({ note: "Baixando o motor de transmissão", fraction: f * DOWNLOAD_SHARE$1 }),
          signal
        )
      );
      report({
        note: "Instalando o motor de transmissão (confirme o aviso do sistema)",
        fraction: DOWNLOAD_SHARE$1,
        permission: true
      });
      await step(
        () => deps.runPrivileged(
          [
            "set -e",
            "stage=/var/lib/horizonte/stage",
            `pkg=${shQuote(pkg.fileName)}`,
            'mkdir -p "$stage"',
            `install -m 600 ${shQuote(file)} "$stage/$pkg"`,
            `echo ${shQuote(`${pkg.sha256}  `)}"$stage/$pkg" | sha256sum -c - >/dev/null`,
            INSTALL_COMMAND[pkg.kind],
            ...firewall ? [] : [FIREWALL_SCRIPT],
            'rm -rf "$stage"'
          ].join("\n")
        )
      );
    }
    if (!firewall) {
      if (!needInstall) {
        report({
          note: "Liberando o motor no firewall (confirme o aviso do sistema)",
          fraction: DOWNLOAD_SHARE$1,
          permission: true
        });
        await step(() => deps.runPrivileged(["set -e", FIREWALL_SCRIPT].join("\n")));
      }
      await step(() => deps.runUser(MARK_FIREWALL));
    }
    if (needCredentials) {
      signal?.throwIfAborted();
      const credentials = {
        username: USERNAME$1,
        password: deps.generatePassword(),
        port: deps.port
      };
      await step(
        () => deps.runUser(
          `sunshine --creds ${shQuote(credentials.username)} ${shQuote(credentials.password)}`
        )
      );
      await step(() => deps.vault.save(credentials));
    }
    if (needInstall || needCredentials || needStart) {
      report({ note: "Ligando o motor de transmissão", fraction: INSTALL_SHARE$1 });
      await step(
        () => deps.runUser(
          needCredentials || active && !responding ? `systemctl --user enable ${SUNSHINE_UNIT} && systemctl --user restart ${SUNSHINE_UNIT}` : `systemctl --user enable --now ${SUNSHINE_UNIT}`
        )
      );
      await step(() => deps.waitForApi());
    }
    mirror = false;
    portal = false;
    if (sessionKind(deps.env) === "wayland") {
      portal = await step(
        async () => await deps.probe.sunshinePatched() && await deps.probe.portalVirtualSupported()
      );
      if (portal) await step(() => deps.runUser(PORTAL_VIRTUAL_SCRIPT));
      else mirror = true;
    } else if (!monitor) {
      try {
        await step(() => deps.runUser(VIRTUAL_MONITOR_SCRIPT));
      } catch {
        mirror = true;
      }
    }
    if (mirror) report({ note: MIRROR_NOTE, fraction: 1 });
    else report({ note: "Motor pronto", fraction: 1 });
  }
  const ensure = createSetupTask(run2);
  return {
    installer: { ensureInstalled: ensure },
    display: {
      ensureVirtualDisplay: (signal) => ensure(void 0, signal),
      // No espelho, a "tela virtual" é a principal: a que está na origem do desktop.
      config: () => portal ? { capture: "portal" } : {},
      // O portal ignora o número da saída e usa o monitor que ele mesmo criou.
      outputName: () => portal ? "0" : null,
      isVirtual: (display) => mirror ? display.primary || display.originX === 0 : display.friendlyName.includes(MONITOR_NAME)
    }
  };
}
const join$2 = node_path.posix.join;
async function ensureMoonlightLinux(deps, onProgress) {
  const target = join$2(deps.dir, `Moonlight-${deps.artifact.version}.AppImage`);
  if (!await deps.exists(target)) {
    await deps.run(`mkdir -p ${shQuote(deps.dir)}`);
    await deps.download(deps.artifact, target, (f) => onProgress?.(f * 0.95));
  }
  await deps.run(`chmod +x ${shQuote(target)}`);
  return target;
}
const GNOME_PLACEMENT_SCRIPT = String.raw`
import sys, gi
gi.require_version('Gio', '2.0')
from gi.repository import Gio, GLib
side = sys.argv[1]
bus = Gio.bus_get_sync(Gio.BusType.SESSION)
P = ('org.gnome.Mutter.DisplayConfig', '/org/gnome/Mutter/DisplayConfig', 'org.gnome.Mutter.DisplayConfig')
placed = set()

def place():
    serial, monitors, logical, _ = bus.call_sync(*P, 'GetCurrentState', None, None, 0, -1, None).unpack()
    modes = {}
    for spec, list_, _p in monitors:
        for m in list_:
            if m[6].get('is-current'): modes[spec[0]] = m
    virtual = [l for l in logical if any(s[0].startswith('Meta-') for s in l[5])]
    real = [l for l in logical if l not in virtual]
    names = {s[0] for l in virtual for s in l[5]}
    placed.intersection_update(names)
    fresh = [l for l in virtual if l[5][0][0] not in placed]
    if not fresh or not real: return
    v = fresh[0]
    size = lambda l: (int(modes[l[5][0][0]][1] / l[2]), int(modes[l[5][0][0]][2] / l[2]))
    vw, vh = size(v)
    left = min(l[0] for l in real); top = min(l[1] for l in real)
    right = max(l[0] + size(l)[0] for l in real)
    x, y = {'left': (left - vw, top), 'above': (left, top - vh)}.get(side, (right, top))
    placed.add(v[5][0][0])
    if (x, y) == (v[0], v[1]): return
    ox = min(x, left); oy = min(y, top)
    def lm(l, lx, ly): return (lx - ox, ly - oy, l[2], l[3], l[4], [(s[0], modes[s[0]][0], {}) for s in l[5]])
    config = [lm(l, l[0], l[1]) for l in logical if l is not v] + [lm(v, x, y)]
    bus.call_sync(*P, 'ApplyMonitorsConfig', GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', (serial, 1, config, {})), None, 0, -1, None)

def safe(*_):
    try: place()
    except Exception as error: print(error, file=sys.stderr, flush=True)

bus.signal_subscribe(P[0], P[2], 'MonitorsChanged', P[1], None, 0, safe)
loop = GLib.MainLoop()
GLib.io_add_watch(GLib.IOChannel.unix_new(0), GLib.PRIORITY_DEFAULT, GLib.IO_IN | GLib.IO_HUP, lambda *_: (loop.quit(), False)[1])
safe()
loop.run()
`;
function createGnomePlacer(env) {
  let current = null;
  return async (side) => {
    if (!/gnome/i.test(env.XDG_CURRENT_DESKTOP ?? "")) return;
    current?.kill();
    const child = node_child_process.spawn("python3", ["-c", GNOME_PLACEMENT_SCRIPT, side], {
      stdio: ["pipe", "ignore", "ignore"]
    });
    child.on("error", () => void 0);
    current = { kill: () => void child.kill() };
  };
}
const VERSION = "2026.914.233613";
const base$1 = `https://github.com/LizardByte/Sunshine/releases/download/v${VERSION}`;
const pin = (kind, fileName, sha256) => ({
  kind,
  version: VERSION,
  fileName,
  url: `${base$1}/${encodeURIComponent(fileName)}`,
  sha256
});
const deb = (suffix, sha256) => pin("deb", `sunshine_${VERSION}-1+${suffix}_amd64.deb`, sha256);
const fedora = (release, sha256) => pin("rpm-dnf", `Sunshine-${VERSION}-1.fc${release}.x86_64.rpm`, sha256);
const suse = (flavor, sha256) => pin("rpm-zypper", `Sunshine-${VERSION}-1.suse.${flavor}.x86_64.rpm`, sha256);
const horizonteDeb = (ubuntu, sha256) => {
  const fileName = `sunshine-horizonte-ubuntu${ubuntu}-amd64.deb`;
  return {
    kind: "deb",
    horizonte: true,
    version: "2026.914.2336131",
    fileName,
    url: `https://github.com/mapompeo/horizonte/releases/download/motores-hz1/${fileName}`,
    sha256
  };
};
const UBUNTU = {
  "22.04": horizonteDeb(
    "22.04",
    "94894e6e31b0e2aaacbb67ee99bdf62cdd7cdf82f952396478fcfefbd94e5d23"
  ),
  "24.04": horizonteDeb(
    "24.04",
    "9bcd26121324f0683deb3d5e20ecbf1e90bfc76dae93a063f58736615414b248"
  ),
  "26.04": horizonteDeb(
    "26.04",
    "3aafe5ae4a481fc443928cf9948d7dad8bf4906f62fb781ed1c1a7e63794add2"
  ),
  "26.10": deb("ubuntu26.10", "1cedccbf3ce7836f1e83a74c23dd8dd7b49e2a0d341198f5b3ca47145244aedd")
};
const UBUNTU_BY_CODENAME = {
  jammy: "22.04",
  noble: "24.04",
  resolute: "26.04"
};
const DEBIAN = {
  "13": deb("debiantrixie", "a86f858cbae57f60ecebd445402ee0295c1c057b857bd45d44c2ea2d255cbbfb")
};
const FEDORA = {
  "43": fedora("43", "e44612e6e85458a183dc47a535c93c367ecf7f260b05daeac54bf0f4f5637080"),
  "44": fedora("44", "2abb16033ecde677f5c45322b39b6d6ae4cf297ac3e36707aa90bd3911d0e00f"),
  "45": fedora("45", "a46b83e8c8e6c8fc2e0601464b43e9c3fd2f67907a23b537ea64ff58ba4fadf3"),
  "46": fedora("46", "451c6c1ccee6edaa8734f12cd3fb9b0ffe2ce3d21cfe2681c9e9fd8c17c859c1")
};
const SUSE_LEAP_16 = suse(
  "lp160",
  "092b631afd236098f45641eed1ce67c237e67b7ff52d9d391ba83eafac9101eb"
);
const SUSE_TUMBLEWEED = suse(
  "tw",
  "33418d232f959ac1698c6f11f90e25bb018c33da5cbf616c3a18b412de67d7e4"
);
const ARCH = pin(
  "pacman",
  `sunshine-${VERSION}-1-x86_64.pkg.tar.zst`,
  "17eb8c4d823a2693038f40aeeab56943ef0d5d6ace8ac90b3693905b0acbba87"
);
function sunshinePackageFor(osRelease, arch) {
  const field = (name) => new RegExp(`^${name}="?([^"
]*)"?$`, "m").exec(osRelease)?.[1] ?? "";
  if (arch !== "x64") {
    throw new Error("Por enquanto o Horizonte no Linux só instala em processador x64.");
  }
  const id = field("ID");
  const family2 = /* @__PURE__ */ new Set([id, ...field("ID_LIKE").split(/\s+/)]);
  const version = field("VERSION_ID");
  const unsupported = (name) => new Error(`${name} ${version} ainda não tem pacote do motor de transmissão no Horizonte.`);
  if (id === "ubuntu" || family2.has("ubuntu")) {
    const release = id === "ubuntu" ? version : UBUNTU_BY_CODENAME[field("UBUNTU_CODENAME")] ?? version;
    const found = UBUNTU[release];
    if (!found) throw unsupported("O Ubuntu");
    return found;
  }
  if (id === "debian" || family2.has("debian")) {
    const found = DEBIAN[version.split(".")[0] ?? ""];
    if (!found) throw unsupported("O Debian");
    return found;
  }
  if (id === "fedora" || family2.has("fedora")) {
    const found = FEDORA[version];
    if (!found) throw unsupported("O Fedora");
    return found;
  }
  if (id === "opensuse-tumbleweed") return SUSE_TUMBLEWEED;
  if (id === "opensuse-leap" || id === "sles" || family2.has("suse")) {
    if (version.startsWith("16")) return SUSE_LEAP_16;
    throw unsupported("O openSUSE");
  }
  if (id === "arch" || family2.has("arch")) return ARCH;
  throw new Error(
    "Esta distribuição ainda não tem pacote do motor de transmissão no Horizonte. Funciona no Ubuntu, Debian 13, Fedora, openSUSE e Arch (e derivados)."
  );
}
const MOONLIGHT_LINUX_APPIMAGE = {
  version: "6.1.0-hz1",
  fileName: "Moonlight-horizonte-x86_64.AppImage",
  url: "https://github.com/mapompeo/horizonte/releases/download/motores-hz1/Moonlight-horizonte-x86_64.AppImage",
  sha256: "1e6e0fdd004a60953710f531ad4d5c403614ded7814eccea56c9d825bbf07b4f"
};
const PORT$1 = 47989;
const SUNSHINE_LOG$1 = node_path.join(node_os.homedir(), ".config", "sunshine", "sunshine.log");
const sh$1 = (command, args, timeoutMs) => new Promise((resolve, reject) => {
  node_child_process.execFile(
    command,
    args,
    { timeout: timeoutMs },
    (error, _out, stderr) => error ? reject(new Error(stderr.trim() || error.message)) : resolve()
  );
});
const succeeds$1 = (script) => sh$1("sh", ["-c", script], 15e3).then(
  () => true,
  () => false
);
const createProbe$1 = () => ({
  sunshineInstalled: () => succeeds$1("command -v sunshine"),
  serviceActive: () => succeeds$1(`systemctl --user is-active --quiet ${SUNSHINE_UNIT}`),
  sunshineResponding: () => succeeds$1('ss -ltn | grep -q ":47990 "'),
  monitorPresent: () => succeeds$1(`xrandr --listmonitors | grep -q ${MONITOR_NAME}`),
  firewallReady: () => succeeds$1("! systemctl is-active --quiet ufw || test -e ~/.config/horizonte/firewall-ok-v2"),
  sunshinePatched: () => succeeds$1('grep -q -a SUNSHINE_PORTAL_VIRTUAL "$(command -v sunshine)"'),
  // AvailableSourceTypes é um bitmask: 4 = monitor virtual.
  portalVirtualSupported: () => succeeds$1(
    't=$(busctl --user get-property org.freedesktop.portal.Desktop /org/freedesktop/portal/desktop org.freedesktop.portal.ScreenCast AvailableSourceTypes | cut -d" " -f2) && [ $((t & 4)) -ne 0 ]'
  )
});
function createMoonlightLauncher$1(userData) {
  return () => ensureMoonlightLinux({
    dir: node_path.join(userData, "moonlight"),
    artifact: MOONLIGHT_LINUX_APPIMAGE,
    exists: (path2) => succeeds$1(`test -e ${shQuote(path2)}`),
    download: downloadVerified,
    run: (script) => sh$1("sh", ["-c", script], 3e4)
  });
}
function createLinuxPlatform(deps) {
  const vault = createCredentialVault({
    file: node_path.join(deps.userData, "sunshine.bin"),
    cipher: deps.cipher
  });
  const createApi = (c) => new SunshineApi({ port: c.port, username: c.username, password: c.password });
  const setup = createLinuxSetup({
    probe: createProbe$1(),
    vault,
    download: downloadVerified,
    // O pkexec mostra o aviso de senha do sistema (polkit) uma única vez.
    runPrivileged: (script) => sh$1("pkexec", ["sh", "-c", script], 6e5),
    runUser: (script) => sh$1("sh", ["-c", script], 12e4),
    // Lido só na hora de instalar: o arquivo existe apenas no Linux.
    packageForThisSystem: () => sunshinePackageFor(node_fs.readFileSync("/etc/os-release", "utf8"), process.arch),
    env: process.env,
    waitForApi: async () => {
      const credentials = await vault.load();
      if (!credentials) throw new Error("A senha do motor de transmissão não foi guardada.");
      await waitForApi(() => createApi(credentials).getConfig(), deps.sleep);
    },
    generatePassword,
    workDir: node_os.tmpdir(),
    port: PORT$1
  });
  return {
    ...setup,
    display: { ...setup.display, place: createGnomePlacer(process.env) },
    restart: () => sh$1("systemctl", ["--user", "restart", SUNSHINE_UNIT], 9e4),
    createApi,
    credentials: async () => {
      const stored = await vault.load();
      if (!stored)
        throw new Error("O motor de transmissão ainda não foi configurado pelo Horizonte.");
      return stored;
    }
  };
}
function lanAddress(interfaces = node_os.networkInterfaces()) {
  const candidates = Object.values(interfaces).flat().flatMap((i) => i && i.family === "IPv4" && !i.internal ? [i.address] : []).filter(
    (a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a) && !a.startsWith("192.168.56.")
  );
  return candidates[0];
}
const TARGETS = {
  win32: {
    artifact: MOONLIGHT_WEB,
    exe: "web-server.exe",
    extract: async (zip, into) => {
      await runPowerShell(
        `Expand-Archive -LiteralPath ${psQuote(zip)} -DestinationPath ${psQuote(into)} -Force`,
        12e4
      );
    }
  },
  linux: {
    artifact: MOONLIGHT_WEB_LINUX,
    exe: "web-server",
    extract: (tgz, into) => new Promise((resolve, reject) => {
      node_child_process.execFile("tar", ["-xzf", tgz, "-C", into], (error) => error ? reject(error) : resolve());
    })
  }
};
const unavailable = {
  status: () => ({ on: false }),
  stop: async () => void 0,
  start: async () => ({
    on: false,
    error: "Receber pelo navegador ainda não está disponível neste sistema."
  })
};
function createRealGateway(deps) {
  const target = TARGETS[process.platform];
  if (!target || process.arch !== "x64") return unavailable;
  const dir = node_path.join(deps.userData, "web");
  const packageDir = node_path.join(dir, "package");
  return createGateway({
    dir,
    deviceName: deps.deviceName,
    sleep: deps.sleep,
    generateCode: () => generatePassword().slice(0, 8),
    lanAddress: () => lanAddress(),
    vault: createCredentialVault({ file: node_path.join(deps.userData, "web.bin"), cipher: deps.cipher }),
    ensureFiles: async () => {
      if (!node_fs.existsSync(node_path.join(packageDir, target.exe))) {
        const file = node_path.join(node_os.tmpdir(), target.artifact.fileName);
        await downloadVerified(target.artifact, file);
        await promises.mkdir(dir, { recursive: true });
        await target.extract(file, dir);
      }
      return packageDir;
    },
    defaultConfig: (pkg) => new Promise((resolve, reject) => {
      node_child_process.execFile(
        node_path.join(pkg, target.exe),
        ["print-config"],
        { cwd: pkg, timeout: 15e3 },
        (error, out) => {
          if (error) return reject(error);
          try {
            resolve(JSON.parse(out));
          } catch (cause) {
            reject(cause);
          }
        }
      );
    }),
    writeConfig: async (path2, config) => {
      await promises.mkdir(dir, { recursive: true });
      await promises.writeFile(path2, JSON.stringify(config, null, 2), "utf8");
    },
    spawn: (pkg, configPath) => {
      const child = node_child_process.spawn(node_path.join(pkg, target.exe), ["--config-path", configPath], {
        cwd: pkg,
        stdio: "ignore",
        windowsHide: true
      });
      child.on("error", () => void 0);
      return { kill: () => void child.kill(), onExit: (l) => void child.once("exit", l) };
    },
    post: async (url, body) => (await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5e3)
    })).status,
    ping: async (url) => {
      await fetch(url, { signal: AbortSignal.timeout(1500) });
    }
  });
}
const join$1 = node_path.posix.join;
const SIMPLE_NAME = /^[A-Za-z0-9._ -]+$/;
async function ensureMoonlightMac(deps, onProgress) {
  const app = join$1(deps.dir, "Moonlight.app");
  const plist = join$1(app, "Contents", "Info.plist");
  const executable = async () => {
    const name = (await deps.run(`plutil -extract CFBundleExecutable raw -o - ${shQuote(plist)}`)).trim();
    if (!SIMPLE_NAME.test(name) || name === "." || name === "..") {
      throw new Error("O Moonlight instalado tem um Info.plist que o Horizonte não entende.");
    }
    return join$1(app, "Contents", "MacOS", name);
  };
  const installed = await deps.exists(plist) && await deps.exists(await executable());
  if (!installed) {
    const file = join$1(deps.workDir, deps.artifact.fileName);
    await deps.download(deps.artifact, file, (f) => onProgress?.(f * 0.8));
    await deps.run(
      [
        "set -e",
        "mnt=$(mktemp -d)",
        `trap 'hdiutil detach "$mnt" -quiet >/dev/null 2>&1 || true' EXIT`,
        `hdiutil attach ${shQuote(file)} -nobrowse -readonly -quiet -mountpoint "$mnt"`,
        `app=$(find "$mnt" -maxdepth 2 -name '*.app' -type d | head -n 1)`,
        'test -n "$app"',
        `mkdir -p ${shQuote(deps.dir)}`,
        `rm -rf ${shQuote(app)}`,
        `cp -R "$app" ${shQuote(app)}`
      ].join("\n")
    );
  }
  const path2 = await executable();
  if (!await deps.exists(path2)) throw new Error("O pacote do Moonlight veio sem o executável.");
  return path2;
}
const join = node_path.posix.join;
const USERNAME = "horizonte";
const DOWNLOAD_SHARE = 0.6;
const INSTALL_SHARE = 0.85;
const SUNSHINE_PROCESS = "Sunshine";
const SCREEN_RECORDING_PANE = "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";
const ONE_SCREEN_MESSAGE = 'Este Mac só tem uma tela, e o macOS não cria monitor virtual sozinho. Para estender a tela, conecte um plugue HDMI "dummy" ou instale o BetterDisplay (ele cria um monitor virtual), e abra o Horizonte de novo.';
const VIRTUAL_DISPLAY_FAILED_MESSAGE = 'Não consegui criar o monitor virtual neste Mac. Conecte um plugue HDMI "dummy" ou instale o BetterDisplay (ele cria um monitor virtual), e abra o Horizonte de novo.';
function createMacSetup(deps) {
  const app = join(deps.appsDir, "Sunshine.app");
  const binary = join(app, "Contents", "MacOS", SUNSHINE_PROCESS);
  async function run2(report, signal) {
    const step = (action) => setupStep(signal, action);
    const [installed, responding, stored, screens] = await step(
      () => Promise.all([
        deps.probe.sunshineInstalled(),
        deps.probe.sunshineResponding(),
        deps.vault.load(),
        deps.probe.displayCount()
      ])
    );
    let screenCount = screens;
    if (screenCount < 2) {
      if (!deps.startVirtualDisplay) throw new Error(ONE_SCREEN_MESSAGE);
      report({ note: "Criando o monitor virtual", fraction: 0 });
      try {
        await step(() => deps.startVirtualDisplay());
      } catch (cause) {
        signal?.throwIfAborted();
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`${VIRTUAL_DISPLAY_FAILED_MESSAGE} (${detail})`);
      }
      for (let attempt2 = 0; attempt2 < 20 && screenCount < 2; attempt2 += 1) {
        await step(() => deps.sleep(500));
        screenCount = await step(() => deps.probe.displayCount());
      }
      if (screenCount < 2) throw new Error(VIRTUAL_DISPLAY_FAILED_MESSAGE);
    }
    const needInstall = !installed;
    const needCredentials = needInstall || stored === null;
    const needStart = !responding;
    if (needInstall) {
      const dmg = deps.dmgForThisMac();
      const file = join(deps.workDir, dmg.fileName);
      report({ note: "Baixando o motor de transmissão", fraction: 0 });
      await step(
        () => deps.download(
          dmg,
          file,
          (f) => report({ note: "Baixando o motor de transmissão", fraction: f * DOWNLOAD_SHARE }),
          signal
        )
      );
      report({ note: "Instalando o motor de transmissão", fraction: DOWNLOAD_SHARE });
      await step(
        () => deps.run(
          [
            "set -e",
            "mnt=$(mktemp -d)",
            `trap 'hdiutil detach "$mnt" -quiet >/dev/null 2>&1 || true' EXIT`,
            `hdiutil attach ${shQuote(file)} -nobrowse -readonly -quiet -mountpoint "$mnt"`,
            `mkdir -p ${shQuote(deps.appsDir)}`,
            `rm -rf ${shQuote(app)}`,
            `cp -R "$mnt/Sunshine.app" ${shQuote(app)}`
          ].join("\n")
        )
      );
    }
    if (needCredentials) {
      signal?.throwIfAborted();
      const credentials = {
        username: USERNAME,
        password: deps.generatePassword(),
        port: deps.port
      };
      await step(
        () => deps.run(
          `${shQuote(binary)} --creds ${shQuote(credentials.username)} ${shQuote(credentials.password)}`
        )
      );
      await step(() => deps.vault.save(credentials));
    }
    if (needInstall || needCredentials || needStart) {
      report({
        note: "Ligando o motor. Se o Mac pedir, permita a gravação de tela",
        fraction: INSTALL_SHARE,
        permission: true
      });
      await step(() => deps.run(`pkill -x ${SUNSHINE_PROCESS} || true
open ${shQuote(app)}`));
      await step(() => deps.run(`open ${shQuote(SCREEN_RECORDING_PANE)}`).catch(() => void 0));
      await step(() => deps.waitForApi());
    }
    report({ note: "Motor pronto", fraction: 1 });
  }
  const ensure = createSetupTask(run2);
  return {
    installer: { ensureInstalled: ensure },
    display: {
      ensureVirtualDisplay: (signal) => ensure(void 0, signal),
      // No Mac o monitor virtual é de outro programa (BetterDisplay) ou um plugue: vale qualquer tela que não seja a principal.
      isVirtual: (display) => !display.primary
    }
  };
}
const base = "https://github.com/LizardByte/Sunshine/releases/download/v2026.914.233613";
const SUNSHINE_DMG = {
  arm64: {
    version: "2026.914.233613",
    fileName: "Sunshine-macOS-arm64.dmg",
    url: `${base}/Sunshine-macOS-arm64.dmg`,
    sha256: "795f03a389c5726f9a7b15f501dc1ddf204b442cae565859ac83aae027a9e07c"
  },
  x64: {
    version: "2026.914.233613",
    fileName: "Sunshine-macOS-x86_64.dmg",
    url: `${base}/Sunshine-macOS-x86_64.dmg`,
    sha256: "764b11674babac0cd838c2883359207a481c462f355ccbfd1ec91f6d44672101"
  }
};
const MOONLIGHT_MAC_DMG = {
  version: "6.1.0",
  fileName: "Moonlight-6.1.0.dmg",
  url: "https://github.com/moonlight-stream/moonlight-qt/releases/download/v6.1.0/Moonlight-6.1.0.dmg",
  sha256: "d494740eead8ad4e620cdc8feedb56083bc29cabbbeef34cb82585fd87725fa2"
};
function sunshineDmgFor(arch) {
  const found = SUNSHINE_DMG[arch];
  if (!found)
    throw new Error("Este tipo de processador ainda não é compatível com o Horizonte no Mac.");
  return found;
}
const PORT = 47989;
const APPS_DIR = node_path.join(node_os.homedir(), "Applications");
const SUNSHINE_LOG = node_path.join(node_os.homedir(), ".config", "sunshine", "sunshine.log");
const sh = (script, timeoutMs = 12e4) => new Promise((resolve, reject) => {
  node_child_process.execFile(
    "sh",
    ["-c", script],
    { timeout: timeoutMs },
    (error, out, stderr) => error ? reject(new Error(stderr.trim() || error.message)) : resolve(out)
  );
});
const succeeds = (script) => sh(script, 15e3).then(
  () => true,
  () => false
);
const countDisplays = (report) => (report.match(/Resolution:/g) ?? []).length;
const createProbe = (helperPath = null) => ({
  sunshineInstalled: () => succeeds(`test -d ${shQuote(node_path.join(APPS_DIR, "Sunshine.app"))}`),
  sunshineResponding: () => succeeds("lsof -nP -iTCP:47990 -sTCP:LISTEN"),
  displayCount: async () => helperPath ? Number((await sh(`${shQuote(helperPath)} --count`, 15e3)).trim()) : countDisplays(await sh("system_profiler SPDisplaysDataType", 3e4))
});
function createMoonlightLauncher(userData) {
  return () => ensureMoonlightMac({
    dir: node_path.join(userData, "moonlight"),
    workDir: node_os.tmpdir(),
    artifact: MOONLIGHT_MAC_DMG,
    exists: (path2) => succeeds(`test -e ${shQuote(path2)}`),
    download: downloadVerified,
    run: (script) => sh(script, 6e5)
  });
}
function createMacPlatform(deps) {
  const vault = createCredentialVault({
    file: node_path.join(deps.userData, "sunshine.bin"),
    cipher: deps.cipher
  });
  const createApi = (c) => new SunshineApi({ port: c.port, username: c.username, password: c.password });
  let monitor = null;
  const helperPath = deps.helperPath !== null && node_fs.existsSync(deps.helperPath) ? deps.helperPath : null;
  process.on("exit", () => monitor?.stop());
  const setup = createMacSetup({
    probe: createProbe(helperPath),
    vault,
    download: downloadVerified,
    run: async (script) => void await sh(script, 6e5),
    dmgForThisMac: () => sunshineDmgFor(process.arch),
    waitForApi: async () => {
      const credentials = await vault.load();
      if (!credentials) throw new Error("A senha do motor de transmissão não foi guardada.");
      await waitForApi(() => createApi(credentials).getConfig(), deps.sleep);
    },
    generatePassword,
    sleep: deps.sleep,
    startVirtualDisplay: helperPath ? async () => {
      if (monitor) return;
      monitor = await startDisplayHelper(() => {
        const child = node_child_process.spawn(helperPath, [], { stdio: ["ignore", "pipe", "pipe"] });
        return {
          onError: (cb) => void child.on("error", cb),
          onStdout: (cb) => void child.stdout.on("data", (chunk) => cb(chunk.toString())),
          onStderr: (cb) => void child.stderr.on("data", (chunk) => cb(chunk.toString())),
          onExit: (cb) => void child.on("exit", (code) => {
            monitor = null;
            cb(code);
          }),
          kill: () => void child.kill("SIGTERM")
        };
      });
    } : void 0,
    workDir: node_os.tmpdir(),
    appsDir: APPS_DIR,
    port: PORT
  });
  return {
    ...setup,
    restart: async () => {
      await sh(
        `pkill -x ${SUNSHINE_PROCESS} || true
open ${shQuote(node_path.join(APPS_DIR, "Sunshine.app"))}`
      );
    },
    stopVirtualDisplay: () => {
      monitor?.stop();
      monitor = null;
    },
    createApi,
    credentials: async () => {
      const stored = await vault.load();
      if (!stored)
        throw new Error("O motor de transmissão ainda não foi configurado pelo Horizonte.");
      return stored;
    }
  };
}
const DEFAULT_PORT = 47989;
const DEFAULT_LOG = "C:\\Program Files\\Sunshine\\config\\sunshine.log";
function existingInstaller() {
  return { ensureInstalled: async () => void 0 };
}
function existingDisplay() {
  return {
    ensureVirtualDisplay: async () => void 0,
    isVirtual: (display) => /vdd|virtual/i.test(display.friendlyName)
  };
}
function readDevEngineConfig(env) {
  if (env["HORIZONTE_ENGINE"] !== "sunshine") return null;
  const username = env["HORIZONTE_SUNSHINE_USER"];
  const password = env["HORIZONTE_SUNSHINE_PASSWORD"];
  if (!username || !password) {
    throw new Error(
      "Defina HORIZONTE_SUNSHINE_USER e HORIZONTE_SUNSHINE_PASSWORD para usar o Sunshine de verdade."
    );
  }
  const rawPort = env["HORIZONTE_SUNSHINE_PORT"];
  const port = rawPort === void 0 ? DEFAULT_PORT : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65e3) {
    throw new Error("HORIZONTE_SUNSHINE_PORT precisa ser um número de porta válido.");
  }
  return {
    credentials: { username, password, port },
    logPath: env["HORIZONTE_SUNSHINE_LOG"] || DEFAULT_LOG
  };
}
if (process.platform === "linux" && process.env.APPIMAGE) electron.app.commandLine.appendSwitch("no-sandbox");
if (process.platform === "linux" && !process.env.XDG_CURRENT_DESKTOP)
  electron.app.commandLine.appendSwitch("password-store", "gnome-libsecret");
const PAIR_TIMEOUT_MS = 6e4;
const LIST_TIMEOUT_MS = 2e4;
function trayImage() {
  if (process.platform !== "darwin")
    return electron.nativeImage.createFromPath(icon).resize({ width: 16, height: 16 });
  const image = electron.nativeImage.createFromPath(trayTemplate);
  image.addRepresentation({
    scaleFactor: 2,
    buffer: electron.nativeImage.createFromPath(trayTemplate2x).toPNG()
  });
  image.setTemplateImage(true);
  return image;
}
function desktopSize(exclude = null) {
  const boxes = electron.screen.getAllDisplays().filter(({ id }) => id !== exclude).map(({ bounds, scaleFactor }) => ({
    left: bounds.x * scaleFactor,
    top: bounds.y * scaleFactor,
    right: (bounds.x + bounds.width) * scaleFactor,
    bottom: (bounds.y + bounds.height) * scaleFactor
  }));
  if (boxes.length === 0) return { width: 1920, height: 1080 };
  return {
    width: Math.round(
      Math.max(...boxes.map((b) => b.right)) - Math.min(...boxes.map((b) => b.left))
    ),
    height: Math.round(
      Math.max(...boxes.map((b) => b.bottom)) - Math.min(...boxes.map((b) => b.top))
    )
  };
}
function overlayFor() {
  const dark = electron.nativeTheme.shouldUseDarkColors;
  return {
    // Mesmo fundo da janela (--bg no CSS), para os botões não parecerem uma faixa à parte.
    color: dark ? "#000000" : "#F2F2F7",
    symbolColor: dark ? "#FFFFFF" : "#000000",
    height: 64
  };
}
function createWindow(controller) {
  const window = new electron.BrowserWindow({
    title: "Horizonte",
    icon,
    width: 760,
    height: 580,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    // Windows e Linux: botões da janela por cima da interface. No macOS são os três botões nativos, num ponto fixo
    // dentro da barra de 64 px (o CSS reserva o espaço à esquerda).
    ...process.platform === "darwin" ? { trafficLightPosition: { x: 20, y: 25 } } : { titleBarOverlay: overlayFor() },
    backgroundColor: electron.nativeTheme.shouldUseDarkColors ? "#000000" : "#F2F2F7",
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      additionalArguments: [`--horizonte-engine=${USE_WEBRTC ? "webrtc" : "sunshine"}`],
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  window.once("ready-to-show", () => window.show());
  if (process.platform !== "darwin") {
    const refreshOverlay = () => {
      if (!window.isDestroyed()) window.setTitleBarOverlay(overlayFor());
    };
    electron.nativeTheme.on("updated", refreshOverlay);
    window.on("closed", () => electron.nativeTheme.off("updated", refreshOverlay));
  }
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  let tray = null;
  const showWindow = () => {
    if (window.isDestroyed()) return;
    window.show();
    window.focus();
  };
  const followTray = createTrayFollower(
    { hide: () => window.hide(), show: showWindow },
    {
      open: () => {
        tray ??= new electron.Tray(trayImage());
        tray.setToolTip("Horizonte: conectado");
        tray.setContextMenu(
          electron.Menu.buildFromTemplate([
            { label: "Abrir Horizonte", click: showWindow },
            { label: "Sair", click: () => electron.app.quit() }
          ])
        );
        tray.on("click", showWindow);
      },
      close: () => {
        tray?.destroy();
        tray = null;
      }
    }
  );
  const unsubscribe = controller.subscribe((snapshot) => {
    if (window.isDestroyed()) return;
    window.webContents.send(CHANNELS.push, snapshot);
    followTray(snapshot.state);
  });
  window.on("closed", () => {
    unsubscribe();
    tray?.destroy();
    tray = null;
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void window.loadFile(node_path.join(__dirname, "../renderer/index.html"));
  }
}
async function readVideoHint() {
  const cards = await promises.readdir("/sys/class/drm").catch(() => []);
  const vendors = await Promise.all(
    cards.filter((card) => /^card\d+$/.test(card)).map((card) => promises.readFile(`/sys/class/drm/${card}/device/vendor`, "utf8").catch(() => ""))
  );
  const dirs = process.env["HORIZONTE_DRI_DIRS"]?.split(":") ?? DRIVER_DIRS;
  const drivers = (await Promise.all(dirs.map((dir) => promises.readdir(dir).catch(() => [])))).flat();
  const os = parseOsRelease(await promises.readFile("/etc/os-release", "utf8").catch(() => ""));
  return videoDriverHint({ vendors: vendors.filter(Boolean), drivers, os }) ?? await readWifiHint();
}
async function readWifiHint() {
  const names = await promises.readdir("/sys/class/net").catch(() => []);
  const wireless = (await Promise.all(
    names.map(async (name) => {
      const isWifi = node_fs.existsSync(`/sys/class/net/${name}/wireless`);
      const up = (await promises.readFile(`/sys/class/net/${name}/operstate`, "utf8").catch(() => "")).trim() === "up";
      return isWifi && up ? name : null;
    })
  )).filter((name) => name !== null);
  const iw = ["/usr/sbin/iw", "/sbin/iw", "/usr/bin/iw"].find((path2) => node_fs.existsSync(path2));
  if (!iw) return null;
  const interfaces = await Promise.all(
    wireless.map(
      (name) => new Promise(
        (resolve) => node_child_process.execFile(
          iw,
          ["dev", name, "get", "power_save"],
          { timeout: 3e3 },
          (_error, stdout) => resolve({ name, powerSave: parsePowerSave(String(stdout)) })
        )
      )
    )
  );
  return wifiPowerHint({ interfaces });
}
async function boot() {
  await electron.app.whenReady();
  utils.electronApp.setAppUserModelId("com.horizonte.app");
  electron.session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false)
  );
  electron.app.on("browser-window-created", (_event, window) => utils.optimizer.watchWindowShortcuts(window));
  const persisted = createSettingsStore(
    node_path.join(electron.app.getPath("userData"), "settings.json"),
    cleanName(node_os.hostname()) || void 0
  );
  const autostart = createAutostart({
    platform: process.platform,
    executable: process.env.APPIMAGE || process.execPath,
    configDir: process.env.XDG_CONFIG_HOME || node_path.join(node_os.homedir(), ".config"),
    native: (on) => electron.app.setLoginItemSettings({ openAtLogin: on })
  });
  const store = {
    load: persisted.load,
    save: async (settings) => {
      const previous = await persisted.load();
      if (electron.app.isPackaged && settings.autostart !== previous.autostart)
        await autostart.set(settings.autostart);
      try {
        await persisted.save(settings);
      } catch (cause) {
        if (electron.app.isPackaged && settings.autostart !== previous.autostart)
          await autostart.set(previous.autostart);
        throw cause;
      }
    }
  };
  const fake = new FakeEngine(utils.is.dev ? 700 : 0);
  const dev = readDevEngineConfig(process.env);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const memory = createEngineMemory(node_path.join(electron.app.getPath("userData"), "engine.json"));
  const real = process.platform === "win32" && (electron.app.isPackaged || process.env["HORIZONTE_ENGINE"] === "install");
  const realLinux = process.platform === "linux" && (electron.app.isPackaged || process.env["HORIZONTE_ENGINE"] === "install");
  const realMac = process.platform === "darwin" && (electron.app.isPackaged || process.env["HORIZONTE_ENGINE"] === "install");
  const discovery = createDiscovery({
    find: (interfaceAddress) => {
      const bonjour = safeBonjour(interfaceAddress);
      const browser = bonjour.find({ type: "nvstream" });
      return {
        on: (_event, listener) => browser.on("up", listener),
        stop: () => {
          browser.stop();
          bonjour.destroy();
        }
      };
    },
    ownAddresses: () => Object.values(node_os.networkInterfaces()).flat().flatMap((i) => i ? [i.address] : []),
    localNetworks: () => Object.values(node_os.networkInterfaces()).flat().flatMap(
      (i) => i && i.family === "IPv4" ? [{ address: i.address, netmask: i.netmask }] : []
    )
  });
  const moonlightDir = node_path.join(electron.app.getPath("userData"), "moonlight", MOONLIGHT.version);
  const windowsMoonlightExe = () => ensureMoonlight({
    dir: moonlightDir,
    exists: async (path2) => node_fs.existsSync(path2),
    download: async (onProgress) => {
      const zip = node_path.join(electron.app.getPath("temp"), MOONLIGHT.fileName);
      await downloadVerified(MOONLIGHT, zip, onProgress);
      return zip;
    },
    extract: async (zip, into) => {
      await runPowerShell(
        `Expand-Archive -LiteralPath ${psQuote(zip)} -DestinationPath ${psQuote(into)} -Force`,
        12e4
      );
    }
  });
  const moonlightExe = process.platform === "darwin" ? createMoonlightLauncher(electron.app.getPath("userData")) : process.platform === "linux" ? createMoonlightLauncher$1(electron.app.getPath("userData")) : windowsMoonlightExe;
  const clientEnv = process.platform === "linux" ? { ...process.env, APPIMAGE_EXTRACT_AND_RUN: "1" } : process.env;
  const receiver = createMoonlightClient({
    listHosts: discovery.listHosts,
    sendPin,
    pairedHosts: createPairedHostsStore(node_path.join(electron.app.getPath("userData"), "paired-hosts.json")),
    // O Moonlight se apresenta ao outro lado com o nome do computador.
    deviceName: () => cleanName(node_os.hostname()) || "Dispositivo",
    randomPin: () => String(node_crypto.randomInt(1e4)).padStart(4, "0"),
    run: async (args) => {
      const child = node_child_process.spawn(await moonlightExe(), args, { stdio: "ignore", env: clientEnv });
      return waitForExit(
        { kill: () => void child.kill(), onExit: (l) => void child.once("exit", l) },
        args[0] === "list" ? LIST_TIMEOUT_MS : PAIR_TIMEOUT_MS,
        (l) => void child.once("error", l)
      );
    },
    spawn: async (args) => {
      const child = node_child_process.spawn(await moonlightExe(), args, { stdio: "ignore", env: clientEnv });
      await new Promise((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      return {
        kill: () => void child.kill(),
        onExit: (listener) => void child.once("exit", listener)
      };
    }
  });
  const presence = createPresence({ advertise: advertiseService, browse: browseService });
  let ownKind = "desktop";
  let ownName = () => cleanName(node_os.hostname()) || "Computador";
  let ownSettings = () => null;
  let virtualDisplay = () => null;
  let signalingPort = () => null;
  let engine = fake;
  if (USE_WEBRTC) {
    const webrtc = createAppWebRtcEngine({
      presence,
      deviceName: () => ownName(),
      kind: () => ownKind,
      // Onde a pessoa deixou a tela deste aparelho; sem posição guardada, o lado padrão dos ajustes.
      placementFor: (fingerprint) => {
        const settings = ownSettings();
        return settings?.screenPlacements[fingerprint] ?? (settings ? { side: settings.extendSide } : null);
      }
    });
    virtualDisplay = () => webrtc.target();
    signalingPort = () => webrtc.signalingPort();
    engine = webrtc;
  } else if (dev) {
    engine = composeEngine(
      new SunshineEngine({
        installer: existingInstaller(),
        display: existingDisplay(),
        memory,
        credentials: async () => dev.credentials,
        createApi: (credentials) => new SunshineApi({
          port: credentials.port,
          username: credentials.username,
          password: credentials.password
        }),
        readLog: () => readLogTail(dev.logPath),
        sleep
      }),
      receiver
    );
  } else if (real) {
    const platform = createWindowsPlatform({
      userData: electron.app.getPath("userData"),
      cipher: toCipher(electron.safeStorage),
      sleep,
      confirmDriverTrust: async () => {
        const answer = await electron.dialog.showMessageBox({
          type: "warning",
          title: "Autorizar o monitor virtual",
          message: "O Horizonte precisa instalar um driver de monitor virtual.",
          detail: "O driver é de código aberto (Virtual Display Driver) e tem certificado próprio, que o Windows só aceita se for confiado como autoridade raiz. O Horizonte confia nele apenas durante a instalação e o remove em seguida. Só continue se você confia nessa origem.",
          buttons: ["Autorizar e instalar", "Cancelar"],
          defaultId: 1,
          cancelId: 1,
          noLink: true
        });
        return answer.response === 0;
      }
    });
    engine = composeEngine(
      new SunshineEngine({
        installer: platform.installer,
        display: platform.display,
        memory,
        credentials: platform.credentials,
        createApi: platform.createApi,
        readLog: () => readLogTail(SUNSHINE_LOG$2),
        sleep,
        pins: createPinChannel(),
        restart: platform.restart,
        // Na primeira partida o motor testa todos os codificadores e leva mais de 30 segundos.
        timing: { restartTimeoutMs: 12e4 }
      }),
      receiver
    );
  } else if (realLinux) {
    const platform = createLinuxPlatform({
      userData: electron.app.getPath("userData"),
      cipher: toCipher(electron.safeStorage),
      sleep
    });
    engine = composeEngine(
      new SunshineEngine({
        installer: platform.installer,
        display: platform.display,
        memory,
        credentials: platform.credentials,
        createApi: platform.createApi,
        readLog: () => readLogTail(SUNSHINE_LOG$1),
        sleep,
        pins: createPinChannel(),
        restart: platform.restart,
        timing: { restartTimeoutMs: 12e4 }
      }),
      receiver
    );
  } else if (realMac) {
    const platform = createMacPlatform({
      userData: electron.app.getPath("userData"),
      cipher: toCipher(electron.safeStorage),
      sleep,
      // Empacotado, o auxiliar vem junto do app (extraResources); do código-fonte, da pasta onde ele é compilado.
      helperPath: electron.app.isPackaged ? node_path.join(process.resourcesPath, "horizonte-display") : node_path.join(electron.app.getAppPath(), "native", "macos", "build", "horizonte-display")
    });
    electron.app.on("before-quit", () => platform.stopVirtualDisplay());
    engine = composeEngine(
      new SunshineEngine({
        installer: platform.installer,
        display: platform.display,
        memory,
        credentials: platform.credentials,
        createApi: platform.createApi,
        readLog: () => readLogTail(SUNSHINE_LOG),
        sleep,
        pins: createPinChannel(),
        restart: platform.restart,
        timing: { restartTimeoutMs: 12e4 }
      }),
      receiver
    );
  }
  const kindReady = detectDeviceKind({
    platform: process.platform,
    runPowerShell: (script) => runPowerShell(script, 2e4),
    readText: (path2) => promises.readFile(path2, "utf8").catch(() => null),
    listDir: (path2) => promises.readdir(path2),
    run: (command, args) => new Promise(
      (resolve) => node_child_process.execFile(command, args, { timeout: 5e3 }, (error, out) => resolve(error ? null : out))
    )
  }).then((kind) => ownKind = kind);
  electron.app.on("before-quit", () => presence.stop());
  const mouse = process.platform === "darwin" ? void 0 : createRealMouseEngine({
    userData: electron.app.getPath("userData"),
    download: (zip) => downloadVerified(DESKFLOW_WINDOWS, zip),
    extract: async (zip, into) => {
      await runPowerShell(
        `Expand-Archive -LiteralPath ${psQuote(zip)} -DestinationPath ${psQuote(into)} -Force`,
        12e4
      );
    },
    runPowerShell: (script) => runPowerShell(script, 3e4),
    ownScreen: desktopSize,
    ownKind: () => ownKind,
    writeText: (text) => electron.clipboard.writeText(text),
    readText: () => electron.clipboard.readText()
  });
  if (mouse) electron.app.on("before-quit", () => void mouse.stop().catch(() => void 0));
  const controller = await createController({ engine, mouse, store });
  ownName = () => controller.getSnapshot().settings.deviceName;
  ownSettings = () => controller.getSnapshot().settings;
  void kindReady.then(
    (kind) => presence.announce(controller.getSnapshot().settings.deviceName, kind)
  );
  const diagnosticEnv = {
    version: electron.app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    osRelease: node_os.release(),
    electron: process.versions.electron,
    home: node_os.homedir()
  };
  const history = createDiagnosticHistory(
    node_path.join(electron.app.getPath("userData"), "diagnostic-history.json"),
    diagnosticEnv
  );
  let recordedError = null;
  const rememberError = (snapshot) => {
    if (snapshot.state.screen !== "error") {
      recordedError = null;
      return;
    }
    if (recordedError === snapshot.state.error) return;
    recordedError = snapshot.state.error;
    void history.record(snapshot).catch(() => void 0);
  };
  controller.subscribe(rememberError);
  rememberError(controller.getSnapshot());
  electronUpdater.autoUpdater.autoDownload = false;
  electronUpdater.autoUpdater.autoInstallOnAppQuit = false;
  electronUpdater.autoUpdater.allowPrerelease = electron.app.getVersion().includes("-");
  electronUpdater.autoUpdater.allowDowngrade = false;
  const updates = createUpdater({
    supported: electron.app.isPackaged && updatesSupported(),
    autoDownload: true,
    currentVersion: electron.app.getVersion(),
    check: () => electronUpdater.autoUpdater.checkForUpdates(),
    download: () => electronUpdater.autoUpdater.downloadUpdate(),
    install: () => electronUpdater.autoUpdater.quitAndInstall(false, true),
    canInstall: () => !["connected", "receiving", "preparing", "approve"].includes(
      controller.getSnapshot().state.screen
    ),
    listen: (events) => {
      electronUpdater.autoUpdater.on("update-available", (info) => events.available(info.version));
      electronUpdater.autoUpdater.on("update-not-available", events.current);
      electronUpdater.autoUpdater.on("download-progress", (info) => events.progress(info.percent));
      electronUpdater.autoUpdater.on("update-downloaded", events.downloaded);
      electronUpdater.autoUpdater.on("error", events.error);
    }
  });
  updates.subscribe((status) => {
    electron.BrowserWindow.getAllWindows().forEach(
      (window) => window.webContents.send(CHANNELS.updatePush, status)
    );
  });
  let announced = "";
  updates.subscribe((status) => {
    if (status.phase !== "ready" || announced === status.version || !electron.Notification.isSupported())
      return;
    announced = status.version ?? "";
    const note = new electron.Notification({
      title: "Atualização pronta",
      body: `Clique para reiniciar o Horizonte na versão ${(status.version ?? "").replace(/-beta\./, " beta ")}.`
    });
    note.on("click", () => void updates.perform("install"));
    note.show();
  });
  setInterval(
    () => {
      if (["idle", "current", "error"].includes(updates.status().phase))
        void updates.perform("check");
    },
    4 * 60 * 60 * 1e3
  ).unref();
  electron.ipcMain.handle(CHANNELS.updateStatus, () => updates.status());
  const uninstall = createUninstaller({
    platform: process.platform,
    packaged: electron.app.isPackaged,
    executable: process.execPath,
    exists: node_fs.existsSync,
    busy: () => ["connected", "receiving", "preparing", "approve"].includes(
      controller.getSnapshot().state.screen
    ) || ["checking", "downloading"].includes(updates.status().phase),
    confirm: async () => (await electron.dialog.showMessageBox({
      type: "question",
      title: "Desinstalar Horizonte",
      message: "Desinstalar o Horizonte deste dispositivo?",
      detail: "O desinstalador do Windows será aberto. Sunshine, Moonlight e o driver virtual são componentes separados e permanecerão instalados.",
      buttons: ["Cancelar", "Desinstalar"],
      defaultId: 0,
      cancelId: 0
    })).response === 1,
    launch: (path2) => new Promise((resolve, reject) => {
      const child = node_child_process.spawn(path2, [], { detached: true, stdio: "ignore" });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    }),
    quit: () => electron.app.quit()
  });
  electron.ipcMain.handle(CHANNELS.uninstall, () => uninstall());
  electron.ipcMain.handle(CHANNELS.update, (_event, action) => {
    if (action === "check" || action === "download" || action === "install")
      return updates.perform(action);
    return updates.status();
  });
  if (engine === fake && !electron.app.isPackaged) runDevDemo(controller, fake);
  electron.ipcMain.handle(CHANNELS.snapshot, () => controller.getSnapshot());
  electron.ipcMain.handle(CHANNELS.dispatch, (_event, payload) => {
    if (isUiEvent(payload)) controller.dispatch(payload);
  });
  electron.ipcMain.handle(
    CHANNELS.updateSettings,
    (_event, patch) => controller.updateSettings(
      typeof patch === "object" && patch !== null ? patch : {}
    )
  );
  electron.ipcMain.handle(CHANNELS.hosts, async () => {
    const [hosts] = await Promise.all([
      controller.listHosts(),
      presence.refresh().catch(() => void 0)
    ]);
    return presence.withKinds(hosts);
  });
  electron.ipcMain.handle(CHANNELS.mousePeers, async () => {
    const [peers] = await Promise.all([
      controller.listMousePeers(),
      presence.refresh().catch(() => void 0)
    ]);
    return presence.withKinds(peers);
  });
  electron.ipcMain.handle(CHANNELS.mouseScreen, () => desktopSize(virtualDisplay()));
  electron.ipcMain.handle(CHANNELS.videoHint, () => process.platform === "linux" ? readVideoHint() : null);
  electron.ipcMain.handle(CHANNELS.deviceKind, async (_event, address, name) => {
    if (typeof name !== "string") return kindReady;
    const where = typeof address === "string" ? address : void 0;
    if (where) await presence.refresh().catch(() => void 0);
    return presence.kindOf(where, name);
  });
  electron.ipcMain.handle(CHANNELS.openRepo, () => electron.shell.openExternal(REPO_URL));
  const reports = createDiagnosticReporter({
    text: async (includeHistory) => {
      const snapshot = controller.getSnapshot();
      return buildReportDiagnostic(diagnosticEnv, snapshot) + (includeHistory ? `

${await history.summary()}` : "");
    },
    open: (url) => electron.shell.openExternal(url),
    copy: (text) => electron.clipboard.writeText(text)
  });
  electron.ipcMain.handle(
    CHANNELS.diagnosticDraft,
    (_event, includeHistory) => reports.prepare(includeHistory)
  );
  electron.ipcMain.handle(CHANNELS.reportDiagnostic, (_event, text) => reports.report(text));
  electron.ipcMain.handle(CHANNELS.copyDiagnostic, async () => {
    try {
      const recent = await history.text();
      electron.clipboard.writeText(
        buildDiagnostic(diagnosticEnv, controller.getSnapshot()) + (recent ? `

Erros recentes (histórico local):
${recent}` : "")
      );
      return true;
    } catch {
      return false;
    }
  });
  const gateway = createRealGateway({
    userData: electron.app.getPath("userData"),
    cipher: toCipher(electron.safeStorage),
    sleep,
    deviceName: () => controller.getSnapshot().settings.deviceName
  });
  const webAccess = USE_WEBRTC ? createBrowserAccess({
    pagesDir: node_path.join(__dirname, "../renderer"),
    signalingPort: () => signalingPort(),
    lanAddress: () => lanAddress()
  }) : gateway;
  electron.ipcMain.handle(CHANNELS.webAccess, () => webAccess.status());
  electron.ipcMain.handle(
    CHANNELS.setWebAccess,
    (_event, on) => on === true ? webAccess.start() : webAccess.stop().then(() => webAccess.status())
  );
  electron.app.on("before-quit", () => void webAccess.stop());
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow(controller);
  });
  await finishStartup({
    createWindow: () => createWindow(controller),
    syncAutostart: electron.app.isPackaged ? () => autostart.set(controller.getSnapshot().settings.autostart) : void 0,
    reportError: (error) => {
      console.error(error);
      electron.dialog.showErrorBox(
        "Não consegui configurar a abertura com o sistema",
        `${error.message}

Detalhe: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`
      );
    }
  });
  void updates.perform("check");
}
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
function updatesSupported() {
  if (process.platform === "win32") return true;
  if (process.platform !== "linux") return false;
  if (process.env.APPIMAGE) return true;
  try {
    return node_fs.readFileSync(node_path.join(process.resourcesPath, "package-type"), "utf8").trim() === "deb";
  } catch {
    return false;
  }
}
function readMotorArgs() {
  try {
    return parseMotorArgs(process.argv);
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}

${MOTOR_USAGE}`);
    return "invalid";
  }
}
const motor = readMotorArgs();
const USE_WEBRTC = process.env["HORIZONTE_ENGINE"] === "webrtc" || process.platform === "linux" && process.env["HORIZONTE_ENGINE"] !== "sunshine" && process.env["HORIZONTE_ENGINE"] !== "fake";
if (motor === "invalid") {
  electron.app.exit(2);
} else if (motor) {
  prepareMotorSwitches();
  void runMotorBench(motor);
} else if (!electron.app.isPackaged || electron.app.requestSingleInstanceLock()) {
  electron.app.on("second-instance", () => {
    const [window] = electron.BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  if (USE_WEBRTC) prepareMotorSwitches();
  void runStartup(boot, (error) => {
    console.error(error);
    try {
      electron.dialog.showErrorBox(
        "Não consegui iniciar o Horizonte",
        `${error.message}

Detalhe: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`
      );
    } finally {
      electron.app.quit();
    }
  });
} else {
  electron.app.quit();
}
