// PM2 process definition for the SomHR backend.
// Usage (on the server):  pm2 start deploy/ecosystem.config.cjs
//                         pm2 save && pm2 startup systemd
module.exports = {
  apps: [
    {
      name: "somhr-api",
      cwd: "/home/ubuntu/app/backend",
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "600M",
      // env values come from backend/.env (loaded by the app via dotenv);
      // PM2 only needs to know how to launch + restart the process.
      autorestart: true,
      watch: false,
    },
  ],
};
