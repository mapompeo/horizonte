/** O pedaço do processo do auxiliar que importa; o `child_process.spawn` de verdade entra em `wire.ts`. */
export interface HelperProcess {
  onStdout(callback: (text: string) => void): void
  onStderr(callback: (text: string) => void): void
  onExit(callback: (code: number | null) => void): void
  onError(callback: (error: Error) => void): void
  kill(): void
}

export interface RunningDisplay {
  displayId: number
  stop(): void
}

/**
 * Liga o auxiliar `horizonte-display` e espera ele avisar "DISPLAY_ID <n>". Sem aviso a tempo, ou se ele encerrar
 * antes, o erro leva o que ele disse. O monitor virtual dura enquanto o auxiliar estiver rodando.
 */
export function startDisplayHelper(
  spawn: () => HelperProcess,
  timeoutMs = 20_000
): Promise<RunningDisplay> {
  return new Promise((resolve, reject) => {
    const child = spawn()
    let stdout = ''
    let stderr = ''
    let settled = false
    let stopped = false

    const stop = (): void => {
      if (stopped) return
      stopped = true
      child.kill()
    }
    const fail = (message: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      stop()
      reject(new Error(message))
    }

    const timer = setTimeout(
      () =>
        fail(`o auxiliar do monitor virtual não respondeu em ${Math.round(timeoutMs / 1000)} s`),
      timeoutMs
    )

    child.onError((error) =>
      fail(`não consegui iniciar o auxiliar do monitor virtual: ${error.message}`)
    )
    child.onStderr((text) => {
      stderr += text
    })
    child.onStdout((text) => {
      if (settled) return
      stdout += text
      // Só vale a linha inteira: "DISPLAY_ID 1" pode ser o começo de "DISPLAY_ID 12".
      const found = /DISPLAY_ID (\d+)\n/.exec(stdout)
      if (!found) return
      settled = true
      clearTimeout(timer)
      resolve({ displayId: Number(found[1]), stop })
    })
    child.onExit((code) => {
      stopped = true
      fail(
        stderr.trim() ||
          `o auxiliar do monitor virtual encerrou com código ${code ?? 'desconhecido'}`
      )
    })
  })
}
