FROM node:20-alpine3.20

WORKDIR /app

COPY package*.json ./

RUN npm install 

ENV NODE_ENV=production

COPY . .

RUN  mkdir inbox 

COPY .env-example ./.env

ENTRYPOINT [ "/app/bin/mastodon-cli.js" ]

CMD [ "help" ]
