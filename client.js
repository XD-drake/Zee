const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

let username = "";
let targetUsername = "";
const users = new Map();

socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input.trim();
    console.log(`Welcome, ${username} to the chat`);

    socket.emit("registerPublicKey", { username, publicKey });
    rl.prompt();
  });
});

rl.on("line", (line) => {
  if (!username) return;

  const message = line.trim();
  if (!message) {
    rl.prompt();
    return;
  }

  let match;
  if ((match = message.match(/^!secret (\w+)$/))) {
    const target = match[1];
    if (!users.has(target)) {
      console.log(`User "${target}" belum terdaftar`);
    } else {
      targetUsername = target;
      console.log(`Now secretly chatting with ${targetUsername}`);
    }
  } else if (message === "!exit") {
    if (targetUsername) {
      console.log(`No more secretly chatting with ${targetUsername}`);
      targetUsername = "";
    } else {
      console.log("Kamu sedang tidak dalam mode secret");
    }
  } else if (targetUsername) {
    const encrypted = crypto.publicEncrypt(
      users.get(targetUsername),
      Buffer.from(message, "utf8")
    );
    socket.emit("message", {
      username,
      target: targetUsername,
      message: encrypted.toString("base64"),
    });
    console.log(`[secret ke ${targetUsername}] ${message}`);
  } else {
    socket.emit("message", { username, message });
  }

  rl.prompt();
});

socket.on("init", (keys) => {
  keys.forEach(([user, key]) => users.set(user, key));
  console.log(`\nThere are currently ${users.size} users in the chat`);
  rl.prompt();
});

socket.on("newUser", (data) => {
  const { username: newUsername, publicKey: newKey } = data;
  users.set(newUsername, newKey);
  console.log(`${newUsername} joined the chat`);
  rl.prompt();
});

socket.on("message", (data) => {
  const { username: sender, message, target } = data;

  if (sender === username) return;

  if (!target) {
    console.log(`${sender}: ${message}`);
  } else if (target === username) {
    try {
      const plaintext = crypto
        .privateDecrypt(privateKey, Buffer.from(message, "base64"))
        .toString("utf8");
      console.log(`[SECRET dari ${sender}] ${plaintext}`);
    } catch (err) {
      console.log(`[SECRET dari ${sender}] gagal didekripsi`);
    }
  } else {
    console.log(`${sender} (secret untuk ${target}): ${message}`);
  }

  rl.prompt();
});

socket.on("disconnect", () => {
  console.log("Server disconnected, Exiting...");
  rl.close();
  process.exit(0);
});

rl.on("SIGINT", () => {
  console.log("\nExiting...");
  socket.disconnect();
  rl.close();
  process.exit(0);
});
