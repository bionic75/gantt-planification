FROM node:18

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 8080

ENV UV_THREADPOOL_SIZE=16

CMD ["node", "server.js"]
