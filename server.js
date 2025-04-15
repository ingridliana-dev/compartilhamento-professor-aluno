import express from "express";
import { createServer } from "https";
import { Server } from "socket.io";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

// Certificados para HTTPS
const options = {
  key: fs.readFileSync("./.cert/key.pem"),
  cert: fs.readFileSync("./.cert/cert.pem"),
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

// Servir arquivos estáticos em produção
app.use(express.static(join(__dirname, "dist")));

const server = createServer(options, app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Configurar opções para HTTPS
  secure: true,
  transports: ["websocket", "polling"],
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
