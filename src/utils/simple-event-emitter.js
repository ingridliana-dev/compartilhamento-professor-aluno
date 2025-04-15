// Implementação simples de EventEmitter
export default class SimpleEventEmitter {
  constructor() {
    this._events = {};
  }
  
  on(event, listener) {
    if (!this._events[event]) {
      this._events[event] = [];
    }
    this._events[event].push(listener);
    return this;
  }
  
  once(event, listener) {
    const onceWrapper = (...args) => {
      this.off(event, onceWrapper);
      listener.apply(this, args);
    };
    return this.on(event, onceWrapper);
  }
  
  off(event, listener) {
    if (!this._events[event]) return this;
    if (!listener) {
      delete this._events[event];
      return this;
    }
    this._events[event] = this._events[event].filter((l) => l !== listener);
    return this;
  }
  
  emit(event, ...args) {
    if (!this._events[event]) return false;
    
    // Criar uma cópia do array de listeners para evitar problemas se um listener modificar o array
    const listeners = [...this._events[event]];
    
    // Usar um loop for tradicional em vez de forEach para evitar problemas de recursividade
    for (let i = 0; i < listeners.length; i++) {
      try {
        listeners[i].apply(this, args);
      } catch (error) {
        console.error(`Erro ao executar listener para evento ${event}:`, error);
      }
    }
    
    return true;
  }
}
