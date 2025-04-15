// Implementação personalizada de WebRTC para substituir simple-peer

// Implementação simples de EventEmitter
class SimpleEventEmitter {
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

class CustomPeer extends SimpleEventEmitter {
  constructor(options = {}) {
    super();

    this.initiator = options.initiator || false;
    this.stream = options.stream || null;
    this.config = options.config || {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    };
    this.sdpTransform = options.sdpTransform || ((sdp) => sdp);
    this.connected = false;
    this._pc = null;
    this._dataChannel = null;
    this._remoteCandidates = [];

    console.log("CustomPeer criado com configurações:", {
      initiator: this.initiator,
      hasStream: !!this.stream,
      config: this.config,
    });

    this._init();
  }

  _init() {
    try {
      console.log("Inicializando RTCPeerConnection...");
      console.log(
        "RTCPeerConnection disponível:",
        typeof window.RTCPeerConnection
      );

      // Verificar se RTCPeerConnection está disponível
      if (typeof window.RTCPeerConnection !== "function") {
        throw new Error(
          "RTCPeerConnection não está disponível neste navegador"
        );
      }

      this._pc = new window.RTCPeerConnection(this.config);

      // Adicionar stream local se disponível
      if (this.stream) {
        console.log("Adicionando stream local...");
        this.stream.getTracks().forEach((track) => {
          this._pc.addTrack(track, this.stream);
        });
      }

      // Configurar canal de dados
      if (this.initiator) {
        console.log("Criando canal de dados como iniciador...");
        this._dataChannel = this._pc.createDataChannel("data");
        this._setupDataChannel();
      } else {
        console.log("Configurando para receber canal de dados...");
        this._pc.ondatachannel = (event) => {
          console.log("Canal de dados recebido");
          this._dataChannel = event.channel;
          this._setupDataChannel();
        };
      }

      // Configurar eventos de ICE
      this._pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(
            "ICE candidate gerado:",
            event.candidate.candidate.substring(0, 50) + "..."
          );
          this.emit("signal", {
            type: "candidate",
            candidate: event.candidate,
          });
        }
      };

      this._pc.oniceconnectionstatechange = () => {
        console.log("Estado da conexão ICE:", this._pc.iceConnectionState);
        if (
          this._pc.iceConnectionState === "connected" ||
          this._pc.iceConnectionState === "completed"
        ) {
          this._connected();
        } else if (
          this._pc.iceConnectionState === "failed" ||
          this._pc.iceConnectionState === "disconnected" ||
          this._pc.iceConnectionState === "closed"
        ) {
          this.emit("error", new Error("Conexão ICE falhou ou foi fechada"));
        }
      };

      // Configurar evento para stream remoto
      this._pc.ontrack = (event) => {
        console.log("Stream remoto recebido");
        this.emit("stream", event.streams[0]);
      };

      // Se for o iniciador, criar oferta
      if (this.initiator) {
        console.log("Criando oferta como iniciador...");
        this._createOffer();
      }
    } catch (error) {
      console.error("Erro ao inicializar CustomPeer:", error);
      this.emit("error", error);
    }
  }

  _setupDataChannel() {
    if (!this._dataChannel) return;

    this._dataChannel.onopen = () => {
      console.log("Canal de dados aberto");
      this._connected();
    };

    this._dataChannel.onclose = () => {
      console.log("Canal de dados fechado");
      this._cleanup();
    };

    this._dataChannel.onerror = (err) => {
      console.error("Erro no canal de dados:", err);
      this.emit("error", err);
    };

    this._dataChannel.onmessage = (event) => {
      console.log("Mensagem recebida:", typeof event.data);
      this.emit("data", event.data);
    };
  }

  _connected() {
    if (this.connected) return;
    this.connected = true;
    console.log("Conexão estabelecida!");
    this.emit("connect");
  }

  async _createOffer() {
    try {
      const offer = await this._pc.createOffer();
      const transformedOffer = { ...offer, sdp: this.sdpTransform(offer.sdp) };
      await this._pc.setLocalDescription(transformedOffer);
      console.log("Oferta criada e definida como descrição local");

      this.emit("signal", {
        type: "offer",
        sdp: this._pc.localDescription,
      });
    } catch (error) {
      console.error("Erro ao criar oferta:", error);
      this.emit("error", error);
    }
  }

  async _createAnswer() {
    try {
      const answer = await this._pc.createAnswer();
      const transformedAnswer = {
        ...answer,
        sdp: this.sdpTransform(answer.sdp),
      };
      await this._pc.setLocalDescription(transformedAnswer);
      console.log("Resposta criada e definida como descrição local");

      this.emit("signal", {
        type: "answer",
        sdp: this._pc.localDescription,
      });
    } catch (error) {
      console.error("Erro ao criar resposta:", error);
      this.emit("error", error);
    }
  }

  async signal(data) {
    try {
      if (!this._pc) {
        throw new Error("Conexão não inicializada");
      }

      if (data.type === "offer") {
        console.log("Recebida oferta, definindo descrição remota...");
        await this._pc.setRemoteDescription(
          new window.RTCSessionDescription(data.sdp)
        );
        console.log("Criando resposta...");
        await this._createAnswer();

        // Adicionar candidatos ICE armazenados
        this._addStoredCandidates();
      } else if (data.type === "answer") {
        console.log("Recebida resposta, definindo descrição remota...");
        await this._pc.setRemoteDescription(
          new window.RTCSessionDescription(data.sdp)
        );

        // Adicionar candidatos ICE armazenados
        this._addStoredCandidates();
      } else if (data.type === "candidate") {
        const candidate = new window.RTCIceCandidate(data.candidate);

        if (this._pc.remoteDescription) {
          console.log("Adicionando candidato ICE...");
          await this._pc.addIceCandidate(candidate);
        } else {
          console.log("Armazenando candidato ICE para adicionar depois...");
          this._remoteCandidates.push(candidate);
        }
      }
    } catch (error) {
      console.error("Erro ao processar sinal:", error);
      this.emit("error", error);
    }
  }

  async _addStoredCandidates() {
    if (this._remoteCandidates.length > 0) {
      console.log(
        `Adicionando ${this._remoteCandidates.length} candidatos ICE armazenados...`
      );

      for (const candidate of this._remoteCandidates) {
        try {
          await this._pc.addIceCandidate(candidate);
        } catch (error) {
          console.error("Erro ao adicionar candidato ICE armazenado:", error);
        }
      }

      this._remoteCandidates = [];
    }
  }

  send(data) {
    if (!this._dataChannel || this._dataChannel.readyState !== "open") {
      throw new Error("Canal de dados não está aberto");
    }

    this._dataChannel.send(data);
  }

  destroy() {
    this._cleanup();
  }

  _cleanup() {
    // Evitar chamadas múltiplas
    if (!this._pc && !this._dataChannel) {
      return;
    }

    if (this._dataChannel) {
      try {
        this._dataChannel.close();
      } catch (err) {
        console.error("Erro ao fechar canal de dados:", err);
      }
      this._dataChannel = null;
    }

    if (this._pc) {
      try {
        this._pc.close();
      } catch (err) {
        console.error("Erro ao fechar conexão peer:", err);
      }
      this._pc = null;
    }

    this.connected = false;

    // Usar setTimeout para evitar problemas de recursividade
    setTimeout(() => {
      try {
        this.emit("close");
      } catch (err) {
        console.error("Erro ao emitir evento close:", err);
      }
    }, 0);
  }
}

// Verificar suporte a WebRTC
const WEBRTC_SUPPORT = !!(
  typeof window !== "undefined" &&
  window.RTCPeerConnection &&
  window.RTCSessionDescription &&
  window.RTCIceCandidate &&
  navigator.mediaDevices &&
  navigator.mediaDevices.getUserMedia
);

console.log("Suporte a WebRTC detectado:", WEBRTC_SUPPORT);

// Exportar a classe CustomPeer com a mesma interface que simple-peer
export default function createPeer(options) {
  return new CustomPeer(options);
}

// Adicionar propriedade estática para verificar suporte
createPeer.WEBRTC_SUPPORT = WEBRTC_SUPPORT;
