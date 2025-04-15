import { useState } from "react";
import "./App.css";
import TelaInicial from "./components/TelaInicial";
import SalaProfessor from "./components/SalaProfessor";
import SalaAluno from "./components/SalaAluno";

function App() {
  const [tipoUsuario, setTipoUsuario] = useState(null); // 'professor' ou 'aluno'
  const [salaId, setSalaId] = useState(null);
  const [nome, setNome] = useState("");

  // Função para entrar como professor
  const entrarComoProfessor = (nome, novaSalaId) => {
    setNome(nome);
    // Usar o ID fornecido ou gerar um novo
    const salaGerada =
      novaSalaId || Math.random().toString(36).substring(2, 7).toUpperCase();
    console.log("Entrando como professor na sala:", salaGerada);
    setSalaId(salaGerada);
    setTipoUsuario("professor");
  };

  // Função para atualizar o ID da sala (usado quando o servidor cria uma sala)
  const atualizarSalaId = (novoId) => {
    console.log("Atualizando ID da sala para:", novoId);
    setSalaId(novoId);
  };

  // Função para entrar como aluno
  const entrarComoAluno = (nome, salaIdInformada) => {
    setNome(nome);
    setSalaId(salaIdInformada);
    setTipoUsuario("aluno");
  };

  // Função para voltar à tela inicial
  const voltarParaInicio = () => {
    setTipoUsuario(null);
    setSalaId(null);
  };

  return (
    <div className="app-container">
      {!tipoUsuario && (
        <TelaInicial
          entrarComoProfessor={entrarComoProfessor}
          entrarComoAluno={entrarComoAluno}
        />
      )}

      {tipoUsuario === "professor" && (
        <SalaProfessor
          nome={nome}
          salaId={salaId}
          voltarParaInicio={voltarParaInicio}
          atualizarSalaId={atualizarSalaId}
        />
      )}

      {tipoUsuario === "aluno" && (
        <SalaAluno
          nome={nome}
          salaId={salaId}
          voltarParaInicio={voltarParaInicio}
        />
      )}
    </div>
  );
}

export default App;
