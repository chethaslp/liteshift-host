import { createServer, IncomingMessage, ServerResponse } from "http";
import "dotenv/config";
import bcrypt from "bcryptjs";

import { Server } from "socket.io";
import { dbHelpers } from "./lib/db";
import { User } from "./lib/models";

const port = parseInt(process.env.PORT || "3000", 10);
const server = createServer();
const io = new Server(server, {cors: {origin: "*"}});


io.on("connection", (socket) => {
  console.log(`${socket.id}-> User connected`);

  try{
    
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

