# Guia de Implantação

Este documento descreve como implantar a aplicação em um servidor para uso em produção.

## Pré-requisitos

- Servidor com Node.js (versão 14 ou superior)
- Certificado SSL válido (necessário para WebRTC)
- Domínio configurado (opcional, mas recomendado)

## Passos para implantação

### 1. Clonar o repositório

```bash
git clone https://github.com/seu-usuario/compartilhamento-professor-aluno.git
cd compartilhamento-professor-aluno
```

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar certificados SSL

Você precisa de certificados SSL válidos para que o WebRTC funcione corretamente. Você pode:

- Usar certificados gratuitos do Let's Encrypt
- Comprar certificados de uma autoridade certificadora
- Usar certificados auto-assinados (apenas para testes)

Coloque seus certificados na raiz do projeto com os nomes:
- `cert.pem` (certificado)
- `key.pem` (chave privada)

### 4. Configurar variáveis de ambiente (opcional)

Crie um arquivo `.env` na raiz do projeto:

```
PORT_VITE=3000
PORT_SERVER=3001
HOST=0.0.0.0
```

### 5. Construir a aplicação para produção

```bash
npm run build
```

### 6. Iniciar o servidor

```bash
node server.js
```

A aplicação estará disponível em:
- Frontend: https://seu-dominio:3000
- Servidor Socket.IO: https://seu-dominio:3001

## Implantação com Docker (alternativa)

### 1. Criar um Dockerfile

```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000
EXPOSE 3001

CMD ["node", "server.js"]
```

### 2. Construir e executar a imagem Docker

```bash
docker build -t compartilhamento-professor-aluno .
docker run -p 3000:3000 -p 3001:3001 -v /path/to/certs:/app/certs compartilhamento-professor-aluno
```

## Considerações de segurança

- Sempre use HTTPS em produção
- Considere adicionar autenticação para controlar o acesso às salas
- Configure um firewall para permitir apenas o tráfego necessário
- Mantenha o Node.js e as dependências atualizadas
