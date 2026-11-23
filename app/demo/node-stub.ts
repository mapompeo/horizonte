/** No navegador não há disco: o núcleo importa estes módulos do Node, mas a demonstração guarda tudo na memória. */
const unavailable = (): never => {
  throw new Error('Sem acesso a arquivos no navegador.')
}

export const mkdir = unavailable
export const readFile = unavailable
export const rename = unavailable
export const rm = unavailable
export const writeFile = unavailable
export const dirname = unavailable
