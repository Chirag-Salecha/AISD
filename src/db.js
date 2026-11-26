const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const dataDir = path.join(__dirname, "../data");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "talenthub.db"));

db.pragma("journal_mode = WAL");

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('student', 'recruiter')),
        branch TEXT
    );

    CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company TEXT NOT NULL,
        title TEXT NOT NULL,
        location TEXT NOT NULL,
        salary TEXT NOT NULL,
        eligibility TEXT NOT NULL
    );
`);

const count = db.prepare(
    "SELECT COUNT(*) AS total FROM jobs"
).get();

if (count.total === 0) {
    const insert = db.prepare(`
        INSERT INTO jobs
        (company, title, location, salary, eligibility)
        VALUES (?, ?, ?, ?, ?)
    `);

    insert.run(
        "Google", "Software Engineer",
        "Bengaluru", "8-12 LPA", "CSE / ISE"
    );

    insert.run(
        "Microsoft", "Backend Developer",
        "Hyderabad", "10-15 LPA", "CSE / ISE"
    );

    insert.run(
        "Infosys", "Full Stack Developer",
        "Pune", "4-7 LPA", "All Engineering Branches"
    );
}

// Create a recruiter account using private environment settings.
const recruiterEmail = process.env.RECRUITER_EMAIL;
const recruiterPassword = process.env.RECRUITER_PASSWORD;

if (recruiterEmail && recruiterPassword) {
    const email = recruiterEmail.trim().toLowerCase();

    const existing = db.prepare(
        "SELECT id FROM users WHERE email = ?"
    ).get(email);

    if (!existing) {
        const hash = bcrypt.hashSync(recruiterPassword, 12);

        db.prepare(`
            INSERT INTO users
            (name, email, password_hash, role, branch)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            "Demo Recruiter", email, hash, "recruiter", null
        );
    }
}

console.log("SQLite database initialized successfully");

module.exports = db;
