require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");
const helmet = require("helmet");

if (
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32
) {
    throw new Error("Configure a strong SESSION_SECRET in .env");
}

const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmet());
app.use(express.json({ limit: "20kb" }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 1000
    }
}));

app.use(express.static(path.join(__dirname, "../public")));

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            error: "Authentication required"
        });
    }

    next();
}

function requireRole(role) {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.status(401).json({
                error: "Authentication required"
            });
        }

        if (req.session.user.role !== role) {
            return res.status(403).json({
                error: "Access denied"
            });
        }

        next();
    };
}

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        status: "success",
        message: "Talent Hub API is running"
    });
});

// Student registration
app.post("/api/auth/register", async (req, res) => {
    const { name, email, password, branch } = req.body || {};

    if (
        typeof name !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string" ||
        typeof branch !== "string" ||
        !name.trim() ||
        name.length > 80 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        password.length < 8 ||
        password.length > 72 ||
        !["CSE", "ISE", "ECE", "MECH", "CIVIL"].includes(branch)
    ) {
        return res.status(400).json({
            error: "Invalid registration details"
        });
    }

    const cleanEmail = email.trim().toLowerCase();

    try {
        const hashedPassword = await bcrypt.hash(password, 12);

        db.prepare(`
            INSERT INTO users
            (name, email, password_hash, role, branch)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            name.trim(),
            cleanEmail,
            hashedPassword,
            "student",
            branch
        );

        res.status(201).json({
            message: "Student registered successfully"
        });

    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({
                error: "Email already registered"
            });
        }

        console.error("Registration failed:", error.message);

        res.status(500).json({
            error: "Registration failed"
        });
    }
});

// Login
app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body || {};

    if (
        typeof email !== "string" ||
        typeof password !== "string"
    ) {
        return res.status(400).json({
            error: "Email and password required"
        });
    }

    const user = db.prepare(
        "SELECT * FROM users WHERE email = ?"
    ).get(email.trim().toLowerCase());

    const valid = user
        ? await bcrypt.compare(password, user.password_hash)
        : false;

    if (!valid) {
        return res.status(401).json({
            error: "Invalid email or password"
        });
    }

    req.session.regenerate((err) => {
        if (err) {
            return res.status(500).json({
                error: "Login failed"
            });
        }

        req.session.user = {
            id: user.id,
            role: user.role
        };

        res.json({
            message: "Login successful",
            name: user.name,
            role: user.role
        });
    });
});

// Get logged-in user
app.get("/api/auth/me", requireLogin, (req, res) => {
    const user = db.prepare(`
        SELECT id, name, email, role, branch
        FROM users
        WHERE id = ?
    `).get(req.session.user.id);

    if (!user) {
        return res.status(401).json({
            error: "Account unavailable"
        });
    }

    res.json(user);
});

// Logout
app.post("/api/auth/logout", requireLogin, (req, res) => {
    req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ message: "Logged out successfully" });
    });
});

// Get job listings
app.get("/api/jobs", (req, res) => {
    const jobs = db.prepare(
        "SELECT * FROM jobs ORDER BY id DESC"
    ).all();

    res.json(jobs);
});

// Only recruiters can create jobs
app.post("/api/jobs", requireRole("recruiter"), (req, res) => {
    const { company, title, location, salary, eligibility } =
        req.body || {};

    const fields = [
        company, title, location, salary, eligibility
    ];

    if (fields.some(
        value =>
            typeof value !== "string" ||
            !value.trim() ||
            value.length > 200
    )) {
        return res.status(400).json({
            error: "Invalid job details"
        });
    }

    const result = db.prepare(`
        INSERT INTO jobs
        (company, title, location, salary, eligibility)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        company.trim(),
        title.trim(),
        location.trim(),
        salary.trim(),
        eligibility.trim()
    );

    res.status(201).json({
        message: "Job created successfully",
        jobId: result.lastInsertRowid.toString()
    });
});

// Student eligibility check
app.get(
    "/api/eligibility/:jobId",
    requireRole("student"),
    (req, res) => {
        const jobId = Number(req.params.jobId);

        if (!Number.isSafeInteger(jobId) || jobId < 1) {
            return res.status(400).json({
                error: "Invalid job ID"
            });
        }

        const student = db.prepare(`
            SELECT branch FROM users
            WHERE id = ? AND role = 'student'
        `).get(req.session.user.id);

        const job = db.prepare(
            "SELECT * FROM jobs WHERE id = ?"
        ).get(jobId);

        if (!student || !job) {
            return res.status(404).json({
                error: "Student or job not found"
            });
        }

        const allowedBranches = job.eligibility
            .split("/")
            .map(branch => branch.trim());

        const eligible =
            job.eligibility === "All Engineering Branches" ||
            allowedBranches.includes(student.branch);

        res.json({
            jobId: job.id,
            eligible,
            message: eligible
                ? "You are eligible for this job"
                : "You are not eligible for this job"
        });
    }
);

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Talent Hub running on port ${PORT}`);
});
