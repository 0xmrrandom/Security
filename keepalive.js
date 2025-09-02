import express from "express";
const app = express();
app.all("/", (req, res) => res.send("Bot is alive!"));
app.listen(3000, () => console.log("KeepAlive server running on port 3000"));
