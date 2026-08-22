// PM2 — mantém o bot vivo e reinicia automaticamente.
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: "bot-envio-parcial",
      script: "index.js",
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // O bot já controla seu próprio agendamento (node-cron); sem cron_restart.
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
