FROM node:18-alpine

WORKDIR /app

# Copiar arquivos de configuração
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar o código-fonte
COPY . .

# Construir a aplicação
RUN npm run build

# Expor a porta
EXPOSE 3000
EXPOSE 3001

# Comando para iniciar a aplicação
CMD ["node", "server.js"]
