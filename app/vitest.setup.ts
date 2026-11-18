// Os testes conferem os textos em português, seja qual for o idioma da máquina (a CI roda em inglês).
;(globalThis as { __hzLang?: string }).__hzLang = 'pt'
