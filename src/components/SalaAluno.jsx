import { useState, useEffect, useRef } from "react";
import "./SalaAluno.css";
import * as comunicacao from "../utils/comunicacao";

// Polyfill para getDisplayMedia em navegadores mais antigos
if (typeof navigator !== "undefined" && typeof window !== "undefined") {
  // Verificar se estamos em um contexto seguro (HTTPS ou localhost)
  const isSecureContext = window.isSecureContext;
  console.log("Executando em contexto seguro:", isSecureContext);

  // Verificar se é Chrome
  const isChrome = navigator.userAgent.indexOf("Chrome") !== -1;
  console.log("Detectado como Chrome:", isChrome);

  // Adicionar polyfill apenas se estiver em um contexto seguro
  if (isSecureContext) {
    if (navigator.mediaDevices && !navigator.mediaDevices.getDisplayMedia) {
      console.log("Adicionando polyfill para getDisplayMedia");

      // Tentar usar a versão experimental do Chrome
      if (navigator.getDisplayMedia) {
        console.log("Usando navigator.getDisplayMedia como polyfill");
        navigator.mediaDevices.getDisplayMedia = function (constraints) {
          return navigator.getDisplayMedia(constraints);
        };
      }
      // Solução específica para Chrome
      else if (isChrome && navigator.mediaDevices.getUserMedia) {
        console.log("Usando solução específica para Chrome");
        // No Chrome, podemos tentar usar a API de captura de tela
        navigator.mediaDevices.getDisplayMedia = function (constraints) {
          // Modificar as constraints para tentar capturar a tela
          const screenConstraints = {
            video: {
              mandatory: {
                chromeMediaSource: "desktop",
                maxWidth: 4096,
                maxHeight: 2160,
              },
            },
            audio: constraints.audio || false,
          };

          console.log(
            "Tentando getUserMedia com constraints para captura de tela"
          );
          return navigator.mediaDevices.getUserMedia(screenConstraints);
        };
      }
    }
  } else {
    console.warn(
      "Não está em um contexto seguro, compartilhamento de tela pode não funcionar"
    );
  }
}

const SalaAluno = ({ nome, salaId, voltarParaInicio }) => {
  const [compartilhando, setCompartilhando] = useState(false);
  const [professorConectado, setProfessorConectado] = useState(false);
  const [mensagem, setMensagem] = useState(
    "Aguardando conexão do professor..."
  );

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const contextRef = useRef(null);

  // Conectar ao servidor e configurar listeners
  useEffect(() => {
    const inicializar = async () => {
      try {
        console.log("Iniciando conexão com o servidor...");
        // Conectar ao servidor
        const conectado = await comunicacao.conectarServidor();
        if (!conectado) {
          console.error("Não foi possível conectar ao servidor");
          setMensagem("Erro ao conectar ao servidor. Tente novamente.");
          return;
        }

        console.log("Conectado ao servidor. Tentando entrar na sala:", salaId);
        // Entrar na sala
        try {
          await comunicacao.entrarSala(nome, salaId);
          console.log("Entrou na sala com sucesso!");
          setProfessorConectado(true);
          setMensagem('Conectado! Clique em "Compartilhar Tela" para iniciar.');
        } catch (salaError) {
          console.error("Erro ao entrar na sala:", salaError);
          setMensagem(`Erro: ${salaError.message}`);
          return;
        }

        // Configurar receptor para desenhos do professor
        const limparReceptorDesenhos = comunicacao.configurarReceptorDesenhos(
          (desenhoData) => {
            console.log("Recebendo desenho do professor:", desenhoData);
            if (contextRef.current) {
              const ctx = contextRef.current;

              if (desenhoData.tipo === "lapis") {
                if (!desenhoData.continuar && !desenhoData.finalizar) {
                  // Iniciar novo desenho
                  ctx.beginPath();
                  ctx.strokeStyle = desenhoData.cor;
                  ctx.lineWidth = desenhoData.espessura;
                  ctx.moveTo(desenhoData.pontos.x, desenhoData.pontos.y);
                } else if (desenhoData.continuar) {
                  // Continuar desenho
                  ctx.lineTo(desenhoData.pontos.x, desenhoData.pontos.y);
                  ctx.stroke();
                } else if (desenhoData.finalizar) {
                  // Finalizar desenho
                  ctx.closePath();
                }
              } else if (desenhoData.tipo === "linha") {
                // Desenhar linha
                ctx.beginPath();
                ctx.strokeStyle = desenhoData.cor;
                ctx.lineWidth = desenhoData.espessura;
                ctx.moveTo(desenhoData.pontos.x1, desenhoData.pontos.y1);
                ctx.lineTo(desenhoData.pontos.x2, desenhoData.pontos.y2);
                ctx.stroke();
              } else if (desenhoData.tipo === "retangulo") {
                // Desenhar retângulo
                ctx.beginPath();
                ctx.strokeStyle = desenhoData.cor;
                ctx.lineWidth = desenhoData.espessura;
                ctx.rect(
                  desenhoData.pontos.x1,
                  desenhoData.pontos.y1,
                  desenhoData.width,
                  desenhoData.height
                );
                ctx.stroke();
              }
            }
          }
        );

        // Configurar receptor para limpar canvas
        const limparReceptorLimparCanvas =
          comunicacao.configurarReceptorLimparCanvas(() => {
            console.log("Recebendo comando para limpar canvas");
            if (contextRef.current && canvasRef.current) {
              contextRef.current.clearRect(
                0,
                0,
                canvasRef.current.width,
                canvasRef.current.height
              );
            }
          });

        // Configurar receptor para desconexão do professor
        const limparReceptorProfessor = comunicacao.configurarReceptorProfessor(
          () => {
            console.log("Professor desconectado");
            setProfessorConectado(false);
            setMensagem("Professor desconectado. Aguardando reconexão...");
            pararCompartilhamento();
          }
        );

        return () => {
          limparReceptorDesenhos();
          limparReceptorLimparCanvas();
          limparReceptorProfessor();
          comunicacao.desconectar();
        };
      } catch (error) {
        console.error("Erro ao inicializar:", error);
        setMensagem(`Erro ao conectar: ${error.message}`);
      }
    };

    inicializar();
  }, [nome, salaId]);

  // Inicialização do canvas para receber os desenhos do professor
  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;

      const context = canvas.getContext("2d");
      context.lineCap = "round";
      contextRef.current = context;
    }
  }, []);

  // Referência para a conexão WebRTC
  const peerRef = useRef(null);
  const receptorSinaisRef = useRef(null);

  // Função para tentar compartilhamento de tela usando a API do Chrome
  const tentarCompartilhamentoChrome = async (options) => {
    // Verificar se é Chrome
    const isChrome = navigator.userAgent.indexOf("Chrome") !== -1;
    if (!isChrome) {
      throw new Error("Método específico para Chrome");
    }

    console.log("Tentando método alternativo para Chrome");

    // Tentar usar a API experimental do Chrome
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        // Tentar usar constraints específicas para captura de tela no Chrome
        const constraints = {
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              maxWidth: 4096,
              maxHeight: 2160,
            },
          },
          audio: false,
        };

        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        console.error("Erro no método alternativo para Chrome:", err);
        throw err;
      }
    } else {
      throw new Error("getUserMedia não disponível");
    }
  };

  // Função para iniciar o compartilhamento de tela
  const iniciarCompartilhamento = async () => {
    try {
      console.log("Iniciando compartilhamento de tela...");
      console.log("Navegador:", navigator.userAgent);
      console.log("mediaDevices disponível:", !!navigator.mediaDevices);
      if (navigator.mediaDevices) {
        console.log(
          "getDisplayMedia disponível:",
          !!navigator.mediaDevices.getDisplayMedia
        );
      }

      // Limpar qualquer conexão anterior
      if (peerRef.current) {
        try {
          peerRef.current.destroy();
        } catch (err) {
          console.log("Erro ao destruir peer anterior:", err);
        }
        peerRef.current = null;
      }

      if (receptorSinaisRef.current) {
        receptorSinaisRef.current();
        receptorSinaisRef.current = null;
      }

      // Verificar se a API de compartilhamento de tela está disponível
      // Abordagem mais direta - tentar usar a API diretamente
      try {
        // Verificar se o navegador é Chrome e está sendo executado em um contexto seguro
        const isChrome = navigator.userAgent.indexOf("Chrome") !== -1;
        const isSecureContext = window.isSecureContext;

        console.log("Executando em contexto seguro:", isSecureContext);
        console.log("Detectado como Chrome:", isChrome);

        // Se não estiver em um contexto seguro, tentar uma abordagem alternativa
        if (!isSecureContext) {
          console.warn("Não está em um contexto seguro (HTTPS ou localhost)");

          // Verificar se está usando Chrome
          if (isChrome) {
            setMensagem(
              `O compartilhamento de tela requer uma conexão segura (HTTPS ou localhost).

              Como você está usando o Chrome, você pode habilitar uma configuração experimental para permitir o compartilhamento de tela neste site.`
            );

            // Adicionar botão para habilitar flags do Chrome
            setTimeout(() => {
              const mensagemElement = document.querySelector(
                ".sem-compartilhamento p"
              );
              if (mensagemElement) {
                // Criar container para os botões
                const botoesContainer = document.createElement("div");
                botoesContainer.className = "botoes-solucao";

                // Botão para habilitar flags do Chrome
                const botaoFlags = document.createElement("button");
                botaoFlags.textContent = "Habilitar configuração experimental";
                botaoFlags.className = "botao-solucao";
                botaoFlags.onclick = () => {
                  // Abrir a página de flags do Chrome
                  window.open(
                    "chrome://flags/#unsafely-treat-insecure-origin-as-secure",
                    "_blank"
                  );

                  // Mostrar instruções detalhadas
                  const instrucoes = document.createElement("div");
                  instrucoes.className = "instrucoes-chrome";
                  instrucoes.innerHTML = `
                    <h3>Siga estas instruções:</h3>
                    <ol>
                      <li>Na página que abriu, procure por "Insecure origins treated as secure"</li>
                      <li>Adicione este endereço na caixa de texto: <strong>${window.location.origin}</strong></li>
                      <li>Selecione <strong>Enabled</strong> no menu suspenso</li>
                      <li>Clique no botão <strong>Relaunch</strong> no canto inferior direito</li>
                      <li>Após o Chrome reiniciar, volte para esta página e tente compartilhar novamente</li>
                    </ol>
                  `;

                  // Adicionar instruções após o container de botões
                  botoesContainer.parentNode.insertBefore(
                    instrucoes,
                    botoesContainer.nextSibling
                  );
                };

                // Adicionar botão ao container
                botoesContainer.appendChild(botaoFlags);

                // Adicionar container após a mensagem
                mensagemElement.parentNode.insertBefore(
                  botoesContainer,
                  mensagemElement.nextSibling
                );
              }
            }, 100);
          } else {
            // Para outros navegadores, sugerir usar o Chrome
            setMensagem(
              `O compartilhamento de tela requer uma conexão segura (HTTPS ou localhost).

              Recomendamos usar o Google Chrome, que oferece opções avançadas para permitir o compartilhamento de tela.`
            );
          }
          return;
        }

        // Verificar se mediaDevices está disponível
        if (!navigator.mediaDevices) {
          throw new Error("API mediaDevices não disponível");
        }

        // Verificar se getDisplayMedia está disponível
        if (typeof navigator.mediaDevices.getDisplayMedia !== "function") {
          // Tentar usar a versão experimental do Chrome
          if (typeof navigator.getDisplayMedia === "function") {
            console.log("Usando navigator.getDisplayMedia como alternativa");
            navigator.mediaDevices.getDisplayMedia = function (constraints) {
              return navigator.getDisplayMedia(constraints);
            };
          } else {
            throw new Error("getDisplayMedia não disponível");
          }
        }
      } catch (error) {
        console.error(
          "Erro ao verificar suporte para compartilhamento de tela:",
          error
        );
        setMensagem(
          "Seu navegador não suporta compartilhamento de tela. Por favor, use um navegador mais recente como Chrome, Firefox ou Edge."
        );
        return;
      }

      // Solicitar acesso à tela do usuário com tratamento de erro mais detalhado
      let stream;
      try {
        // Usar opções mais básicas para maior compatibilidade
        const displayMediaOptions = {
          video: true,
          audio: false,
        };

        console.log(
          "Solicitando getDisplayMedia com opções:",
          displayMediaOptions
        );

        // Usar uma abordagem mais direta para solicitar o compartilhamento de tela
        try {
          // Tentar usar a API padrão
          console.log("Tentando getDisplayMedia padrão...");
          stream = await navigator.mediaDevices.getDisplayMedia(
            displayMediaOptions
          );
          console.log("Stream obtido com sucesso via getDisplayMedia padrão");
        } catch (standardError) {
          console.warn("Erro ao usar getDisplayMedia padrão:", standardError);

          // Tentar usar a API experimental do Chrome
          if (navigator.getDisplayMedia) {
            try {
              console.log("Tentando getDisplayMedia experimental...");
              stream = await navigator.getDisplayMedia(displayMediaOptions);
              console.log(
                "Stream obtido com sucesso via getDisplayMedia experimental"
              );
            } catch (experimentalError) {
              console.error(
                "Erro ao usar getDisplayMedia experimental:",
                experimentalError
              );

              // Tentar método alternativo para Chrome
              try {
                console.log("Tentando método alternativo para Chrome...");
                const isChrome = navigator.userAgent.indexOf("Chrome") !== -1;
                if (isChrome) {
                  stream = await tentarCompartilhamentoChrome(
                    displayMediaOptions
                  );
                  console.log(
                    "Stream obtido com sucesso via método alternativo para Chrome"
                  );
                } else {
                  throw new Error(
                    "Método alternativo disponível apenas para Chrome"
                  );
                }
              } catch (chromeError) {
                console.error(
                  "Erro no método alternativo para Chrome:",
                  chromeError
                );
                throw experimentalError; // Propagar o erro experimental se o método Chrome falhar
              }
            }
          } else {
            // Tentar método alternativo para Chrome como última opção
            try {
              console.log(
                "Tentando método alternativo para Chrome como última opção..."
              );
              const isChrome = navigator.userAgent.indexOf("Chrome") !== -1;
              if (isChrome) {
                stream = await tentarCompartilhamentoChrome(
                  displayMediaOptions
                );
                console.log(
                  "Stream obtido com sucesso via método alternativo para Chrome"
                );
              } else {
                throw standardError; // Se não for Chrome, propagar o erro original
              }
            } catch (lastError) {
              console.error("Todas as tentativas falharam:", lastError);
              throw standardError; // Propagar o erro original
            }
          }
        }

        console.log("Stream obtido com sucesso:", stream);
      } catch (mediaError) {
        console.error("Erro ao acessar mídia:", mediaError);
        if (mediaError.name === "NotAllowedError") {
          setMensagem(
            "Permissão para compartilhar tela negada. Por favor, permita o acesso."
          );
        } else if (mediaError.name === "NotFoundError") {
          setMensagem("Nenhuma tela disponível para compartilhamento.");
        } else if (mediaError.name === "NotSupportedError") {
          setMensagem(
            "Seu navegador não suporta compartilhamento de tela. Por favor, use um navegador mais recente."
          );
        } else {
          setMensagem(
            `Erro ao acessar tela: ${
              mediaError.message || mediaError
            }. Tente usar outro navegador como Chrome, Firefox ou Edge.`
          );
        }
        return;
      }

      if (!stream) {
        setMensagem("Não foi possível obter stream de vídeo.");
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setCompartilhando(true);
      setMensagem("Compartilhando tela com o professor");

      // Inicializar peer WebRTC como iniciador (aluno inicia a conexão)
      console.log("Inicializando peer WebRTC...");

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

      let peer;
      try {
        // Configurar opções mais robustas para o peer
        peer = comunicacao.inicializarPeer(
          true,
          stream,
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
      } catch (peerError) {
        console.error("Erro ao inicializar peer WebRTC:", peerError);
        throw new Error(
          `Erro ao inicializar conexão WebRTC: ${peerError.message}. ` +
            "Verifique se você está usando HTTPS ou localhost."
        );
      }

      peerRef.current = peer;

      // Configurar eventos do peer com mais logs
      peer.on("signal", (sinal) => {
        console.log(
          "Sinal gerado, enviando para o professor...",
          sinal.type || "candidato"
        );
        // Enviar sinal para o professor via servidor
        comunicacao.enviarSinal(salaId, null, sinal); // null porque não sabemos o ID do professor
      });

      peer.on("connect", () => {
        console.log("Conexão WebRTC estabelecida com o professor!");
        setMensagem("Conexão estabelecida com o professor");

        // Enviar um ping para manter a conexão ativa
        const pingInterval = setInterval(() => {
          if (peer.connected) {
            try {
              peer.send(
                JSON.stringify({ type: "ping", timestamp: Date.now() })
              );
              console.log("Ping enviado para manter conexão");
            } catch (err) {
              console.error("Erro ao enviar ping:", err);
            }
          } else {
            clearInterval(pingInterval);
          }
        }, 5000); // Enviar ping a cada 5 segundos
      });

      peer.on("error", (err) => {
        console.error("Erro na conexão WebRTC:", err);
        setMensagem(`Erro na conexão: ${err.message || err}. Tente novamente.`);
        pararCompartilhamento();
      });

      peer.on("close", () => {
        console.log("Conexão WebRTC fechada");
        setMensagem(
          "Compartilhamento de tela interrompido. A conexão foi fechada."
        );
        pararCompartilhamento();
      });

      // Adicionar evento para dados recebidos
      peer.on("data", (data) => {
        try {
          const message = JSON.parse(data);
          console.log("Mensagem recebida do professor:", message);

          // Responder a pings do professor
          if (message.type === "ping") {
            peer.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          }
        } catch (err) {
          console.log("Dados recebidos (não JSON):", data.toString());
        }
      });

      // Configurar receptor de sinais
      console.log("Configurando receptor de sinais...");
      const limparReceptor = comunicacao.configurarReceptorSinais(
        (remetenteId, sinal) => {
          console.log(`Recebendo sinal de ${remetenteId}`);
          if (peerRef.current) {
            try {
              peerRef.current.signal(sinal);
            } catch (err) {
              console.error("Erro ao processar sinal:", err);
              setMensagem("Erro ao processar sinal. Tente novamente.");
              pararCompartilhamento();
            }
          }
        }
      );

      receptorSinaisRef.current = limparReceptor;

      // Detectar quando o usuário para o compartilhamento
      stream.getVideoTracks()[0].onended = () => {
        console.log("Compartilhamento de tela encerrado pelo usuário");
        pararCompartilhamento();
      };

      // Monitorar o estado da conexão e tentar reconectar se necessário
      monitorConexaoRef.current = setInterval(() => {
        if (peerRef.current) {
          // Verificar se a conexão está ativa
          if (
            peerRef.current._pc &&
            peerRef.current._pc.iceConnectionState === "disconnected"
          ) {
            console.log("Conexão ICE desconectada, tentando recuperar...");
            setMensagem("Conexão instável. Tentando recuperar...");

            // Tentar renegociar a conexão
            try {
              if (peerRef.current._pc.restartIce) {
                console.log("Reiniciando ICE...");
                peerRef.current._pc.restartIce();
              }
            } catch (err) {
              console.error("Erro ao tentar reiniciar ICE:", err);
            }
          }

          // Se a conexão falhou completamente
          if (
            peerRef.current._pc &&
            (peerRef.current._pc.iceConnectionState === "failed" ||
              peerRef.current._pc.iceConnectionState === "closed")
          ) {
            console.log("Conexão ICE falhou ou foi fechada");
            setMensagem("Conexão perdida. Reiniciando compartilhamento...");
            clearInterval(monitorConexaoRef.current);
            monitorConexaoRef.current = null;

            // Parar o compartilhamento atual
            pararCompartilhamento();

            // Tentar reiniciar o compartilhamento após um breve atraso
            setTimeout(() => {
              if (professorConectado) {
                console.log(
                  "Tentando reiniciar o compartilhamento automaticamente..."
                );
                iniciarCompartilhamento();
              }
            }, 3000);
          }
        } else {
          clearInterval(monitorConexaoRef.current);
          monitorConexaoRef.current = null;
        }
      }, 5000); // Verificar a cada 5 segundos

      // Definir um timeout para verificar se a conexão foi estabelecida
      timeoutConexaoRef.current = setTimeout(() => {
        if (peerRef.current && !peerRef.current.connected) {
          console.log(
            "Timeout de conexão - não foi possível conectar ao professor"
          );
          setMensagem(
            "Aguardando professor aceitar a conexão... Se demorar muito, tente novamente."
          );

          // Definir um segundo timeout mais longo antes de desistir completamente
          setTimeout(() => {
            if (peerRef.current && !peerRef.current.connected) {
              console.log("Segundo timeout de conexão - desistindo");
              setMensagem(
                "Tempo esgotado. Não foi possível conectar ao professor. Tente novamente."
              );
              clearInterval(monitorConexaoRef.current);
              monitorConexaoRef.current = null;
              pararCompartilhamento();
            }
          }, 30000); // Mais 30 segundos (total de 45 segundos)
        }
      }, 15000); // 15 segundos para o primeiro timeout

      // Limpar os intervalos quando o componente for desmontado ou o compartilhamento parar
      return () => {
        if (monitorConexaoRef.current) {
          clearInterval(monitorConexaoRef.current);
          monitorConexaoRef.current = null;
        }
        if (timeoutConexaoRef.current) {
          clearTimeout(timeoutConexaoRef.current);
          timeoutConexaoRef.current = null;
        }
      };
    } catch (error) {
      console.error("Erro ao compartilhar tela:", error);
      setMensagem(
        `Erro ao compartilhar tela: ${error.message}. Tente novamente.`
      );
      pararCompartilhamento();
    }
  };

  // Referências para os intervalos de monitoramento
  const monitorConexaoRef = useRef(null);
  const timeoutConexaoRef = useRef(null);

  // Função para parar o compartilhamento de tela
  const pararCompartilhamento = () => {
    console.log("Parando compartilhamento de tela...");

    // Limpar intervalos de monitoramento
    if (monitorConexaoRef.current) {
      console.log("Limpando intervalo de monitoramento de conexão");
      clearInterval(monitorConexaoRef.current);
      monitorConexaoRef.current = null;
    }

    if (timeoutConexaoRef.current) {
      console.log("Limpando timeout de conexão");
      clearTimeout(timeoutConexaoRef.current);
      timeoutConexaoRef.current = null;
    }

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          console.log(`Parando track: ${track.kind}`);
          track.stop();
        });
      } catch (err) {
        console.error("Erro ao parar tracks:", err);
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Fechar conexão WebRTC
    if (peerRef.current) {
      try {
        console.log("Destruindo peer WebRTC...");
        peerRef.current.destroy();
      } catch (err) {
        console.error("Erro ao destruir peer:", err);
      }
      peerRef.current = null;
    }

    // Limpar receptor de sinais
    if (receptorSinaisRef.current) {
      console.log("Removendo receptor de sinais...");
      receptorSinaisRef.current();
      receptorSinaisRef.current = null;
    }

    setCompartilhando(false);
    setMensagem("Compartilhamento de tela interrompido");

    // Adicionar um pequeno atraso antes de permitir reiniciar o compartilhamento
    setTimeout(() => {
      console.log("Pronto para iniciar novo compartilhamento");
      setMensagem(
        professorConectado
          ? 'Compartilhamento interrompido. Clique em "Compartilhar Tela" para reiniciar.'
          : "Aguardando conexão do professor..."
      );
    }, 1000);
  };

  // Ajustar o tamanho do canvas quando o vídeo muda de tamanho
  useEffect(() => {
    if (compartilhando && canvasRef.current && videoRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        if (videoRef.current && canvasRef.current) {
          const videoRect = videoRef.current.getBoundingClientRect();
          canvasRef.current.width = videoRect.width;
          canvasRef.current.height = videoRect.height;

          // Reconfigurar o contexto após redimensionar
          if (contextRef.current) {
            contextRef.current.lineCap = "round";
          }
        }
      });

      resizeObserver.observe(videoRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [compartilhando]);

  return (
    <div className="sala-aluno">
      <div className="sala-header">
        <div className="sala-info">
          <div className="sala-id">Sala: {salaId}</div>
          <div className="sala-nome">Aluno: {nome}</div>
        </div>
        <button onClick={voltarParaInicio} className="botao-voltar">
          Sair da Sala
        </button>
      </div>

      <div className="sala-conteudo">
        <div className="area-compartilhamento">
          {!compartilhando ? (
            <div className="sem-compartilhamento">
              <p>{mensagem}</p>
              {professorConectado && (
                <div className="compartilhamento-container">
                  <button
                    onClick={iniciarCompartilhamento}
                    className="botao-compartilhar"
                  >
                    Compartilhar Tela
                  </button>
                  <p className="info-compartilhamento">
                    Para compartilhar sua tela, você precisa usar um navegador
                    moderno como Chrome, Firefox ou Edge.
                    <br />
                    Se estiver usando Chrome, certifique-se de que está usando a
                    versão mais recente.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="tela-compartilhada">
              <div className="video-container">
                <video ref={videoRef} autoPlay muted />
              </div>
              <canvas ref={canvasRef} className="canvas-overlay" />

              <div className="controles-compartilhamento">
                <button onClick={pararCompartilhamento} className="botao-parar">
                  Parar Compartilhamento
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalaAluno;
