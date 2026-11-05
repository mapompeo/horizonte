/*
 * Auxiliar do modo Mouse no GNOME, sem Deskflow e sem diálogo de permissão. Fala por linhas na entrada e na saída
 * padrão; quando a entrada fecha (o Horizonte saiu), ele sai junto, e o GNOME devolve o mouse e o teclado na hora.
 *
 * --check: sai com 0 se este GNOME captura mouse e teclado (org.gnome.Mutter.InputCapture).
 *
 * --capture: este computador empresta o mouse. Avisa "ZONE <largura> <altura> <x> <y>" para cada tela seguido de
 * "ZONES", de novo quando as telas mudam. Aceita "barrier <id> <x1> <y1> <x2> <y2>" (uma por linha) e "apply" (troca as
 * barreiras por essas e liga), e "release <x> <y>" (devolve o cursor aqui, nesse ponto). Quando o cursor cruza uma
 * barreira, avisa "ENTER <id> <x> <y>" e, até o release, tudo o que seria deste computador: "move <dx> <dy>",
 * "button <código> <1|0>", "key <código> <1|0>", "wheel <dx> <dy>" (passos, em 120 avos) e "scroll <dx> <dy>" (contínuo).
 *
 * --inject: este computador é controlado. Aceita as mesmas linhas de evento (move, button, key, wheel, scroll) e
 * "warp <x> <y>" (leva o cursor a esse ponto, contado do canto de cima à esquerda).
 *
 * Saída 2: argumentos; 3: o GNOME recusou; 4: a conexão de eventos caiu.
 */
#include <gio/gio.h>
#include <gio/gunixfdlist.h>
#include <glib-unix.h>
#include <libei.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>

#define CAPTURE "org.gnome.Mutter.InputCapture"
#define REMOTE "org.gnome.Mutter.RemoteDesktop"
/* Teclado e ponteiro. */
#define CAPABILITIES 3u
#define MAX_BARRIERS 16
/* Longe o bastante para o cursor encostar no canto em qualquer disposição de telas. */
#define FAR 1000000.0

struct barrier {
  int id;
  int x1, y1, x2, y2;
  guint mutter;
};

static GDBusConnection *bus;
static GMainLoop *loop;
static int exit_code;
static char *session;
static const char *session_iface;
static const char *session_dest;
/* Captura */
static struct ei *ei;
static guint serial;
static guint activation;
static gboolean active;
static struct barrier barriers[MAX_BARRIERS];
static int barrier_count;
static gboolean enabled;

static void quit(int code, const char *message) {
  if (message) fprintf(stderr, "%s\n", message);
  if (exit_code == 0) exit_code = code;
  g_main_loop_quit(loop);
}

static GVariant *call(const char *method, GVariant *args, const char *type, GUnixFDList **fds) {
  GError *error = NULL;
  GVariant *result = g_dbus_connection_call_with_unix_fd_list_sync(
    bus, session_dest, session, session_iface, method, args, type ? G_VARIANT_TYPE(type) : NULL, 0, 5000, NULL, fds,
    NULL, &error);
  if (!result) {
    fprintf(stderr, "%s: %s\n", method, error->message);
    g_error_free(error);
  }
  return result;
}

static void drop(GVariant *value) {
  if (value) g_variant_unref(value);
}

/* ---------- captura ---------- */

static void announce_zones(void) {
  GVariant *result = call("GetZones", NULL, "(ua(uuii))", NULL);
  if (!result) return;
  GVariantIter *zones;
  g_variant_get(result, "(ua(uuii))", &serial, &zones);
  guint width, height;
  gint x, y;
  while (g_variant_iter_next(zones, "(uuii)", &width, &height, &x, &y)) printf("ZONE %u %u %d %d\n", width, height, x, y);
  g_variant_iter_free(zones);
  g_variant_unref(result);
  printf("ZONES\n");
  fflush(stdout);
}

static void apply_barriers(void) {
  if (enabled) drop(call("Disable", NULL, NULL, NULL));
  enabled = FALSE;
  drop(call("ClearBarriers", NULL, NULL, NULL));
  for (int i = 0; i < barrier_count; i++) {
    struct barrier *b = &barriers[i];
    GVariant *result = call("AddBarrier", g_variant_new("(u(iiii))", serial, b->x1, b->y1, b->x2, b->y2), "(u)", NULL);
    if (!result) {
      printf("BARRIER_FAILED %d\n", b->id);
      continue;
    }
    g_variant_get(result, "(u)", &b->mutter);
    g_variant_unref(result);
  }
  GVariant *result = call("Enable", NULL, NULL, NULL);
  enabled = result != NULL;
  drop(result);
  printf(enabled ? "ENABLED\n" : "ENABLE_FAILED\n");
  fflush(stdout);
}

static void release_at(double x, double y) {
  if (!active) return;
  GVariantBuilder options;
  g_variant_builder_init(&options, G_VARIANT_TYPE_VARDICT);
  g_variant_builder_add(&options, "{sv}", "activation_id", g_variant_new_uint32(activation));
  g_variant_builder_add(&options, "{sv}", "cursor_position", g_variant_new("(dd)", x, y));
  drop(call("Release", g_variant_new("(@a{sv})", g_variant_builder_end(&options)), NULL, NULL));
  active = FALSE;
}

static void on_signal(GDBusConnection *connection, const char *sender, const char *path, const char *iface,
                      const char *name, GVariant *args, gpointer data) {
  (void)connection, (void)sender, (void)path, (void)iface, (void)data;
  if (!g_strcmp0(name, "Activated")) {
    guint mutter;
    double x, y;
    g_variant_get(args, "(uu(dd))", &activation, &mutter, &x, &y);
    active = TRUE;
    int id = -1;
    for (int i = 0; i < barrier_count; i++)
      if (barriers[i].mutter == mutter) id = barriers[i].id;
    printf("ENTER %d %.1f %.1f\n", id, x, y);
  } else if (!g_strcmp0(name, "Deactivated")) {
    active = FALSE;
    printf("LEFT\n");
  } else if (!g_strcmp0(name, "ZonesChanged")) {
    announce_zones();
  } else if (!g_strcmp0(name, "Disabled")) {
    enabled = FALSE;
    printf("DISABLED\n");
  } else if (!g_strcmp0(name, "Closed")) {
    quit(3, "o GNOME encerrou a captura");
  }
  fflush(stdout);
}

static gboolean on_ei(gint fd, GIOCondition condition, gpointer data) {
  (void)fd, (void)condition, (void)data;
  ei_dispatch(ei);
  struct ei_event *event;
  while ((event = ei_get_event(ei))) {
    switch (ei_event_get_type(event)) {
      case EI_EVENT_SEAT_ADDED:
        ei_seat_bind_capabilities(ei_event_get_seat(event), EI_DEVICE_CAP_POINTER, EI_DEVICE_CAP_BUTTON,
                                  EI_DEVICE_CAP_SCROLL, EI_DEVICE_CAP_KEYBOARD, NULL);
        break;
      case EI_EVENT_POINTER_MOTION:
        if (active) printf("move %.3f %.3f\n", ei_event_pointer_get_dx(event), ei_event_pointer_get_dy(event));
        break;
      case EI_EVENT_BUTTON_BUTTON:
        if (active) printf("button %u %d\n", ei_event_button_get_button(event), ei_event_button_get_is_press(event) ? 1 : 0);
        break;
      case EI_EVENT_KEYBOARD_KEY:
        if (active) printf("key %u %d\n", ei_event_keyboard_get_key(event), ei_event_keyboard_get_key_is_press(event) ? 1 : 0);
        break;
      case EI_EVENT_SCROLL_DISCRETE:
        if (active) printf("wheel %d %d\n", ei_event_scroll_get_discrete_dx(event), ei_event_scroll_get_discrete_dy(event));
        break;
      case EI_EVENT_SCROLL_DELTA:
        if (active) printf("scroll %.3f %.3f\n", ei_event_scroll_get_dx(event), ei_event_scroll_get_dy(event));
        break;
      case EI_EVENT_DISCONNECT:
        quit(4, "a conexão de eventos do GNOME caiu");
        break;
      default:
        break;
    }
    ei_event_unref(event);
  }
  fflush(stdout);
  return G_SOURCE_CONTINUE;
}

static int start_capture(void) {
  GError *error = NULL;
  GVariant *result = g_dbus_connection_call_sync(bus, CAPTURE, "/org/gnome/Mutter/InputCapture", CAPTURE, "CreateSession",
                                                 g_variant_new("(u)", CAPABILITIES), G_VARIANT_TYPE("(o)"), 0, 5000, NULL,
                                                 &error);
  if (!result) {
    fprintf(stderr, "este GNOME não captura o mouse: %s\n", error->message);
    return -1;
  }
  g_variant_get(result, "(o)", &session);
  g_variant_unref(result);
  session_dest = CAPTURE;
  session_iface = CAPTURE ".Session";
  g_dbus_connection_signal_subscribe(bus, CAPTURE, session_iface, NULL, session, NULL, 0, on_signal, NULL, NULL);

  GUnixFDList *fds = NULL;
  result = call("ConnectToEIS", NULL, "(h)", &fds);
  if (!result) return -1;
  gint handle;
  g_variant_get(result, "(h)", &handle);
  g_variant_unref(result);
  int fd = g_unix_fd_list_get(fds, handle, NULL);
  g_object_unref(fds);
  ei = ei_new_receiver(NULL);
  ei_configure_name(ei, "Horizonte");
  if (fd < 0 || ei_setup_backend_fd(ei, fd) != 0) {
    fprintf(stderr, "não consegui ligar a conexão de eventos\n");
    return -1;
  }
  g_unix_fd_add(ei_get_fd(ei), G_IO_IN, on_ei, NULL);
  announce_zones();
  return 0;
}

/* ---------- controlado ---------- */

static int start_inject(void) {
  GError *error = NULL;
  GVariant *result = g_dbus_connection_call_sync(bus, REMOTE, "/org/gnome/Mutter/RemoteDesktop", REMOTE, "CreateSession",
                                                 NULL, G_VARIANT_TYPE("(o)"), 0, 5000, NULL, &error);
  if (!result) {
    fprintf(stderr, "o GNOME não aceitou o controle remoto: %s\n", error->message);
    return -1;
  }
  g_variant_get(result, "(o)", &session);
  g_variant_unref(result);
  session_dest = REMOTE;
  session_iface = REMOTE ".Session";
  result = call("Start", NULL, NULL, NULL);
  if (!result) return -1;
  g_variant_unref(result);
  printf("READY\n");
  fflush(stdout);
  return 0;
}

/* Sem esperar resposta: muitos movimentos por segundo, e nenhum vale a pena esperar. */
static void notify(const char *method, GVariant *args) {
  g_dbus_connection_call(bus, session_dest, session, session_iface, method, args, NULL, 0, -1, NULL, NULL, NULL);
}

static void motion(double dx, double dy) {
  notify("NotifyPointerMotionRelative", g_variant_new("(dd)", dx, dy));
}

/* ---------- comandos ---------- */

static void command(const char *line) {
  int id, x1, y1, x2, y2, code, state;
  double dx, dy;
  if (sscanf(line, "barrier %d %d %d %d %d", &id, &x1, &y1, &x2, &y2) == 5) {
    if (barrier_count < MAX_BARRIERS) barriers[barrier_count++] = (struct barrier){ id, x1, y1, x2, y2, 0 };
  } else if (!strcmp(line, "clear")) {
    barrier_count = 0;
  } else if (!strcmp(line, "apply")) {
    apply_barriers();
  } else if (sscanf(line, "release %lf %lf", &dx, &dy) == 2) {
    release_at(dx, dy);
  } else if (sscanf(line, "move %lf %lf", &dx, &dy) == 2) {
    motion(dx, dy);
  } else if (sscanf(line, "warp %lf %lf", &dx, &dy) == 2) {
    motion(-FAR, -FAR);
    motion(dx, dy);
  } else if (sscanf(line, "button %d %d", &code, &state) == 2) {
    if (code >= 0x110 && code <= 0x117) notify("NotifyPointerButton", g_variant_new("(ib)", code, state != 0));
  } else if (sscanf(line, "key %d %d", &code, &state) == 2) {
    if (code > 0 && code < 0x300) notify("NotifyKeyboardKeycode", g_variant_new("(ub)", (guint)code, state != 0));
  } else if (sscanf(line, "wheel %d %d", &x1, &y1) == 2) {
    if (y1) notify("NotifyPointerAxisDiscrete", g_variant_new("(ui)", 0u, y1 / 120));
    if (x1) notify("NotifyPointerAxisDiscrete", g_variant_new("(ui)", 1u, x1 / 120));
  } else if (sscanf(line, "scroll %lf %lf", &dx, &dy) == 2) {
    notify("NotifyPointerAxis", g_variant_new("(ddu)", dx, dy, 0u));
  }
}

static gboolean on_stdin(GIOChannel *channel, GIOCondition condition, gpointer data) {
  (void)condition, (void)data;
  char *line = NULL;
  gsize end = 0;
  GIOStatus status = g_io_channel_read_line(channel, &line, NULL, &end, NULL);
  if (status == G_IO_STATUS_EOF || status == G_IO_STATUS_ERROR) {
    g_main_loop_quit(loop);
    return G_SOURCE_REMOVE;
  }
  if (line) {
    line[end] = '\0';
    command(line);
    g_free(line);
  }
  return G_SOURCE_CONTINUE;
}

static gboolean on_term(gpointer data) {
  (void)data;
  g_main_loop_quit(loop);
  return G_SOURCE_REMOVE;
}

int main(int argc, char **argv) {
  const char *mode = argc == 2 ? argv[1] : "";
  if (strcmp(mode, "--check") && strcmp(mode, "--capture") && strcmp(mode, "--inject")) {
    fprintf(stderr, "uso: horizonte-mouse --check | --capture | --inject\n");
    return 2;
  }
  /* Se o Horizonte morrer, este morre junto e o GNOME devolve o mouse. */
  prctl(PR_SET_PDEATHSIG, SIGTERM);
  GError *error = NULL;
  bus = g_bus_get_sync(G_BUS_TYPE_SESSION, NULL, &error);
  if (!bus) {
    fprintf(stderr, "sem sessão do D-Bus: %s\n", error->message);
    return 3;
  }
  if (!strcmp(mode, "--check")) {
    GVariant *result = g_dbus_connection_call_sync(bus, CAPTURE, "/org/gnome/Mutter/InputCapture", "org.freedesktop.DBus.Properties", "Get",
                                                   g_variant_new("(ss)", CAPTURE, "SupportedCapabilities"), G_VARIANT_TYPE("(v)"), 0, 3000, NULL, NULL);
    if (!result) return 3;
    GVariant *inner;
    g_variant_get(result, "(v)", &inner);
    const guint caps = g_variant_get_uint32(inner);
    return (caps & CAPABILITIES) == CAPABILITIES ? 0 : 3;
  }
  loop = g_main_loop_new(NULL, FALSE);
  if ((!strcmp(mode, "--capture") ? start_capture() : start_inject()) < 0) return 3;
  GIOChannel *input = g_io_channel_unix_new(0);
  g_io_add_watch(input, G_IO_IN | G_IO_HUP, on_stdin, NULL);
  g_unix_signal_add(SIGTERM, on_term, NULL);
  g_unix_signal_add(SIGINT, on_term, NULL);
  g_main_loop_run(loop);
  return exit_code;
}
