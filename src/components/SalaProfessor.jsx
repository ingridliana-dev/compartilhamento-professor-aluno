import { useState, useEffect, useRef } from "react";
import "./SalaProfessor.css";
import * as comunicacao from "../utils/comunicacao";

const SalaProfessor = ({ nome, salaId, voltarParaInicio, atualizarSalaId }) => {
  const [conexoes, setConexoes] = useState([]);
  const [alunosConectados, setAlunosConectados] = useState([]);
  const [alunoSelecionado, setAlunoSelecionado] = useState(null);
  const [ferramentaAtiva, setFerramentaAtiva] = useState(null);
  const [corSelecionada, setCorSelecionada] = useState("#FF0000");
  const [espessuraLinha, setEspessuraLinha] = useState(3);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const desenhando = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lastImageRef = useRef(null);

  // Conectar ao servidor e configurar listeners
  useEffect(() => {
    const inicializar = async () => {
      try {
        console.log("Iniciando conexão com o servidor...");
        // Conectar ao servidor
        const conectado = await comunicacao.conectarServidor();
        if (!conectado) {
          console.error("Não foi possível conectar ao servidor");
          return;
        }

        console.log("Conectado ao servidor");
        // Criar sala usando o ID existente
        console.log("Criando sala no servidor com ID:", salaId);
        const novaSalaId = await comunicacao.criarSala(nome, salaId);
        console.log("Sala criada no servidor:", novaSalaId);

        // Verificar se o ID retornado pelo servidor é diferente do atual
        if (novaSalaId !== salaId) {
          console.log(`ID da sala mudou de ${salaId} para ${novaSalaId}`);
          // Atualizar o ID da sala no componente pai
          atualizarSalaId(novaSalaId);
        }

        // Configurar receptor de alunos
        console.log("Configurando receptor de alunos...");
        const limparReceptorAlunos = comunicacao.configurarReceptorAlunos(
          (evento, aluno) => {
            console.log(`Evento de aluno: ${evento}`, aluno);
            if (evento === "conectado") {
              console.log(`Aluno conectado: ${aluno.nome} (${aluno.id})`);
              setAlunosConectados((prev) => {
                // Verificar se o aluno já existe na lista
                if (prev.some((a) => a.id === aluno.id)) {
                  return prev;
                }
                return [...prev, aluno];
              });

              // Inicializar a conexão WebRTC para este aluno, mesmo que não esteja selecionado
              // Isso permite que o professor receba sinais do aluno antes de selecioná-lo
              console.log(
                `Inicializando conexão WebRTC para o aluno ${aluno.nome} (${aluno.id})`
              );
              inicializarConexaoAluno(aluno.id);
            } else if (evento === "desconectado") {
              console.log(`Aluno desconectado: ${aluno.nome} (${aluno.id})`);
              setAlunosConectados((prev) =>
                prev.filter((a) => a.id !== aluno.id)
              );
            } else if (evento === "compartilhando") {
              console.log(
                `Aluno compartilhando tela: ${aluno.nome} (${aluno.id})`
              );
              // Selecionar automaticamente o aluno que está compartilhando a tela
              if (!alunoSelecionado || alunoSelecionado.id !== aluno.id) {
                // Adicionar notificação visual
                alert(
                  `O aluno ${aluno.nome} iniciou o compartilhamento de tela. Selecionando automaticamente.`
                );
                selecionarAluno(aluno.id);
              }
            }

            // Se o aluno desconectado for o selecionado, limpar a seleção
            if (
              evento === "desconectado" &&
              alunoSelecionado?.id === aluno.id
            ) {
              setAlunoSelecionado(null);
            }
          }
        );

        return () => {
          limparReceptorAlunos();
          comunicacao.desconectar();
        };
      } catch (error) {
        console.error("Erro ao inicializar:", error);
      }
    };

    inicializar();
  }, [nome, salaId, alunoSelecionado]);

  // Inicialização do canvas
  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;

      const context = canvas.getContext("2d");
      context.lineCap = "round";
      context.strokeStyle = corSelecionada;
      context.lineWidth = espessuraLinha;
      contextRef.current = context;

      // Ajustar o canvas para corresponder exatamente ao tamanho do vídeo
      const resizeObserver = new ResizeObserver(() => {
        if (videoRef.current && canvasRef.current) {
          const videoRect = videoRef.current.getBoundingClientRect();
          canvas.width = videoRect.width;
          canvas.height = videoRect.height;

          // Reconfigurar o contexto após redimensionar
          context.lineCap = "round";
          context.strokeStyle = corSelecionada;
          context.lineWidth = espessuraLinha;
        }
      });

      if (videoRef.current) {
        resizeObserver.observe(videoRef.current);
      }

      return () => {
        if (videoRef.current) {
          resizeObserver.unobserve(videoRef.current);
        }
      };
    }
  }, [alunoSelecionado, corSelecionada, espessuraLinha]);

  // Atualiza as configurações do contexto quando mudam
  useEffect(() => {
    if (contextRef.current) {
      contextRef.current.strokeStyle = corSelecionada;
      contextRef.current.lineWidth = espessuraLinha;
    }
  }, [corSelecionada, espessuraLinha]);

  // Funções de desenho
  const iniciarDesenho = (e) => {
    if (!ferramentaAtiva || !contextRef.current) return;

    const { offsetX, offsetY } = obterCoordenadas(e);
    startXRef.current = offsetX;
    startYRef.current = offsetY;

    // Salvar o estado atual do canvas para ferramentas que precisam redesenhar
    if (ferramentaAtiva === "linha" || ferramentaAtiva === "retangulo") {
      const canvas = canvasRef.current;
      lastImageRef.current = contextRef.current.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );
    }

    if (ferramentaAtiva === "lapis") {
      contextRef.current.beginPath();
      contextRef.current.moveTo(offsetX, offsetY);

      // Enviar dados do início do desenho para o aluno
      if (alunoSelecionado) {
        const desenhoData = {
          tipo: "lapis",
          cor: corSelecionada,
          espessura: espessuraLinha,
          pontos: {
            x: offsetX,
            y: offsetY,
          },
          continuar: false,
        };
        comunicacao.enviarDesenho(salaId, alunoSelecionado.id, desenhoData);
      }
    }

    desenhando.current = true;
  };

  const desenhar = (e) => {
    if (!desenhando.current || !ferramentaAtiva || !contextRef.current) return;

    const { offsetX, offsetY } = obterCoordenadas(e);
    const ctx = contextRef.current;
    const canvas = canvasRef.current;

    if (ferramentaAtiva === "lapis") {
      ctx.lineTo(offsetX, offsetY);
      ctx.stroke();

      // Enviar dados do desenho para o aluno
      if (alunoSelecionado) {
        const desenhoData = {
          tipo: "lapis",
          cor: corSelecionada,
          espessura: espessuraLinha,
          pontos: {
            x: offsetX,
            y: offsetY,
          },
          continuar: true,
        };
        comunicacao.enviarDesenho(salaId, alunoSelecionado.id, desenhoData);
      }
    } else if (ferramentaAtiva === "linha") {
      // Restaurar o canvas para o estado antes de começar a desenhar
      if (lastImageRef.current) {
        ctx.putImageData(lastImageRef.current, 0, 0);
      }

      // Desenhar a linha
      ctx.beginPath();
      ctx.moveTo(startXRef.current, startYRef.current);
      ctx.lineTo(offsetX, offsetY);
      ctx.stroke();

      // Armazenar as coordenadas finais para enviar no finalizarDesenho
      window.lastX = offsetX;
      window.lastY = offsetY;
    } else if (ferramentaAtiva === "retangulo") {
      // Restaurar o canvas para o estado antes de começar a desenhar
      if (lastImageRef.current) {
        ctx.putImageData(lastImageRef.current, 0, 0);
      }

      // Calcular largura e altura
      const width = offsetX - startXRef.current;
      const height = offsetY - startYRef.current;

      // Desenhar o retângulo
      ctx.beginPath();
      ctx.rect(startXRef.current, startYRef.current, width, height);
      ctx.stroke();

      // Armazenar as dimensões para enviar no finalizarDesenho
      window.lastWidth = width;
      window.lastHeight = height;
    }
  };

  const finalizarDesenho = () => {
    if (!contextRef.current || !desenhando.current) return;

    if (ferramentaAtiva === "lapis") {
      contextRef.current.closePath();

      // Enviar sinal de finalização do desenho
      if (alunoSelecionado) {
        const desenhoData = {
          tipo: "lapis",
          finalizar: true,
        };
        comunicacao.enviarDesenho(salaId, alunoSelecionado.id, desenhoData);
      }
    } else if (
      (ferramentaAtiva === "linha" || ferramentaAtiva === "retangulo") &&
      alunoSelecionado
    ) {
      // Para linha e retângulo, enviar o desenho completo ao finalizar
      const desenhoData = {
        tipo: ferramentaAtiva,
        cor: corSelecionada,
        espessura: espessuraLinha,
        pontos: {
          x1: startXRef.current,
          y1: startYRef.current,
          x2:
            ferramentaAtiva === "linha" ? lastX : startXRef.current + lastWidth,
          y2:
            ferramentaAtiva === "linha"
              ? lastY
              : startYRef.current + lastHeight,
        },
      };

      if (ferramentaAtiva === "retangulo") {
        desenhoData.width = lastWidth;
        desenhoData.height = lastHeight;
      }

      comunicacao.enviarDesenho(salaId, alunoSelecionado.id, desenhoData);
    }

    desenhando.current = false;
    lastImageRef.current = null;
  };

  const obterCoordenadas = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    // Para eventos de mouse
    if (e.nativeEvent.offsetX !== undefined) {
      // Calcular as coordenadas corretas com base na escala do canvas
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      return {
        offsetX: e.nativeEvent.offsetX * scaleX,
        offsetY: e.nativeEvent.offsetY * scaleY,
      };
    }

    // Para eventos de toque
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      offsetX: (e.touches[0].clientX - rect.left) * scaleX,
      offsetY: (e.touches[0].clientY - rect.top) * scaleY,
    };
  };

  const limparCanvas = () => {
    if (contextRef.current && canvasRef.current) {
      contextRef.current.clearRect(
        0,
        0,
        canvasRef.current.width,
        canvasRef.current.height
      );

      // Enviar comando de limpeza para o aluno
      if (alunoSelecionado) {
        comunicacao.limparCanvasRemoto(salaId, alunoSelecionado.id);
      }
    }
  };

  // Referências para as conexões WebRTC
  const peerConexoes = useRef({});
  const receptoresSinais = useRef({});

  const selecionarAluno = (alunoId) => {
    console.log(`Selecionando aluno: ${alunoId}`);
    const aluno = alunosConectados.find((a) => a.id === alunoId);
    if (!aluno) {
      console.error(`Aluno com ID ${alunoId} não encontrado`);
      return;
    }

    // Se já tiver um aluno selecionado, limpar a conexão anterior
    if (alunoSelecionado && alunoSelecionado.id !== alunoId) {
      // Limpar conexão anterior
      if (peerConexoes.current[alunoSelecionado.id]) {
        try {
          peerConexoes.current[alunoSelecionado.id].destroy();
        } catch (err) {
          console.error("Erro ao destruir peer anterior:", err);
        }
        delete peerConexoes.current[alunoSelecionado.id];
      }

      // Limpar receptor de sinais anterior
      if (receptoresSinais.current[alunoSelecionado.id]) {
        receptoresSinais.current[alunoSelecionado.id]();
        delete receptoresSinais.current[alunoSelecionado.id];
      }

      // Limpar vídeo
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }

    setAlunoSelecionado(aluno);
    console.log(`Aluno selecionado: ${aluno.nome}`);

    // Configurar receptor de sinais WebRTC se ainda não existir
    if (!peerConexoes.current[alunoId]) {
      console.log("Inicializando peer WebRTC para receber stream do aluno");

      // Configurar opções mais robustas para o peer
      const peer = comunicacao.inicializarPeer(
        false,
        null,
        {
          // Adicionar mais servidores STUN/TURN para melhorar a conexão
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun3.l.google.com:19302" },
            { urls: "stun:stun4.l.google.com:19302" },
            { urls: "stun:stun.ekiga.net" },
            { urls: "stun:stun.ideasip.com" },
            { urls: "stun:stun.schlund.de" },
            { urls: "stun:stun.stunprotocol.org:3478" },
            { urls: "stun:stun.voiparound.com" },
            { urls: "stun:stun.voipbuster.com" },
            { urls: "stun:stun.voipstunt.com" },
            { urls: "stun:stun.voxgratia.org" },
          ],
          sdpSemantics: "unified-plan",
        },
        salaId
      );

      // Configurar eventos do peer com mais logs
      peer.on("signal", (sinal) => {
        console.log(
          "Sinal gerado, enviando para o aluno...",
          sinal.type || "candidato"
        );
        // Enviar sinal para o aluno via servidor
        comunicacao.enviarSinal(salaId, alunoId, sinal);
      });

      peer.on("stream", (stream) => {
        console.log("Stream recebido do aluno!");
        // Exibir o stream do aluno no vídeo
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });

      peer.on("connect", () => {
        console.log("Conexão WebRTC estabelecida com o aluno!");

        // Enviar um ping para manter a conexão ativa
        const pingInterval = setInterval(() => {
          if (peer.connected) {
            try {
              peer.send(
                JSON.stringify({ type: "ping", timestamp: Date.now() })
              );
              console.log("Ping enviado para manter conexão com aluno");
            } catch (err) {
              console.error("Erro ao enviar ping para aluno:", err);
            }
          } else {
            clearInterval(pingInterval);
          }
        }, 5000); // Enviar ping a cada 5 segundos

        // Limpar o intervalo quando o peer for destruído
        peer.on("close", () => clearInterval(pingInterval));
      });

      // Adicionar evento para dados recebidos
      peer.on("data", (data) => {
        try {
          const message = JSON.parse(data);
          console.log("Mensagem recebida do aluno:", message);

          // Responder a pings do aluno
          if (message.type === "ping") {
            peer.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          }
        } catch (err) {
          console.log("Dados recebidos (não JSON):", data.toString());
        }
      });

      peer.on("error", (err) => {
        console.error("Erro na conexão WebRTC:", err);
      });

      peer.on("close", () => {
        console.log("Conexão WebRTC fechada");
        // Limpar recursos se o peer for fechado
        if (peerConexoes.current[alunoId] === peer) {
          delete peerConexoes.current[alunoId];

          if (receptoresSinais.current[alunoId]) {
            receptoresSinais.current[alunoId]();
            delete receptoresSinais.current[alunoId];
          }
        }
      });

      // Armazenar a conexão
      peerConexoes.current[alunoId] = peer;

      // Configurar receptor de sinais para este aluno
      console.log("Configurando receptor de sinais para o aluno");
      const limparReceptor = comunicacao.configurarReceptorSinais(
        (remetenteId, sinal) => {
          console.log(`Recebendo sinal de ${remetenteId}`);

          // Processar sinais de qualquer aluno da sala, não apenas do selecionado
          // Isso é importante para estabelecer a conexão inicial
          if (peerConexoes.current[remetenteId]) {
            try {
              console.log(`Processando sinal do aluno ${remetenteId}`);
              peerConexoes.current[remetenteId].signal(sinal);
            } catch (err) {
              console.error("Erro ao processar sinal:", err);
            }
          } else if (remetenteId === alunoId && peerConexoes.current[alunoId]) {
            try {
              console.log("Processando sinal do aluno selecionado");
              peerConexoes.current[alunoId].signal(sinal);
            } catch (err) {
              console.error("Erro ao processar sinal:", err);
            }
          } else {
            console.log(
              `Sinal recebido de ${remetenteId}, mas não há conexão estabelecida`
            );
          }
        }
      );

      // Armazenar o limpador do receptor
      receptoresSinais.current[alunoId] = limparReceptor;
    }
  };

  return (
    <div className="sala-professor">
      <div className="sala-header">
        <div className="sala-info">
          <div className="sala-id">Sala: {salaId}</div>
          <div className="sala-nome">Professor: {nome}</div>
        </div>
        <button onClick={voltarParaInicio} className="botao-voltar">
          Sair da Sala
        </button>
      </div>

      <div className="sala-conteudo">
        <div className="lista-alunos">
          <h3>Alunos Conectados</h3>
          {alunosConectados.length === 0 ? (
            <p className="sem-alunos">Aguardando alunos se conectarem...</p>
          ) : (
            <ul>
              {alunosConectados.map((aluno) => (
                <li
                  key={aluno.id}
                  className={
                    alunoSelecionado?.id === aluno.id ? "selecionado" : ""
                  }
                  onClick={() => selecionarAluno(aluno.id)}
                >
                  {aluno.nome}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="area-visualizacao">
          {!alunoSelecionado ? (
            <div className="sem-aluno-selecionado">
              <p>Selecione um aluno para visualizar a tela</p>
            </div>
          ) : (
            <>
              <div className="tela-compartilhada">
                <div className="video-container">
                  <video ref={videoRef} autoPlay muted />
                </div>
                <canvas
                  ref={canvasRef}
                  className={`canvas-overlay ${ferramentaAtiva ? "ativo" : ""}`}
                  onMouseDown={iniciarDesenho}
                  onMouseMove={desenhar}
                  onMouseUp={finalizarDesenho}
                  onMouseLeave={finalizarDesenho}
                  onTouchStart={iniciarDesenho}
                  onTouchMove={desenhar}
                  onTouchEnd={finalizarDesenho}
                />
              </div>

              <div className="ferramentas">
                <button
                  className={`ferramenta ${
                    ferramentaAtiva === "lapis" ? "ativo" : ""
                  }`}
                  onClick={() =>
                    setFerramentaAtiva(
                      ferramentaAtiva === "lapis" ? null : "lapis"
                    )
                  }
                >
                  Lápis
                </button>

                <button
                  className={`ferramenta ${
                    ferramentaAtiva === "linha" ? "ativo" : ""
                  }`}
                  onClick={() =>
                    setFerramentaAtiva(
                      ferramentaAtiva === "linha" ? null : "linha"
                    )
                  }
                >
                  Linha
                </button>

                <button
                  className={`ferramenta ${
                    ferramentaAtiva === "retangulo" ? "ativo" : ""
                  }`}
                  onClick={() =>
                    setFerramentaAtiva(
                      ferramentaAtiva === "retangulo" ? null : "retangulo"
                    )
                  }
                >
                  Retângulo
                </button>

                <div className="separador"></div>

                <input
                  type="color"
                  value={corSelecionada}
                  onChange={(e) => setCorSelecionada(e.target.value)}
                  className="cor-picker"
                />

                <input
                  type="range"
                  min="1"
                  max="10"
                  value={espessuraLinha}
                  onChange={(e) => setEspessuraLinha(parseInt(e.target.value))}
                  className="espessura-slider"
                />

                <button onClick={limparCanvas} className="ferramenta limpar">
                  Limpar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalaProfessor;
