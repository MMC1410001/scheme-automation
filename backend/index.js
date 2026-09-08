const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const port = process.env.PORT;

// Middleware
// More permissive CORS for development/local testing
app.use(cors());

app.use(express.json());

const setupSwagger = require("./config/swagger");
setupSwagger(app, port);

// Routes
app.use("/api", require("./routes/upload.routes"));
app.use("/api", require("./routes/bigquery.routes"));

app.get("/", (req, res) => {
  res.send("Excel to GCP Server Running");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
