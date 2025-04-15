import express from "express";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { Server } from "socket.io";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

// Determinar se estamos em produção (Railway) ou desenvolvimento
const isProduction =
  process.env.NODE_ENV === "production" ||
  process.env.RAILWAY_ENVIRONMENT === "production";

// Certificados para HTTPS em desenvolvimento
let options = {};
let server;

if (!isProduction) {
  try {
    options = {
      key: fs.readFileSync("./.cert/key.pem"),
      cert: fs.readFileSync("./.cert/cert.pem"),
    };
  } catch (error) {
    console.warn(
      "Certificados SSL não encontrados. Usando HTTP para desenvolvimento."
    );
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
// Configurar CORS para permitir acesso de qualquer origem
app.use(
  cors({
    origin: true, // Permitir qualquer origem
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Access-Control-Allow-Origin",
    ],
  })
);

// Adicionar middleware para lidar com preflight requests
app.options("*", cors());

// Servir arquivos estáticos em produção
app.use(express.static(join(__dirname, "dist")));

// Rota de healthcheck para o Railway
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Rota raiz para healthcheck
app.get("/", (req, res) => {
  // Se for uma solicitação de API, retornar JSON
  if (req.headers.accept && req.headers.accept.includes("application/json")) {
    return res
      .status(200)
      .json({ status: "ok", timestamp: new Date().toISOString() });
  }

  // Se for uma solicitação normal, servir o index.html
  res.sendFile(join(__dirname, "dist", "index.html"));
});

// Rota para verificar informações do servidor
app.get("/api/info", (req, res) => {
  res.status(200).json({
    status: "ok",
    environment: isProduction ? "production" : "development",
    protocol: req.protocol,
    host: req.get("host"),
    timestamp: new Date().toISOString(),
    salas: Object.keys(salas).length,
  });
});

// Criar servidor HTTP ou HTTPS dependendo do ambiente
if (isProduction) {
  server = createHttpServer(app);
} else {
  // Em desenvolvimento, usar HTTPS se os certificados estiverem disponíveis
  if (options.key && options.cert) {
    server = createHttpsServer(options, app);
  } else {
    server = createHttpServer(app);
  }
}

const io = new Server(server, {
  cors: {
    origin: true, // Permitir qualquer origem
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Access-Control-Allow-Origin",
    ],
  },
  // Configurar opções para HTTPS apenas se não estivermos em produção
  secure: !isProduction && options.key && options.cert,
  transports: ["websocket", "polling"],
  // Aumentar timeout para conexões lentas
  pingTimeout: 60000,
  pingInterval: 25000,
  // Permitir upgrades de conexão
  allowUpgrades: true,
  // Configurar para funcionar com proxies
  allowEIO3: true,
});

// Armazenar informações das salas
const salas = {};

io.on("connection", (socket) => {
  console.log("Novo usuário conectado:", socket.id);

  // Quando um professor cria uma sala
  socket.on("criar-sala", ({ nome, salaId }) => {
    console.log(`Professor ${nome} criou a sala ${salaId}`);

    // Armazenar informações da sala
    salas[salaId] = {
      professor: {
        id: socket.id,
        nome,
      },
      alunos: [],
    };

    // Entrar na sala Socket.IO
    socket.join(salaId);

    // Confirmar criação da sala
    socket.emit("sala-criada", { salaId });

    console.log(
      `Sala ${salaId} criada com sucesso. Salas disponíveis:`,
      Object.keys(salas)
    );
  });

  // Quando um aluno entra em uma sala
  socket.on("entrar-sala", ({ nome, salaId }) => {
    console.log(`Aluno ${nome} tentando entrar na sala ${salaId}`);
    console.log(`Salas disponíveis:`, Object.keys(salas));

    // Verificar se a sala existe
    if (!salas[salaId]) {
      console.log(`Sala ${salaId} não encontrada`);
      socket.emit("erro", { mensagem: "Sala não encontrada" });
      return;
    }

    // Adicionar aluno à sala
    const aluno = { id: socket.id, nome };
    salas[salaId].alunos.push(aluno);

    // Entrar na sala Socket.IO
    socket.join(salaId);

    // Confirmar entrada na sala
    socket.emit("entrou-sala", { salaId });

    // Notificar o professor sobre o novo aluno
    if (salas[salaId].professor) {
      console.log(
        `Notificando professor ${salas[salaId].professor.nome} sobre novo aluno ${nome}`
      );
      io.to(salas[salaId].professor.id).emit("aluno-conectado", aluno);
    } else {
      console.log(`Professor não encontrado na sala ${salaId}`);
    }
  });

  // Quando um usuário envia sinal WebRTC
  socket.on("sinal-webrtc", ({ salaId, destinatarioId, sinal }) => {
    console.log(`Sinal WebRTC de ${socket.id} na sala ${salaId}`);

    // Verificar se a sala existe
    if (!salas[salaId]) {
      console.log(`Sala ${salaId} não encontrada para sinal WebRTC`);
      return;
    }

    // Se o destinatário não for especificado e o remetente é um aluno, enviar para o professor
    if (!destinatarioId) {
      // Verificar se o remetente é um aluno
      const alunoIndex = salas[salaId].alunos.findIndex(
        (a) => a.id === socket.id
      );
      if (alunoIndex !== -1 && salas[salaId].professor) {
        // É um aluno, enviar para o professor
        destinatarioId = salas[salaId].professor.id;
        const aluno = salas[salaId].alunos[alunoIndex];
        console.log(
          `Aluno ${aluno.nome} enviando sinal para o professor ${salas[salaId].professor.nome}`
        );
      }
      // Verificar se o remetente é o professor
      else if (
        salas[salaId].professor &&
        salas[salaId].professor.id === socket.id
      ) {
        // É o professor, mas não especificou o aluno - erro
        console.log(
          `Professor enviou sinal sem especificar o aluno destinatário`
        );
        return;
      }
    }

    // Se o remetente for o professor e o destinatário for especificado
    if (
      salas[salaId].professor &&
      salas[salaId].professor.id === socket.id &&
      destinatarioId
    ) {
      // Verificar se o destinatário é um aluno válido
      const aluno = salas[salaId].alunos.find((a) => a.id === destinatarioId);
      if (aluno) {
        console.log(
          `Professor ${salas[salaId].professor.nome} enviando sinal para aluno ${aluno.nome}`
        );
        io.to(destinatarioId).emit("sinal-webrtc", {
          remetenteId: socket.id,
          sinal,
        });
      } else {
        console.log(
          `Aluno com ID ${destinatarioId} não encontrado na sala ${salaId}`
        );
      }
      return;
    }

    // Enviar o sinal para o destinatário
    if (destinatarioId) {
      console.log(`Enviando sinal para ${destinatarioId}`);
      io.to(destinatarioId).emit("sinal-webrtc", {
        remetenteId: socket.id,
        sinal,
      });
    } else {
      console.log(`Destinatário não encontrado para o sinal WebRTC`);
    }
  });

  // Quando o professor envia um desenho
  socket.on("desenho", ({ salaId, alunoId, desenhoData }) => {
    console.log(
      `Professor enviou desenho para aluno ${alunoId} na sala ${salaId}`
    );
    io.to(alunoId).emit("desenho", desenhoData);
  });

  // Quando o professor limpa o canvas
  socket.on("limpar-canvas", ({ salaId, alunoId }) => {
    console.log(
      `Professor limpou canvas para aluno ${alunoId} na sala ${salaId}`
    );
    io.to(alunoId).emit("limpar-canvas");
  });

  // Quando um usuário se desconecta
  socket.on("disconnect", () => {
    console.log("Usuário desconectado:", socket.id);

    // Remover usuário das salas
    for (const salaId in salas) {
      const sala = salas[salaId];

      // Se for o professor
      if (sala.professor && sala.professor.id === socket.id) {
        // Notificar todos os alunos da sala
        sala.alunos.forEach((aluno) => {
          io.to(aluno.id).emit("professor-desconectado");
        });

        // Remover a sala
        delete salas[salaId];
        console.log(`Sala ${salaId} removida porque o professor saiu`);
      }
      // Se for um aluno
      else {
        const index = sala.alunos.findIndex((a) => a.id === socket.id);
        if (index !== -1) {
          const aluno = sala.alunos[index];
          sala.alunos.splice(index, 1);

          // Notificar o professor
          if (sala.professor) {
            io.to(sala.professor.id).emit("aluno-desconectado", aluno);
          }

          console.log(`Aluno removido da sala ${salaId}`);
        }
      }
    }
  });
});

// Definir porta e host
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";

// Adicionar tratamento de erros para o servidor
server.on("error", (error) => {
  console.error("Erro no servidor:", error);
});

// Iniciar o servidor
try {
  server.listen(PORT, HOST, () => {
    console.log(`Servidor rodando em ${HOST}:${PORT}`);
    console.log(`Ambiente: ${isProduction ? "Produção" : "Desenvolvimento"}`);
    console.log(
      `Usando ${server instanceof createHttpsServer ? "HTTPS" : "HTTP"}`
    );
    console.log(
      `Variáveis de ambiente: PORT=${process.env.PORT}, NODE_ENV=${process.env.NODE_ENV}`
    );
    console.log(`Diretório atual: ${process.cwd()}`);
    console.log(`Rotas disponíveis: /health, /api/info`);
  });
} catch (error) {
  console.error("Erro ao iniciar o servidor:", error);
}
