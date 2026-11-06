FROM node:22-bookworm-slim

WORKDIR /opt/seal22-template

COPY template/package.json template/package-lock.json ./
RUN npm ci
COPY template/ ./
COPY build.mjs /opt/seal22/build.mjs
RUN chmod -R a+rX /opt/seal22-template /opt/seal22

USER 1000
