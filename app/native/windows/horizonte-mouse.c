/*
 * horizonte-mouse (Windows): o modo Mouse, com o mesmo protocolo de linhas do auxiliar do Linux.
 *
 *   --check    sai com 0 (o Windows sempre deixa capturar e injetar sem permissão extra).
 *   --capture  imprime as telas (ZONE largura altura x y, depois ZONES) e recebe barreiras (barrier id x1 y1 x2 y2,
 *              clear, apply). Quando o cursor encosta numa barreira, imprime ENTER id x y e passa a segurar o mouse e
 *              o teclado aqui, imprimindo move/button/key/wheel. "release x y" devolve o cursor e imprime LEFT.
 *   --inject   recebe warp/move/button/key/wheel/scroll e age neste computador.
 *
 * Coordenadas em pixels de verdade (o processo declara DPI por monitor). Teclas no código do Linux (evdev), que no
 * teclado de PC é quase sempre o próprio scancode.
 */
#define _WIN32_WINNT 0x0A00
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WM_LINE (WM_APP + 1)
#define MAX_BARRIERS 16

struct barrier { int id, x1, y1, x2, y2; };
static struct barrier pending[MAX_BARRIERS], barriers[MAX_BARRIERS];
static int pending_count, barrier_count;
static DWORD main_thread;
static BOOL active;
static POINT held;

/* ---------- teclas: scancode (com o bit E0) <-> evdev ---------- */

static const struct { int sc; int ext; int ev; } KEYS[] = {
  {0x1C, 1, 96}, {0x1D, 1, 97}, {0x35, 1, 98}, {0x37, 1, 99}, {0x38, 1, 100}, {0x47, 1, 102}, {0x48, 1, 103},
  {0x49, 1, 104}, {0x4B, 1, 105}, {0x4D, 1, 106}, {0x4F, 1, 107}, {0x50, 1, 108}, {0x51, 1, 109}, {0x52, 1, 110},
  {0x53, 1, 111}, {0x5B, 1, 125}, {0x5C, 1, 126}, {0x5D, 1, 127},
  {0x73, 0, 89}, {0x70, 0, 93}, {0x79, 0, 92}, {0x7B, 0, 94}, {0x7D, 0, 124}, {0x7E, 0, 121},
};

static int to_evdev(int sc, int ext) {
  for (size_t i = 0; i < sizeof KEYS / sizeof *KEYS; i++)
    if (KEYS[i].sc == sc && KEYS[i].ext == ext) return KEYS[i].ev;
  return !ext && sc > 0 && sc <= 88 ? sc : 0;
}

static int from_evdev(int ev, int *ext) {
  for (size_t i = 0; i < sizeof KEYS / sizeof *KEYS; i++)
    if (KEYS[i].ev == ev) { *ext = KEYS[i].ext; return KEYS[i].sc; }
  *ext = 0;
  return ev > 0 && ev <= 88 ? ev : 0;
}

/* ---------- saída ---------- */

static void out(const char *format, ...) {
  va_list args;
  va_start(args, format);
  vprintf(format, args);
  va_end(args);
  fflush(stdout);
}

static BOOL CALLBACK zone(HMONITOR monitor, HDC dc, LPRECT rect, LPARAM data) {
  (void)monitor, (void)dc, (void)data;
  out("ZONE %ld %ld %ld %ld\n", rect->right - rect->left, rect->bottom - rect->top, rect->left, rect->top);
  return TRUE;
}

static void zones(void) {
  EnumDisplayMonitors(NULL, NULL, zone, 0);
  out("ZONES\n");
}

/* ---------- captura ---------- */

/* A barreira em que o cursor encostou, ou -1. A barreira fica na borda de fora; o cursor, no último pixel. */
static int touching(POINT p) {
  for (int i = 0; i < barrier_count; i++) {
    struct barrier *b = &barriers[i];
    if (b->x1 == b->x2) {
      if (p.y < b->y1 || p.y > b->y2) continue;
      if (p.x <= b->x1 && p.x >= b->x1 - 1) return i;
    } else {
      if (p.x < b->x1 || p.x > b->x2) continue;
      if (p.y <= b->y1 && p.y >= b->y1 - 1) return i;
    }
  }
  return -1;
}

static LRESULT CALLBACK on_mouse(int code, WPARAM message, LPARAM data) {
  MSLLHOOKSTRUCT *m = (MSLLHOOKSTRUCT *)data;
  if (code != HC_ACTION || (m->flags & LLMHF_INJECTED)) return CallNextHookEx(NULL, code, message, data);
  if (!active) {
    if (message == WM_MOUSEMOVE) {
      int i = touching(m->pt);
      if (i >= 0) {
        active = TRUE;
        GetCursorPos(&held);
        out("ENTER %d %ld %ld\n", barriers[i].id, m->pt.x, m->pt.y);
        return 1;
      }
    }
    return CallNextHookEx(NULL, code, message, data);
  }
  switch (message) {
    case WM_MOUSEMOVE:
      if (m->pt.x != held.x || m->pt.y != held.y) out("move %ld %ld\n", m->pt.x - held.x, m->pt.y - held.y);
      break;
    case WM_LBUTTONDOWN: case WM_LBUTTONUP: out("button 272 %d\n", message == WM_LBUTTONDOWN); break;
    case WM_RBUTTONDOWN: case WM_RBUTTONUP: out("button 273 %d\n", message == WM_RBUTTONDOWN); break;
    case WM_MBUTTONDOWN: case WM_MBUTTONUP: out("button 274 %d\n", message == WM_MBUTTONDOWN); break;
    case WM_XBUTTONDOWN: case WM_XBUTTONUP:
      out("button %d %d\n", HIWORD(m->mouseData) == XBUTTON1 ? 275 : 276, message == WM_XBUTTONDOWN);
      break;
    /* Roda para cima é positiva no Windows e negativa no Linux; para os lados, igual. */
    case WM_MOUSEWHEEL: out("wheel 0 %d\n", -(short)HIWORD(m->mouseData)); break;
    case WM_MOUSEHWHEEL: out("wheel %d 0\n", (short)HIWORD(m->mouseData)); break;
  }
  return 1;
}

static LRESULT CALLBACK on_key(int code, WPARAM message, LPARAM data) {
  KBDLLHOOKSTRUCT *k = (KBDLLHOOKSTRUCT *)data;
  if (code != HC_ACTION || !active || (k->flags & LLKHF_INJECTED)) return CallNextHookEx(NULL, code, message, data);
  int ev = to_evdev((int)k->scanCode, (k->flags & LLKHF_EXTENDED) != 0);
  if (ev) out("key %d %d\n", ev, message == WM_KEYDOWN || message == WM_SYSKEYDOWN);
  return 1;
}

static void capture_command(const char *line) {
  struct barrier b;
  double x, y;
  if (sscanf(line, "barrier %d %d %d %d %d", &b.id, &b.x1, &b.y1, &b.x2, &b.y2) == 5) {
    if (pending_count < MAX_BARRIERS) pending[pending_count++] = b;
  } else if (!strcmp(line, "clear")) {
    pending_count = 0;
  } else if (!strcmp(line, "apply")) {
    memcpy(barriers, pending, sizeof pending);
    barrier_count = pending_count;
  } else if (sscanf(line, "release %lf %lf", &x, &y) == 2) {
    active = FALSE;
    SetCursorPos((int)x, (int)y);
    out("LEFT\n");
  }
}

/* ---------- injeção ---------- */

static void send_mouse(DWORD flags, LONG dx, LONG dy, DWORD data) {
  INPUT input = { .type = INPUT_MOUSE };
  input.mi.dx = dx;
  input.mi.dy = dy;
  input.mi.dwFlags = flags;
  input.mi.mouseData = data;
  SendInput(1, &input, sizeof input);
}

/* Põe o cursor neste ponto da área de trabalho inteira (0,0 é o canto de cima à esquerda dela). */
static void move_to(LONG x, LONG y) {
  int left = GetSystemMetrics(SM_XVIRTUALSCREEN), top = GetSystemMetrics(SM_YVIRTUALSCREEN);
  int width = GetSystemMetrics(SM_CXVIRTUALSCREEN), height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
  if (width < 2 || height < 2) return;
  LONG nx = (LONG)(((double)(x - left) * 65535.0) / (width - 1));
  LONG ny = (LONG)(((double)(y - top) * 65535.0) / (height - 1));
  send_mouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK, nx, ny, 0);
}

static void inject_command(const char *line) {
  double x, y;
  int code, state;
  POINT p;
  if (sscanf(line, "warp %lf %lf", &x, &y) == 2) {
    move_to(GetSystemMetrics(SM_XVIRTUALSCREEN) + (LONG)x, GetSystemMetrics(SM_YVIRTUALSCREEN) + (LONG)y);
  } else if (sscanf(line, "move %lf %lf", &x, &y) == 2) {
    GetCursorPos(&p);
    move_to(p.x + (LONG)(x < 0 ? x - 0.5 : x + 0.5), p.y + (LONG)(y < 0 ? y - 0.5 : y + 0.5));
  } else if (sscanf(line, "button %d %d", &code, &state) == 2) {
    static const DWORD down[] = { MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_MIDDLEDOWN };
    static const DWORD up[] = { MOUSEEVENTF_LEFTUP, MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_MIDDLEUP };
    if (code >= 272 && code <= 274) send_mouse(state ? down[code - 272] : up[code - 272], 0, 0, 0);
    else if (code == 275 || code == 276)
      send_mouse(state ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP, 0, 0, code == 275 ? XBUTTON1 : XBUTTON2);
  } else if (sscanf(line, "key %d %d", &code, &state) == 2) {
    int ext, sc = from_evdev(code, &ext);
    if (!sc) return;
    INPUT input = { .type = INPUT_KEYBOARD };
    input.ki.wScan = (WORD)sc;
    input.ki.dwFlags = KEYEVENTF_SCANCODE | (ext ? KEYEVENTF_EXTENDEDKEY : 0) | (state ? 0 : KEYEVENTF_KEYUP);
    SendInput(1, &input, sizeof input);
  } else if (sscanf(line, "wheel %lf %lf", &x, &y) == 2) {
    if (y) send_mouse(MOUSEEVENTF_WHEEL, 0, 0, (DWORD)(LONG)-y);
    if (x) send_mouse(MOUSEEVENTF_HWHEEL, 0, 0, (DWORD)(LONG)x);
  } else if (sscanf(line, "scroll %lf %lf", &x, &y) == 2) {
    /* Rolagem suave do Linux vem em pixels (uns 10 por dente da roda); no Windows, 120 por dente. */
    if (y) send_mouse(MOUSEEVENTF_WHEEL, 0, 0, (DWORD)(LONG)(-y * 12));
    if (x) send_mouse(MOUSEEVENTF_HWHEEL, 0, 0, (DWORD)(LONG)(x * 12));
  }
}

/* ---------- entrada padrão ---------- */

static DWORD WINAPI read_lines(LPVOID data) {
  (void)data;
  char line[256];
  while (fgets(line, sizeof line, stdin)) {
    line[strcspn(line, "\r\n")] = '\0';
    PostThreadMessage(main_thread, WM_LINE, 0, (LPARAM)_strdup(line));
  }
  PostThreadMessage(main_thread, WM_QUIT, 0, 0);
  return 0;
}

int main(int argc, char **argv) {
  const char *mode = argc == 2 ? argv[1] : "";
  if (strcmp(mode, "--check") && strcmp(mode, "--capture") && strcmp(mode, "--inject")) {
    fprintf(stderr, "uso: horizonte-mouse --check | --capture | --inject\n");
    return 64;
  }
  if (!strcmp(mode, "--check")) return 0;
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  BOOL capture = !strcmp(mode, "--capture");
  main_thread = GetCurrentThreadId();
  MSG msg;
  /* Cria a fila de mensagens desta thread antes de a leitura começar a postar nela. */
  PeekMessage(&msg, NULL, WM_USER, WM_USER, PM_NOREMOVE);
  if (capture) {
    if (!SetWindowsHookEx(WH_MOUSE_LL, on_mouse, GetModuleHandle(NULL), 0) ||
        !SetWindowsHookEx(WH_KEYBOARD_LL, on_key, GetModuleHandle(NULL), 0)) {
      fprintf(stderr, "o Windows recusou observar o mouse: %lu\n", GetLastError());
      return 3;
    }
    zones();
  }
  out("READY\n");
  CloseHandle(CreateThread(NULL, 0, read_lines, NULL, 0, NULL));
  while (GetMessage(&msg, NULL, 0, 0) > 0) {
    if (msg.message == WM_LINE) {
      char *line = (char *)msg.lParam;
      if (capture) capture_command(line);
      else inject_command(line);
      free(line);
    } else if (msg.message == WM_DISPLAYCHANGE && capture) {
      zones();
    }
    TranslateMessage(&msg);
    DispatchMessage(&msg);
  }
  return 0;
}
