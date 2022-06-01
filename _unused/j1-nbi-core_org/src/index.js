import '@babel/polyfill'
import './bqplot.css'

import j1-nbi from './j1-nbi'

// Define globally for use in browser.
if (typeof window !== 'undefined') {
  window.j1-nbi = j1-nbi
}

export default j1-nbi
