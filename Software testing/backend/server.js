const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "testai",
  password: "admin123",
  port: 5432,
});

app.get("/", (req, res) => {
  res.send("AI Testing Platform Backend Running");
});

app.get("/dbtest", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).send("Database connection failed");
  }
});

app.post("/projects", async (req, res) => {
  try {
    const { name, description } = req.body;

    const result = await pool.query(
      "INSERT INTO projects (name, description) VALUES ($1, $2) RETURNING *",
      [name, description]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error creating project");
  }
});

app.get("/projects", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM projects ORDER BY id");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching projects");
  }
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});