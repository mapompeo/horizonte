/*
 * horizonte-display (Linux, GNOME): cria um monitor virtual pelo Mutter e fica vivo até receber SIGTERM ou SIGINT.
 * O monitor some junto com o processo. Imprime "READY" quando a tela já existe.
 *
 * O Mutter só cria o monitor quando alguém consome o stream PipeWire dele, e é quem consome que escolhe o tamanho.
 * Este auxiliar consome a 1 quadro por segundo e descarta: quem captura de verdade é o Chromium, pelo portal.
 *
 * Uso: horizonte-display [--width 1920] [--height 1080] [--refresh 60]
 * Saída 2: argumentos ou ambiente; 3: o Mutter recusou ou encerrou a sessão; 4: o PipeWire falhou.
 */
#include <gio/gio.h>
#include <glib-unix.h>
#include <pipewire/pipewire.h>
#include <spa/param/video/format-utils.h>
#include <spa/pod/builder.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <signal.h>

#define MUTTER "org.gnome.Mutter.ScreenCast"

struct app {
  GMainLoop *loop;
  GDBusConnection *bus;
  char *session;
  char *stream_path;
  struct pw_thread_loop *pw_loop;
  struct pw_context *context;
  struct pw_core *core;
  struct pw_stream *stream;
  struct spa_hook stream_listener;
  int width;
  int height;
  int refresh;
  int exit_code;
  gboolean ready;
};

static void quit(struct app *app, int code, const char *message) {
  if (message) fprintf(stderr, "%s\n", message);
  if (app->exit_code == 0) app->exit_code = code;
  g_main_loop_quit(app->loop);
}

static gboolean on_quit_idle(gpointer data) {
  struct app *app = data;
  quit(app, app->exit_code, NULL);
  return G_SOURCE_REMOVE;
}

static void on_process(void *data) {
  struct app *app = data;
  struct pw_buffer *buffer;
  /* Só devolve os quadros: o conteúdo não interessa a este processo. */
  while ((buffer = pw_stream_dequeue_buffer(app->stream)) != NULL) pw_stream_queue_buffer(app->stream, buffer);
}

static gboolean announce_ready(gpointer data) {
  struct app *app = data;
  if (!app->ready) {
    app->ready = TRUE;
    printf("READY %dx%d\n", app->width, app->height);
    fflush(stdout);
  }
  return G_SOURCE_REMOVE;
}

static void on_state_changed(void *data, enum pw_stream_state old, enum pw_stream_state state, const char *error) {
  struct app *app = data;
  (void)old;
  if (state == PW_STREAM_STATE_STREAMING) {
    g_idle_add(announce_ready, app);
  } else if (state == PW_STREAM_STATE_ERROR || (state == PW_STREAM_STATE_UNCONNECTED && app->ready)) {
    fprintf(stderr, "o stream do monitor virtual parou: %s\n", error ? error : "desconectado");
    app->exit_code = 4;
    g_idle_add(on_quit_idle, app);
  }
}

static const struct pw_stream_events stream_events = {
  PW_VERSION_STREAM_EVENTS,
  .state_changed = on_state_changed,
  .process = on_process,
};

static int connect_stream(struct app *app, uint32_t node) {
  uint8_t buffer[1024];
  struct spa_pod_builder builder = SPA_POD_BUILDER_INIT(buffer, sizeof(buffer));
  struct spa_rectangle size = SPA_RECTANGLE(app->width, app->height);
  struct spa_fraction none = SPA_FRACTION(0, 1);
  struct spa_fraction one = SPA_FRACTION(1, 1);
  /* O tamanho é fixo (é ele que define o monitor). A taxa máxima de 1 quadro por segundo faz o Mutter quase não
   * gastar copiando quadros para cá; o monitor em si continua com a taxa de atualização normal. */
  const struct spa_pod *params[1];
  params[0] = spa_pod_builder_add_object(
    &builder, SPA_TYPE_OBJECT_Format, SPA_PARAM_EnumFormat,
    SPA_FORMAT_mediaType, SPA_POD_Id(SPA_MEDIA_TYPE_video),
    SPA_FORMAT_mediaSubtype, SPA_POD_Id(SPA_MEDIA_SUBTYPE_raw),
    SPA_FORMAT_VIDEO_format,
    SPA_POD_CHOICE_ENUM_Id(5, SPA_VIDEO_FORMAT_BGRx, SPA_VIDEO_FORMAT_BGRx, SPA_VIDEO_FORMAT_BGRA,
                           SPA_VIDEO_FORMAT_RGBx, SPA_VIDEO_FORMAT_RGBA),
    SPA_FORMAT_VIDEO_size, SPA_POD_Rectangle(&size),
    SPA_FORMAT_VIDEO_framerate, SPA_POD_Fraction(&none),
    SPA_FORMAT_VIDEO_maxFramerate, SPA_POD_CHOICE_RANGE_Fraction(&one, &one, &one));

  app->stream = pw_stream_new(app->core, "horizonte-display",
                              pw_properties_new(PW_KEY_MEDIA_TYPE, "Video", PW_KEY_MEDIA_CATEGORY, "Capture",
                                                PW_KEY_MEDIA_ROLE, "Screen", NULL));
  if (!app->stream) return -1;
  pw_stream_add_listener(app->stream, &app->stream_listener, &stream_events, app);
  return pw_stream_connect(app->stream, PW_DIRECTION_INPUT, node,
                           PW_STREAM_FLAG_AUTOCONNECT | PW_STREAM_FLAG_DONT_RECONNECT, params, 1);
}

static void on_stream_added(GDBusConnection *bus, const char *sender, const char *path, const char *iface,
                            const char *signal, GVariant *parameters, gpointer data) {
  struct app *app = data;
  guint32 node = 0;
  (void)bus; (void)sender; (void)path; (void)iface; (void)signal;
  g_variant_get(parameters, "(u)", &node);
  pw_thread_loop_lock(app->pw_loop);
  int result = connect_stream(app, node);
  pw_thread_loop_unlock(app->pw_loop);
  if (result < 0) quit(app, 4, "não consegui ligar ao stream do monitor virtual");
}

static void on_session_closed(GDBusConnection *bus, const char *sender, const char *path, const char *iface,
                              const char *signal, GVariant *parameters, gpointer data) {
  (void)bus; (void)sender; (void)path; (void)iface; (void)signal; (void)parameters;
  quit(data, 3, "o GNOME encerrou o monitor virtual");
}

static GVariant *call(struct app *app, const char *path, const char *iface, const char *method,
                      GVariant *args, const char *reply, GError **error) {
  return g_dbus_connection_call_sync(app->bus, MUTTER, path, iface, method, args,
                                     reply ? G_VARIANT_TYPE(reply) : NULL, G_DBUS_CALL_FLAGS_NONE, 10000, NULL,
                                     error);
}

static int start_mutter(struct app *app) {
  GError *error = NULL;
  GVariantBuilder props;
  g_variant_builder_init(&props, G_VARIANT_TYPE_VARDICT);
  GVariant *result = call(app, "/org/gnome/Mutter/ScreenCast", MUTTER, "CreateSession",
                          g_variant_new("(a{sv})", &props), "(o)", &error);
  if (!result) {
    fprintf(stderr, "o GNOME não aceitou criar o monitor virtual: %s\n", error->message);
    return -1;
  }
  g_variant_get(result, "(o)", &app->session);
  g_variant_unref(result);

  g_dbus_connection_signal_subscribe(app->bus, MUTTER, MUTTER ".Session", "Closed", app->session, NULL,
                                     G_DBUS_SIGNAL_FLAGS_NONE, on_session_closed, app, NULL);

  GVariantBuilder record;
  g_variant_builder_init(&record, G_VARIANT_TYPE_VARDICT);
  g_variant_builder_add(&record, "{sv}", "cursor-mode", g_variant_new_uint32(1)); /* cursor desenhado na imagem */
  g_variant_builder_add(&record, "{sv}", "is-platform", g_variant_new_boolean(TRUE));
  result = call(app, app->session, MUTTER ".Session", "RecordVirtual", g_variant_new("(a{sv})", &record), "(o)",
                &error);
  if (!result) {
    fprintf(stderr, "o GNOME não aceitou o monitor virtual: %s\n", error->message);
    return -1;
  }
  g_variant_get(result, "(o)", &app->stream_path);
  g_variant_unref(result);

  g_dbus_connection_signal_subscribe(app->bus, MUTTER, MUTTER ".Stream", "PipeWireStreamAdded", app->stream_path,
                                     NULL, G_DBUS_SIGNAL_FLAGS_NONE, on_stream_added, app, NULL);

  result = call(app, app->session, MUTTER ".Session", "Start", NULL, NULL, &error);
  if (!result) {
    fprintf(stderr, "o GNOME não iniciou o monitor virtual: %s\n", error->message);
    return -1;
  }
  g_variant_unref(result);
  return 0;
}

static gboolean on_signal(gpointer data) {
  quit(data, 0, NULL);
  return G_SOURCE_REMOVE;
}

static int parse_int(const char *value, int min, int max) {
  char *end = NULL;
  long n = value ? strtol(value, &end, 10) : -1;
  return (end && *end == '\0' && n >= min && n <= max) ? (int)n : -1;
}

int main(int argc, char **argv) {
  struct app app = { .width = 1920, .height = 1080, .refresh = 60 };
  for (int i = 1; i < argc; i += 2) {
    const char *value = i + 1 < argc ? argv[i + 1] : NULL;
    int *target = !strcmp(argv[i], "--width")   ? &app.width
                : !strcmp(argv[i], "--height")  ? &app.height
                : !strcmp(argv[i], "--refresh") ? &app.refresh
                                                : NULL;
    if (!target || (*target = parse_int(value, 1, 16384)) < 0) {
      fprintf(stderr, "uso: horizonte-display [--width 1920] [--height 1080] [--refresh 60]\n");
      return 2;
    }
  }

  /* Se o Horizonte morrer, o monitor não pode ficar para trás. */
  prctl(PR_SET_PDEATHSIG, SIGTERM);
  if (getppid() == 1) return 0;

  GError *error = NULL;
  app.bus = g_bus_get_sync(G_BUS_TYPE_SESSION, NULL, &error);
  if (!app.bus) {
    fprintf(stderr, "sem a sessão do D-Bus: %s\n", error->message);
    return 2;
  }

  pw_init(&argc, &argv);
  app.pw_loop = pw_thread_loop_new("horizonte-display", NULL);
  app.context = pw_context_new(pw_thread_loop_get_loop(app.pw_loop), NULL, 0);
  if (!app.context || pw_thread_loop_start(app.pw_loop) < 0) {
    fprintf(stderr, "não consegui iniciar o PipeWire\n");
    return 4;
  }
  pw_thread_loop_lock(app.pw_loop);
  app.core = pw_context_connect(app.context, NULL, 0);
  pw_thread_loop_unlock(app.pw_loop);
  if (!app.core) {
    fprintf(stderr, "o PipeWire não está rodando nesta sessão\n");
    return 4;
  }

  app.loop = g_main_loop_new(NULL, FALSE);
  g_unix_signal_add(SIGTERM, on_signal, &app);
  g_unix_signal_add(SIGINT, on_signal, &app);
  if (start_mutter(&app) < 0) return 3;

  g_main_loop_run(app.loop);

  /* Fecha a sessão do Mutter: o monitor some na hora, e as janelas voltam para as outras telas. */
  if (app.session) {
    GVariant *result = call(&app, app.session, MUTTER ".Session", "Stop", NULL, NULL, NULL);
    if (result) g_variant_unref(result);
  }
  pw_thread_loop_lock(app.pw_loop);
  if (app.stream) pw_stream_destroy(app.stream);
  pw_core_disconnect(app.core);
  pw_thread_loop_unlock(app.pw_loop);
  pw_thread_loop_stop(app.pw_loop);
  pw_context_destroy(app.context);
  pw_thread_loop_destroy(app.pw_loop);
  pw_deinit();
  return app.exit_code;
}
