<script lang="ts">
  import qrcode from 'qrcode-generator'

  interface Props {
    /** O que o celular abre ao apontar a câmera. */
    text: string
    size?: number
  }

  let { text, size = 168 }: Props = $props()

  /** Um caminho só com um quadradinho por módulo escuro: nítido em qualquer tamanho. */
  const code = $derived.by(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const count = qr.getModuleCount()
    let path = ''
    for (let row = 0; row < count; row++)
      for (let col = 0; col < count; col++)
        if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`
    return { count, path }
  })
</script>

<div class="qr" style="width: {size}px; height: {size}px">
  <svg
    viewBox="-2 -2 {code.count + 4} {code.count + 4}"
    shape-rendering="crispEdges"
    role="img"
    aria-label="QR code para abrir no celular"
  >
    <path d={code.path} fill="#000000" />
  </svg>
</div>
