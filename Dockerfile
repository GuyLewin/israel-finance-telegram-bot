FROM node:17-alpine

# Installs latest Chromium package.
RUN apk add --no-cache \
    chromium \
    nss \
    ca-certificates

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Add weak user.
RUN addgroup -S docker && adduser -S -g docker docker \
    && mkdir -p /home/docker/Downloads /app \
    && chown -R docker:docker /home/docker \
    && chown -R docker:docker /app

# Run everything after as non-privileged user.
USER docker

# Go to app directory
WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY --chown=docker package*.json ./

RUN npm install

# Bundle app source
COPY . .

CMD [ "npm", "run", "docker-start" ]
