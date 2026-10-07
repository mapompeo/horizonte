/**
 * Caminhos curvos entre cada sistema da esquerda e cada um da direita, saindo da borda de cada cartão
 * (e não de um ponto qualquer): `left` e `right` são a borda direita dos cartões da esquerda e a borda esquerda
 * dos da direita; `ys` é a altura do centro de cada linha de cartões.
 */
export function matrixPaths(left, right, ys) {
  const mid = (left + right) / 2
  const out = []
  for (const a of ys) for (const b of ys) out.push(`M${left} ${a} C ${mid} ${a} ${mid} ${b} ${right} ${b}`)
  return out
}

export function mountMatrix(root) {
  if (!root) return
  const svg = root.querySelector('svg')
  const cards = [...root.querySelectorAll('.chip.l')]
  const right = [...root.querySelectorAll('.chip.r')]
  const update = () => {
    const width = root.clientWidth
    const height = root.clientHeight
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    let index = 0
    cards.forEach((card) => right.forEach((target) => {
      const left = card.offsetLeft + card.offsetWidth
      const end = target.offsetLeft
      const middle = (left + end) / 2
      const path = `M${left} ${card.offsetTop} C ${middle} ${card.offsetTop} ${middle} ${target.offsetTop} ${end} ${target.offsetTop}`
      root.querySelector(`#p${index++}`).setAttribute('d', path)
    }))
  }
  new ResizeObserver(update).observe(root)
  update()
}
