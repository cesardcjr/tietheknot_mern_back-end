require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { rateLimit } = require("express-rate-limit");
const connectDB = require("./config/db");

const app = express();

for (const key of ["MONGO_URI", "JWT_SECRET"]) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const allowedOrigins = [
  ...(process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  "https://tietheknot-mern-front-end.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
].filter((origin, index, origins) => origins.indexOf(origin) === index);

const corsOptions = {
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  };

app.use(cors(corsOptions));

app.options("*", cors(corsOptions));

app.use(express.json({ limit: "1mb" }));
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.get("/", (req, res) =>
  res.json({ message: "TieTheKnot PH API is running" }),
);

app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many authentication attempts. Please try again later." },
  }),
  require("./routes/auth"),
);
app.use("/api/data", require("./routes/data"));
app.use("/api/invitations", require("./routes/invitations"));
app.use("/api/media", require("./routes/media"));
app.use(
  "/api/public/invitations",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many invitation requests. Please try again later." },
  }),
  require("./routes/publicInvitations"),
);

app.use((req, res) => res.status(404).json({ message: "Route not found" }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;
const start = async () => {
  await connectDB();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

start();
