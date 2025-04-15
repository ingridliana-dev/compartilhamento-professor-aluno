// Polyfill para a variável global no navegador
if (typeof window !== 'undefined') {
  window.global = window;
}

export default {};
