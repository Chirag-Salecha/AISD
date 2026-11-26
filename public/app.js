

// ================================
// TALENT HUB FRONTEND
// ================================

const get = (id) => document.getElementById(id);

let currentUser = null;

// NOTIFICATION

function notify(message, error = false) {
    const box = get("notice");

    box.textContent = message;
    box.className =
        "notice " + (error ? "error" : "success");
}

// API REQUEST

async function api(url, method = "GET", body = null) {

    const response = await fetch(url, {
        method: method,
        credentials: "same-origin",
        headers: body
            ? { "Content-Type": "application/json" }
            : {},
        body: body ? JSON.stringify(body) : undefined
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.error || "Request failed"
        );
    }

    return data;
}

// OPEN LOGIN POPUP

function openLoginPopup() {

    get("loginError").textContent = "";
    get("loginPassword").value = "";

    get("loginPopup").showModal();
}

get("quickLoginBtn").addEventListener(
    "click",
    openLoginPopup
);

get("heroLoginBtn").addEventListener(
    "click",
    openLoginPopup
);

// CLOSE POPUP

get("cancelLogin").addEventListener(
    "click",
    () => get("loginPopup").close()
);

// ROLE SELECTION

get("loginRole").addEventListener(
    "change",
    function () {

        if (this.value === "recruiter") {
            get("loginEmail").value =
                "recruiter@talenthub.test";
        } else {
            get("loginEmail").value = "";
        }

        get("loginPassword").value = "";
    }
);

// LOGIN

get("quickLoginForm").addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();

        const email =
            get("loginEmail").value.trim();

        const password =
            get("loginPassword").value;

        const selectedRole =
            get("loginRole").value;

        try {

            await api(
                "/api/auth/login",
                "POST",
                { email, password }
            );

            const user =
                await api("/api/auth/me");

            if (user.role !== selectedRole) {

                await api(
                    "/api/auth/logout",
                    "POST"
                );

                throw new Error(
                    "Please select your correct account role."
                );
            }

            currentUser = user;

            get("loginPopup").close();

            get("loginPassword").value = "";

            updateDashboard();

            await loadJobs();

            notify(
                "Login successful! Welcome, " +
                user.name
            );

            get("dashboard").scrollIntoView({
                behavior: "smooth"
            });

        } catch (error) {

            get("loginError").textContent =
                error.message;
        }
    }
);

// UPDATE DASHBOARD

function updateDashboard() {

    const loggedIn = Boolean(currentUser);

    get("quickLoginBtn").hidden = loggedIn;
    get("heroLoginBtn").hidden = loggedIn;
    get("logoutBtn").hidden = !loggedIn;

    get("registerSection").hidden = loggedIn;
    get("dashboard").hidden = !loggedIn;

    get("studentPanel").hidden =
        currentUser?.role !== "student";

    get("recruiterPanel").hidden =
        currentUser?.role !== "recruiter";

    if (loggedIn) {

        get("userLabel").textContent =
            currentUser.name;

        get("dashboardTitle").textContent =
            "Welcome, " + currentUser.name;

    } else {

        get("userLabel").textContent = "Guest";
    }
}

// STUDENT REGISTRATION

get("registerForm").addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();

        const data =
            Object.fromEntries(
                new FormData(this)
            );

        try {

            await api(
                "/api/auth/register",
                "POST",
                data
            );

            notify(
                "Student registered successfully!"
            );

            this.reset();

            get("loginRole").value = "student";
            get("loginEmail").value = data.email;

            openLoginPopup();

        } catch (error) {

            notify(error.message, true);
        }
    }
);

// CREATE JOB

get("jobForm").addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();

        const data =
            Object.fromEntries(
                new FormData(this)
            );

        try {

            await api(
                "/api/jobs",
                "POST",
                data
            );

            notify(
                "Job created successfully!"
            );

            this.reset();

            await loadJobs();

        } catch (error) {

            notify(error.message, true);
        }
    }
);

// CREATE SAFE TEXT ELEMENT

function textElement(tag, text) {

    const element =
        document.createElement(tag);

    element.textContent = text;

    return element;
}

// DISPLAY JOBS

async function loadJobs() {

    const container = get("jobContainer");

    try {

        const jobs = await api("/api/jobs");

        container.replaceChildren();

        if (jobs.length === 0) {
            container.textContent =
                "No jobs available.";
            return;
        }

        jobs.forEach((job) => {

            const card =
                document.createElement("article");

            card.className = "card";

            card.appendChild(
                textElement("h3", job.title)
            );

            [
                "Company: " + job.company,
                "Location: " + job.location,
                "Salary: " + job.salary,
                "Eligibility: " + job.eligibility
            ].forEach((detail) => {

                card.appendChild(
                    textElement("p", detail)
                );
            });

            // STUDENT ELIGIBILITY BUTTON

            if (currentUser?.role === "student") {

                const button =
                    document.createElement("button");

                button.className = "btn";

                button.textContent =
                    "Check Eligibility";

                const result =
                    document.createElement("p");

                result.className =
                    "eligibility-result";

                result.hidden = true;

                button.addEventListener(
                    "click",
                    async () => {

                        button.disabled = true;

                        try {

                            const answer = await api(
                                "/api/eligibility/" + job.id
                            );

                            result.textContent =
                                answer.message;

                        } catch (error) {

                            result.textContent =
                                error.message;

                        } finally {

                            result.hidden = false;
                            button.disabled = false;
                        }
                    }
                );

                card.appendChild(button);
                card.appendChild(result);
            }

            container.appendChild(card);
        });

    } catch (error) {

        container.textContent =
            "Unable to load jobs.";

        notify(error.message, true);
    }
}

// LOGOUT

get("logoutBtn").addEventListener(
    "click",
    async function () {

        try {

            await api(
                "/api/auth/logout",
                "POST"
            );

            currentUser = null;

            updateDashboard();

            await loadJobs();

            notify(
                "Logged out successfully."
            );

            window.location.hash = "#home";

        } catch (error) {

            notify(error.message, true);
        }
    }
);

// REFRESH JOBS

get("refreshBtn").addEventListener(
    "click",
    loadJobs
);

// INITIALIZE APPLICATION

async function initializeApp() {

    try {

        currentUser =
            await api("/api/auth/me");

    } catch {

        currentUser = null;
    }

    updateDashboard();

    await loadJobs();
}

initializeApp();

