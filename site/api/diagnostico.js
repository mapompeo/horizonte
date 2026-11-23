// Recebe o diagnóstico do app (um clique, sem conta no GitHub) e abre o registro no repositório.
// O token fica só aqui na Vercel (GITHUB_TOKEN, com permissão de criar issues no repositório).
//
// Dois jeitos de chegar:
// - botão "Enviar diagnóstico": uma issue por envio (`diagnostico`);
// - envio automático de erro (`automatico` + `codigo`): uma issue por erro, versão e sistema (`erro-automatico`); o
//   mesmo erro de outros computadores vira comentário nela, para não encher o repositório.

const REPO = 'mapompeo/horizonte'
// O relatório do app (computador e o final dos logs) cabe numa issue: o GitHub aceita até 65 536 caracteres.
const MAX = 60_000
// Uma issue de erro com tantos comentários já diz o que precisa: o resto só contaria de novo.
const MAX_COMMENTS = 25

const github = (token, path, init = {}) =>
  fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'horizonte-diagnostico'
    }
  })

const fence = (text) => '```\n' + text.replace(/```/g, "'''") + '\n```'

async function automatic(token, text, version, code) {
  // O título só leva partes conferidas (versão, sistema e número do erro): nada do texto livre do relatório.
  const system = /^Sistema: (win32|windows|darwin|macos|linux)\b/im.exec(text)?.[1]?.toLowerCase() ?? 'outro'
  const title = `Erro ${code} · ${version} · ${system}`
  const open = await github(token, '/issues?state=open&labels=erro-automatico&per_page=100')
  const found = open.ok ? (await open.json()).find((issue) => issue.title === title) : null
  if (found) {
    if (found.comments >= MAX_COMMENTS) return 200
    const res = await github(token, `/issues/${found.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: fence(text) })
    })
    return res.ok ? 201 : 502
  }
  const res = await github(token, '/issues', {
    method: 'POST',
    body: JSON.stringify({ title, body: fence(text), labels: ['erro-automatico'] })
  })
  return res.ok ? 201 : 502
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ erro: 'Use POST.' })
  const text = typeof request.body?.texto === 'string' ? request.body.texto.trim() : ''
  if (!text || text.length > MAX || !/^Horizonte /m.test(text))
    return response.status(400).json({ erro: 'Diagnóstico inválido.' })
  const token = process.env.GITHUB_TOKEN
  if (!token) return response.status(503).json({ erro: 'Envio indisponível agora.' })
  const version = /^Horizonte (\S+)/m.exec(text)?.[1] ?? ''
  if (request.body?.automatico === true) {
    const code = request.body.codigo
    if (!/^\d{3}$/.test(String(code)) || !/^[0-9A-Za-z.+-]{1,32}$/.test(version))
      return response.status(400).json({ erro: 'Diagnóstico inválido.' })
    const status = await automatic(token, text, version, code)
    return status === 502
      ? response.status(502).json({ erro: 'Não consegui registrar agora.' })
      : response.status(status).json({ ok: true })
  }
  const res = await github(token, '/issues', {
    method: 'POST',
    body: JSON.stringify({
      title: `Diagnóstico ${version}`.trim(),
      body: fence(text),
      labels: ['diagnostico']
    })
  })
  if (!res.ok) return response.status(502).json({ erro: 'Não consegui registrar agora.' })
  return response.status(201).json({ ok: true })
}
