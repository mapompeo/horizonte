// Recebe o diagnóstico do app (um clique, sem conta no GitHub) e abre o registro no repositório.
// O token fica só aqui na Vercel (GITHUB_TOKEN, com permissão de criar issues no repositório).

const REPO = 'mapompeo/horizonte'
// O relatório do app (computador e o final dos logs) cabe numa issue: o GitHub aceita até 65 536 caracteres.
const MAX = 60_000

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ erro: 'Use POST.' })
  const text = typeof request.body?.texto === 'string' ? request.body.texto.trim() : ''
  if (!text || text.length > MAX || !/^Horizonte /m.test(text))
    return response.status(400).json({ erro: 'Diagnóstico inválido.' })
  const token = process.env.GITHUB_TOKEN
  if (!token) return response.status(503).json({ erro: 'Envio indisponível agora.' })
  const version = /^Horizonte (\S+)/m.exec(text)?.[1] ?? ''
  const github = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'horizonte-diagnostico'
    },
    body: JSON.stringify({
      title: `Diagnóstico ${version}`.trim(),
      body: '```\n' + text.replace(/```/g, "'''") + '\n```',
      labels: ['diagnostico']
    })
  })
  if (!github.ok) return response.status(502).json({ erro: 'Não consegui registrar agora.' })
  return response.status(201).json({ ok: true })
}
