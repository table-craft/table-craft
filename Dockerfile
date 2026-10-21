# Tablecraft images. Build context: this folder.
#
#   docker build --target site  -t tablecraft-site .    # landing + playground, static (nginx, port 80)
#   docker build --target rooms -t tablecraft-rooms .   # self-hosted multiplayer room server (port 5180)
#   docker build --target dev   -t tablecraft-dev .     # landing + playground with hot reload (port 5173)
FROM node:22-alpine AS deps
WORKDIR /tablecraft
COPY package.json package-lock.json ./
RUN npm ci

# dev: source is bind-mounted (see docker-compose in the host project), Vite HMR
FROM deps AS dev
EXPOSE 5173
CMD ["npm", "run", "site:dev", "--", "--host", "0.0.0.0"]

# rooms: socket.io room server from examples/server (GAME=path/to/game.js to host another game)
FROM deps AS rooms
COPY . .
ENV PORT=5180
EXPOSE 5180
CMD ["node", "examples/server/server.js"]

FROM deps AS site-build
COPY . .
RUN npm run site:build

FROM nginx:1.27-alpine AS site
COPY --from=site-build /tablecraft/site/dist /usr/share/nginx/html
EXPOSE 80
