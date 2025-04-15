import { useState } from 'react';
import './TelaInicial.css';

const TelaInicial = ({ entrarComoProfessor, entrarComoAluno }) => {
  const [nome, setNome] = useState('');
  const [salaId, setSalaId] = useState('');
  const [modo, setModo] = useState(null); // 'professor' ou 'aluno'

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!nome) return;

    if (modo === 'professor') {
      entrarComoProfessor(nome);
    } else if (modo === 'aluno') {
      if (!salaId) return;
      entrarComoAluno(nome, salaId);
    }
  };

  return (
    <div className="tela-inicial">
      <h1>Compartilhamento Professor-Aluno</h1>
      
      {!modo ? (
        <div className="escolha-modo">
          <button onClick={() => setModo('professor')}>Sou Professor</button>
          <button onClick={() => setModo('aluno')}>Sou Aluno</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="formulario-entrada">
          <h2>{modo === 'professor' ? 'Entrar como Professor' : 'Entrar como Aluno'}</h2>
          
          <div className="campo">
            <label htmlFor="nome">Seu Nome:</label>
            <input
              type="text"
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Digite seu nome"
              required
            />
          </div>
          
          {modo === 'aluno' && (
            <div className="campo">
              <label htmlFor="salaId">Código da Sala:</label>
              <input
                type="text"
                id="salaId"
                value={salaId}
                onChange={(e) => setSalaId(e.target.value.toUpperCase())}
                placeholder="Digite o código da sala"
                required
              />
            </div>
          )}
          
          <div className="acoes">
            <button type="button" onClick={() => setModo(null)} className="botao-voltar">
              Voltar
            </button>
            <button type="submit" className="botao-entrar">
              Entrar
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default TelaInicial;
