import { io } from "socket.io-client";
// Importar nossas implementações personalizadas
import createPeer from "./webrtc-custom";
import createSocketStreamPeer from "./socket-stream";

// Verificar suporte a WebRTC
const hasWebRTCSupport = !!(
  typeof window !== "undefined" &&
  window.RTCPeerConnection &&
  window.RTCSessionDescription &&
  window.RTCIceCandidate &&
  navigator.mediaDevices &&
  navigator.mediaDevices.getUserMedia
);

// Forçar uso de WebRTC em navegadores modernos
const isModernBrowser = !!(
  navigator.userAgent.includes("Chrome") ||
  navigator.userAgent.includes("Firefox") ||
  navigator.userAgent.includes("Edge") ||
  navigator.userAgent.includes("Safari")
);

// Verificar se estamos em produção (Railway)
const isProduction =
  window.location.hostname.includes("railway.app") ||
  window.location.hostname.includes(".up.railway.app");

// Forçar o uso de Socket.IO Stream em produção para maior confiabilidade
const forceSocketStream = isProduction;

// Usar WebRTC apenas se o navegador for moderno E não estivermos forçando Socket.IO Stream
const useWebRTC = (hasWebRTCSupport || isModernBrowser) && !forceSocketStream;

// Escolher a implementação apropriada
const Peer = useWebRTC ? createPeer : createSocketStreamPeer;
console.log("Suporte a WebRTC detectado:", hasWebRTCSupport);
console.log("Navegador moderno detectado:", isModernBrowser);
console.log("Em ambiente de produção:", isProduction);
console.log("Forçando Socket.IO Stream:", forceSocketStream);
console.log(
  "Usando implementação:",
  useWebRTC ? "WebRTC personalizado" : "Socket.IO Stream"
);

// URL do servidor Socket.IO - usar o IP da máquina para acesso externo
// Para desenvolvimento local, use localhost
// Para acesso de outros dispositivos na mesma rede, use o IP da máquina
// Usar o mesmo protocolo que o navegador está usando (HTTP ou HTTPS)

// Em produção (Railway), o servidor Socket.IO está no mesmo host/porta que o frontend
// Em desenvolvimento, o servidor Socket.IO está na porta 3001

let SERVER_URL;
if (isProduction) {
  // Em produção, o servidor Socket.IO está no mesmo host/porta
  SERVER_URL = `${window.location.protocol}//${window.location.host}`;
} else {
  // Em desenvolvimento, o servidor Socket.IO está na porta 3001
  SERVER_URL = `${window.location.protocol}//${window.location.hostname}:3001`;
}

// Instância do Socket.IO
let socket = null;

// Conexão com o servidor Socket.IO
export const conectarServidor = () => {
  console.log("Conectando ao servidor...");
  console.log("URL do servidor:", SERVER_URL);
  return new Promise((resolve) => {
    // Configurar opções para aceitar certificados auto-assinados
    socket = io(SERVER_URL, {
      rejectUnauthorized: false, // Aceitar certificados auto-assinados
      secure: true,
      transports: ["websocket", "polling"],
      extraHeaders: {
        "Access-Control-Allow-Origin": "*",
      },
      withCredentials: false,
    });

    socket.on("connect", () => {
      console.log("Conectado ao servidor!", socket.id);
      resolve(true);
    });

    socket.on("connect_error", (error) => {
      console.error("Erro ao conectar ao servidor:", error);
      resolve(false);
    });
  });
};

// Criação de sala pelo professor
export const criarSala = (professorNome, salaIdExistente = null) => {
  console.log(`Professor ${professorNome} criando sala...`);
  return new Promise((resolve) => {
    // Usar o ID existente ou gerar um novo
    const salaId =
      salaIdExistente ||
      Math.random().toString(36).substring(2, 7).toUpperCase();
    console.log(`Usando ID de sala: ${salaId}`);

    // Enviar solicitação para criar sala
    socket.emit("criar-sala", { nome: professorNome, salaId });

    // Aguardar confirmação
    socket.once("sala-criada", ({ salaId }) => {
      console.log(`Sala ${salaId} criada com sucesso no servidor!`);
      resolve(salaId);
    });
  });
};

// Entrada em sala pelo aluno
export const entrarSala = (alunoNome, salaId) => {
  console.log(`Aluno ${alunoNome} entrando na sala ${salaId}...`);
  return new Promise((resolve, reject) => {
    // Enviar solicitação para entrar na sala
    socket.emit("entrar-sala", { nome: alunoNome, salaId });

    // Aguardar confirmação
    socket.once("entrou-sala", () => {
      console.log(`Aluno ${alunoNome} entrou na sala ${salaId}!`);
      resolve(true);
    });

    // Ou erro
    socket.once("erro", ({ mensagem }) => {
      console.error(`Erro ao entrar na sala: ${mensagem}`);
      reject(new Error(mensagem));
    });
  });
};

// Verificar suporte a WebRTC
export const verificarSuporteWebRTC = () => {
  // Adicionar log para debug detalhado
  console.log("Verificando suporte WebRTC:", {
    mediaDevices: navigator.mediaDevices,
    RTCPeerConnection: window.RTCPeerConnection,
    userAgent: navigator.userAgent,
    isChrome: navigator.userAgent.indexOf("Chrome") !== -1,
    isFirefox: navigator.userAgent.indexOf("Firefox") !== -1,
    isEdge: navigator.userAgent.indexOf("Edg") !== -1,
    Peer_WEBRTC_SUPPORT: Peer.WEBRTC_SUPPORT,
  });

  // Verificar se o navegador é Chrome, Firefox ou Edge
  const isChrome = navigator.userAgent.indexOf("Chrome") !== -1;
  const isFirefox = navigator.userAgent.indexOf("Firefox") !== -1;
  const isEdge = navigator.userAgent.indexOf("Edg") !== -1;

  // Forçar suporte para navegadores conhecidos
  if (isChrome || isFirefox || isEdge) {
    console.log("Navegador suportado detectado, forçando suporte WebRTC");
    return true;
  }

  // Verificar se o navegador suporta WebRTC usando detecção direta
  if (!navigator.mediaDevices || !window.RTCPeerConnection) {
    throw new Error(
      "Seu navegador não suporta WebRTC. Use Chrome, Firefox ou Edge recente."
    );
  }

  // Adicionar log para debug
  console.log("Suporte WebRTC detectado:", {
    mediaDevices: !!navigator.mediaDevices,
    RTCPeerConnection: !!window.RTCPeerConnection,
    Peer_WEBRTC_SUPPORT: Peer.WEBRTC_SUPPORT,
  });

  // Verificar se estamos em HTTPS ou localhost
  if (
    window.location.protocol !== "https:" &&
    window.location.hostname !== "localhost"
  ) {
    throw new Error(
      "O compartilhamento de tela requer uma conexão segura (HTTPS) ou localhost. " +
        "Sua conexão atual é HTTP, o que não é suportado pelos navegadores para WebRTC."
    );
  }

  // Verificar se getDisplayMedia está disponível
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    throw new Error(
      "Seu navegador não suporta compartilhamento de tela. " +
        "Use Chrome, Firefox ou Edge em suas versões mais recentes."
    );
  }

  return true;
};

// Inicialização de peer WebRTC
export const inicializarPeer = (
  isInitiator,
  stream = null,
  customConfig = {},
  salaId = null
) => {
  console.log(
    `Inicializando peer como ${isInitiator ? "iniciador" : "receptor"}...`
  );

  // Verificar suporte a WebRTC
  try {
    verificarSuporteWebRTC();
  } catch (error) {
    console.error("Erro de suporte WebRTC:", error);
    throw error;
  }

  // Configuração padrão
  const defaultConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478" },
    ],
  };

  // Mesclar configurações personalizadas com as padrões
  const config = {
    ...defaultConfig,
    ...customConfig,
  };

  console.log("Usando configuração de peer:", config);

  const peerConfig = {
    initiator: isInitiator,
    trickle: true,
    stream: stream,
    config: config,
    // Aumentar o timeout para estabelecer conexão
    sdpTransform: (sdp) => {
      console.log("Transformando SDP:", sdp.substring(0, 100) + "...");
      return sdp;
    },
  };

  try {
    console.log("Criando peer com configuração:", peerConfig);

    // Verificar se RTCPeerConnection está realmente disponível
    const rtcAvailable =
      typeof window !== "undefined" &&
      typeof window.RTCPeerConnection === "function" &&
      typeof window.RTCSessionDescription === "function" &&
      typeof window.RTCIceCandidate === "function";

    console.log("RTCPeerConnection realmente disponível:", rtcAvailable);

    // Usar Socket.IO Stream se RTCPeerConnection não estiver disponível
    if (!rtcAvailable) {
      console.log(
        "RTCPeerConnection não disponível, usando implementação baseada em Socket.IO"
      );
      peerConfig.socket = socket;
      peerConfig.salaId = salaId;
      peerConfig.destinatarioId = null; // Será definido automaticamente para o professor

      // Usar diretamente a implementação Socket.IO Stream
      const peer = createSocketStreamPeer(peerConfig);
      console.log("Peer Socket.IO Stream criado com sucesso");
      return peer;
    }

    // Tentar usar a implementação WebRTC
    try {
      console.log("Criando peer com a implementação WebRTC");
      const peer = createPeer(peerConfig);
      console.log("Peer WebRTC criado com sucesso");
      return peer;
    } catch (peerError) {
      console.error("Erro ao criar peer WebRTC:", peerError);
      console.log("Tentando implementação Socket.IO Stream como fallback");

      // Usar implementação Socket.IO Stream como fallback
      peerConfig.socket = socket;
      peerConfig.salaId = salaId;
      peerConfig.destinatarioId = null; // Será definido automaticamente para o professor

      const peer = createSocketStreamPeer(peerConfig);
      console.log("Peer Socket.IO Stream criado com sucesso como fallback");
      return peer;
    }
  } catch (error) {
    console.error("Erro ao criar peer:", error);
    throw error;
  }
};

// Envio de sinal WebRTC via Socket.IO
export const enviarSinal = (salaId, destinatarioId, sinal) => {
  console.log(
    `Enviando sinal para ${destinatarioId ? destinatarioId : "professor"}...`
  );
  socket.emit("sinal-webrtc", { salaId, destinatarioId, sinal });
};

// Configuração para receber sinais WebRTC
export const configurarReceptorSinais = (callback) => {
  socket.on("sinal-webrtc", ({ remetenteId, sinal }) => {
    console.log(`Sinal recebido de ${remetenteId}`);
    callback(remetenteId, sinal);
  });

  // Retorna função para remover o listener
  return () => socket.off("sinal-webrtc");
};

// Configuração para receber notificações de alunos conectados (para o professor)
export const configurarReceptorAlunos = (callback) => {
  socket.on("aluno-conectado", (aluno) => {
    console.log(`Aluno conectado: ${aluno.nome}`);
    callback("conectado", aluno);
  });

  socket.on("aluno-desconectado", (aluno) => {
    console.log(`Aluno desconectado: ${aluno.nome}`);
    callback("desconectado", aluno);
  });

  // Adicionar receptor para notificação de aluno compartilhando tela
  socket.on("aluno-compartilhando", (aluno) => {
    console.log(`Aluno ${aluno.alunoNome} iniciou compartilhamento de tela`);
    callback("compartilhando", { id: aluno.alunoId, nome: aluno.alunoNome });
  });

  // Retorna função para remover os listeners
  return () => {
    socket.off("aluno-conectado");
    socket.off("aluno-desconectado");
    socket.off("aluno-compartilhando");
  };
};

// Configuração para receber notificação de professor desconectado (para o aluno)
export const configurarReceptorProfessor = (callback) => {
  socket.on("professor-desconectado", () => {
    console.log("Professor desconectado");
    callback();
  });

  // Retorna função para remover o listener
  return () => socket.off("professor-desconectado");
};

// Envio de desenho do professor para o aluno
export const enviarDesenho = (salaId, alunoId, desenhoData) => {
  socket.emit("desenho", { salaId, alunoId, desenhoData });
};

// Configuração para receber desenhos (para o aluno)
export const configurarReceptorDesenhos = (callback) => {
  socket.on("desenho", (desenhoData) => {
    callback(desenhoData);
  });

  // Retorna função para remover o listener
  return () => socket.off("desenho");
};

// Envio de comando para limpar o canvas
export const limparCanvasRemoto = (salaId, alunoId) => {
  socket.emit("limpar-canvas", { salaId, alunoId });
};

// Configuração para receber comando de limpar canvas (para o aluno)
export const configurarReceptorLimparCanvas = (callback) => {
  socket.on("limpar-canvas", () => {
    callback();
  });

  // Retorna função para remover o listener
  return () => socket.off("limpar-canvas");
};

// Desconexão do servidor
export const desconectar = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    console.log("Desconectado do servidor");
  }
};
