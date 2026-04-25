import { createServer, IncomingMessage, ServerResponse } from "http";
import "dotenv/config";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import { Server } from "socket.io";
import { dbHelpers } from "./lib/db";
import { User } from "./lib/models";
import DeploymentManager from "./lib/deployment";
import apps from "./routes/apps";
import caddy from "./routes/caddy";
import deploy from "./routes/deploy";
import systemctl from "./routes/systemctl";
import system from "./routes/system";
import user from "./routes/user";

const port = parseInt(process.env.PORT || "8008", 10);
const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url?.startsWith('/webhook/github/')) {
    const appName = decodeURIComponent(req.url.replace('/webhook/github/', '').split('?')[0]);
    const app = dbHelpers.getAppByName(appName) as any;
    
    if (!app || !app.webhook_token) {
      res.writeHead(404);
      return res.end('App or webhook not found');
    }

    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const signature = req.headers['x-hub-signature-256'] as string;
        if (!signature) {
          res.writeHead(401);
          return res.end('Missing signature');
        }

        const hmac = crypto.createHmac('sha256', app.webhook_token);
        const digest = 'sha256=' + hmac.update(body).digest('hex');
        
        if (signature !== digest) {
          res.writeHead(401);
          return res.end('Invalid signature');
        }

        const payload = JSON.parse(body);
        const expectedRef = `refs/heads/${app.branch}`;
        
        if (payload.ref !== expectedRef) {
          res.writeHead(200); // OK but ignored
          return res.end(`Ignored push to ${payload.ref}`);
        }

        // Trigger deployment
        DeploymentManager.deployFromGit({
          appName: app.name,
          repository: app.repository_url,
          branch: app.branch,
          startCommand: app.start_command,
          buildCommand: app.build_command,
          installCommand: app.install_command,
          runtime: app.runtime
        });

        res.writeHead(200);
        res.end('Deployment queued');
      } catch (err) {
        res.writeHead(400);
        res.end('Invalid payload');
      }
    });
  } else {
    // Return 404 for other requests, Socket.IO handles its own paths
    res.writeHead(404);
    res.end();
  }
});
const io = new Server(server, {cors: {origin: "*"}});

// Set up the deployment manager with Socket.IO server for real-time streaming
DeploymentManager.setSocketServer(io);


io.on("connection", (socket) => {
  console.log(`${socket.id}-> User connected`);

  try{
    apps(io, socket);
    caddy(io, socket);
    deploy(io, socket);
    systemctl(io, socket);
    system(io, socket);
    user(io, socket);
    
  } catch(error) {
    console.error(error);
  }

});

io.on('disconnect', (socket) => {
  console.log(`${socket.id}-> User disconnected`);
});


// Authentication middleware
io.use((socket, next) => {
  const username = socket.handshake.auth.username;
  const password = socket.handshake.auth.password;

  if (!username || !password) {
    const err = new Error("401");
    // @ts-ignore
    err.code = "auth/401";
    err.message = "Unauthorized User.";
    return next(err);
  }

  const user = dbHelpers.getUserByUsername(username) as User;

  if (!user) {
    const err = new Error("401");
    // @ts-ignore
    err.code = "auth/401";
    err.message = "Unauthorized User.";
    return next(err);
  }

  if(bcrypt.compareSync(password, user.password_hash)){
    socket.data.user = user;
    return next();
  }

  const err = new Error("401");
  // @ts-ignore
  err.code = "auth/401";
  err.message = "Unauthorized User.";

  next(err);
});



server.listen(port, () => {
  console.log(`Socket.IO server running on port ${port}`);
});

