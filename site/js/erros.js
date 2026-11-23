/* Página dos códigos de erro: o português fica no HTML; aqui a tabela troca para o inglês ou o espanhol, pelos dados
   que vêm na própria página (gerados do catálogo do app, app/src/shared/errors.ts). Mesma escolha de idioma do site. */
(function () {
  'use strict'
  var data = JSON.parse(document.getElementById('erros-dados').textContent)
  var query = (/[?&]lang=(pt|en|es)\b/.exec(location.search) || [])[1]
  var stored = null
  try {
    stored = localStorage.getItem('hz-lang')
  } catch (e) {
    /* sem armazenamento */
  }
  var first = String((navigator.languages && navigator.languages[0]) || navigator.language || '').toLowerCase()
  var lang = query || (data.ui[stored] ? stored : first.indexOf('pt') === 0 ? 'pt' : first.indexOf('es') === 0 ? 'es' : 'en')
  if (lang === 'pt') return
  var ui = data.ui[lang]
  document.documentElement.lang = lang
  document.title = ui.pageTitle
  document.querySelector('h1').textContent = ui.h1
  document.querySelector('.lede').textContent = ui.lede
  document.querySelector('.back').textContent = ui.back
  document.querySelectorAll('[data-area]').forEach(function (el) {
    el.textContent = ui.areas[el.getAttribute('data-area')]
  })
  document.querySelectorAll('th[data-col]').forEach(function (el) {
    el.textContent = ui.cols[el.getAttribute('data-col')]
  })
  Object.keys(data.codes).forEach(function (code) {
    var row = document.getElementById(code)
    if (!row) return
    row.querySelector('.what').textContent = data.codes[code][lang][0]
    row.querySelector('.fix').textContent = data.codes[code][lang][1]
  })
})()
