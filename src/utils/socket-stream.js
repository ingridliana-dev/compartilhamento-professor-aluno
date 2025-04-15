// Implementação alternativa para compartilhamento de tela usando Socket.IO
// Usada quando WebRTC não está disponível ou não funciona corretamente

import EventEmitter from './simple-event-emitter';

// Tamanho máximo de cada chunk de dados (em bytes)
const MAX_CHUNK_SIZE = 64 * 1024; // 64KB

class SocketStreamPeer extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.socket = options.socket;
    this.salaId = options.salaId;
    this.destinatarioId = options.destinatarioId;
    this.stream = options.stream;
    this.initiator = options.initiator || false;
    this.connected = false;
    this.destroyed = false;
    this._videoTrack = null;
    this._canvas = document.createElement('canvas');
    this._context = this._canvas.getContext('2d');
    this._videoElement = document.createElement('video');
    this._frameInterval = null;
    this._frameRate = 5; // Frames por segundo
    
    console.log('SocketStreamPeer criado com configurações:', {
      initiator: this.initiator,
      hasStream: !!this.stream,
      salaId: this.salaId,
      destinatarioId: this.destinatarioId
    });
    
    this._init();
  }
  
  _init() {
    try {
      console.log('Inicializando SocketStreamPeer...');
      
      // Configurar receptor de sinais
      this.socket.on('sinal-webrtc', ({ remetenteId, sinal }) => {
        console.log(`Sinal recebido de ${remetenteId}`);
        
        if (sinal.type === 'socket-stream-connect') {
          console.log('Recebido pedido de conexão');
          this.destinatarioId = remetenteId;
          
          // Responder ao pedido de conexão
          this.socket.emit('sinal-webrtc', {
            salaId: this.salaId,
            destinatarioId: remetenteId,
            sinal: {
              type: 'socket-stream-connect-ack'
            }
          });
          
          if (!this.connected) {
            this.connected = true;
            this.emit('connect');
          }
        } else if (sinal.type === 'socket-stream-connect-ack') {
          console.log('Conexão confirmada');
          
          if (!this.connected) {
            this.connected = true;
            this.emit('connect');
            
            // Se temos um stream, começar a enviar frames
            if (this.stream && this.initiator) {
              this._startSendingFrames();
            }
          }
        } else if (sinal.type === 'socket-stream-frame') {
          // Recebemos um frame de vídeo
          this._handleVideoFrame(sinal.frameData);
        } else if (sinal.type === 'socket-stream-data') {
          // Recebemos dados
          this.emit('data', sinal.data);
        }
      });
      
      // Se for o iniciador, enviar pedido de conexão
      if (this.initiator) {
        console.log('Enviando pedido de conexão como iniciador');
        this.socket.emit('sinal-webrtc', {
          salaId: this.salaId,
          destinatarioId: this.destinatarioId,
          sinal: {
            type: 'socket-stream-connect'
          }
        });
      }
      
    } catch (error) {
      console.error('Erro ao inicializar SocketStreamPeer:', error);
      this.emit('error', error);
    }
  }
  
  _startSendingFrames() {
    if (!this.stream) return;
    
    // Configurar o elemento de vídeo
    this._videoElement.srcObject = this.stream;
    this._videoElement.muted = true;
    this._videoElement.play().catch(err => console.error('Erro ao reproduzir vídeo:', err));
    
    // Configurar o canvas para capturar frames
    this._videoElement.addEventListener('loadedmetadata', () => {
      this._canvas.width = this._videoElement.videoWidth;
      this._canvas.height = this._videoElement.videoHeight;
      
      console.log(`Configurado canvas com dimensões ${this._canvas.width}x${this._canvas.height}`);
      
      // Iniciar o envio de frames
      this._frameInterval = setInterval(() => {
        this._captureAndSendFrame();
      }, 1000 / this._frameRate);
    });
  }
  
  _captureAndSendFrame() {
    if (!this.connected || this.destroyed) {
      if (this._frameInterval) {
        clearInterval(this._frameInterval);
        this._frameInterval = null;
      }
      return;
    }
    
    try {
      // Desenhar o frame atual no canvas
      this._context.drawImage(
        this._videoElement, 
        0, 0, 
        this._canvas.width, 
        this._canvas.height
      );
      
      // Converter o canvas para uma imagem JPEG com qualidade reduzida
      const frameData = this._canvas.toDataURL('image/jpeg', 0.5);
      
      // Enviar o frame para o destinatário
      this.socket.emit('sinal-webrtc', {
        salaId: this.salaId,
        destinatarioId: this.destinatarioId,
        sinal: {
          type: 'socket-stream-frame',
          frameData
        }
      });
    } catch (error) {
      console.error('Erro ao capturar e enviar frame:', error);
    }
  }
  
  _handleVideoFrame(frameData) {
    // Criar um stream simulado se ainda não existe
    if (!this._videoTrack) {
      // Criar uma imagem para carregar o frame
      const img = new Image();
      img.onload = () => {
        // Configurar o canvas com as dimensões da imagem
        this._canvas.width = img.width;
        this._canvas.height = img.height;
        
        // Desenhar a imagem no canvas
        this._context.drawImage(img, 0, 0);
        
        // Criar um stream a partir do canvas
        const stream = this._canvas.captureStream(this._frameRate);
        this._videoTrack = stream.getVideoTracks()[0];
        
        // Emitir o evento de stream
        this.emit('stream', stream);
      };
      img.src = frameData;
    } else {
      // Atualizar o frame no canvas
      const img = new Image();
      img.onload = () => {
        this._context.drawImage(img, 0, 0);
      };
      img.src = frameData;
    }
  }
  
  // Método para enviar dados
  send(data) {
    if (!this.connected || this.destroyed) {
      throw new Error('Conexão não está estabelecida');
    }
    
    // Converter para string se não for
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    
    // Enviar os dados via Socket.IO
    this.socket.emit('sinal-webrtc', {
      salaId: this.salaId,
      destinatarioId: this.destinatarioId,
      sinal: {
        type: 'socket-stream-data',
        data: dataStr
      }
    });
  }
  
  // Método para processar sinais (compatibilidade com a API do simple-peer)
  signal(data) {
    // Não precisamos fazer nada aqui, pois já estamos tratando os sinais no _init
    console.log('Método signal chamado, mas não é necessário para SocketStreamPeer');
  }
  
  // Método para destruir a conexão
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    
    console.log('Destruindo SocketStreamPeer');
    
    // Parar de enviar frames
    if (this._frameInterval) {
      clearInterval(this._frameInterval);
      this._frameInterval = null;
    }
    
    // Limpar recursos
    if (this._videoElement) {
      this._videoElement.pause();
      this._videoElement.srcObject = null;
    }
    
    // Emitir evento de fechamento
    setTimeout(() => {
      try {
        this.emit('close');
      } catch (err) {
        console.error('Erro ao emitir evento close:', err);
      }
    }, 0);
  }
}

// Exportar a classe com a mesma interface que simple-peer
export default function createSocketStreamPeer(options) {
  return new SocketStreamPeer(options);
}

// Adicionar propriedade estática para verificar suporte
createSocketStreamPeer.SOCKET_STREAM_SUPPORT = true;
