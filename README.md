# Compartilhamento Professor-Aluno

Aplicação web para professores visualizarem e desenharem na tela de seus alunos remotamente, sem necessidade de instalação adicional.

## Funcionalidades

- **Compartilhamento de tela**: Alunos podem compartilhar sua tela com o professor
- **Desenho remoto**: Professores podem desenhar sobre a tela compartilhada dos alunos
- **Múltiplos alunos**: Suporte para vários alunos em uma mesma sala
- **Sem instalação**: Funciona diretamente no navegador, sem necessidade de plugins ou extensões
- **Compatibilidade**: Implementação dupla usando WebRTC e Socket.IO para garantir funcionamento em diferentes navegadores

## Tecnologias utilizadas

- React.js para a interface do usuário
- Socket.IO para comunicação em tempo real
- WebRTC para compartilhamento de tela (com fallback para Socket.IO)
- HTTPS para conexão segura

## Como executar

### Pré-requisitos

- Node.js (versão 14 ou superior)
- NPM ou Yarn

### Instalação

1. Clone o repositório:
```bash
git clone https://github.com/seu-usuario/compartilhamento-professor-aluno.git
cd compartilhamento-professor-aluno
```

2. Instale as dependências:
```bash
npm install
# ou
yarn install
```

3. Inicie o servidor de desenvolvimento:
```bash
npm run dev
# ou
yarn dev
```

4. Acesse a aplicação em `https://localhost:3000`

## Uso

1. **Como professor**:
   - Entre como professor e crie uma sala
   - Compartilhe o código da sala com seus alunos
   - Quando os alunos se conectarem, selecione um aluno para visualizar sua tela
   - Use as ferramentas de desenho para interagir com a tela do aluno

2. **Como aluno**:
   - Entre como aluno e insira o código da sala fornecido pelo professor
   - Clique em "Compartilhar Tela" para iniciar o compartilhamento
   - O professor poderá ver sua tela e desenhar sobre ela

## Segurança

- A aplicação requer HTTPS para funcionar corretamente (ou localhost para desenvolvimento)
- O compartilhamento de tela só funciona com a permissão explícita do aluno
- Nenhum dado é armazenado em servidores externos

## Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo LICENSE para mais detalhes.
