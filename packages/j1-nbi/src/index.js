import j1-nbi from 'j1-nbi-core'

const interact = new j1-nbi({
  baseUrl: 'https://mybinder.org',
  spec: 'Calebs97/riemann_book/master',
})
window.interact = interact

interact.prepare()
