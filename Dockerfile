FROM node:18-alpine

ARG HOST_PORT 
ENV HOST_PORT ${HOST_PORT} 
EXPOSE ${HOST_PORT}

COPY mailman_connector.js /home/node/app/mailman_connector.js

RUN npm -g install nodemon

WORKDIR /home/node/app

ENTRYPOINT ["sh", "-c", "nodemon mailman_connector.js $HOST_PORT"]
