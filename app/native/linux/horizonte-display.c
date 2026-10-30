/*
 * horizonte-display (Linux, GNOME): cria um monitor virtual pelo Mutter e fica vivo até receber SIGTERM ou SIGINT.
 * O monitor some junto com o processo. Imprime "READY <largura>x<altura>" quando a tela já existe.
 *
 * O Mutter só cria o monitor quando alguém consome o stream PipeWire dele, e é quem consome que escolhe o tamanho.
 *
 * Sem --frames, este auxiliar consome a 1 quadro por segundo e descarta: quem captura é o Chromium, pelo portal de
 * captura de tela (com o seletor do GNOME).
 *
 * Com --frames <socket>, ele escuta nesse socket Unix e manda a quem se conectar cada imagem nova da tela estendida,
 * sem converter (BGRx ou RGBx, como o Mutter entrega). A janela de envio do Horizonte transforma as imagens em vídeo
 * (MediaStreamTrackGenerator): assim a tela chega ao WebRTC sem o seletor do GNOME. Sem mudança na tela, a última
 * imagem é repetida a cada segundo, para o codificador ter o que mandar a quem acabou de entrar.
 *
 * Cada imagem vai com um cabeçalho de 24 bytes (inteiros de 32 bits, little-endian): "HZF1", largura, altura, bytes
 * por linha, formato (0 = BGRX, 1 = RGBX) e tamanho dos dados; depois os dados.
 *
 * Posição: pela entrada padrão, uma linha por pedido, "place <left|right|above|below> [início]". O início é onde a
 * tela estendida começa ao longo da borda das outras telas, em fração dessa borda; sem ele, fica centralizada. A
 * disposição é aplicada como temporária (sem o aviso "manter alterações" do GNOME) e responde "PLACED" ou, no erro
 * padrão, o motivo.
 *
 * Uso: horizonte-display [--width 1920] [--height 1080] [--refresh 60] [--frames /run/user/1000/horizonte.sock]
 * Saída 2: argumentos ou ambiente; 3: o Mutter recusou ou encerrou a sessão; 4: o PipeWire falhou; 5: o socket.
 */
#include <errno.h>
#include <gio/gio.h>
#include <glib-unix.h>
#include <pipewire/pipewire.h>
#include <poll.h>
#include <pthread.h>
#include <signal.h>
#include <spa/param/buffers.h>
#include <spa/param/video/format-utils.h>
#include <spa/pod/builder.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>

#define MUTTER "org.gnome.Mutter.ScreenCast"
#define DISPLAY_CONFIG "org.gnome.Mutter.DisplayConfig"
#define DISPLAY_CONFIG_PATH "/org/gnome/Mutter/DisplayConfig"
#define FRAME_MAGIC 0x31465A48u /* "HZF1" */
#define REPEAT_MS 1000

struct app {
  GMainLoop *loop;
  GDBusConnection *bus;
  char *session;
  char *stream_path;
  struct pw_thread_loop *pw_loop;
  struct pw_context *context;
  struct pw_core *core;
  struct pw_stream *input;
  struct spa_hook input_listener;
  uint32_t input_format;
  int width;
  int height;
  int refresh;
  int exit_code;
  gboolean ready;
  /* Monitores virtuais (Meta-N) que já existiam antes deste: o nosso é o que aparecer de novo. */
  GPtrArray *virtual_before;

  /* Envio das imagens (--frames). A thread do PipeWire copia a imagem nova para `frame` quando o envio está livre;
   * a thread de envio manda e libera. Se o envio ainda está ocupado, a imagem é descartada: vale a mais recente. */
  const char *frames_path;
  int listen_fd;
  pthread_t sender;
  pthread_mutex_t lock;
  pthread_cond_t wake;
  uint8_t *frame;
  uint32_t frame_size, frame_stride, frame_format;
  gboolean frame_new, frame_valid, sending, stopping;
  unsigned frames_in, frames_sent;
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

static gboolean announce_ready(gpointer data) {
  struct app *app = data;
  if (!app->ready) {
    app->ready = TRUE;
    printf("READY %dx%d\n", app->width, app->height);
    fflush(stdout);
  }
  return G_SOURCE_REMOVE;
}

/* ---------- envio das imagens ---------- */

static int write_all(int fd, const void *data, size_t size) {
  const uint8_t *p = data;
  while (size > 0) {
    ssize_t n = send(fd, p, size, MSG_NOSIGNAL);
    if (n < 0 && errno == EINTR) continue;
    if (n <= 0) return -1;
    p += n;
    size -= (size_t)n;
  }
  return 0;
}

static int send_frame(struct app *app, int fd) {
  uint32_t header[6] = { FRAME_MAGIC, (uint32_t)app->width, (uint32_t)app->height, app->frame_stride,
                         app->frame_format, app->frame_size };
  if (write_all(fd, header, sizeof(header)) < 0) return -1;
  return write_all(fd, app->frame, app->frame_size);
}

static void *sender_main(void *data) {
  struct app *app = data;
  while (!app->stopping) {
    /* Um cliente por vez: a janela de envio do Horizonte. */
    struct pollfd p = { .fd = app->listen_fd, .events = POLLIN };
    if (poll(&p, 1, 200) <= 0) continue;
    int client = accept(app->listen_fd, NULL, NULL);
    if (client < 0) continue;
    gboolean first = TRUE;
    for (;;) {
      pthread_mutex_lock(&app->lock);
      /* Quem acabou de conectar recebe logo a última imagem; depois, espera uma nova ou 1 s. */
      if (!first || !app->frame_valid) {
        struct timespec until;
        clock_gettime(CLOCK_REALTIME, &until);
        until.tv_sec += REPEAT_MS / 1000;
        while (!app->frame_new && !app->stopping &&
               pthread_cond_timedwait(&app->wake, &app->lock, &until) != ETIMEDOUT) {
        }
      }
      first = FALSE;
      if (app->stopping) {
        pthread_mutex_unlock(&app->lock);
        break;
      }
      if (!app->frame_valid) {
        pthread_mutex_unlock(&app->lock);
        continue;
      }
      app->frame_new = FALSE;
      app->sending = TRUE;
      pthread_mutex_unlock(&app->lock);
      int result = send_frame(app, client);
      pthread_mutex_lock(&app->lock);
      app->sending = FALSE;
      if (result == 0) app->frames_sent++;
      pthread_mutex_unlock(&app->lock);
      if (result < 0) break; /* a janela fechou: espera a próxima */
    }
    close(client);
  }
  return NULL;
}

static int start_frames(struct app *app) {
  struct sockaddr_un address = { .sun_family = AF_UNIX };
  if (strlen(app->frames_path) >= sizeof(address.sun_path)) {
    fprintf(stderr, "caminho do socket longo demais\n");
    return -1;
  }
  strcpy(address.sun_path, app->frames_path);
  unlink(app->frames_path);
  app->listen_fd = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
  /* Só o próprio usuário pode ler a tela. */
  mode_t old = umask(0077);
  int bound = app->listen_fd >= 0 ? bind(app->listen_fd, (struct sockaddr *)&address, sizeof(address)) : -1;
  umask(old);
  if (bound < 0 || listen(app->listen_fd, 1) < 0) {
    fprintf(stderr, "não consegui abrir o socket das imagens: %s\n", strerror(errno));
    return -1;
  }
  app->frame = g_malloc((size_t)app->width * app->height * 4);
  pthread_mutex_init(&app->lock, NULL);
  pthread_cond_init(&app->wake, NULL);
  return pthread_create(&app->sender, NULL, sender_main, app) == 0 ? 0 : -1;
}

static void stop_frames(struct app *app) {
  if (!app->frames_path || app->listen_fd < 0) return;
  pthread_mutex_lock(&app->lock);
  app->stopping = TRUE;
  pthread_cond_signal(&app->wake);
  pthread_mutex_unlock(&app->lock);
  shutdown(app->listen_fd, SHUT_RDWR);
  pthread_join(app->sender, NULL);
  close(app->listen_fd);
  unlink(app->frames_path);
}

/* ---------- tela estendida (vinda do Mutter) ---------- */

static void on_process(void *data) {
  struct app *app = data;
  struct pw_buffer *buffer, *latest = NULL;
  /* Fica só com o mais recente: se atrasou, os mais velhos não interessam. */
  while ((buffer = pw_stream_dequeue_buffer(app->input)) != NULL) {
    if (latest) pw_stream_queue_buffer(app->input, latest);
    latest = buffer;
  }
  if (!latest) return;
  app->frames_in++;

  /* O Mutter manda um quadro vazio quando nada mudou na tela; esses não interessam. */
  struct spa_data *in = &latest->buffer->datas[0];
  if (app->frames_path && in->data && in->chunk->size > 0) {
    const uint32_t stride = in->chunk->stride > 0 ? (uint32_t)in->chunk->stride : (uint32_t)app->width * 4;
    const uint32_t size = stride * (uint32_t)app->height;
    pthread_mutex_lock(&app->lock);
    if (!app->sending && size <= (uint32_t)app->width * app->height * 4 && in->chunk->offset + size <= in->maxsize) {
      memcpy(app->frame, (const uint8_t *)in->data + in->chunk->offset, size);
      app->frame_size = size;
      app->frame_stride = stride;
      app->frame_format =
        (app->input_format == SPA_VIDEO_FORMAT_RGBx || app->input_format == SPA_VIDEO_FORMAT_RGBA) ? 1 : 0;
      app->frame_valid = app->frame_new = TRUE;
      pthread_cond_signal(&app->wake);
    }
    pthread_mutex_unlock(&app->lock);
  }
  pw_stream_queue_buffer(app->input, latest);
}

static void on_param_changed(void *data, uint32_t id, const struct spa_pod *param) {
  struct app *app = data;
  if (id != SPA_PARAM_Format || param == NULL) return;
  struct spa_video_info_raw info;
  if (spa_format_video_raw_parse(param, &info) >= 0) app->input_format = info.format;
  /* Memória comum (e não DMA-BUF), para o processador poder ler os pixels. */
  uint8_t buffer[256];
  struct spa_pod_builder builder = SPA_POD_BUILDER_INIT(buffer, sizeof(buffer));
  const struct spa_pod *params[1];
  params[0] = spa_pod_builder_add_object(
    &builder, SPA_TYPE_OBJECT_ParamBuffers, SPA_PARAM_Buffers,
    SPA_PARAM_BUFFERS_dataType, SPA_POD_CHOICE_FLAGS_Int((1 << SPA_DATA_MemFd) | (1 << SPA_DATA_MemPtr)));
  pw_stream_update_params(app->input, params, 1);
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
  .param_changed = on_param_changed,
  .process = on_process,
};

static int connect_stream(struct app *app, uint32_t node) {
  uint8_t buffer[1024];
  struct spa_pod_builder builder = SPA_POD_BUILDER_INIT(buffer, sizeof(buffer));
  struct spa_rectangle size = SPA_RECTANGLE(app->width, app->height);
  struct spa_fraction none = SPA_FRACTION(0, 1);
  struct spa_fraction one = SPA_FRACTION(1, 1);
  /* O tamanho é fixo (é ele que define o monitor). Sem --frames, a taxa máxima de 1 quadro por segundo faz o Mutter
   * quase não gastar copiando quadros para cá; o monitor em si continua com a taxa de atualização normal. */
  struct spa_fraction max = app->frames_path ? SPA_FRACTION(app->refresh, 1) : one;
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
    SPA_FORMAT_VIDEO_maxFramerate, SPA_POD_CHOICE_RANGE_Fraction(&max, &one, &max));

  app->input = pw_stream_new(app->core, "horizonte-display",
                             pw_properties_new(PW_KEY_MEDIA_TYPE, "Video", PW_KEY_MEDIA_CATEGORY, "Capture",
                                               PW_KEY_MEDIA_ROLE, "Screen", NULL));
  if (!app->input) return -1;
  pw_stream_add_listener(app->input, &app->input_listener, &stream_events, app);
  return pw_stream_connect(app->input, PW_DIRECTION_INPUT, node,
                           PW_STREAM_FLAG_AUTOCONNECT | PW_STREAM_FLAG_DONT_RECONNECT |
                             (app->frames_path ? PW_STREAM_FLAG_MAP_BUFFERS : 0),
                           params, 1);
}

/* ---------- Mutter (D-Bus) ---------- */

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

/* ---------- posição (Mutter DisplayConfig) ---------- */

struct logical {
  int x, y, w, h;
  double scale;
  guint32 transform;
  gboolean primary;
  char *connector;
  char *mode;
};

static GVariant *display_config(struct app *app, const char *method, GVariant *args, const char *reply,
                                GError **error) {
  return g_dbus_connection_call_sync(app->bus, DISPLAY_CONFIG, DISPLAY_CONFIG_PATH, DISPLAY_CONFIG, method, args,
                                     reply ? G_VARIANT_TYPE(reply) : NULL, G_DBUS_CALL_FLAGS_NONE, 5000, NULL, error);
}

/* Lê o estado atual: cada tela lógica com o seu conector, o modo em uso e o tamanho em coordenadas da área de
 * trabalho. Devolve a quantidade (0 se falhou). */
static int read_layout(struct app *app, guint32 *serial, struct logical *out, int max) {
  GVariant *state = display_config(app, "GetCurrentState", NULL, "(ua((ssss)a(siiddada{sv})a{sv})a(iiduba(ssss)a{sv})a{sv})", NULL);
  if (!state) return 0;
  GVariant *monitors = g_variant_get_child_value(state, 1);
  GVariant *logicals = g_variant_get_child_value(state, 2);
  GVariant *props = g_variant_get_child_value(state, 3);
  g_variant_get_child(state, 0, "u", serial);
  guint32 layout_mode = 1;
  g_variant_lookup(props, "layout-mode", "u", &layout_mode);

  int count = 0;
  for (gsize i = 0; i < g_variant_n_children(logicals) && count < max; i++) {
    GVariant *l = g_variant_get_child_value(logicals, i);
    struct logical *item = &out[count];
    memset(item, 0, sizeof(*item));
    g_variant_get_child(l, 0, "i", &item->x);
    g_variant_get_child(l, 1, "i", &item->y);
    g_variant_get_child(l, 2, "d", &item->scale);
    g_variant_get_child(l, 3, "u", &item->transform);
    g_variant_get_child(l, 4, "b", &item->primary);
    GVariant *specs = g_variant_get_child_value(l, 5);
    if (g_variant_n_children(specs) > 0) g_variant_get_child(specs, 0, "(ssss)", &item->connector, NULL, NULL, NULL);
    g_variant_unref(specs);
    g_variant_unref(l);
    if (!item->connector) continue;
    /* Modo em uso deste conector, e o tamanho dele. */
    for (gsize m = 0; m < g_variant_n_children(monitors); m++) {
      GVariant *monitor = g_variant_get_child_value(monitors, m);
      char *connector = NULL;
      GVariant *spec = g_variant_get_child_value(monitor, 0);
      g_variant_get_child(spec, 0, "s", &connector);
      g_variant_unref(spec);
      if (g_strcmp0(connector, item->connector) == 0) {
        GVariant *modes = g_variant_get_child_value(monitor, 1);
        for (gsize k = 0; k < g_variant_n_children(modes); k++) {
          GVariant *mode = g_variant_get_child_value(modes, k);
          GVariant *mode_props = g_variant_get_child_value(mode, 6);
          gboolean current = FALSE;
          g_variant_lookup(mode_props, "is-current", "b", &current);
          if (current) {
            int w = 0, h = 0;
            g_variant_get_child(mode, 0, "s", &item->mode);
            g_variant_get_child(mode, 1, "i", &w);
            g_variant_get_child(mode, 2, "i", &h);
            /* Com o layout lógico (o padrão do GNOME), a área de trabalho conta em pixels lógicos. */
            const gboolean rotated = item->transform % 2 == 1;
            const double div = layout_mode == 1 && item->scale > 0 ? item->scale : 1;
            item->w = (int)((rotated ? h : w) / div + 0.5);
            item->h = (int)((rotated ? w : h) / div + 0.5);
          }
          g_variant_unref(mode_props);
          g_variant_unref(mode);
        }
        g_variant_unref(modes);
      }
      g_free(connector);
      g_variant_unref(monitor);
    }
    if (item->mode) count++;
    else g_free(item->connector);
  }
  g_variant_unref(props);
  g_variant_unref(logicals);
  g_variant_unref(monitors);
  g_variant_unref(state);
  return count;
}

static void free_layout(struct logical *items, int count) {
  for (int i = 0; i < count; i++) {
    g_free(items[i].connector);
    g_free(items[i].mode);
  }
}

static gboolean was_virtual_before(struct app *app, const char *connector) {
  for (guint i = 0; app->virtual_before && i < app->virtual_before->len; i++)
    if (g_strcmp0(g_ptr_array_index(app->virtual_before, i), connector) == 0) return TRUE;
  return FALSE;
}

static void remember_virtual_monitors(struct app *app) {
  struct logical items[16];
  guint32 serial = 0;
  int count = read_layout(app, &serial, items, 16);
  app->virtual_before = g_ptr_array_new_with_free_func(g_free);
  for (int i = 0; i < count; i++)
    if (g_str_has_prefix(items[i].connector, "Meta-")) g_ptr_array_add(app->virtual_before, g_strdup(items[i].connector));
  free_layout(items, count);
}

/* Põe a tela estendida no lado pedido das outras telas; `centered`: no meio da borda, sem olhar `start`. */
static gboolean place(struct app *app, const char *side, gboolean centered, double start, char **why) {
  struct logical items[16];
  guint32 serial = 0;
  int count = read_layout(app, &serial, items, 16);
  int mine = -1;
  for (int i = count - 1; i >= 0; i--)
    if (g_str_has_prefix(items[i].connector, "Meta-") && !was_virtual_before(app, items[i].connector)) mine = i;
  if (mine < 0 || count < 2) {
    free_layout(items, count);
    *why = g_strdup("a tela estendida ainda não apareceu");
    return FALSE;
  }

  /* Caixa das outras telas. */
  int left = G_MAXINT, top = G_MAXINT, right = G_MININT, bottom = G_MININT;
  for (int i = 0; i < count; i++) {
    if (i == mine) continue;
    left = MIN(left, items[i].x);
    top = MIN(top, items[i].y);
    right = MAX(right, items[i].x + items[i].w);
    bottom = MAX(bottom, items[i].y + items[i].h);
  }
  struct logical *v = &items[mine];
  const gboolean along_x = !g_strcmp0(side, "above") || !g_strcmp0(side, "below");
  const int edge = along_x ? right - left : bottom - top;
  const int peer = along_x ? v->w : v->h;
  const int at = centered ? (edge - peer) / 2 : (int)(start * edge);
  if (!g_strcmp0(side, "left")) { v->x = left - v->w; v->y = top + at; }
  else if (!g_strcmp0(side, "right")) { v->x = right; v->y = top + at; }
  else if (!g_strcmp0(side, "above")) { v->x = left + at; v->y = top - v->h; }
  else { v->x = left + at; v->y = bottom; }

  /* O GNOME quer a área de trabalho começando em (0, 0). */
  int ox = G_MAXINT, oy = G_MAXINT;
  for (int i = 0; i < count; i++) {
    ox = MIN(ox, items[i].x);
    oy = MIN(oy, items[i].y);
  }
  GVariantBuilder logical;
  g_variant_builder_init(&logical, G_VARIANT_TYPE("a(iiduba(ssa{sv}))"));
  for (int i = 0; i < count; i++) {
    GVariantBuilder monitors;
    g_variant_builder_init(&monitors, G_VARIANT_TYPE("a(ssa{sv})"));
    g_variant_builder_add(&monitors, "(ss@a{sv})", items[i].connector, items[i].mode,
                          g_variant_new_array(G_VARIANT_TYPE("{sv}"), NULL, 0));
    g_variant_builder_add(&logical, "(iidub@a(ssa{sv}))", items[i].x - ox, items[i].y - oy, items[i].scale,
                          items[i].transform, items[i].primary, g_variant_builder_end(&monitors));
  }
  GVariantBuilder props;
  g_variant_builder_init(&props, G_VARIANT_TYPE_VARDICT);
  GError *error = NULL;
  /* Método 1: temporário. Some quando a sessão acaba, e o GNOME não pergunta se é para manter. */
  GVariant *result = display_config(app, "ApplyMonitorsConfig",
                                    g_variant_new("(uu@a(iiduba(ssa{sv}))@a{sv})", serial, 1,
                                                  g_variant_builder_end(&logical), g_variant_builder_end(&props)),
                                    NULL, &error);
  free_layout(items, count);
  if (!result) {
    *why = g_strdup(error->message);
    g_error_free(error);
    return FALSE;
  }
  g_variant_unref(result);
  return TRUE;
}

static gboolean on_command(GIOChannel *channel, GIOCondition condition, gpointer data) {
  struct app *app = data;
  if (condition & (G_IO_HUP | G_IO_ERR)) return G_SOURCE_REMOVE;
  char *line = NULL;
  if (g_io_channel_read_line(channel, &line, NULL, NULL, NULL) != G_IO_STATUS_NORMAL || !line) return G_SOURCE_CONTINUE;
  char side[16] = "";
  char start_text[32] = "";
  const int fields = sscanf(line, "place %15s %31s", side, start_text);
  g_free(line);
  if (fields < 1 || (strcmp(side, "left") && strcmp(side, "right") && strcmp(side, "above") && strcmp(side, "below"))) {
    fprintf(stderr, "pedido de posição inválido\n");
    return G_SOURCE_CONTINUE;
  }
  /* O início pode passar um pouco das pontas da borda (tela estendida maior que as outras), nunca muito. */
  char *end = NULL;
  double start = fields == 2 ? g_ascii_strtod(start_text, &end) : 0;
  const gboolean centered = fields < 2 || !end || *end || start < -4 || start > 4;
  char *why = NULL;
  if (place(app, side, centered, start, &why)) {
    printf("PLACED %s\n", side);
    fflush(stdout);
  } else {
    fprintf(stderr, "não consegui posicionar a tela estendida: %s\n", why);
    g_free(why);
  }
  return G_SOURCE_CONTINUE;
}

static gboolean debug_tick(gpointer data) {
  struct app *app = data;
  fprintf(stderr, "quadros do Mutter %u, imagens enviadas %u\n", app->frames_in, app->frames_sent);
  return G_SOURCE_CONTINUE;
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
  struct app app = { .width = 1920, .height = 1080, .refresh = 60, .listen_fd = -1 };
  for (int i = 1; i < argc; i += 2) {
    const char *value = i + 1 < argc ? argv[i + 1] : NULL;
    if (!strcmp(argv[i], "--frames") && value && value[0] == '/') {
      app.frames_path = value;
      continue;
    }
    int *target = !strcmp(argv[i], "--width")   ? &app.width
                : !strcmp(argv[i], "--height")  ? &app.height
                : !strcmp(argv[i], "--refresh") ? &app.refresh
                                                : NULL;
    if (!target || (*target = parse_int(value, 1, 16384)) < 0) {
      fprintf(stderr, "uso: horizonte-display [--width 1920] [--height 1080] [--refresh 60] [--frames /caminho.sock]\n");
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
  if (app.frames_path && start_frames(&app) < 0) return 5;

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
  remember_virtual_monitors(&app);
  if (start_mutter(&app) < 0) return 3;
  GIOChannel *commands = g_io_channel_unix_new(STDIN_FILENO);
  g_io_add_watch(commands, G_IO_IN | G_IO_HUP | G_IO_ERR, on_command, &app);
  if (getenv("HZ_DEBUG")) g_timeout_add_seconds(2, debug_tick, &app);

  g_main_loop_run(app.loop);

  /* Fecha a sessão do Mutter: o monitor some na hora, e as janelas voltam para as outras telas. */
  if (app.session) {
    GVariant *result = call(&app, app.session, MUTTER ".Session", "Stop", NULL, NULL, NULL);
    if (result) g_variant_unref(result);
  }
  pw_thread_loop_lock(app.pw_loop);
  if (app.input) pw_stream_destroy(app.input);
  pw_core_disconnect(app.core);
  pw_thread_loop_unlock(app.pw_loop);
  pw_thread_loop_stop(app.pw_loop);
  stop_frames(&app);
  pw_context_destroy(app.context);
  pw_thread_loop_destroy(app.pw_loop);
  pw_deinit();
  return app.exit_code;
}
