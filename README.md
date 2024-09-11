## How to Install

### Using Docker

Pull the latest docker image

```bash
docker pull ghcr.io/dgcgovkh/document-encryption-server:latest
```

Run the docker container

```bash
docker run -d -p 8080:80 --restart unless-stopped -v ./<server-config-file>:/app/server-config.json ghcr.io/dgcgovkh/document-encryption-server:latest
```

### Non-Docker

Requirements:

- [Node.js](https://nodejs.org/en/download/)
- [npm](https://docs.npmjs.com/cli/)
- [Git](https://git-scm.com/downloads)
- [pm2](https://pm2.keymetrics.io/) - For running in the background

```bash
# Clone and install dependencies
git clone https://github.com/dgcgovkh/document-encryption-server.git
cd document-encryption-server
npm install
```

Create an .env file (optinal)

```bash
# Add env variable name PORT to .env file (default port is 80)
echo "PORT=8080" >> .env
```

```bash
# Option 1. Try it
node server.js

# (Recommended) Option 2. Run in the background using PM2
pm2 start server.js --name document-encryption
```

Document-encryption is now running on http://localhost:8080

More useful PM2 Commands

```bash
# If you want to see the current console output
pm2 monit

# If you want to add it to startup
pm2 save && pm2 startup
```
