

// =========================================================
// DRISHTI - FLOOD DISASTER SIMULATOR
// Backend + Dataset + Virtual Sensor
// =========================================================

const API_BASE = "https://drishti-backend.onrender.com/api";

let rows = [];
let currentIndex = 0;
let localIndex = 0;

let role = "admin";

let timer = null;
let backendConnected = false;
let backendRecordCount = 0;
let currentSensorData = null;
let readingInProgress = false;

let audioContext = null;

// STEP 11E: Session alert history
let alertHistory = [];

// =========================================================
// DEMO SMS DELIVERY SIMULATION
// This is a UI simulation for the hackathon demo. It does not
// send a real SMS. Change this number to the demo user's number.
// =========================================================
const DRISHTI_DEMO_USER_NUMBER =
    localStorage.getItem("drishti_demo_user_number") ||
    "+91 XXXXX 4582";

let lastSmsSimulationAlertId = null;

const $ = id => document.getElementById(id);


// =========================================================
// DATASET COLUMNS
// =========================================================

const columns = {
    lat: "Latitude",
    lon: "Longitude",
    rain: "Rainfall (mm)",
    temp: "Temperature (°C)",
    hum: "Humidity (%)",
    river: "River Discharge (m³/s)",
    water: "Water Level (m)",
    elev: "Elevation (m)",
    land: "Land Cover",
    soil: "Soil Type",
    pop: "Population Density",
    infra: "Infrastructure",
    hist: "Historical Floods",
    target: "Flood Occurred"
};


// =========================================================
// NUMBER HELPER
// =========================================================

function n(value) {

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : 0;
}


// =========================================================
// CSV PARSER
// =========================================================

function parseCSV(text) {

    const output = [];

    let row = [];
    let cell = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {

        const c = text[i];
        const next = text[i + 1];

        if (c === '"') {

            if (quoted && next === '"') {

                cell += '"';
                i++;

            } else {

                quoted = !quoted;

            }

        } else if (c === "," && !quoted) {

            row.push(cell);
            cell = "";

        } else if (
            (c === "\n" || c === "\r") &&
            !quoted
        ) {

            if (c === "\r" && next === "\n") {
                i++;
            }

            row.push(cell);

            if (
                row.some(
                    value => value.trim() !== ""
                )
            ) {
                output.push(row);
            }

            row = [];
            cell = "";

        } else {

            cell += c;

        }
    }

    if (cell !== "" || row.length) {

        row.push(cell);

        if (
            row.some(
                value => value.trim() !== ""
            )
        ) {
            output.push(row);
        }
    }

    return output;
}


function toObjects(text) {

    const parsed = parseCSV(text);

    if (!parsed.length) {
        return [];
    }

    const headers = parsed.shift();

    return parsed.map(row => {

        const object = {};

        headers.forEach((header, index) => {

            object[header] =
                (row[index] ?? "").trim();

        });

        return object;
    });
}


// =========================================================
// LOCAL RISK ENGINE
// Used for existing dashboard/table/map.
// Backend risk is used for virtual sensor.
// =========================================================

function risk(row) {

    if (!row) {

        return {
            score: 0,
            level: "LOW",
            target: 0
        };
    }

    let score = 0;

    const rain = n(row[columns.rain]);
    const water = n(row[columns.water]);
    const river = n(row[columns.river]);
    const hist = n(row[columns.hist]);

    const target = n(row[columns.target]);


    // Rainfall

    if (rain >= 180) {
        score += 30;
    } else if (rain >= 120) {
        score += 22;
    } else if (rain >= 70) {
        score += 12;
    }


    // Water level

    if (water >= 8) {
        score += 30;
    } else if (water >= 5) {
        score += 20;
    } else if (water >= 3) {
        score += 10;
    }


    // River discharge

    if (river >= 4000) {
        score += 25;
    } else if (river >= 2500) {
        score += 15;
    } else if (river >= 1200) {
        score += 8;
    }


    // Historical floods

    if (hist >= 2) {
        score += 15;
    } else if (hist >= 1) {
        score += 8;
    }


    let level = "LOW";

    if (score >= 70) {
        level = "CRITICAL";
    } else if (score >= 50) {
        level = "HIGH";
    } else if (score >= 30) {
        level = "MEDIUM";
    }

    return {
        score,
        level,
        target
    };
}


// =========================================================
// BADGE
// =========================================================

function badge(level) {

    return `
        <span class="badge ${String(level).toLowerCase()}">
            ${level}
        </span>
    `;
}


// =========================================================
// BACKEND CONNECTION
// =========================================================

async function checkBackendConnection() {

    try {

        const response =
            await fetch(`${API_BASE}/summary`);

        if (!response.ok) {

            throw new Error(
                `Backend HTTP ${response.status}`
            );
        }

        const data =
            await response.json();

        backendConnected = true;

        backendRecordCount =
            Number(data.records) || 0;

        console.log(
            "✅ DRISHTI Backend Connected"
        );

        console.log(
            "📊 Total Records:",
            backendRecordCount
        );

        return data;

    } catch (error) {

        backendConnected = false;

        console.error(
            "❌ Backend Connection Failed:",
            error
        );

        return null;
    }
}


// =========================================================
// GET SENSOR FROM FLASK
// =========================================================

async function getSensorReading(index) {

    if (!backendConnected) {

        console.warn(
            "⚠️ Backend is offline."
        );

        return null;
    }

    try {

        const response =
            await fetch(
                `${API_BASE}/sensor/${index}`
            );

        if (!response.ok) {

            throw new Error(
                `Sensor API HTTP ${response.status}`
            );
        }

        const data =
            await response.json();

        console.log(
            "📡 Sensor Reading:",
            data
        );

        return data;

    } catch (error) {

        console.error(
            "❌ Sensor Error:",
            error
        );

        alert(
            "Virtual sensor data backend se nahi mil raha.\n\n" +
            "Check karo Flask server running hai."
        );

        return null;
    }
}


// =========================================================
// PAGE NAVIGATION
// =========================================================

function setPage(id, title) {

    document
        .querySelectorAll(".page")
        .forEach(page => {

            page.classList.add("hidden");

        });


    const page = $(id);

    if (page) {
        page.classList.remove("hidden");
    }


    if ($("pageTitle")) {

        $("pageTitle").textContent =
            title;
    }


    document
        .querySelectorAll(".nav")
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.page ===
                id.replace("page-", "")
            );

        });
}


// =========================================================
// NAVIGATION
// =========================================================

function setupNav() {

    document
        .querySelectorAll(".nav[data-page]")
        .forEach(button => {

            button.onclick = () => {

                const page =
                    button.dataset.page;

                if (role === "admin") {

                    adminPage(page);

                } else {

                    userPage(page);

                }
            };
        });
}


// =========================================================
// ADMIN PAGES
// =========================================================

function adminPage(page) {

    const map = {

        overview: [
            "page-overview",
            "Flood Intelligence Dashboard"
        ],

        disasters: [
            "page-disasters",
            "Flood Dataset Monitoring"
        ],

        datasets: [
            "page-datasets",
            "Dataset Center"
        ],

        sensors: [
            "page-sensors",
            "Virtual Sensor Simulation"
        ],

        prediction: [
            "page-prediction",
            "Flood Risk Assessment"
        ],

        map: [
            "page-map",
            "Flood Risk Map"
        ],

        volunteers: [
            "page-volunteers",
            "Volunteer Network — Command Center"
        ]
    };

    if (!map[page]) return;

    setPage(
        map[page][0],
        map[page][1]
    );

    // Live weather is shown and monitored only on Virtual Sensors.
    if ($("liveWeatherWarning")) {
        $("liveWeatherWarning").classList.toggle("hidden", page !== "sensors");
    }

    if (page === "sensors") {
        startLiveWeatherMonitoring();
    } else {
        stopLiveWeatherMonitoring();
    }
}


// =========================================================
// USER PAGES
// =========================================================

// REPLACE ONLY YOUR CURRENT userPage() FUNCTION WITH T

// STEP 8 ROOT FIX
// Replace ONLY your current userPage(page) function with this:

function userPage(page) {

    const map = {

        userHome: [
            "page-userHome",
            "My Local Flood Dashboard"
        ],

        userAlerts: [
            "page-userAlerts",
            "My Flood Alerts"
        ],

        safe: [
            "page-safe",
            "Safe Spots"
        ],

        help: [
            "page-help",
            "Emergency Help"
        ],

        userVolunteers: [
            "page-userVolunteers",
            "Volunteer Network"
        ]

    };

    if (!map[page]) return;

    // IMPORTANT FIX:
    // The whole userPages section is hidden by default in index.html.
    // We must show it when entering a user page.
    if ($("adminPages")) {
        $("adminPages").classList.add("hidden");
    }

    if ($("userPages")) {
        $("userPages").classList.remove("hidden");
    }

    // Weather monitoring is an admin Virtual Sensors feature.
    if ($("liveWeatherWarning")) {
        $("liveWeatherWarning").classList.add("hidden");
    }
    stopLiveWeatherMonitoring();

    setPage(
        map[page][0],
        map[page][1]
    );

    // Render the selected page after it becomes visible.
    if (page === "safe") {
        renderSafe();
    }

    if (page === "help") {
        renderHelp();
    }

    if (page === "userHome") {
        renderUserHome();
    }

    if (page === "userAlerts") {
        renderUserAlerts();
    }

    if (page === "userVolunteers") {
        renderCitizenVolunteerNetwork();
    }
}




// =========================================================
// VOLUNTEER NETWORK — API + ADMIN/CITIZEN UI
// Prototype only: local JSON storage; no real dispatch/SMS.
// =========================================================

const VOLUNTEER_API = `${API_BASE}`;
const VOLUNTEER_ID_KEY = "drishti_current_volunteer_id";

function volunteerEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[character]));
}

async function volunteerApi(path, options = {}) {
    const response = await fetch(`${VOLUNTEER_API}${path}`, {
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        }
    });

    let data = {};
    try {
        data = await response.json();
    } catch (_) {
        data = {};
    }

    if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
}

function volunteerStatusLabel(status) {
    return ({
        ASSIGNED: "Assigned",
        ACCEPTED: "Accepted",
        ON_THE_WAY: "On the Way",
        COMPLETED: "Completed"
    })[status] || status || "Unknown";
}

function volunteerStatusClass(status) {
    return String(status || "assigned").toLowerCase().replace(/[^a-z_]/g, "");
}

async function renderVolunteerAdmin() {
    const root = $("page-volunteers");
    if (!root) return;

    root.innerHTML = `
      <div class="grid">
        <div class="card">
          <div class="label">VOLUNTEER OPERATIONS</div>
          <div class="value">Volunteer Network</div>
          <p class="muted">Register volunteers, publish area-specific alerts, and assign support tasks.</p>
          <p class="muted">Prototype only — verify all emergency actions with official responders.</p>
        </div>
      </div>

      <div class="section card">
        <h2>🚨 Create Rescue Incident (Admin)</h2>
        <p class="muted">Publish a specific incident. It will appear on the Volunteer Rescue Board so nearby volunteers can self-assign.</p>
        <form id="adminRescueCreateForm" class="controls">
          <label>Incident title<input name="title" required maxlength="180" placeholder="People stranded near bridge"></label>
          <label>Area / landmark<input name="area" required maxlength="200" placeholder="Exact locality / landmark"></label>
          <label>People affected<input name="people_count" type="number" min="1" max="10000" value="1" required></label>
          <label>Severity<select name="severity"><option>CRITICAL</option><option selected>HIGH</option><option>MEDIUM</option><option>LOW</option></select></label>
          <label>Latitude (needed for 5 km / map)<input name="latitude" placeholder="e.g. 30.3165"></label>
          <label>Longitude (needed for 5 km / map)<input name="longitude" placeholder="e.g. 78.0322"></label>
          <label>Reporter / contact (optional)<input name="contact" maxlength="100" placeholder="Phone or contact details"></label>
          <label>What help is needed?<textarea name="details" required maxlength="2000" rows="3" placeholder="Describe the situation and immediate needs"></textarea></label>
          <button class="btn primary" type="submit">Publish Rescue Incident</button>
        </form>
        <p id="adminRescueCreateMessage" class="muted" aria-live="polite"></p>
      </div>

      <div class="section two">
        <div class="card">
          <h2>📣 Publish Area Alert</h2>
          <form id="volunteerAlertForm" class="controls">
            <label>Area / locality<input name="area" required maxlength="150" placeholder="e.g. Rajpur Road"></label>
            <label>Alert title<input name="title" required maxlength="180" placeholder="Flood assistance needed"></label>
            <label>Hazard type
              <select name="hazard_type">
                <option>Flood</option><option>Waterlogging</option><option>Landslide</option><option>Evacuation Support</option><option>Relief Distribution</option>
              </select>
            </label>
            <label>Help required<input name="required_help" maxlength="500" placeholder="First aid, supplies, evacuation support"></label>
            <label>Instructions<textarea name="instructions" rows="3" maxlength="2000" placeholder="Safe meeting point and instructions"></textarea></label>
            <button class="btn primary" type="submit">Publish Alert</button>
          </form>
          <p id="volunteerAlertMessage" class="muted" aria-live="polite"></p>
        </div>

        <div class="card">
          <h2>🧭 Assign a Volunteer</h2>
          <form id="volunteerAssignForm" class="controls">
            <label>Volunteer
              <select id="volunteerAssignPerson" name="volunteer_id" required>
                <option value="">Loading volunteers…</option>
              </select>
            </label>
            <label>Area alert
              <select id="volunteerAssignAlert" name="alert_id" required>
                <option value="">Loading alerts…</option>
              </select>
            </label>
            <label>Rescue / coordination team<input name="rescue_team" maxlength="150" placeholder="e.g. Team Alpha"></label>
            <label>Task instructions (optional)<textarea name="instructions" rows="3" maxlength="2000" placeholder="Specific task instructions"></textarea></label>
            <button class="btn primary" type="submit">Assign Task</button>
          </form>
          <p id="volunteerAssignMessage" class="muted" aria-live="polite"></p>
        </div>
      </div>

      <div class="section two">
        <div class="card">
          <div class="controls" style="justify-content:space-between;align-items:center">
            <h2>👥 Volunteer Directory</h2>
            <button class="btn" type="button" onclick="renderVolunteerAdmin()">Refresh</button>
          </div>
          <div id="volunteerDirectoryList" class="muted">Loading directory…</div>
        </div>
        <div class="card">
          <div class="controls" style="justify-content:space-between;align-items:center">
            <h2>🚨 Published Area Alerts</h2>
            <button class="btn" type="button" onclick="renderVolunteerAdmin()">Refresh</button>
          </div>
          <div id="volunteerAlertList" class="muted">Loading alerts…</div>
        </div>
      </div>

      <div class="section card">
        <div class="controls" style="justify-content:space-between;align-items:center">
          <h2>🆘 Stranded People / Rescue Reports</h2>
          <button class="btn" type="button" onclick="renderVolunteerAdmin()">Refresh reports</button>
        </div>
        <div id="adminRescueReports" class="muted">Loading rescue reports…</div>
      </div>

      <div class="section card">
        <div class="controls" style="justify-content:space-between;align-items:center">
          <h2>📋 Assigned Tasks & Status</h2>
          <button class="btn" type="button" onclick="renderVolunteerAdmin()">Refresh tasks</button>
        </div>
        <div id="volunteerTaskList" class="muted">Loading assignments…</div>
      </div>
    `;

    const incidentForm = $("adminRescueCreateForm");
    if (incidentForm) incidentForm.onsubmit = async event => {
      event.preventDefault();
      const message = $("adminRescueCreateMessage");
      const payload = Object.fromEntries(new FormData(incidentForm).entries());
      payload.people_count = Number(payload.people_count || 1);
      message.textContent = "Publishing rescue incident…";
      try {
        await volunteerApi("/rescue-reports", {method:"POST", body:JSON.stringify(payload)});
        incidentForm.reset();
        message.textContent = "Incident published. It is now visible to volunteers.";
        await renderVolunteerAdmin();
      } catch (error) { message.textContent = `Could not publish incident: ${error.message}`; }
    };

    const alertForm = $("volunteerAlertForm");
    if (alertForm) {
        alertForm.onsubmit = async event => {
            event.preventDefault();
            const message = $("volunteerAlertMessage");
            message.textContent = "Publishing alert…";
            const form = new FormData(alertForm);
            const payload = Object.fromEntries(form.entries());
            try {
                await volunteerApi("/volunteer-alerts", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });
                alertForm.reset();
                message.textContent = "Area alert published.";
                await renderVolunteerAdmin();
            } catch (error) {
                message.textContent = `Could not publish alert: ${error.message}`;
            }
        };
    }

    const assignForm = $("volunteerAssignForm");
    if (assignForm) {
        assignForm.onsubmit = async event => {
            event.preventDefault();
            const message = $("volunteerAssignMessage");
            message.textContent = "Assigning task…";
            const payload = Object.fromEntries(new FormData(assignForm).entries());
            try {
                await volunteerApi("/volunteer-assignments", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });
                assignForm.reset();
                message.textContent = "Task assigned successfully.";
                await renderVolunteerAdmin();
            } catch (error) {
                message.textContent = `Could not assign task: ${error.message}`;
            }
        };
    }

    try {
        const [volunteerData, alertData, taskData, rescueData, citizenReportData] = await Promise.all([
            volunteerApi("/volunteers"),
            volunteerApi("/volunteer-alerts"),
            volunteerApi("/volunteer-assignments"),
            volunteerApi("/rescue-reports"),
            volunteerApi("/reports")
        ]);

        const volunteers = volunteerData.volunteers || [];
        const alerts = alertData.alerts || [];
        const tasks = taskData.assignments || [];

        const personSelect = $("volunteerAssignPerson");
        if (personSelect) {
            personSelect.innerHTML = `<option value="">Select volunteer</option>` +
                volunteers.map(v => `<option value="${volunteerEscape(v.id)}">${volunteerEscape(v.name)} — ${volunteerEscape(v.area)}</option>`).join("");
        }

        const alertSelect = $("volunteerAssignAlert");
        if (alertSelect) {
            alertSelect.innerHTML = `<option value="">Select area alert</option>` +
                alerts.map(a => `<option value="${volunteerEscape(a.id)}">${volunteerEscape(a.title)} — ${volunteerEscape(a.area)}</option>`).join("");
        }

        const directory = $("volunteerDirectoryList");
        if (directory) {
            directory.innerHTML = volunteers.length ? volunteers.map(v => `
              <div class="section" style="border-bottom:1px solid rgba(148,163,184,.2);padding:10px 0">
                <strong>${volunteerEscape(v.name)}</strong>
                <div class="muted">${volunteerEscape(v.area)} · ${volunteerEscape(v.availability || "Availability not specified")}</div>
                <div>Contact: ${volunteerEscape(v.contact)}</div>
                <div class="muted">Skills: ${volunteerEscape((v.skills || []).join(", ") || "Not specified")}</div>
              </div>`).join("") : `<p>No volunteers registered yet.</p>`;
        }

        const alertList = $("volunteerAlertList");
        if (alertList) {
            alertList.innerHTML = alerts.length ? alerts.slice().reverse().map(a => `
              <div class="section" style="border-bottom:1px solid rgba(148,163,184,.2);padding:10px 0">
                <strong>${volunteerEscape(a.title)}</strong>
                <div class="muted">${volunteerEscape(a.area)} · ${volunteerEscape(a.hazard_type)}</div>
                <div>${volunteerEscape(a.required_help || "Support requested not specified")}</div>
                <p class="muted">${volunteerEscape(a.instructions || "")}</p>
              </div>`).join("") : `<p>No area alerts published yet.</p>`;
        }

        const adminRescueRoot = $("adminRescueReports");
        const rescueReports = rescueData.reports || [];
        if (adminRescueRoot) {
            adminRescueRoot.innerHTML = rescueReports.length ? rescueReports.slice().reverse().map(report => `
              <div class="section" style="border-bottom:1px solid rgba(148,163,184,.2);padding:12px 0">
                <strong>${volunteerEscape(report.area)}</strong>
                <div class="muted">${volunteerEscape(report.severity)} · ${volunteerEscape(report.people_count)} people · ${volunteerEscape(report.status.replaceAll("_", " "))}</div>
                <p>${volunteerEscape(report.details)}</p>
                ${report.latitude && report.longitude ? `<div class="muted">GPS: ${volunteerEscape(report.latitude)}, ${volunteerEscape(report.longitude)}</div>` : ""}
                ${report.contact ? `<div class="muted">Contact: ${volunteerEscape(report.contact)}</div>` : ""}
                ${report.accepted_by ? `<p>Accepted by: ${volunteerEscape(report.accepted_by)}</p>` : ""}
              </div>`).join("") : `<p>No rescue reports submitted yet.</p>`;
        }

        if (adminRescueRoot) {
            const citizenReports = (citizenReportData.reports || []).filter(r => !["RESOLVED", "CLOSED"].includes(String(r.status || "").toUpperCase()));
            if (citizenReports.length) {
                adminRescueRoot.innerHTML += `<h3>🆘 Citizen-submitted reports</h3>` + citizenReports.map(r => `<div class="section" style="border:1px solid rgba(148,163,184,.25);border-radius:12px;padding:12px;margin:10px 0"><strong>${volunteerEscape(r.title || r.hazard_type)}</strong><div class="muted">${volunteerEscape(r.location_text)} · ${volunteerEscape(r.status)} · ${volunteerEscape(r.created_at)}</div><p>${volunteerEscape(r.description)}</p>${r.photo_url ? `<a href="${volunteerEscape(r.photo_url)}" target="_blank" rel="noopener">View photo</a>` : ""}<div class="controls">${r.latitude != null && r.longitude != null ? `<button class="btn primary" type="button" onclick="analyzeVolunteerSafeRoute('${volunteerEscape(r.id)}','${volunteerEscape(r.latitude)}','${volunteerEscape(r.longitude)}','${volunteerEscape(r.location_text)}')">🧭 AI Safe Route Analysis</button>` : `<span class="muted">GPS missing; ask reporter for coordinates before routing.</span>`}<button class="btn" type="button" onclick="openReportCommunication('${volunteerEscape(r.id)}','citizen')">💬 Open communication</button></div></div>`).join("");
            }
        }

        const taskList = $("volunteerTaskList");
        if (taskList) {
            taskList.innerHTML = tasks.length ? tasks.slice().reverse().map(task => `
              <div class="section" style="border-bottom:1px solid rgba(148,163,184,.2);padding:12px 0">
                <strong>${volunteerEscape(task.alert_title)}</strong>
                <div class="muted">${volunteerEscape(task.volunteer_name)} · ${volunteerEscape(task.area)} · ${volunteerEscape(task.rescue_team || "No team specified")}</div>
                <p>${volunteerEscape(task.instructions || task.required_help || "")}</p>
                <div class="controls" style="align-items:center">
                  <span class="badge">${volunteerEscape(volunteerStatusLabel(task.status))}</span>
                  <label>Update status
                    <select onchange="updateVolunteerTaskStatus('${volunteerEscape(task.id)}', this.value)">
                      ${["ASSIGNED","ACCEPTED","ON_THE_WAY","COMPLETED"].map(status => `<option value="${status}" ${task.status === status ? "selected" : ""}>${volunteerStatusLabel(status)}</option>`).join("")}
                    </select>
                  </label>
                </div>
              </div>`).join("") : `<p>No volunteer tasks assigned yet.</p>`;
        }
    } catch (error) {
        const message = `<p>Volunteer API unavailable: ${volunteerEscape(error.message)}. Confirm Flask is running on port 5000.</p>`;
        ["volunteerDirectoryList", "volunteerAlertList", "volunteerTaskList", "adminRescueReports"].forEach(id => {
            if ($(id)) $(id).innerHTML = message;
        });
    }
}

async function updateVolunteerTaskStatus(taskId, status) {
    try {
        await volunteerApi(`/volunteer-assignments/${encodeURIComponent(taskId)}`, {
            method: "PATCH",
            body: JSON.stringify({ status })
        });
        await renderVolunteerAdmin();
    } catch (error) {
        alert(`Could not update task status: ${error.message}`);
        await renderVolunteerAdmin();
    }
}

async function renderCitizenVolunteerNetwork() {
    const root = $("page-userVolunteers");
    if (!root) return;
    root.innerHTML = `
      <div class="card">
        <h2>🤝 Volunteer Rescue Board</h2>
        <p class="muted">No formal registration or account needed. Save a quick volunteer profile once, then use “I can help” on any active incident. Your details stay in this browser and are sent only when you accept a rescue request.</p>
        <div class="section two">
          <label>Your name<input id="activeVolunteerName" maxlength="100" placeholder="Your name"></label>
          <label>Phone / WhatsApp<input id="activeVolunteerContact" maxlength="100" placeholder="Contact number"></label>
        </div>
        <div class="controls">
          <button class="btn primary" type="button" onclick="saveVolunteerQuickProfile()">🤝 Become a Volunteer</button>
          <button class="btn" type="button" onclick="captureVolunteerLocation()">📍 Use my location</button>
          <span id="volunteerLocationLabel" class="muted">Location not shared</span>
          <button class="btn" type="button" onclick="renderCitizenVolunteerNetwork()">↻ Refresh reports</button>
        </div>
        <p id="quickVolunteerProfileMessage" class="muted" aria-live="polite">You can help without formal registration.</p>
      </div>
      <div class="card">
        <h2>🆘 People needing help</h2>
        <div id="citizenRescueReports">Loading reports…</div>
      </div>
      <div class="card">
        <h2>💬 Rescue communication</h2>
        <p class="muted">Open a report’s messages to coordinate with the person who reported the emergency. Keep messages short and share only necessary contact details.</p>
        <div id="volunteerReportMessages">Select “Open communication” on a report.</div>
      </div>
      <div class="card"><h2>📋 Assigned Tasks & Status</h2><div id="citizenVolunteerTasks">Admin-assigned tasks are shown in the task panel.</div></div>`;

    // Quick volunteer profile: no registration endpoint or account is required.
    try {
        const savedProfile = JSON.parse(localStorage.getItem("drishti_quick_volunteer_profile") || "null");
        if (savedProfile) {
            if ($("activeVolunteerName")) $("activeVolunteerName").value = savedProfile.name || "";
            if ($("activeVolunteerContact")) $("activeVolunteerContact").value = savedProfile.contact || "";
            if ($("quickVolunteerProfileMessage")) $("quickVolunteerProfileMessage").textContent = "Volunteer profile ready — you can accept a nearby rescue request.";
        }
    } catch (_) {}
    [$("activeVolunteerName"), $("activeVolunteerContact")].filter(Boolean).forEach(input => {
        input.addEventListener("change", () => {
            const name = ($("activeVolunteerName")?.value || "").trim();
            const contact = ($("activeVolunteerContact")?.value || "").trim();
            if (name && contact) localStorage.setItem("drishti_quick_volunteer_profile", JSON.stringify({name, contact}));
        });
    });

    const currentLocation = window.drishtiVolunteerLocation || null;
    if (currentLocation && $("volunteerLocationLabel")) $("volunteerLocationLabel").textContent = `GPS ready: ${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)}`;

    try {
        const [citizenData, rescueData, alertData] = await Promise.all([
            volunteerApi("/reports"), volunteerApi("/rescue-reports"), volunteerApi("/volunteer-alerts")
        ]);
        const citizenReports = (citizenData.reports || []).filter(r => !["RESOLVED", "CLOSED"].includes(String(r.status || "").toUpperCase()));
        const rescueReports = (rescueData.reports || []).filter(r => !["RESOLVED", "CLOSED"].includes(String(r.status || "").toUpperCase()));
        const merged = [
          ...citizenReports.map(r => ({...r, source: "citizen", displayArea: r.location_text || "Location not specified", displayTitle: r.title || r.hazard_type || "Citizen emergency", displayDetails: r.description || "", displayPeople: r.people_count || "Not specified", displaySeverity: r.severity || (r.hazard_type === "Flood" ? "HIGH" : "MEDIUM")})),
          ...rescueReports.map(r => ({...r, source: "rescue", displayArea: r.area || "Location not specified", displayTitle: r.title || r.hazard_type || "Rescue request", displayDetails: r.details || "", displayPeople: r.people_count || 1, displaySeverity: r.severity || "HIGH"}))
        ];
        const rootReports = $("citizenRescueReports");
        if (rootReports) {
          rootReports.innerHTML = merged.length ? merged.map(r => {
            const lat = r.latitude ?? r.lat, lon = r.longitude ?? r.lon;
            let distanceText = "Distance unknown — location coordinates unavailable";
            let outsideRadius = false;
            if (currentLocation && lat != null && lon != null && lat !== "" && lon !== "") {
              const rad = n => Number(n) * Math.PI / 180;
              const dLat = rad(Number(lat) - currentLocation.latitude), dLon = rad(Number(lon) - currentLocation.longitude);
              const a = Math.sin(dLat/2)**2 + Math.cos(rad(currentLocation.latitude))*Math.cos(rad(Number(lat)))*Math.sin(dLon/2)**2;
              const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              distanceText = `${km.toFixed(1)} km away`;
              outsideRadius = km > 5;
            }
            const severity = String(r.displaySeverity || "MEDIUM").toUpperCase();
            const status = String(r.status || "NEW").toUpperCase();
            const escapedId = volunteerEscape(r.id);
            const mapLink = lat != null && lon != null && lat !== "" && lon !== "" ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lat + "," + lon)}&travelmode=driving` : "";
            const accepted = Boolean(r.volunteer_name || r.accepted_by);
            return `<div class="section" style="border:1px solid rgba(148,163,184,.25);border-radius:12px;padding:14px;margin:12px 0">
              <div class="controls" style="justify-content:space-between;align-items:center"><strong>🆘 ${volunteerEscape(r.displayTitle)}</strong><span class="badge ${severity === "CRITICAL" ? "high" : "medium"}">${volunteerEscape(severity)}</span></div>
              <p><strong>📍 Area:</strong> ${volunteerEscape(r.displayArea)}</p>
              <p>${volunteerEscape(r.displayDetails)}</p>
              <div class="muted">People affected: ${volunteerEscape(r.displayPeople)} · Status: ${volunteerEscape(status.replaceAll("_", " "))} · ${volunteerEscape(distanceText)}</div>
              ${r.created_at ? `<small class="muted">Reported: ${volunteerEscape(r.created_at)}</small>` : ""}
              ${r.photo_url ? `<p><a href="${volunteerEscape(r.photo_url)}" target="_blank" rel="noopener">📷 View incident photo</a></p>` : ""}
              ${r.contact ? `<p>Reporter contact: <a href="tel:${volunteerEscape(r.contact)}">${volunteerEscape(r.contact)}</a></p>` : ""}
              ${accepted ? `<p>🤝 Volunteer responding: <strong>${volunteerEscape(r.volunteer_name || r.accepted_by)}</strong>${r.volunteer_contact ? ` · <a href="tel:${volunteerEscape(r.volunteer_contact)}">Contact volunteer</a>` : ""}</p>` : ""}
              <div class="controls">
                ${!accepted ? `<button class="btn primary" type="button" onclick="selfAssignReport('${escapedId}','${volunteerEscape(r.source)}')" ${outsideRadius ? "disabled title=\"This report is over 5 km away\"" : ""}>I can help</button>` : ""}
                ${mapLink ? `<button class="btn" type="button" onclick="analyzeVolunteerSafeRoute('${escapedId}','${volunteerEscape(lat)}','${volunteerEscape(lon)}','${volunteerEscape(r.displayArea)}')">🧭 AI Safe Route Analysis</button>` : `<span class="muted">Add GPS coordinates to enable map routing.</span>`}
                <button class="btn" type="button" onclick="openReportCommunication('${escapedId}','${volunteerEscape(r.source)}')">💬 Open communication</button>
                ${r.source === "citizen" ? `<button class="btn" type="button" onclick="markCitizenReportResolved('${escapedId}')">Mark resolved</button>` : `<button class="btn" type="button" onclick="resolveRescueReport('${escapedId}')">Mark resolved</button>`}
              </div>
            </div>`;
          }).join("") : `<p>No active reports right now. New citizen reports will appear here automatically.</p>`;
        }
        const alertsRoot = $("citizenVolunteerAlerts");
        if (alertsRoot) alertsRoot.innerHTML = (alertData.alerts || []).map(a => `<p><strong>${volunteerEscape(a.title)}</strong> — ${volunteerEscape(a.area)}</p>`).join("") || "No area alerts right now.";
    } catch (error) {
        const msg = `<p>Could not load reports: ${volunteerEscape(error.message)}. Confirm Flask is running on port 5000.</p>`;
        if ($("citizenRescueReports")) $("citizenRescueReports").innerHTML = msg;
    }
}

function saveVolunteerQuickProfile() {
    const name = ($("activeVolunteerName")?.value || "").trim();
    const contact = ($("activeVolunteerContact")?.value || "").trim();
    if (!name) return alert("Please enter your name.");
    if (!contact) return alert("Please enter a phone number or WhatsApp contact so the rescue team can coordinate.");
    localStorage.setItem("drishti_quick_volunteer_profile", JSON.stringify({name, contact}));
    const message = $("quickVolunteerProfileMessage");
    if (message) message.textContent = `You're ready to help, ${name}. Choose “I can help” on an active report.`;
    renderCitizenVolunteerNetwork();
}

async function captureVolunteerLocation() {
    if (!navigator.geolocation) return alert("GPS is not available in this browser.");
    navigator.geolocation.getCurrentPosition(position => {
        window.drishtiVolunteerLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        if ($("volunteerLocationLabel")) $("volunteerLocationLabel").textContent = `GPS ready: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
        renderCitizenVolunteerNetwork();
    }, error => alert(`Could not get location: ${error.message}. You can still view reports, but 5 km distance cannot be verified.`), {enableHighAccuracy:true, timeout:10000});
}

async function selfAssignReport(reportId, source) {
    const name = ($("activeVolunteerName")?.value || "").trim();
    const contact = ($("activeVolunteerContact")?.value || "").trim();
    if (!name || !contact) return alert("Tap “Become a Volunteer” first and enter your name and contact. No account or formal registration is needed.");
    const loc = window.drishtiVolunteerLocation || {};
    try {
      if (source === "rescue") {
        await volunteerApi(`/rescue-reports/${encodeURIComponent(reportId)}`, {method:"PATCH", body:JSON.stringify({action:"ACCEPT", volunteer_name:name, volunteer_contact:contact})});
      } else {
        await volunteerApi(`/reports/${encodeURIComponent(reportId)}`, {method:"PATCH", body:JSON.stringify({action:"ACCEPT", volunteer_name:name, volunteer_contact:contact, volunteer_latitude:loc.latitude, volunteer_longitude:loc.longitude})});
      }
      alert("You are now marked as responding. Use Open communication to coordinate.");
      await renderCitizenVolunteerNetwork();
    } catch (error) { alert(`Could not accept report: ${error.message}`); }
}

async function markCitizenReportResolved(reportId) {
    if (!confirm("Only mark resolved after confirming people have received help. Continue?")) return;
    try { await volunteerApi(`/reports/${encodeURIComponent(reportId)}`, {method:"PATCH", body:JSON.stringify({status:"RESOLVED"})}); await renderCitizenVolunteerNetwork(); }
    catch(error) { alert(`Could not update report: ${error.message}`); }
}

async function analyzeVolunteerSafeRoute(reportId, latitude, longitude, area) {
    const destination = `${latitude},${longitude}`;
    const current = window.drishtiVolunteerLocation;
    const origin = current ? `${current.latitude},${current.longitude}` : "My+Location";
    const safety = "DRISHTI route-assist (prototype): verify road closures, flood depth, bridge status and official emergency instructions before moving. This map uses Google Maps routing and is NOT a verified AI or live flood-safe route.";
    alert(`${safety}\nIncident: ${area}\nReport: ${reportId}`);
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`, "_blank", "noopener");
}

async function openReportCommunication(reportId, source) {
    const root = $("volunteerReportMessages");
    if (!root) return;
    root.innerHTML = `<h3>💬 Report ${volunteerEscape(reportId)}</h3><div id="reportMessageList">Loading messages…</div><form id="reportMessageForm" class="controls"><input id="reportMessageSender" placeholder="Your name / role" maxlength="100" required><input id="reportMessageText" placeholder="Message / help coordination" maxlength="1000" required><button class="btn primary" type="submit">Send</button></form>`;
    const endpoint = source === "rescue" ? `/rescue-reports/${encodeURIComponent(reportId)}/messages` : `/reports/${encodeURIComponent(reportId)}/messages`;
    async function loadMessages() {
      try { const data = await volunteerApi(endpoint); $("reportMessageList").innerHTML = (data.messages || []).map(m => `<p><strong>${volunteerEscape(m.sender)}</strong>: ${volunteerEscape(m.message)} <small class="muted">${volunteerEscape(m.created_at || "")}</small></p>`).join("") || "No messages yet."; }
      catch(e) { $("reportMessageList").textContent = `Messages unavailable: ${e.message}`; }
    }
    await loadMessages();
    $("reportMessageForm").onsubmit = async e => { e.preventDefault(); try { await volunteerApi(endpoint,{method:"POST",body:JSON.stringify({sender:$("reportMessageSender").value,message:$("reportMessageText").value})}); $("reportMessageText").value=""; await loadMessages(); } catch(err) { alert(err.message); } };
}

async function acceptRescueReport(reportId) {
    const name = ($("activeVolunteerName")?.value || "").trim();
    const contact = ($("activeVolunteerContact")?.value || "").trim();
    if (!name || !contact) return alert("Please enter your name and contact. Registration is not required.");
    try { await volunteerApi(`/rescue-reports/${encodeURIComponent(reportId)}`, {method:"PATCH",body:JSON.stringify({action:"ACCEPT",volunteer_name:name,volunteer_contact:contact})}); await renderCitizenVolunteerNetwork(); }
    catch(error) { alert(`Could not accept report: ${error.message}`); }
}

async function resolveRescueReport(reportId) {
    if (!confirm("Mark resolved only after confirming help has reached the people. Continue?")) return;
    try { await volunteerApi(`/rescue-reports/${encodeURIComponent(reportId)}`, {method:"PATCH",body:JSON.stringify({action:"RESOLVE"})}); await renderCitizenVolunteerNetwork(); }
    catch(error) { alert(`Could not resolve report: ${error.message}`); }
}

async function updateCitizenVolunteerTask(taskId, status) {
    try {
        await volunteerApi(`/volunteer-assignments/${encodeURIComponent(taskId)}`, {
            method: "PATCH",
            body: JSON.stringify({ status })
        });
        await renderCitizenVolunteerNetwork();
    } catch (error) {
        alert(`Could not update your task: ${error.message}`);
    }
}


// =========================================================
// RENDER ALL
// =========================================================

function renderAll() {

    renderOverview();
    renderDisasters();
    renderDataset();
    renderSensors();
    renderPrediction();
    renderMap();
    renderUserHome();
    renderUserAlerts();
    renderSafe();
    renderHelp();
    renderVolunteerAdmin();
    renderCitizenVolunteerNetwork();
}


// =========================================================
// OVERVIEW
// =========================================================

function renderOverview() {

    if (!rows.length) return;

    const flooded =
        rows.filter(
            row =>
                n(row[columns.target]) === 1
        ).length;


    const avgRain =
        rows.reduce(
            (total, row) =>
                total +
                n(row[columns.rain]),
            0
        ) / rows.length;


    const maxWater =
        Math.max(
            ...rows.map(
                row =>
                    n(row[columns.water])
            )
        );


    if (!$("page-overview")) return;


    $("page-overview").innerHTML = `

        <div class="grid">

            <div class="card">
                <div class="label">
                    DATASET RECORDS
                </div>

                <div class="value">
                    ${rows.length.toLocaleString()}
                </div>
            </div>


            <div class="card">
                <div class="label">
                    HISTORICAL FLOOD OUTCOMES
                </div>

                <div class="value">
                    ${flooded.toLocaleString()}
                </div>
            </div>


            <div class="card">
                <div class="label">
                    AVERAGE RAINFALL
                </div>

                <div class="value">
                    ${avgRain.toFixed(1)} mm
                </div>
            </div>


            <div class="card">
                <div class="label">
                    MAX WATER LEVEL
                </div>

                <div class="value">
                    ${maxWater.toFixed(2)} m
                </div>
            </div>

        </div>


        <div class="section two">

            <div class="card">

                <h2>
                    📡 Live Dataset Stream
                </h2>

                <p class="muted">
                    Dataset rows are treated as
                    virtual sensor readings.
                </p>

                <div id="overviewLive"></div>

            </div>


            <div class="card">

                <h2>
                    ⚡ Quick Controls
                </h2>

                <div class="controls">

                    <button
                        class="btn"
                        onclick="adminPage('sensors')">
                        📡 Open Sensors
                    </button>

                    <button
                        class="btn"
                        onclick="adminPage('prediction')">
                        🧠 Risk Assessment
                    </button>

                    <button
                        class="btn"
                        onclick="adminPage('datasets')">
                        📊 Dataset
                    </button>

                </div>

            </div>

        </div>

        <div id="alertAnalytics" class="section"></div>
        <div id="activeIncidents" class="section"></div>
        <div id="communityReports" class="section"></div>
    `;

    updateOverviewLive();
    renderAlertAnalytics();
    renderActiveIncidents();
    loadAdminHazardReports();
}


// =========================================================
// OVERVIEW LIVE
// =========================================================

function updateOverviewLive() {

    const row =
        rows[currentIndex];

    if (
        !row ||
        !$("overviewLive")
    ) return;


    const q =
        risk(row);


    $("overviewLive").innerHTML = `

        <div class="sensor-grid">

            <div class="sensor">
                🌧️
                <span>Rainfall</span>
                <strong>
                    ${n(row[columns.rain]).toFixed(1)}
                </strong>
                mm
            </div>


            <div class="sensor">
                🌊
                <span>Water Level</span>
                <strong>
                    ${n(row[columns.water]).toFixed(2)}
                </strong>
                m
            </div>


            <div class="sensor">
                🚰
                <span>River Discharge</span>
                <strong>
                    ${n(row[columns.river]).toFixed(0)}
                </strong>
                m³/s
            </div>


            <div class="sensor">
                💧
                <span>Humidity</span>
                <strong>
                    ${n(row[columns.hum]).toFixed(1)}
                </strong>
                %
            </div>


            <div class="sensor">
                🚨
                <span>Risk</span>
                <strong>
                    ${q.level}
                </strong>
            </div>


            <div class="sensor">
                📍
                <span>Location</span>
                <strong>
                    ${n(row[columns.lat]).toFixed(2)},
                    ${n(row[columns.lon]).toFixed(2)}
                </strong>
            </div>

        </div>
    `;
}


// =========================================================
// DATASET MONITORING
// =========================================================

function renderDisasters() {

    if (
        !rows.length ||
        !$("page-disasters")
    ) return;


    const start =
        Math.max(
            0,
            currentIndex - 4
        );


    const sample =
        rows.slice(
            start,
            start + 8
        );


    $("page-disasters").innerHTML = `

        <div class="card">

            <h2>
                🌊 Flood Dataset Monitoring
            </h2>

            <p class="muted">
                Dataset records used for
                DRISHTI virtual monitoring.
            </p>


            <div class="grid">

                <div class="card">
                    <div class="label">
                        TOTAL RECORDS
                    </div>

                    <div class="value">
                        ${rows.length.toLocaleString()}
                    </div>
                </div>


                <div class="card">
                    <div class="label">
                        CURRENT RECORD
                    </div>

                    <div class="value">
                        #${currentIndex + 1}
                    </div>
                </div>


                <div class="card">
                    <div class="label">
                        FLOOD OUTCOME
                    </div>

                    <div class="value">
                        ${n(
        rows[currentIndex]?.[
        columns.target
        ]
    ) === 1
            ? "YES"
            : "NO"
        }
                    </div>
                </div>


                <div class="card">
                    <div class="label">
                        CURRENT RISK
                    </div>

                    <div class="value">
                        ${risk(
            rows[currentIndex]
        ).level
        }
                    </div>
                </div>

            </div>

        </div>


        <div class="section card">

            <h2>
                Dataset Records
            </h2>

            <div class="table-wrap">

                <table class="table">

                    <thead>

                        <tr>
                            <th>#</th>
                            <th>Location</th>
                            <th>Rainfall</th>
                            <th>Water</th>
                            <th>River</th>
                            <th>Historical</th>
                            <th>Outcome</th>
                            <th>Risk</th>
                            <th>Action</th>
                        </tr>

                    </thead>


                    <tbody>

                        ${sample.map(
            (row, i) => {

                const index =
                    start + i;

                const q =
                    risk(row);

                return `

                                        <tr>

                                            <td>
                                                #${index + 1}
                                            </td>

                                            <td>
                                                ${n(row[columns.lat]).toFixed(3)},
                                                ${n(row[columns.lon]).toFixed(3)}
                                            </td>

                                            <td>
                                                ${n(row[columns.rain]).toFixed(1)}
                                                mm
                                            </td>

                                            <td>
                                                ${n(row[columns.water]).toFixed(2)}
                                                m
                                            </td>

                                            <td>
                                                ${n(row[columns.river]).toFixed(0)}
                                            </td>

                                            <td>
                                                ${n(row[columns.hist])}
                                            </td>

                                            <td>
                                                ${n(
                    row[
                    columns.target
                    ]
                ) === 1
                        ? badge("FLOOD")
                        : badge("NO FLOOD")
                    }
                                            </td>

                                            <td>
                                                ${badge(q.level)}
                                            </td>

                                            <td>
                                                <button
                                                    class="btn"
                                                    onclick="
                                                        selectRecord(${index});
                                                        adminPage('disasters');
                                                    ">
                                                    👁 VIEW
                                                </button>
                                            </td>

                                        </tr>
                                    `;
            }
        ).join("")
        }

                    </tbody>

                </table>

            </div>

        </div>


        <div
            id="recordDetails"
            class="section">
        </div>
    `;


    showRecordDetails(
        currentIndex
    );
}


// =========================================================
// RECORD DETAILS
// =========================================================

function showRecordDetails(index) {

    const row =
        rows[index];

    if (!row || !$("recordDetails")) return;

    const q =
        risk(row);


    $("recordDetails").innerHTML = `

        <div class="card">

            <h2>
                📋 Record #${index + 1}
            </h2>


            <div class="sensor-grid">

                <div class="sensor">
                    📍
                    <span>Latitude</span>
                    <strong>
                        ${n(row[columns.lat]).toFixed(4)}
                    </strong>
                </div>


                <div class="sensor">
                    📍
                    <span>Longitude</span>
                    <strong>
                        ${n(row[columns.lon]).toFixed(4)}
                    </strong>
                </div>


                <div class="sensor">
                    🌧️
                    <span>Rainfall</span>
                    <strong>
                        ${n(row[columns.rain]).toFixed(1)}
                    </strong>
                    mm
                </div>


                <div class="sensor">
                    🌊
                    <span>Water Level</span>
                    <strong>
                        ${n(row[columns.water]).toFixed(2)}
                    </strong>
                    m
                </div>


                <div class="sensor">
                    🚰
                    <span>River Discharge</span>
                    <strong>
                        ${n(row[columns.river]).toFixed(0)}
                    </strong>
                    m³/s
                </div>


                <div class="sensor">
                    🌡️
                    <span>Temperature</span>
                    <strong>
                        ${n(row[columns.temp]).toFixed(1)}
                    </strong>
                    °C
                </div>


                <div class="sensor">
                    💧
                    <span>Humidity</span>
                    <strong>
                        ${n(row[columns.hum]).toFixed(1)}
                    </strong>
                    %
                </div>


                <div class="sensor">
                    ⛰️
                    <span>Elevation</span>
                    <strong>
                        ${n(row[columns.elev]).toFixed(1)}
                    </strong>
                    m
                </div>

            </div>


            <div class="section">

                <table class="table">

                    <tbody>

                        <tr>
                            <td>Land Cover</td>
                            <td>${row[columns.land]}</td>
                        </tr>

                        <tr>
                            <td>Soil Type</td>
                            <td>${row[columns.soil]}</td>
                        </tr>

                        <tr>
                            <td>Infrastructure</td>
                            <td>${row[columns.infra]}</td>
                        </tr>

                        <tr>
                            <td>Historical Floods</td>
                            <td>${row[columns.hist]}</td>
                        </tr>

                        <tr>
                            <td>Dataset Flood Outcome</td>
                            <td>
                                ${q.target === 1
            ? badge("FLOOD OCCURRED")
            : badge("NO FLOOD")
        }
                            </td>
                        </tr>

                        <tr>
                            <td>DRISHTI Risk</td>
                            <td>
                                ${badge(q.level)}
                                ${q.score}/100
                            </td>
                        </tr>

                    </tbody>

                </table>

            </div>


            <div class="controls">

                <button
                    class="primary btn"
                    onclick="
                        currentIndex=${index};
                        localIndex=${index};
                        renderAll();
                        adminPage('sensors');
                    ">
                    📡 USE AS VIRTUAL SENSOR
                </button>


                <button
                    class="btn"
                    onclick="
                        currentIndex=${index};
                        renderAll();
                        adminPage('prediction');
                    ">
                    🧠 ANALYZE THIS RECORD
                </button>


                <button
                    class="btn"
                    onclick="
                        currentIndex=${index};
                        renderAll();
                        adminPage('map');
                    ">
                    🗺️ SHOW ON MAP
                </button>

            </div>

        </div>
    `;
}


// =========================================================
// DATASET CENTER
// =========================================================

function renderDataset() {

    if (!$("page-datasets")) return;

    const row =
        rows[currentIndex] || {};


    $("page-datasets").innerHTML = `

        <div class="grid">

            <div class="card">
                <div class="label">
                    DATASET RECORDS
                </div>

                <div class="value">
                    ${rows.length.toLocaleString()}
                </div>
            </div>


            <div class="card">
                <div class="label">
                    FEATURES
                </div>

                <div class="value">
                    14
                </div>
            </div>


            <div class="card">
                <div class="label">
                    CURRENT RECORD
                </div>

                <div class="value">
                    #${currentIndex + 1}
                </div>
            </div>


            <div class="card">
                <div class="label">
                    FLOOD OUTCOME
                </div>

                <div class="value">
                    ${n(
        row[columns.target]
    ) === 1
            ? "YES"
            : "NO"
        }
                </div>
            </div>

        </div>


        <div class="section card">

            <h2>
                📊 Flood Dataset Center
            </h2>

            <p class="muted">
                data/flood_risk_dataset_india.csv
            </p>


            <div class="controls">

                <button
                    class="primary btn"
                    onclick="nextReading()">
                    ⏭ NEXT RECORD
                </button>


                <button
                    class="btn"
                    onclick="adminPage('sensors')">
                    📡 VIRTUAL SENSOR
                </button>


                <button
                    class="btn"
                    onclick="adminPage('prediction')">
                    🧠 RISK ASSESSMENT
                </button>

            </div>

        </div>


        <div class="section card">

            <h2>
                Current Dataset Record
                #${currentIndex + 1}
            </h2>

            <div class="table-wrap">

                <table class="table">

                    <tbody>

                        ${Object.entries(row)
            .map(
                ([key, value]) => `
                                        <tr>
                                            <td>
                                                <b>${key}</b>
                                            </td>

                                            <td>
                                                ${value}
                                            </td>
                                        </tr>
                                    `
            )
            .join("")
        }

                    </tbody>

                </table>

            </div>

        </div>
    `;
}


// =========================================================
// VIRTUAL SENSOR PAGE
// =========================================================

function renderEarlyWarning(data) {
    const box = $("earlyWarning");
    if (!box) return;

    const warning = data?.early_warning || {};
    const risk = data?.risk || {};
    const level = warning.level || risk.risk_level || "LOW";
    const title = warning.title || "Flood Monitoring";
    const message = warning.message || "Continue monitoring the situation.";
    const reason = warning.reason || "No additional warning reason available.";
    const action = warning.recommended_action || "Continue monitoring updates.";
    const score = Number(warning.score ?? risk.risk_score ?? 0).toFixed(2);

    let icon = "🟢";
    if (level === "MEDIUM") icon = "🟡";
    else if (level === "HIGH") icon = "🟠";
    else if (level === "CRITICAL") icon = "🚨";

    box.innerHTML = `
        <div class="prediction">
            <h2>${icon} ${title} ${badge(level)}</h2>
            <p><strong>Risk Score:</strong> ${score}/100</p>
            <p>${message}</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p><strong>Recommended Action:</strong> ${action}</p>
        </div>
    `;
}


function renderSensors() {

    if (!$("page-sensors")) return;


    $("page-sensors").innerHTML = `

        <div class="card">

            <h2>
                📡 Virtual Sensor Console
            </h2>

            <p class="muted">
                No physical hardware is required.
                Dataset rows are streamed through
                the Flask backend as virtual sensor readings.
            </p>


            <div class="controls">

                <button
                    class="primary btn"
                    onclick="startSimulation()">
                    ▶ START LIVE SIMULATION
                </button>


                <button
                    class="btn"
                    onclick="stopSimulation()">
                    ⏹ STOP
                </button>


                <button
                    class="btn"
                    onclick="nextReading()">
                    ⏭ NEXT READING
                </button>


                <button
                    class="danger"
                    onclick="manualAlarm()">
                    🚨 TEST ALARM
                </button>


                <button
                    class="danger"
                    onclick="testCombinedAlarm()">
                    🚨 TEST COMBINED ALERT
                </button>

            </div>


            <div id="sensorCards"></div>

            <div
                id="earlyWarning"
                class="section">
            </div>

            <div
                id="sensorStatus"
                class="section">
            </div>

            <div
                id="alertHistory"
                class="section">
            </div>

        </div>
    `;


    updateSensorView();

    if (currentSensorData) {
        renderEarlyWarning(currentSensorData);
    }

    renderAlertHistory();
}


// =========================================================
// SENSOR VIEW
// =========================================================

function updateSensorView() {

    const row =
        rows[currentIndex];

    if (
        !row ||
        !$("sensorCards")
    ) return;


    const q =
        risk(row);


    $("sensorCards").innerHTML = `

        <div class="sensor-grid">

            <div class="sensor">
                🌧️
                <span>Rainfall</span>
                <strong>
                    ${n(row[columns.rain]).toFixed(1)}
                </strong>
                mm
            </div>


            <div class="sensor">
                🌊
                <span>Water Level</span>
                <strong>
                    ${n(row[columns.water]).toFixed(2)}
                </strong>
                m
            </div>


            <div class="sensor">
                🚰
                <span>River Discharge</span>
                <strong>
                    ${n(row[columns.river]).toFixed(0)}
                </strong>
                m³/s
            </div>


            <div class="sensor">
                🌡️
                <span>Temperature</span>
                <strong>
                    ${n(row[columns.temp]).toFixed(1)}
                </strong>
                °C
            </div>


            <div class="sensor">
                💧
                <span>Humidity</span>
                <strong>
                    ${n(row[columns.hum]).toFixed(1)}
                </strong>
                %
            </div>


            <div class="sensor">
                📍
                <span>Location</span>
                <strong>
                    ${n(row[columns.lat]).toFixed(3)},
                    ${n(row[columns.lon]).toFixed(3)}
                </strong>
            </div>

        </div>
    `;


    $("sensorStatus").innerHTML = `

        <div class="prediction">

            <h3>
                Current Virtual Sensor Status
            </h3>

            <p>
                Local Dataset Record:
                <b>#${currentIndex + 1}</b>
            </p>

            <p>
                Backend Sensor:
                <b>
                    ${currentSensorData?.sensor_id
        || "Waiting for reading..."
        }
                </b>
            </p>

            <p>
                Simulated Risk:
                ${badge(
            currentSensorData?.risk?.risk_level
            || q.level
        )}
            </p>

            <p>
                Risk Score:
                <b>
                    ${currentSensorData?.risk?.risk_score
        ?? q.score
        }/100
                </b>
            </p>

            <p>
                Backend Status:
                <b>
                    ${backendConnected
            ? "ONLINE"
            : "OFFLINE"
        }
                </b>
            </p>

        </div>
    `;
}


// =========================================================
// NEXT READING

// ==========================================
// DRISHTI - LIVE WEATHER EARLY WARNING
// ==========================================

let liveWeatherTimer = null;
let latestWeatherData = null;
let lastCombinedAlertKey = null;

async function loadLiveWeather() {
    try {
        const response = await fetch(`${API_BASE}/weather`);

        if (!response.ok) {
            throw new Error("Weather API unavailable");
        }

        const data = await response.json();

        latestWeatherData = data;

        if (data.status !== "online") {
            throw new Error("Weather service offline");
        }

        renderLiveWeatherWarning(data);

    } catch (error) {
        console.error("Live weather error:", error);

        const box = $("liveWeatherWarning");

        if (box) {
            box.innerHTML = `
                <div class="prediction">
                    <h2>⚠️ LIVE WEATHER UNAVAILABLE</h2>
                    <p>Unable to fetch current weather data.</p>
                    <p><strong>Status:</strong> Waiting for weather service...</p>
                </div>
            `;
        }
    }
}


// =========================================================
// STEP 11D - COMBINED RISK + AUTOMATIC ALERT ENGINE
// =========================================================

function calculateCombinedRisk(sensorData, weatherData) {

    const sensorRisk = sensorData?.risk || {};
    const sensorScore = Number(sensorRisk.risk_score ?? 0);

    const current = weatherData?.current || {};
    const nextHours = weatherData?.next_6_hours || {};

    const rainProbability = Number(
        nextHours.max_rain_probability ?? 0
    );

    const maxRain = Number(
        nextHours.max_rain_mm ?? 0
    );

    const rain = Number(
        current.rain ?? 0
    );

    let weatherScore = 0;

    if (rainProbability >= 80) weatherScore += 55;
    else if (rainProbability >= 60) weatherScore += 40;
    else if (rainProbability >= 40) weatherScore += 25;
    else if (rainProbability >= 20) weatherScore += 10;

    if (maxRain >= 20) weatherScore += 35;
    else if (maxRain >= 10) weatherScore += 25;
    else if (maxRain >= 5) weatherScore += 15;
    else if (maxRain >= 2) weatherScore += 8;

    if (rain >= 10) weatherScore += 10;
    else if (rain >= 5) weatherScore += 7;
    else if (rain >= 2) weatherScore += 4;

    weatherScore = Math.min(100, weatherScore);

    let weatherLevel = "LOW";
    if (weatherScore >= 70) weatherLevel = "CRITICAL";
    else if (weatherScore >= 50) weatherLevel = "HIGH";
    else if (weatherScore >= 25) weatherLevel = "MEDIUM";

    const combinedScore = Math.round(
        (sensorScore * 0.60 + weatherScore * 0.40) * 100
    ) / 100;

    let combinedLevel = "LOW";
    if (combinedScore >= 80) combinedLevel = "CRITICAL";
    else if (combinedScore >= 65) combinedLevel = "HIGH";
    else if (combinedScore >= 40) combinedLevel = "MEDIUM";

    return {
        sensorScore,
        weatherScore,
        weatherLevel,
        combinedScore,
        combinedLevel,
        rainProbability,
        maxRain,
        rain
    };
}


function evaluateCombinedAlert(sensorData) {

    if (!sensorData || !latestWeatherData) {
        return;
    }

    const result = calculateCombinedRisk(
        sensorData,
        latestWeatherData
    );

    const level = result.combinedLevel;

    if (level !== "HIGH" && level !== "CRITICAL") {
        return;
    }

    const record =
        sensorData.record_index ??
        sensorData.record ??
        currentIndex;

    const alertKey =
        `${record}-${level}-${result.combinedScore}`;

    if (lastCombinedAlertKey === alertKey) {
        return;
    }

    lastCombinedAlertKey = alertKey;

    showCombinedAlarm(
        sensorData,
        latestWeatherData,
        result
    );
}



// =========================================================
// BACKEND-PERSISTED INCIDENTS
// The backend is the source of truth; localStorage remains a same-browser fallback.
// =========================================================
async function fetchBackendIncidents() {
    try {
        const response = await fetch(`${API_BASE}/incidents`);
        if (!response.ok) throw new Error(`Incident API returned ${response.status}`);
        const data = await response.json();
        const incidents = Array.isArray(data.incidents) ? data.incidents : [];
        alertHistory = incidents.slice(0, 100);
        localStorage.setItem("drishti_shared_alerts", JSON.stringify(incidents.slice(0, 10)));
        renderAlertHistory();
        renderAlertAnalytics();
        renderActiveIncidents();
        if (role === "user") renderUserAlerts();
        console.info(`DRISHTI: loaded ${incidents.length} backend incidents`);
        return incidents;
    } catch (error) {
        console.warn("DRISHTI incident API unavailable; keeping local browser history.", error);
        return [];
    }
}

async function persistBackendIncident(incident) {
    try {
        const response = await fetch(`${API_BASE}/incidents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(incident)
        });
        if (!response.ok) throw new Error(`Incident save failed (${response.status})`);
        return await response.json();
    } catch (error) {
        console.warn("Incident saved locally, but backend persistence failed:", error);
        return null;
    }
}

async function persistBackendIncidentStatus(incidentId, status) {
    try {
        const response = await fetch(`${API_BASE}/incidents/${encodeURIComponent(incidentId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status })
        });
        if (!response.ok) throw new Error(`Status update failed (${response.status})`);
        return await response.json();
    } catch (error) {
        console.warn("Status updated locally, but backend update failed:", error);
        return null;
    }
}

// =========================================================
// CROSS-TAB USER ALERT SYNC
// Admin and User can be open in different tabs. When Admin
// writes a new alert to localStorage, refresh the User page
// immediately without requiring a manual page reload.
// =========================================================
window.addEventListener("storage", event => {
    if (event.key !== "drishti_shared_alerts") return;

    if (role === "user") {
        renderUserAlerts();
    }
});


function saveSharedAlert(entry) {
    try {
        const existing = JSON.parse(localStorage.getItem("drishti_shared_alerts") || "[]");
        const alert = {
            id: entry.id || `DRISHTI-ALERT-${Date.now()}`,
            timestamp: entry.timestamp || new Date().toISOString(),
            level: entry.level || "HIGH",
            score: Number(entry.score || 0),
            type: entry.type || "COMBINED RISK",
            message: entry.message || "Elevated flood-risk conditions detected.",
            action: entry.action || "Follow official guidance.",
            latitude: Number(entry.latitude || 0),
            longitude: Number(entry.longitude || 0),
            status: entry.status || "NEW"
        };
        const updated = [alert, ...existing]
            .filter((item, index, arr) => arr.findIndex(x => x.id === item.id) === index)
            .slice(0, 10);
        localStorage.setItem("drishti_shared_alerts", JSON.stringify(updated));
        // Persist to Flask so incidents survive refreshes and can be shared by other clients.
        void persistBackendIncident(alert);
    } catch (error) {
        console.warn("Could not save shared DRISHTI alert:", error);
    }
}

window.addEventListener("focus", () => {
    if (role === "user") {
        renderUserAlerts();
    }
});


function getSharedAlerts() {
    try {
        return JSON.parse(localStorage.getItem("drishti_shared_alerts") || "[]");
    } catch (error) {
        return [];
    }
}

function clearSharedAlerts() {
    try {
        localStorage.removeItem("drishti_shared_alerts");
    } catch (error) {
        console.warn("Could not clear shared DRISHTI alerts:", error);
    }
}

function renderSharedUserAlerts() {
    const alerts = getSharedAlerts();

    if (!alerts.length) {
        return `
            <div class="card">
                <h3>📡 DRISHTI Live Alerts</h3>
                <p class="muted">No active HIGH or CRITICAL alerts are currently available.</p>
            </div>
        `;
    }

    const rowsHtml = alerts.map(alert => {
        const icon = alert.level === "CRITICAL" ? "🚨" : "🟠";
        const time = new Date(alert.timestamp).toLocaleString();

        return `
            <div class="prediction" style="margin:10px 0;">
                <h3>${icon} ${alert.level} ${badge(alert.level)}</h3>
                <p><strong>Risk Score:</strong> ${Number(alert.score).toFixed(2)}/100</p>
                <p><strong>Alert ID:</strong> ${alert.id}</p>
                <p><strong>Time:</strong> ${time}</p>
                <p>${alert.message}</p>
                <p><strong>Location:</strong> ${Number(alert.latitude).toFixed(4)}, ${Number(alert.longitude).toFixed(4)}</p>
                <p><strong>Status:</strong> ${getStatusBadge(alert.status || "NEW")}</p>
                <p><strong>SMS Notification:</strong> ✓ SENT TO USER NUMBER</p>
                <p><strong>Recipient:</strong> ${getDemoUserNumber()}</p>
                <p><strong>Recommended Action:</strong> ${alert.action}</p>
            </div>
        `;
    }).join("");

    return `
        <div class="card">
            <h3>📡 DRISHTI Live Alerts</h3>
            <p class="muted">Alerts generated by the DRISHTI flood-risk and early-warning assessment.</p>
            ${rowsHtml}
        </div>
    `;
}

// =========================================================
// LIVE SMS DELIVERY SIMULATION
// =========================================================

function getDemoUserNumber() {
    try {
        return (
            localStorage.getItem("drishti_demo_user_number") ||
            DRISHTI_DEMO_USER_NUMBER
        );
    } catch (error) {
        return DRISHTI_DEMO_USER_NUMBER;
    }
}

function showSmsDeliverySimulation(alert) {
    if (!alert || !alert.id) return;

    // One SMS simulation per incident. The combined alert updates
    // the same incident instead of showing a second fake SMS.
    if (lastSmsSimulationAlertId === alert.id) {
        return;
    }

    lastSmsSimulationAlertId = alert.id;

    const userNumber = getDemoUserNumber();
    const level = String(alert.level || "HIGH").toUpperCase();
    const icon = level === "CRITICAL" ? "🚨" : "🟠";
    const time = new Date(alert.timestamp || Date.now()).toLocaleTimeString();

    let box = $("smsDeliverySimulation");

    if (!box) {
        box = document.createElement("div");
        box.id = "smsDeliverySimulation";
        box.style.cssText = `
            position:fixed;
            right:24px;
            bottom:24px;
            z-index:100000;
            width:min(390px,92vw);
            background:#0f172a;
            color:#fff;
            border:1px solid rgba(34,197,94,.55);
            border-radius:18px;
            padding:18px;
            box-shadow:0 20px 60px rgba(0,0,0,.45);
            font-family:Arial,sans-serif;
        `;
        document.body.appendChild(box);
    }

    box.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <strong style="font-size:17px;">📩 DRISHTI SMS DELIVERY</strong>
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="
                    background:#166534;
                    color:#bbf7d0;
                    padding:5px 9px;
                    border-radius:999px;
                    font-size:11px;
                    font-weight:700;
                ">SIMULATED</span>
                <button id="closeSmsDeliverySimulation" type="button"
                    style="
                        width:30px;height:30px;border:0;border-radius:50%;
                        background:rgba(255,255,255,.1);color:#fff;
                        font-size:20px;line-height:28px;cursor:pointer;
                    " aria-label="Close SMS alert">×</button>
            </div>
        </div>

        <div style="
            margin-top:12px;
            padding:12px;
            background:rgba(255,255,255,.05);
            border-radius:12px;
        ">
            <div style="color:#86efac;font-weight:700;">
                ✓ MESSAGE SENT
            </div>
            <div style="margin-top:6px;font-size:13px;">
                To: <strong>${userNumber}</strong>
            </div>
            <div style="font-size:13px;margin-top:3px;">
                Status: <strong>DELIVERED</strong>
            </div>
            <div style="font-size:12px;opacity:.7;margin-top:3px;">
                ${time}
            </div>
        </div>

        <div style="
            margin-top:12px;
            padding:13px;
            background:#111827;
            border-radius:12px;
            border-left:3px solid #ef4444;
        ">
            <div style="font-weight:700;">
                ${icon} ${level} FLOOD ALERT
            </div>
            <div style="font-size:13px;margin-top:7px;line-height:1.5;">
                DRISHTI Alert: ${alert.message}
            </div>
            <div style="font-size:13px;margin-top:9px;line-height:1.5;color:#bbf7d0;">
                Safe route is sent to the user. Please review it.
            </div>
            <div style="font-size:12px;margin-top:7px;opacity:.75;">
                Location: ${Number(alert.latitude || 0).toFixed(4)},
                ${Number(alert.longitude || 0).toFixed(4)}
            </div>
        </div>

        <div style="
            margin-top:10px;
            font-size:11px;
            color:#94a3b8;
            text-align:center;
        ">
            Demo notification — no real SMS is sent
        </div>
    `;

    box.style.display = "block";

    // Keep the popup visible for 20 seconds so the user can read it.
    // The user can also close it immediately with the × button.
    const closeButton = $("closeSmsDeliverySimulation");
    if (closeButton) {
        closeButton.onclick = () => {
            clearTimeout(window.drishtiSmsTimer);
            box.style.display = "none";
        };
    }

    clearTimeout(window.drishtiSmsTimer);
    window.drishtiSmsTimer = setTimeout(() => {
        if (box) box.style.display = "none";
    }, 20000);

    console.log("📩 DRISHTI DEMO SMS", {
        to: userNumber,
        status: "DELIVERED",
        alertId: alert.id,
        level,
        simulation: true
    });
}

function setDemoUserNumber(number) {
    const clean = String(number || "").trim();

    if (!clean) {
        alert("Please enter a user number.");
        return;
    }

    localStorage.setItem("drishti_demo_user_number", clean);
    alert(`Demo user number saved: ${clean}`);
}

function addAlertHistory(entry) {

    const alert = {
        id: entry.id || `DRISHTI-ALERT-${Date.now()}`,
        timestamp: entry.timestamp || new Date().toISOString(),
        level: String(entry.level || "HIGH").toUpperCase(),
        score: Number(entry.score || 0),
        type: entry.type || "COMBINED RISK",
        message: entry.message || "Elevated flood-risk conditions detected.",
        action: entry.action || "Follow official guidance.",
        latitude: Number(entry.latitude || 0),
        longitude: Number(entry.longitude || 0),
        status: entry.status || "NEW"
    };

    // FIX: Replace an existing incident with the same ID instead
    // of silently creating duplicates. This is important because
    // a HIGH sensor alert can be upgraded to a combined alert.
    alertHistory = [
        alert,
        ...alertHistory.filter(item => item.id !== alert.id)
    ].slice(0, 10);

    // Publish/update the same alert to the Citizen/User alert page.
    saveSharedAlert(alert);

    // Demo-only SMS delivery simulation.
    // This visually demonstrates that the alert is sent to the
    // registered user number without claiming a real SMS was sent.
    showSmsDeliverySimulation(alert);

    renderAlertHistory();
    renderAlertAnalytics();
    renderActiveIncidents();

    // If the user view is open in this tab, refresh it immediately.
    if (role === "user") {
        renderUserAlerts();
    }
}


function renderActiveIncidents() {

    const target = $("activeIncidents");
    if (!target) return;

    const active = (Array.isArray(alertHistory) ? alertHistory : [])
        .filter(alert => !["RESOLVED"].includes(alert.status || "NEW"));

    if (!active.length) {
        target.innerHTML = `
            <div class="card">
                <h3>🚨 Active Incidents</h3>
                <p class="muted">No active incidents. All current cases are resolved or no alert has been generated.</p>
            </div>
        `;
        return;
    }

    const rowsHtml = active.map(alert => {
        const icon = alert.level === "CRITICAL" ? "🚨" : "🟠";
        const time = new Date(alert.timestamp).toLocaleString();

        return `
            <div style="padding:12px;margin:8px 0;border:1px solid rgba(255,255,255,0.10);border-radius:10px;">
                <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                    <strong>${icon} ${alert.level} — ${Number(alert.score).toFixed(2)}/100</strong>
                    <span class="muted">${time}</span>
                </div>
                <p style="margin:7px 0 4px;"><strong>${alert.id}</strong></p>
                <p class="muted" style="margin:0;">
                    📍 ${Number(alert.latitude).toFixed(4)}, ${Number(alert.longitude).toFixed(4)}
                    · ${alert.type}
                </p>
                <p style="margin:7px 0 0;"><strong>Status:</strong> ${getStatusBadge(alert.status || "NEW")}</p>
                <div class="controls" style="margin-top:10px;">
                    ${getStatusButton(alert, "ACKNOWLEDGED")}
                    ${getStatusButton(alert, "RESPONDING")}
                    ${getStatusButton(alert, "RESOLVED")}
                    <button class="btn" onclick="viewIncidentDetails('${alert.id}')">🔎 VIEW DETAILS</button>
                </div>
            </div>
        `;
    }).join("");

    target.innerHTML = `
        <div class="card">
            <h2>🚨 ACTIVE INCIDENTS</h2>
            <p class="muted">Unresolved HIGH and CRITICAL incidents currently requiring attention.</p>
            ${rowsHtml}
        </div>
    `;
}


function renderAlertAnalytics() {

    const target = $("alertAnalytics");
    if (!target) return;

    const alerts = Array.isArray(alertHistory) ? alertHistory : [];
    const total = alerts.length;
    const high = alerts.filter(a => a.level === "HIGH").length;
    const critical = alerts.filter(a => a.level === "CRITICAL").length;
    const active = alerts.filter(a => ["NEW", "ACKNOWLEDGED", "RESPONDING"].includes(a.status || "NEW")).length;
    const resolved = alerts.filter(a => a.status === "RESOLVED").length;
    const average = total
        ? (alerts.reduce((sum, a) => sum + Number(a.score || 0), 0) / total).toFixed(2)
        : "0.00";

    target.innerHTML = `
        <div class="card">
            <h2>📊 DRISHTI ALERT ANALYTICS</h2>
            <div class="grid">
                <div class="card"><div class="label">TOTAL ALERTS</div><div class="value">${total}</div></div>
                <div class="card"><div class="label">HIGH RISK</div><div class="value">${high}</div></div>
                <div class="card"><div class="label">CRITICAL RISK</div><div class="value">${critical}</div></div>
                <div class="card"><div class="label">ACTIVE CASES</div><div class="value">${active}</div></div>
                <div class="card"><div class="label">RESOLVED CASES</div><div class="value">${resolved}</div></div>
                <div class="card"><div class="label">AVERAGE RISK SCORE</div><div class="value">${average}</div></div>
            </div>
        </div>
    `;
}


function renderAlertHistory() {

    const box = $("alertHistory");
    if (!box) return;

    if (!alertHistory.length) {
        box.innerHTML = `
            <div class="card">
                <h3>📋 Alert History</h3>
                <p class="muted">No HIGH or CRITICAL combined alerts recorded in this session.</p>
            </div>
        `;
        return;
    }

    const rowsHtml = alertHistory.map((alert, index) => {
        const icon =
            alert.level === "CRITICAL" ? "🚨" :
                alert.level === "HIGH" ? "🟠" : "🟡";

        const time = new Date(alert.timestamp).toLocaleString();

        return `
            <div style="
                padding:12px;
                margin:8px 0;
                border:1px solid rgba(255,255,255,0.10);
                border-radius:10px;
            ">
                <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                    <strong>${icon} ${alert.level} — ${alert.score.toFixed(2)}/100</strong>
                    <span class="muted">${time}</span>
                </div>
                <p style="margin:7px 0 4px;">${alert.message}</p>
                <p class="muted" style="margin:0;">
                    ${alert.type} · ${alert.id} ·
                    Location: ${alert.latitude.toFixed(4)}, ${alert.longitude.toFixed(4)}
                </p>
                <p style="margin:7px 0 0;"><strong>Status:</strong> ${getStatusBadge(alert.status || "NEW")}</p>
                <p style="margin:7px 0 0;"><strong>Action:</strong> ${alert.action}</p>
                <div class="controls" style="margin-top:10px;">
                    ${getStatusButton(alert, "NEW")}
                    ${getStatusButton(alert, "ACKNOWLEDGED")}
                    ${getStatusButton(alert, "RESPONDING")}
                    ${getStatusButton(alert, "RESOLVED")}
                </div>
            </div>
        `;
    }).join("");

    box.innerHTML = `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
                <div>
                    <h3>📋 Alert History</h3>
                    <p class="muted">Latest ${alertHistory.length} combined HIGH/CRITICAL alerts from this session.</p>
                </div>
                <button class="btn" onclick="clearAlertHistory()">CLEAR HISTORY</button>
            </div>
            ${rowsHtml}
        </div>
    `;
}


function getStatusBadge(status) {
    const labels = {
        NEW: "🆕 NEW",
        ACKNOWLEDGED: "👁️ ACKNOWLEDGED",
        RESPONDING: "🚑 RESPONDING",
        RESOLVED: "✅ RESOLVED"
    };
    return labels[status] || labels.NEW;
}

function getStatusButton(alert, status) {
    if ((alert.status || "NEW") === status) return "";

    const labels = {
        NEW: "🆕 NEW",
        ACKNOWLEDGED: "👁️ ACKNOWLEDGE",
        RESPONDING: "🚑 START RESPONSE",
        RESOLVED: "✅ RESOLVE"
    };

    return `<button class="btn" onclick="updateAlertStatus('${alert.id}', '${status}')">${labels[status]}</button>`;
}

function updateAlertStatus(alertId, status) {
    // Update the Admin session history.
    alertHistory = alertHistory.map(alert =>
        alert.id === alertId
            ? { ...alert, status }
            : alert
    );

    // Persist status to the Flask backend as well as this browser.
    void persistBackendIncidentStatus(alertId, status);

    // Update the shared User/Citizen alert stored in this browser.
    try {
        const alerts = getSharedAlerts().map(alert =>
            alert.id === alertId
                ? { ...alert, status }
                : alert
        );
        localStorage.setItem("drishti_shared_alerts", JSON.stringify(alerts));
    } catch (error) {
        console.warn("Could not update shared DRISHTI alert status:", error);
    }

    renderAlertHistory();
    renderAlertAnalytics();
    renderActiveIncidents();

    if (role === "user") {
        renderUserAlerts();
    }
}


function viewIncidentDetails(alertId) {

    const alert = alertHistory.find(item => item.id === alertId);
    if (!alert) return;

    let modal = $("incidentDetailsModal");

    if (!modal) {
        modal = document.createElement("div");
        modal.id = "incidentDetailsModal";
        modal.className = "alarm hidden";
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="alarm-card" style="max-width:650px;width:92%;max-height:85vh;overflow:auto;">
            <div class="alarm-icon">${alert.level === "CRITICAL" ? "🚨" : "🟠"}</div>
            <h2>DRISHTI INCIDENT DETAILS</h2>
            <p><strong>Alert ID:</strong> ${alert.id}</p>
            <p><strong>Risk Level:</strong> ${alert.level}</p>
            <p><strong>Risk Score:</strong> ${Number(alert.score).toFixed(2)}/100</p>
            <p><strong>Status:</strong> ${getStatusBadge(alert.status || "NEW")}</p>
            <hr>
            <h3>📍 Location</h3>
            <p>${Number(alert.latitude).toFixed(6)}, ${Number(alert.longitude).toFixed(6)}</p>
            <h3>⚠️ Warning</h3>
            <p>${alert.message}</p>
            <h3>🛡 Recommended Action</h3>
            <p>${alert.action}</p>
            <h3>🕒 Timeline</h3>
            <p>✓ Alert Generated</p>
            <p>${["ACKNOWLEDGED", "RESPONDING", "RESOLVED"].includes(alert.status) ? "✓" : "○"} Acknowledged</p>
            <p>${["RESPONDING", "RESOLVED"].includes(alert.status) ? "✓" : "○"} Response Started</p>
            <p>${alert.status === "RESOLVED" ? "✓" : "○"} Resolved</p>
            <button class="danger" onclick="closeIncidentDetails()">CLOSE</button>
        </div>
    `;

    modal.classList.remove("hidden");
}

function closeIncidentDetails() {
    const modal = $("incidentDetailsModal");
    if (modal) modal.classList.add("hidden");
}


function clearAlertHistory() {

    alertHistory = [];
    clearSharedAlerts();
    // Clear the backend store too, keeping the admin action consistent.
    fetch(`${API_BASE}/incidents`, { method: "DELETE" })
        .catch(error => console.warn("Could not clear backend incidents:", error));
    renderAlertHistory();
    renderAlertAnalytics();
    renderActiveIncidents();
}


function showCombinedAlarm(sensorData, weatherData, result) {

    const location = sensorData.location || {};
    const level = result.combinedLevel;
    const score = result.combinedScore.toFixed(2);

    const title =
        level === "CRITICAL"
            ? "🚨 CRITICAL COMBINED FLOOD RISK"
            : "⚠️ HIGH COMBINED FLOOD RISK";

    const message =
        level === "CRITICAL"
            ? "Combined virtual-sensor and live-weather indicators require immediate attention."
            : "Combined virtual-sensor and live-weather indicators show elevated flood risk.";

    const action =
        level === "CRITICAL"
            ? "Follow official emergency instructions and move to a safer location if authorities advise evacuation."
            : "Stay alert, monitor official updates, and prepare for possible evacuation.";

    if ($("alarmText")) {
        $("alarmText").textContent =
            `${title} | ` +
            `Combined Risk: ${score}/100 | ` +
            `Flood Sensor: ${result.sensorScore.toFixed(2)}/100 | ` +
            `Weather Risk: ${result.weatherScore.toFixed(2)}/100 | ` +
            `Rain Probability: ${result.rainProbability.toFixed(0)}% | ` +
            `Next 6h Rain: ${result.maxRain.toFixed(1)} mm | ` +
            `Location: ${Number(location.latitude).toFixed(4)}, ${Number(location.longitude).toFixed(4)} | ` +
            `${message} Action: ${action}`;
    }

    // Reuse the sensor-record alert ID. If a direct HIGH/CRITICAL
    // sensor alert was already created, addAlertHistory() replaces
    // it with this richer combined flood + weather incident.
    const record =
        sensorData?.record_index ??
        sensorData?.record ??
        currentIndex;

    addAlertHistory({
        id: `DRISHTI-ALERT-${record}`,
        timestamp: new Date().toISOString(),
        level,
        score: result.combinedScore,
        type: "COMBINED FLOOD + WEATHER",
        message,
        action,
        latitude: location.latitude,
        longitude: location.longitude,
        status: "NEW"
    });

    if ($("alarm")) {
        $("alarm").classList.remove("hidden");
    }

    playAlarmSound();
}


function testCombinedAlarm() {

    const demoSensor = currentSensorData || {
        record_index: currentIndex,
        location: {
            latitude: 30.3165,
            longitude: 78.0322
        },
        risk: {
            risk_score: 75,
            risk_level: "HIGH"
        }
    };

    const demoWeather = {
        current: {
            rain: 8,
            temperature_2m: 24,
            relative_humidity_2m: 88,
            wind_speed_10m: 22
        },
        next_6_hours: {
            max_rain_probability: 85,
            max_rain_mm: 18
        },
        source: "DRISHTI TEST"
    };

    const result = calculateCombinedRisk(
        demoSensor,
        demoWeather
    );

    showCombinedAlarm(
        demoSensor,
        demoWeather,
        result
    );
}


function renderLiveWeatherWarning(data) {

    const box = $("liveWeatherWarning");
    if (!box) return;

    const current = data?.current || {};
    const nextHours = data?.next_6_hours || {};

    const temperature = Number(current.temperature_2m ?? 0);
    const humidity = Number(current.relative_humidity_2m ?? 0);
    const rain = Number(current.rain ?? 0);
    const precipitation = Number(current.precipitation ?? 0);
    const wind = Number(current.wind_speed_10m ?? 0);
    const rainProbability = Number(nextHours.max_rain_probability ?? 0);
    const maxRain = Number(nextHours.max_rain_mm ?? 0);

    // ------------------------------------------
    // 1. LIVE WEATHER RISK SCORE
    // ------------------------------------------
    let weatherScore = 0;

    if (rainProbability >= 80) weatherScore += 55;
    else if (rainProbability >= 60) weatherScore += 40;
    else if (rainProbability >= 40) weatherScore += 25;
    else if (rainProbability >= 20) weatherScore += 10;

    if (maxRain >= 20) weatherScore += 35;
    else if (maxRain >= 10) weatherScore += 25;
    else if (maxRain >= 5) weatherScore += 15;
    else if (maxRain >= 2) weatherScore += 8;

    if (rain >= 10) weatherScore += 10;
    else if (rain >= 5) weatherScore += 7;
    else if (rain >= 2) weatherScore += 4;

    weatherScore = Math.min(100, weatherScore);

    let weatherLevel = "LOW";
    if (weatherScore >= 70) weatherLevel = "CRITICAL";
    else if (weatherScore >= 50) weatherLevel = "HIGH";
    else if (weatherScore >= 25) weatherLevel = "MEDIUM";

    // ------------------------------------------
    // 2. FLOOD VIRTUAL SENSOR RISK
    // ------------------------------------------
    const sensorRisk = currentSensorData?.risk || {};
    const sensorScore = Number(sensorRisk.risk_score ?? 0);
    const sensorLevel = sensorRisk.risk_level || "WAITING";

    // ------------------------------------------
    // 3. COMBINED RISK ASSESSMENT
    // ------------------------------------------
    let combinedScore = weatherScore;
    let combinedLevel = weatherLevel;
    let combinedMessage = "Live weather conditions are being monitored.";
    let combinedAction = "Continue monitoring DRISHTI updates.";

    if (currentSensorData?.risk) {
        combinedScore = Math.round((sensorScore * 0.60 + weatherScore * 0.40) * 100) / 100;

        if (combinedScore >= 80) combinedLevel = "CRITICAL";
        else if (combinedScore >= 65) combinedLevel = "HIGH";
        else if (combinedScore >= 40) combinedLevel = "MEDIUM";
        else combinedLevel = "LOW";

        if (combinedLevel === "CRITICAL") {
            combinedMessage = "Flood-related risk indicators and/or severe weather conditions require immediate attention.";
            combinedAction = "Follow official emergency instructions and move to a safer location if authorities advise evacuation.";
        } else if (combinedLevel === "HIGH") {
            combinedMessage = "Flood risk indicators are elevated when the virtual sensor and live weather signals are considered together.";
            combinedAction = "Stay alert, monitor official updates, and prepare for possible evacuation.";
        } else if (combinedLevel === "MEDIUM") {
            combinedMessage = "Moderate flood-related conditions are present. Continue close monitoring.";
            combinedAction = "Keep emergency contacts ready and continue monitoring DRISHTI updates.";
        } else {
            combinedMessage = "Current combined indicators do not show elevated flood risk.";
            combinedAction = "Continue normal monitoring and follow official weather/disaster advisories.";
        }
    } else {
        combinedMessage = "Live weather is available. Start the Virtual Sensor Simulation to combine both signals.";
        combinedAction = "Click START LIVE SIMULATION to enable the combined flood-risk assessment.";
    }

    let icon = "🟢";
    if (combinedLevel === "MEDIUM") icon = "🟡";
    else if (combinedLevel === "HIGH") icon = "🟠";
    else if (combinedLevel === "CRITICAL") icon = "🚨";

    const sensorDisplay = currentSensorData?.risk
        ? `${sensorScore.toFixed(2)}/100 (${sensorLevel})`
        : "Waiting for virtual sensor reading";

    box.innerHTML = `
        <div class="prediction">

            <h2>
                ${icon} DRISHTI COMBINED EARLY WARNING
                ${badge(combinedLevel)}
            </h2>

            <p>
                <strong>Combined Risk Score:</strong>
                ${combinedScore.toFixed(2)}/100
            </p>

            <div style="
                display:grid;
                grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
                gap:10px;
                margin:15px 0;
            ">
                <div>
                    <strong>🌊 Virtual Flood Risk</strong><br>
                    ${sensorDisplay}
                </div>

                <div>
                    <strong>🌧 Weather Risk</strong><br>
                    ${weatherScore.toFixed(2)}/100 (${weatherLevel})
                </div>

                <div>
                    <strong>☔ Rain Probability</strong><br>
                    ${rainProbability.toFixed(0)} %
                </div>

                <div>
                    <strong>🌧 Next 6h Rain</strong><br>
                    ${maxRain.toFixed(1)} mm
                </div>
            </div>

            <p><strong>Current Weather</strong></p>

            <div style="
                display:grid;
                grid-template-columns:repeat(auto-fit,minmax(130px,1fr));
                gap:10px;
                margin:10px 0 15px;
            ">
                <div>🌡 ${temperature.toFixed(1)} °C</div>
                <div>💧 ${humidity.toFixed(0)} %</div>
                <div>🌧 ${rain.toFixed(1)} mm</div>
                <div>💨 ${wind.toFixed(1)} km/h</div>
            </div>

            <p>
                <strong>Warning:</strong>
                ${combinedMessage}
            </p>

            <p>
                <strong>Recommended Action:</strong>
                ${combinedAction}
            </p>

            <p style="font-size:12px;opacity:0.7;">
                Weather source: ${data.source || "Open-Meteo"} ·
                Virtual sensor weight: 60% · Weather weight: 40%
            </p>

            <p style="font-size:12px;opacity:0.7;">
                Prototype risk assessment — not a guaranteed disaster prediction.
            </p>

        </div>
    `;

    evaluateCombinedAlert(currentSensorData);
}


// ==========================================
// START LIVE WEATHER MONITORING
// ==========================================

function startLiveWeatherMonitoring() {

    // Load immediately
    loadLiveWeather();

    // Prevent duplicate timers
    if (liveWeatherTimer) {
        clearInterval(liveWeatherTimer);
    }

    // Refresh every 60 seconds
    liveWeatherTimer = setInterval(() => {
        loadLiveWeather();
    }, 60000);
}


// ==========================================
// STOP LIVE WEATHER MONITORING
// ==========================================

function stopLiveWeatherMonitoring() {

    if (liveWeatherTimer) {
        clearInterval(liveWeatherTimer);
        liveWeatherTimer = null;
    }
}
// =========================================================

async function nextReading() {

    if (readingInProgress) {
        return;
    }


    if (!backendConnected) {

        alert(
            "Backend connected nahi hai.\n\n" +
            "Pehle Flask server start karo:\n" +
            "python3 server.py"
        );

        return;
    }


    readingInProgress = true;


    try {

        const index =
            currentIndex;


        console.log(
            "================================"
        );

        console.log(
            "📡 Requesting backend sensor:",
            index
        );


        const sensorData =
            await getSensorReading(index);


        if (!sensorData) {
            return;
        }


        // IMPORTANT:
        // Backend response ko save karo.

        currentSensorData =
            sensorData;

        // Render backend Early Warning in the Virtual Sensor UI.
        renderEarlyWarning(sensorData);

        console.log(
            "📡 DRISHTI VIRTUAL SENSOR"
        );

        console.log(
            "Record:",
            sensorData.record_index ??
            index
        );

        console.log(
            "Sensor:",
            sensorData.sensor_id
        );

        console.log(
            "Rainfall:",
            sensorData.readings?.rainfall
        );

        console.log(
            "Water Level:",
            sensorData.readings?.water_level
        );

        console.log(
            "River Discharge:",
            sensorData.readings?.river_discharge
        );

        console.log(
            "Humidity:",
            sensorData.readings?.humidity
        );

        console.log(
            "Risk:",
            sensorData.risk?.risk_level
        );
        console.log(
            "🚨 EARLY WARNING:",
            sensorData.early_warning
        );

        console.log(
            "Warning Level:",
            sensorData.early_warning?.level
        );

        console.log(
            "Warning Title:",
            sensorData.early_warning?.title
        );

        console.log(
            "Warning Message:",
            sensorData.early_warning?.message
        );

        console.log(
            "Warning Reason:",
            sensorData.early_warning?.reason
        );

        console.log(
            "Recommended Action:",
            sensorData.early_warning?.recommended_action
        );

        console.log(
            "Risk Score:",
            sensorData.risk?.risk_score
        );

        console.log(
            "================================"
        );


        // Keep frontend dataset and
        // backend sensor on same record.

        currentIndex =
            index;

        localIndex =
            index;


        // Move to next backend record
        // AFTER current record is displayed.

        currentIndex =
            index + 1;


        if (
            currentIndex >=
            backendRecordCount
        ) {

            currentIndex = 0;

        }


        // Refresh existing dashboard

        updateSensorView();

        updateOverviewLive();

        renderDisasters();

        renderDataset();

        renderPrediction();


        // =========================================================
        // DIRECT SENSOR ALERT + COMBINED ALERT
        // =========================================================

        const backendRisk = String(
            sensorData.risk?.risk_level ||
            sensorData.early_warning?.level ||
            "LOW"
        ).toUpperCase();

        // HIGH / CRITICAL from the virtual sensor must
        // immediately open the emergency popup.
        if (backendRisk === "HIGH" || backendRisk === "CRITICAL") {
            showBackendAlarm(sensorData);
        }

        // Also evaluate the combined sensor + weather risk.
        evaluateCombinedAlert(sensorData);

        renderAlertHistory();


        console.log(
            "✅ Dashboard UI Updated"
        );

    } finally {

        readingInProgress = false;

    }
}


// =========================================================
// BACKEND SENSOR -> UI
// =========================================================

function showBackendAlarm(data) {

    const location = data?.location || {};
    const warning = data?.early_warning || {};
    const risk = data?.risk || {};

    const level = String(
        warning.level || risk.risk_level || "HIGH"
    ).toUpperCase();

    const score = Number(
        warning.score ?? risk.risk_score ?? 0
    ).toFixed(2);

    const title =
        warning.title ||
        (level === "CRITICAL"
            ? "🚨 CRITICAL FLOOD RISK"
            : "⚠️ HIGH FLOOD RISK");

    const message =
        warning.message ||
        "Elevated flood-risk conditions detected.";

    const reason =
        warning.reason ||
        "Flood-risk indicators have reached an elevated level.";

    const action =
        warning.recommended_action ||
        (level === "CRITICAL"
            ? "Move toward a verified safe location and follow local emergency guidance."
            : "Stay alert, monitor incoming readings, and prepare for possible flooding.");

    // ---------------------------------------------------------
    // GUARANTEE THAT THE POPUP EXISTS
    // If index.html does not contain #alarm, create it here.
    // ---------------------------------------------------------
    let alarm = $("alarm");

    if (!alarm) {
        alarm = document.createElement("div");
        alarm.id = "alarm";
        alarm.className = "alarm";
        alarm.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0,0,0,0.78);
            padding: 20px;
        `;

        alarm.innerHTML = `
            <div style="
                width:min(680px,94vw);
                max-height:88vh;
                overflow:auto;
                background:#111827;
                border:2px solid #ef4444;
                border-radius:20px;
                padding:28px;
                box-shadow:0 20px 70px rgba(0,0,0,.55);
                color:white;
                text-align:left;
            ">
                <div style="font-size:52px;text-align:center;">🚨</div>
                <h2 id="alarmTitle" style="text-align:center;margin:8px 0 18px;">EMERGENCY ALERT</h2>
                <p id="alarmText" style="line-height:1.65;font-size:16px;"></p>
                <button id="alarmCloseBtn" style="
                    width:100%;
                    margin-top:18px;
                    padding:14px;
                    border:0;
                    border-radius:10px;
                    background:#ef4444;
                    color:white;
                    font-size:16px;
                    font-weight:700;
                    cursor:pointer;
                ">ACKNOWLEDGE & CLOSE</button>
            </div>
        `;

        document.body.appendChild(alarm);

        const closeBtn = $("alarmCloseBtn");
        if (closeBtn) {
            closeBtn.onclick = () => {
                alarm.classList.add("hidden");
                alarm.style.display = "none";
            };
        }
    }

    // Make sure an existing popup is visible.
    alarm.classList.remove("hidden");
    alarm.style.display = "flex";

    const text = $("alarmText");
    if (text) {
        text.textContent =
            `${title} | ${message} ` +
            `Reason: ${reason} ` +
            `Risk Score: ${score}/100 | ` +
            `Location: ${Number(location.latitude ?? 0).toFixed(4)}, ` +
            `${Number(location.longitude ?? 0).toFixed(4)} | ` +
            `Action: ${action}`;
    }

    const titleBox = $("alarmTitle");
    if (titleBox) {
        titleBox.textContent = title;
    }

    // ---------------------------------------------------------
    // FIX: HIGH / CRITICAL sensor alerts must also become a
    // persistent Activity History + User/Citizen alert.
    // Use one stable ID per sensor record so the later combined
    // alert updates the same incident instead of creating a
    // duplicate entry.
    // ---------------------------------------------------------
    const record =
        data?.record_index ??
        data?.record ??
        currentIndex;

    const alertId = `DRISHTI-ALERT-${record}`;

    addAlertHistory({
        id: alertId,
        timestamp: new Date().toISOString(),
        level,
        score: Number(score),
        type: "VIRTUAL SENSOR",
        message: `${title}. ${message} Reason: ${reason}`,
        action,
        latitude: Number(location.latitude ?? 0),
        longitude: Number(location.longitude ?? 0),
        status: "NEW"
    });

    console.log("🚨 DRISHTI SENSOR ALERT", {
        id: alertId,
        level,
        score,
        title,
        reason,
        location
    });

    playAlarmSound();
}

// =========================================================
// LIVE SIMULATION
// =========================================================

function startSimulation() {

    if (timer) {
        return;
    }


    if (!backendConnected) {

        alert(
            "Backend connected nahi hai.\n\n" +
            "Flask server start karo."
        );

        return;
    }


    console.log(
        "▶ LIVE BACKEND SIMULATION STARTED"
    );


    // First reading immediately

    nextReading();


    // Then every 2.5 seconds

    timer =
        setInterval(
            () => {

                nextReading();

            },
            2500
        );
}


// =========================================================
// STOP SIMULATION
// =========================================================

function stopSimulation() {

    lastCombinedAlertKey = null;

    if (timer) {

        clearInterval(timer);

        timer = null;

        console.log(
            "⏹ LIVE SIMULATION STOPPED"
        );
    }
}


// =========================================================
// SAFE AUDIO
// =========================================================

function playAlarmSound() {

    try {

        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;


        if (!AudioContextClass) {
            return;
        }


        if (!audioContext) {

            audioContext =
                new AudioContextClass();
        }


        if (
            audioContext.state ===
            "suspended"
        ) {

            audioContext.resume();
        }


        const oscillator =
            audioContext.createOscillator();


        const gain =
            audioContext.createGain();


        oscillator.frequency.value =
            880;


        oscillator.type =
            "sine";


        gain.gain.value =
            0.08;


        oscillator.connect(gain);

        gain.connect(
            audioContext.destination
        );


        oscillator.start();


        setTimeout(
            () => {

                try {
                    oscillator.stop();
                } catch (_) { }

            },
            700
        );


    } catch (error) {

        console.warn(
            "Audio unavailable:",
            error
        );
    }
}


// =========================================================
// MANUAL ALARM
// =========================================================

function manualAlarm() {

    const index =
        role === "admin"
            ? currentIndex
            : localIndex;


    const row =
        rows[index];


    if (!row) return;


    showAlarm(row);
}


// =========================================================
// ORIGINAL LOCAL ALARM
// =========================================================

function showAlarm(row) {

    if (!row) return;


    if ($("alarmText")) {

        $("alarmText").textContent =

            `Flood-risk conditions detected at ` +

            `${n(row[columns.lat]).toFixed(4)}, ` +

            `${n(row[columns.lon]).toFixed(4)}. ` +

            `Move toward a verified safe location ` +

            `and follow local emergency guidance.`;
    }


    if ($("alarm")) {

        $("alarm")
            .classList
            .remove("hidden");
    }


    // Audio only after a user action
    // or explicit alarm event.

    playAlarmSound();
}


// =========================================================
// SELECT RECORD
// =========================================================

function selectRecord(index) {

    if (
        index < 0 ||
        index >= rows.length
    ) return;


    currentIndex =
        index;

    localIndex =
        index;

    currentIndex =
        index;


    currentSensorData =
        null;


    renderAll();
}


// =========================================================
// PREDICTION / RISK PAGE
// =========================================================

function renderPrediction() {

    if (!$("page-prediction")) return;


    $("page-prediction").innerHTML = `

        <div class="card">

            <h2>
                🧠 Flood Risk Assessment
            </h2>

            <p class="muted">
                Current dataset reading is analyzed
                using the DRISHTI flood-risk engine.
                This is a prototype risk assessment,
                not a validated future-flood prediction.
            </p>

            <div id="predictionBox"></div>


            <button
                class="primary btn"
                onclick="runPrediction()">
                🧠 RUN RISK ASSESSMENT
            </button>

        </div>
    `;


    runPrediction();
}


function runPrediction() {

    const row =
        rows[currentIndex];


    if (
        !row ||
        !$("predictionBox")
    ) return;


    const q =
        risk(row);


    let recommendation;


    if (q.level === "CRITICAL") {

        recommendation =
            "Move toward a verified safe location " +
            "and follow local emergency guidance.";

    } else if (q.level === "HIGH") {

        recommendation =
            "Prepare for possible flooding and " +
            "closely monitor incoming readings.";

    } else if (q.level === "MEDIUM") {

        recommendation =
            "Stay alert and continue monitoring " +
            "the flood-risk indicators.";

    } else {

        recommendation =
            "Current simulated indicators are " +
            "relatively low. Continue monitoring.";
    }


    $("predictionBox").innerHTML = `

        <div class="prediction">

            <h2>
                ${badge(q.level)}
                &nbsp;
                Risk Score:
                ${q.score}/100
            </h2>


            <div class="sensor-grid">

                <div class="sensor">
                    🌧️
                    <span>Rainfall</span>
                    <strong>
                        ${n(row[columns.rain]).toFixed(1)}
                    </strong>
                    mm
                </div>


                <div class="sensor">
                    🌊
                    <span>Water Level</span>
                    <strong>
                        ${n(row[columns.water]).toFixed(2)}
                    </strong>
                    m
                </div>


                <div class="sensor">
                    🚰
                    <span>River Discharge</span>
                    <strong>
                        ${n(row[columns.river]).toFixed(0)}
                    </strong>
                    m³/s
                </div>


                <div class="sensor">
                    📊
                    <span>Historical Floods</span>
                    <strong>
                        ${n(row[columns.hist])}
                    </strong>
                </div>

            </div>


            <p>
                📍 Location:
                <b>
                    ${n(row[columns.lat]).toFixed(4)},
                    ${n(row[columns.lon]).toFixed(4)}
                </b>
            </p>


            <p>
                Dataset Ground Truth:
                <b>
                    ${q.target === 1
            ? "Flood Occurred"
            : "No Flood Recorded"
        }
                </b>
            </p>


            <p>
                <b>
                    Recommended Response:
                </b>
                ${recommendation}
            </p>

        </div>
    `;
}


// =========================================================
// MAP
// =========================================================

function renderMap() {
    const host = $("page-map");
    if (!host) return;

    // Use real dataset coordinates, but render the base map locally as SVG.
    // This avoids blank/grey maps when external map tiles fail to load.
    const valid = rows.map((row, index) => ({
        row, index,
        lat: n(row[columns.lat]),
        lon: n(row[columns.lon]),
        assessment: risk(row)
    })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) &&
        p.lat >= 6 && p.lat <= 38.5 && p.lon >= 68 && p.lon <= 98);

    const levels = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    const buckets = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] };
    valid.forEach(p => {
        const level = String(p.assessment.level || "LOW").toUpperCase();
        (buckets[level] || buckets.LOW).push(p);
    });

    // Interleave categories so the demo map doesn't show only one risk colour.
    const points = [];
    const perLevel = 18;
    levels.forEach(level => {
        const bucket = buckets[level];
        const step = Math.max(1, Math.ceil(bucket.length / perLevel));
        for (let i = 0; i < bucket.length && points.filter(p => p._picked).length < 72; i += step) {
            points.push({ ...bucket[i], _picked: true });
        }
    });
    const mapPoints = points.slice(0, 72).map(({ _picked, ...p }) => p);

    // SVG viewport represents the India region. Coordinates use a simple equirectangular projection.
    const W = 760, H = 650;
    const project = (lat, lon) => ({
        x: 82 + ((lon - 68) / 30) * 585,
        y: 48 + ((38.5 - lat) / 32.5) * 545
    });
    const colorFor = level => ({ CRITICAL: "#ff334d", HIGH: "#ff843d", MEDIUM: "#ffca3a", LOW: "#27d980" }[level] || "#27d980");

    const markerSvg = mapPoints.map((p, i) => {
        const level = String(p.assessment.level || "LOW").toUpperCase();
        const pos = project(p.lat, p.lon);
        const x = Math.max(35, Math.min(W - 35, pos.x));
        const y = Math.max(35, Math.min(H - 35, pos.y));
        const title = `${level} risk · ${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`;
        const safeTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        return `<g class="drishti-svg-marker level-${level.toLowerCase()}" data-level="${level}" data-index="${i}" tabindex="0" role="button" aria-label="${safeTitle}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
          <title>${safeTitle} — click for details</title>
          <circle class="marker-halo" r="13" fill="${colorFor(level)}" opacity=".18"></circle>
          <circle class="marker-ring" r="8.5" fill="${colorFor(level)}" opacity=".28"></circle>
          <circle class="marker-core" r="5.5" fill="${colorFor(level)}" stroke="#ffffff" stroke-width="2"></circle>
        </g>`;
    }).join("");

    host.innerHTML = `
      <div class="card drishti-map-card">
        <div class="drishti-map-heading">
          <div><h2>🗺️ India Flood Risk Map</h2><p class="muted">Virtual risk markers plotted over an India-region map</p></div>
          <label class="drishti-map-filter">Show risk
            <select id="drishtiRiskFilter">
              <option value="ALL" selected>All levels</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </label>
        </div>
        <div class="drishti-map-legend">
          <span><i class="drishti-dot critical"></i> Critical (blinking)</span>
          <span><i class="drishti-dot high"></i> High</span>
          <span><i class="drishti-dot medium"></i> Medium</span>
          <span><i class="drishti-dot low"></i> Low</span>
          <span class="drishti-map-count">${mapPoints.length} virtual markers · ${valid.length} valid dataset rows</span>
        </div>
        <div class="drishti-svg-map-shell">
          <svg id="drishtiIndiaSvgMap" class="drishti-svg-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Stylized map of India with virtual flood-risk markers">
            <defs>
              <linearGradient id="indiaSea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b2c3d"/><stop offset="1" stop-color="#071a2b"/></linearGradient>
              <linearGradient id="indiaLand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#284e4b"/><stop offset=".55" stop-color="#1b403f"/><stop offset="1" stop-color="#17313b"/></linearGradient>
              <pattern id="indiaGrid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#9cc7d2" stroke-opacity=".09" stroke-width="1"/></pattern>
              <filter id="mapGlow"><feGaussianBlur stdDeviation="2.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>
            <rect width="${W}" height="${H}" rx="18" fill="url(#indiaSea)"/>
            <rect width="${W}" height="${H}" rx="18" fill="url(#indiaGrid)"/>
            <!-- Stylized mainland India silhouette, drawn locally so it never depends on tile servers. -->
            <path class="india-land" d="M205 88 L247 72 L287 81 L313 101 L345 108 L367 132 L399 143 L428 166 L452 177 L475 201 L493 229 L514 245 L527 271 L516 294 L497 308 L481 327 L472 350 L457 375 L444 404 L426 433 L412 465 L394 500 L378 535 L360 568 L344 585 L327 565 L312 536 L299 506 L285 478 L273 450 L261 421 L246 395 L233 365 L219 341 L204 319 L190 296 L175 276 L160 257 L150 234 L156 213 L176 198 L185 178 L176 157 L184 138 L174 122 L186 106 Z" fill="url(#indiaLand)" stroke="#a9d9bd" stroke-width="2.5" stroke-linejoin="round"/>
            <!-- Northern/eastern extensions and north-east corridor -->
            <path d="M205 88 L185 75 L165 81 L148 69 L129 78 L115 95 L133 108 L158 112 L174 122 M399 143 L425 129 L452 133 L473 148 L492 165 L514 171 L533 188 L551 194 L571 188 L589 198 L606 215 L594 229 L570 226 L552 216 L530 221 L514 245" fill="none" stroke="#a9d9bd" stroke-width="2.5" stroke-linejoin="round"/>
            <!-- Subtle state-like boundary strokes for visual geography (schematic, not official borders). -->
            <g fill="none" stroke="#9bc5b8" stroke-opacity=".58" stroke-width="1.3" stroke-dasharray="3 3">
              <path d="M185 157 L229 164 L268 151 L313 161 L345 108 M156 213 L205 215 L246 205 L287 219 L329 207 L367 132 M150 234 L193 247 L233 238 L273 250 L313 239 L352 258 L399 143 M175 276 L215 281 L261 272 L299 286 L344 278 L393 300 L452 177 M190 296 L233 309 L273 303 L312 317 L350 308 L399 325 L481 327 M204 319 L246 337 L285 331 L325 349 L362 340 L410 360 L472 350 M233 365 L273 366 L312 383 L350 376 L390 395 L444 404 M246 395 L285 407 L322 418 L360 414 L412 465 M261 421 L299 438 L337 451 L378 452 M273 450 L312 466 L344 480 L394 500 M285 478 L327 492 L360 511 M299 506 L337 524 L378 535"/>
              <path d="M313 101 L303 132 L313 161 M345 108 L329 150 L367 180 L352 218 M428 166 L410 205 L452 230 L452 270 M475 201 L452 230 L481 260 L497 308 M246 205 L229 164 M287 219 L268 151 M299 286 L285 331 M312 383 L299 438"/>
            </g>
            <path d="M94 530 Q155 505 203 535 T307 559" fill="none" stroke="#4ca7d1" stroke-opacity=".45" stroke-width="2"/>
            <text x="300" y="300" fill="#d9eee7" fill-opacity=".18" font-size="42" font-weight="800" text-anchor="middle" letter-spacing="5">INDIA</text>
            <text x="28" y="36" fill="#9fc0d2" font-size="12" letter-spacing="1.5">VIRTUAL FLOOD MONITOR</text>
            <g id="drishtiSvgMarkers" filter="url(#mapGlow)">${markerSvg}</g>
            <g transform="translate(630 36)"><circle r="5" fill="#66e5ae"/><text x="12" y="4" fill="#b9d9e8" font-size="11">LIVE DEMO</text></g>
          </svg>
          <div id="drishtiMapDetails" class="drishti-map-details" aria-live="polite"><b>Select a blinking dot</b><span>Risk details and coordinates will appear here.</span></div>
        </div>
        <p class="muted drishti-map-footnote">Schematic India-region visualization. Marker risk comes from the loaded dataset; it is not an official live flood warning or a precise administrative boundary map.</p>
      </div>`;

    if (!document.getElementById("drishti-map-styles")) {
      const style = document.createElement("style");
      style.id = "drishti-map-styles";
      style.textContent = `
        .drishti-map-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
        .drishti-map-heading h2{margin:0 0 6px}.drishti-map-filter{display:flex;align-items:center;gap:8px;color:#9bb0c1;font-size:13px}
        .drishti-map-filter select{background:#081827;color:#e9f2f8;border:1px solid #29465d;border-radius:8px;padding:9px}
        .drishti-map-legend{display:flex;gap:14px;flex-wrap:wrap;align-items:center;padding:12px 0;color:#c4d3df;font-size:13px}
        .drishti-map-count{margin-left:auto;color:#8fa9bc;font-size:12px}.drishti-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px}
        .drishti-dot.critical{background:#ff334d}.drishti-dot.high{background:#ff843d}.drishti-dot.medium{background:#ffca3a}.drishti-dot.low{background:#27d980}
        .drishti-svg-map-shell{position:relative;border:1px solid #2a5367;border-radius:16px;overflow:hidden;background:#071a2b;box-shadow:inset 0 0 45px #0004}
        .drishti-svg-map{display:block;width:100%;height:auto;min-height:380px;max-height:690px}.drishti-svg-marker{cursor:pointer;outline:none}
        .drishti-svg-marker .marker-halo{opacity:.25}.drishti-svg-marker.level-critical .marker-core{animation:drishtiCriticalBlink 1s infinite}.drishti-svg-marker.level-critical .marker-ring{animation:drishtiCriticalRing 1.35s infinite;transform-origin:center}
        .drishti-svg-marker.level-high .marker-core{animation:drishtiHighBlink 1.8s infinite}.drishti-svg-marker:hover .marker-halo,.drishti-svg-marker:focus .marker-halo{opacity:.75}
        @keyframes drishtiCriticalBlink{0%,100%{opacity:1}50%{opacity:.35}}@keyframes drishtiCriticalRing{0%{r:8;opacity:.8}100%{r:18;opacity:0}}
        @keyframes drishtiHighBlink{0%,100%{opacity:1}50%{opacity:.55}}
        .drishti-map-details{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:12px 15px;background:#0a2030;color:#dceaf2;border-top:1px solid #2a5367;font-size:13px}
        .drishti-map-details span{color:#9bb4c5}.drishti-map-details a{color:#6fe0ff;font-weight:700;margin-left:auto}
        .drishti-map-footnote{font-size:12px;margin:12px 0 0;line-height:1.5}
        @media(max-width:650px){.drishti-svg-map{min-height:320px}.drishti-map-count{margin-left:0}.drishti-map-details a{margin-left:0}}
      `;
      document.head.appendChild(style);
    }

    const filter = document.getElementById("drishtiRiskFilter");
    const details = document.getElementById("drishtiMapDetails");
    const markers = Array.from(document.querySelectorAll("#drishtiSvgMarkers .drishti-svg-marker"));
    markers.forEach((marker, i) => {
      const p = mapPoints[i];
      if (!p) return;
      const level = String(p.assessment.level || "LOW").toUpperCase();
      const row = p.row;
      const water = columns.water ? n(row[columns.water]) : NaN;
      const rain = columns.rain ? n(row[columns.rain]) : NaN;
      const river = columns.river ? n(row[columns.river]) : NaN;
      const locationName = `Virtual location ${p.index + 1}`;
      const showDetails = () => {
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`;
        details.innerHTML = `<b>${locationName}</b><span>Risk: <strong style="color:${colorFor(level)}">${level}</strong> (${p.assessment.score ?? "N/A"}/100)</span><span>Lat ${p.lat.toFixed(4)}, Lon ${p.lon.toFixed(4)}</span><span>Rainfall: ${Number.isFinite(rain) ? rain.toFixed(1) + " mm" : "N/A"}</span><span>Water level: ${Number.isFinite(water) ? water.toFixed(2) + " m" : "N/A"}</span><a href="${mapsUrl}" target="_blank" rel="noopener">Open directions ↗</a>`;
      };
      marker.addEventListener("click", showDetails);
      marker.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showDetails(); } });
      marker.addEventListener("mouseenter", () => { marker.querySelector(".marker-halo").setAttribute("opacity", ".75"); });
      marker.addEventListener("mouseleave", () => { marker.querySelector(".marker-halo").setAttribute("opacity", ".25"); });
    });

    if (filter) filter.addEventListener("change", () => {
      const wanted = filter.value;
      markers.forEach(marker => {
        marker.style.display = wanted === "ALL" || marker.dataset.level === wanted ? "" : "none";
      });
    });
}

// =========================================================
// USER HOME
// =========================================================

function renderUserHome() {
    const root = $("page-userHome");
    if (!root) return;

    const row = rows[localIndex] || rows[0] || null;
    const initialRisk = row ? risk(row) : { score: 0, level: "UNKNOWN" };
    const levelColor = level => ({
        CRITICAL: "#ff4658", HIGH: "#ff8b45", MEDIUM: "#f5c542",
        LOW: "#35c98b", UNKNOWN: "#91a4b7"
    }[String(level || "UNKNOWN").toUpperCase()] || "#91a4b7");

    root.innerHTML = `
      <style>
        .dr-user-dash{display:grid;gap:16px;color:var(--text,#e8f1f8)}
        .dr-user-hero{padding:22px;border-radius:18px;background:linear-gradient(120deg,#102d43,#153a50 65%,#17445a);border:1px solid #28536b;display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap}
        .dr-user-hero h2{margin:0 0 6px;font-size:clamp(22px,3vw,30px)}
        .dr-user-hero p{margin:0;color:#b7ccda}
        .dr-user-pill{display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border:1px solid #3b6479;border-radius:999px;font-size:12px;color:#d8e9f3;background:#0a2333}
        .dr-user-dot{width:8px;height:8px;border-radius:50%;background:#35c98b;box-shadow:0 0 0 4px #35c98b22}
        .dr-user-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
        .dr-user-card{border:1px solid var(--border,#29465d);border-radius:16px;padding:19px;background:var(--card,#0d2030);min-width:0}
        .dr-user-card h3{margin:0 0 14px;font-size:17px}
        .dr-user-muted{color:var(--muted,#91a4b7);font-size:13px;line-height:1.55}
        .dr-user-big{font-size:36px;font-weight:750;line-height:1.2;margin:8px 0}
        .dr-user-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:18px}
        .dr-user-metric{padding:12px;border-radius:12px;background:#081827;border:1px solid #213d50}
        .dr-user-metric b{display:block;font-size:18px;margin-top:5px}
        .dr-user-status{padding:15px;border-radius:12px;background:#081827;border-left:4px solid #91a4b7;margin-top:12px}
        .dr-user-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
        .dr-user-actions button{cursor:pointer}
        .dr-user-note{font-size:12px;color:#91a4b7;margin-top:12px;line-height:1.5}
        @media(max-width:680px){.dr-user-grid{grid-template-columns:1fr}.dr-user-metrics{grid-template-columns:1fr 1fr}.dr-user-hero{padding:17px}}
      </style>
      <div class="dr-user-dash">
        <div class="dr-user-hero">
          <div><h2>My Safety Dashboard</h2><p id="drUserLocationLabel">Checking your location…</p></div>
          <span class="dr-user-pill"><span class="dr-user-dot"></span><span id="drUserDataState">Connecting to live data</span></span>
        </div>
        <div class="dr-user-grid">
          <section class="dr-user-card">
            <h3>🌦️ Live Local Weather</h3>
            <div id="drUserWeatherBody"><p class="dr-user-muted">Requesting location and fetching current weather…</p></div>
          </section>
          <section class="dr-user-card">
            <h3>🛡️ Is My Area Safe?</h3>
            <div id="drUserSafetyBody">
              <div class="dr-user-big" style="color:${levelColor(initialRisk.level)}">${initialRisk.level === "UNKNOWN" ? "Checking…" : initialRisk.level}</div>
              <p class="dr-user-muted">Combining available dataset risk with current weather indicators.</p>
            </div>
          </section>
        </div>
        <section class="dr-user-card">
          <h3>📍 Location & Safety Guidance</h3>
          <p id="drUserAdvice" class="dr-user-muted">Allow location access to check weather for your current coordinates. The safety estimate is informational and is not an official warning.</p>
          <div class="dr-user-actions">
            <button class="btn" type="button" id="drUserRefreshBtn">↻ Refresh weather & safety</button>
            <button class="btn" type="button" onclick="userPage('safe')">🛟 Find Safe Spots</button>
            <button class="btn" type="button" onclick="userPage('userAlerts')">🔔 View My Alerts</button>
          </div>
          <p class="dr-user-note">Weather source: backend weather endpoint (Open-Meteo). Risk is a prototype estimate using available dataset and weather values; it cannot guarantee that an area is safe. If you face immediate danger, follow local authorities and emergency services.</p>
        </section>

        <section class="dr-user-card" id="drHazardReportSection">
          <h3>🆘 Report a Hazard or Emergency</h3>
          <p class="dr-user-muted">Report flooding, waterlogging, landslides, damaged roads, fire, or another dangerous situation. Add a photo and location so the admin can review it.</p>
          <form id="hazardReportForm" class="dr-hazard-form">
            <div class="dr-hazard-fields">
              <label>Report title
                <input id="reportTitle" name="title" maxlength="120" required placeholder="e.g. Flood water entering homes">
              </label>
              <label>Event type
                <select id="reportType" name="hazard_type" required>
                  <option value="Flood">Flood</option><option value="Waterlogging">Waterlogging</option><option value="Landslide">Landslide</option><option value="Damaged Road">Damaged road / bridge</option><option value="Fire">Fire</option><option value="Storm">Storm / fallen trees</option><option value="Medical Emergency">Medical emergency</option><option value="Other">Other danger</option>
                </select>
              </label>
              <label class="dr-hazard-wide">What happened?
                <textarea id="reportDescription" name="description" rows="3" maxlength="2000" required placeholder="Describe the danger, severity, and anyone needing help…"></textarea>
              </label>
              <label class="dr-hazard-wide">Area / street / landmark
                <input id="reportLocation" name="location_text" maxlength="240" required placeholder="e.g. Rajpur Road, near the bridge">
              </label>
              <label>Latitude (optional)
                <input id="reportLatitude" name="latitude" inputmode="decimal" placeholder="Captured by GPS">
              </label>
              <label>Longitude (optional)
                <input id="reportLongitude" name="longitude" inputmode="decimal" placeholder="Captured by GPS">
              </label>
              <label class="dr-hazard-wide">Photo of the incident (required, JPG/PNG/WEBP, max 8 MB)
                <input id="reportPhoto" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required>
              </label>
            </div>
            <img id="reportPhotoPreview" class="hidden" alt="Incident photo preview" style="max-width:100%;max-height:260px;border-radius:12px;margin-top:12px;object-fit:contain">
            <div class="dr-user-actions">
              <button class="btn" type="button" id="captureReportLocationBtn" onclick="captureReportLocation()">📍 Use my current location</button>
              <button class="btn primary" type="submit" id="submitReportBtn">🚨 Submit hazard report</button>
            </div>
            <p id="reportFormMessage" class="dr-user-muted" role="status" aria-live="polite">Attach a photo and describe the event. Location access is optional; you can enter the area manually.</p>
          </form>
          <div style="margin-top:18px"><h3>📋 My Submitted Reports</h3><div id="myReportsList"><p class="dr-user-muted">Loading your reports…</p></div></div>
          <style>
            .dr-hazard-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
            .dr-hazard-fields label{display:flex;flex-direction:column;gap:7px;font-size:13px;color:var(--text,#e8f1f8)}
            .dr-hazard-fields input,.dr-hazard-fields select,.dr-hazard-fields textarea{box-sizing:border-box;width:100%;padding:11px 12px;border-radius:10px;border:1px solid var(--border,#29465d);background:var(--bg,#081827);color:var(--text,#e8f1f8);font:inherit}
            .dr-hazard-fields input[type=file]{padding:9px}
            .dr-hazard-wide{grid-column:1/-1}
            @media(max-width:680px){.dr-hazard-fields{grid-template-columns:1fr}.dr-hazard-wide{grid-column:auto}}
          </style>
        </section>
      </div>
    `;

    const reportForm = $("hazardReportForm");
    if (reportForm) reportForm.addEventListener("submit", submitHazardReport);
    setupHazardReportForm();
    loadMyHazardReports();

    const weatherBody = $("drUserWeatherBody");
    const safetyBody = $("drUserSafetyBody");
    const locationLabel = $("drUserLocationLabel");
    const dataState = $("drUserDataState");
    const advice = $("drUserAdvice");
    let activeCoords = null;

    function showWeatherUnavailable(message) {
        if (weatherBody) weatherBody.innerHTML = `<p class="dr-user-muted">⚠️ ${message}</p>`;
        if (dataState) dataState.textContent = "Live weather unavailable";
        if (safetyBody) safetyBody.innerHTML = `<div class="dr-user-big" style="color:#91a4b7">UNKNOWN</div><p class="dr-user-muted">Current weather could not be loaded, so a current-location safety estimate cannot be confirmed.</p>`;
        if (advice) advice.textContent = "Try refreshing when internet and the backend are available. Do not treat missing data as a safe status.";
    }

    async function refreshForCoordinates(coords, label) {
        activeCoords = coords;
        if (locationLabel) locationLabel.textContent = label;
        if (weatherBody) weatherBody.innerHTML = `<p class="dr-user-muted">Fetching current weather…</p>`;
        if (dataState) dataState.textContent = "Loading live data";
        try {
            const query = coords ? `?latitude=${encodeURIComponent(coords.latitude)}&longitude=${encodeURIComponent(coords.longitude)}` : "";
            const response = await fetch(`${API_BASE}/weather${query}`);
            if (!response.ok) throw new Error(`Weather endpoint returned ${response.status}`);
            const data = await response.json();
            if (data.status !== "online" || !data.current) throw new Error(data.error || "Weather provider is offline");

            const current = data.current || {};
            const next = data.next_6_hours || {};
            const temp = Number(current.temperature_2m);
            const humidity = Number(current.relative_humidity_2m);
            const rain = Number(current.rain ?? current.precipitation ?? 0);
            const wind = Number(current.wind_speed_10m);
            const rainProb = Number(next.max_rain_probability ?? 0);
            const forecastRain = Number(next.max_rain_mm ?? 0);
            const weatherCode = Number(current.weather_code);
            const weatherText = ({0:"Clear",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Depositing rime fog",51:"Light drizzle",53:"Drizzle",55:"Dense drizzle",61:"Light rain",63:"Moderate rain",65:"Heavy rain",71:"Light snow",73:"Snow",75:"Heavy snow",80:"Rain showers",81:"Moderate rain showers",82:"Heavy rain showers",95:"Thunderstorm",96:"Thunderstorm with hail",99:"Severe thunderstorm"})[weatherCode] || "Current conditions";

            if (weatherBody) weatherBody.innerHTML = `
              <div class="dr-user-muted">${weatherText} · updated from live weather service</div>
              <div class="dr-user-big">${Number.isFinite(temp) ? `${temp.toFixed(1)}°C` : "—"}</div>
              <div class="dr-user-muted">${Number.isFinite(rain) ? `Current rain: ${rain.toFixed(1)} mm` : "Current rain: unavailable"}</div>
              <div class="dr-user-metrics">
                <div class="dr-user-metric"><span class="dr-user-muted">Humidity</span><b>${Number.isFinite(humidity) ? `${humidity}%` : "—"}</b></div>
                <div class="dr-user-metric"><span class="dr-user-muted">Wind</span><b>${Number.isFinite(wind) ? `${wind.toFixed(0)} km/h` : "—"}</b></div>
                <div class="dr-user-metric"><span class="dr-user-muted">Rain chance*</span><b>${Number.isFinite(rainProb) ? `${rainProb}%` : "—"}</b></div>
              </div>
              <p class="dr-user-note">*Maximum precipitation probability in the next 6 hours. Forecast rainfall peak: ${forecastRain.toFixed(1)} mm.</p>
            `;

            // Convert available weather indicators to a transparent prototype score.
            let weatherScore = 0;
            if (rainProb >= 80) weatherScore += 55; else if (rainProb >= 60) weatherScore += 40; else if (rainProb >= 40) weatherScore += 25; else if (rainProb >= 20) weatherScore += 10;
            if (forecastRain >= 20) weatherScore += 35; else if (forecastRain >= 10) weatherScore += 25; else if (forecastRain >= 5) weatherScore += 15; else if (forecastRain >= 2) weatherScore += 8;
            if (rain >= 10) weatherScore += 10; else if (rain >= 5) weatherScore += 7; else if (rain >= 2) weatherScore += 4;
            weatherScore = Math.min(100, weatherScore);

            const datasetScore = row ? Math.max(0, Math.min(100, Number(risk(row).score) || 0)) : null;
            const combinedScore = datasetScore === null ? weatherScore : Math.round(datasetScore * 0.6 + weatherScore * 0.4);
            let level = "LOW";
            if (combinedScore >= 80) level = "CRITICAL"; else if (combinedScore >= 65) level = "HIGH"; else if (combinedScore >= 40) level = "MEDIUM";
            const color = levelColor(level);
            const riskMeaning = level === "CRITICAL" ? "Very high indicators. Move away from floodwater and follow official emergency instructions." : level === "HIGH" ? "Elevated indicators. Avoid low-lying areas and monitor official local alerts." : level === "MEDIUM" ? "Some risk indicators are present. Stay alert and check local updates." : "Weather indicators are currently lower, but this does not guarantee safety.";
            if (safetyBody) safetyBody.innerHTML = `
              <div class="dr-user-big" style="color:${color}">${level}</div>
              <div class="dr-user-muted">Prototype risk indicator: <b>${combinedScore}/100</b></div>
              <div class="dr-user-status" style="border-left-color:${color}">${riskMeaning}</div>
              <div class="dr-user-metrics">
                <div class="dr-user-metric"><span class="dr-user-muted">Weather indicator</span><b>${weatherScore}/100</b></div>
                <div class="dr-user-metric"><span class="dr-user-muted">Dataset indicator</span><b>${datasetScore === null ? "N/A" : `${datasetScore}/100`}</b></div>
                <div class="dr-user-metric"><span class="dr-user-muted">Rain chance</span><b>${rainProb}%</b></div>
              </div>
            `;
            if (dataState) dataState.textContent = "Live weather connected";
            if (advice) advice.textContent = `Current conditions: ${weatherText}. ${riskMeaning} This is a prototype estimate, not an official warning.`;
        } catch (error) {
            console.error("User dashboard live weather error:", error);
            showWeatherUnavailable("Live weather is unavailable right now. Check that the Flask backend is running and internet is connected.");
        }
    }

    function requestLocation() {
        if (!navigator.geolocation) {
            const fallback = row ? { latitude: n(row[columns.lat]), longitude: n(row[columns.lon]) } : null;
            if (fallback) refreshForCoordinates(fallback, "GPS unavailable · using a dataset reference location");
            else { if (locationLabel) locationLabel.textContent = "Location unavailable"; showWeatherUnavailable("This browser does not support GPS location."); }
            return;
        }
        navigator.geolocation.getCurrentPosition(
            position => {
                const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
                refreshForCoordinates(coords, `Current GPS location · ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
            },
            () => {
                const fallback = row ? { latitude: n(row[columns.lat]), longitude: n(row[columns.lon]) } : null;
                if (fallback) refreshForCoordinates(fallback, "GPS permission not granted · showing dataset reference location");
                else { if (locationLabel) locationLabel.textContent = "Location permission not granted"; showWeatherUnavailable("Allow location access to fetch weather for your current area."); }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
        );
    }

    const refreshButton = $("drUserRefreshBtn");
    if (refreshButton) refreshButton.addEventListener("click", requestLocation);
    requestLocation();
}

// =========================================================
// COMMUNITY HAZARD REPORTING (citizen upload -> Flask backend)
// =========================================================

function setupHazardReportForm() {
    const input = $("reportPhoto");
    const preview = $("reportPhotoPreview");
    if (!input || input.dataset.bound === "1") return;
    input.dataset.bound = "1";
    input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (!file) { preview.classList.add("hidden"); preview.removeAttribute("src"); return; }
        if (!file.type.startsWith("image/")) {
            input.value = "";
            setReportMessage("Please select an image file (JPG, PNG or WEBP).", true);
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            input.value = "";
            preview.classList.add("hidden");
            setReportMessage("Image is larger than 8 MB. Please choose a smaller photo.", true);
            return;
        }
        preview.src = URL.createObjectURL(file);
        preview.classList.remove("hidden");
        setReportMessage("Photo ready. Add the location and submit your report.");
    });
}

function setReportMessage(message, isError = false) {
    const el = $("reportFormMessage");
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? "#ff7b85" : "#8da3b5";
}

function captureReportLocation() {
    if (!navigator.geolocation) {
        setReportMessage("Location is not supported by this browser. Enter the coordinates manually.", true);
        return;
    }
    setReportMessage("Requesting location permission…");
    navigator.geolocation.getCurrentPosition(position => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        if ($("reportLatitude")) $("reportLatitude").value = lat.toFixed(6);
        if ($("reportLongitude")) $("reportLongitude").value = lon.toFixed(6);
        if ($("reportLocation") && !$ ("reportLocation").value.trim()) {
            $("reportLocation").value = `GPS location (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
        }
        setReportMessage("Location captured. You can still edit the area/landmark before submitting.");
    }, error => {
        const msg = error.code === 1 ? "Location permission was denied. Allow location access or enter coordinates manually." : "Could not get location. Enter the area and coordinates manually if available.";
        setReportMessage(msg, true);
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

async function submitHazardReport(event) {
    event.preventDefault();
    const form = $("hazardReportForm");
    const photo = $("reportPhoto")?.files?.[0];
    if (!form) return;
    if (!photo) { setReportMessage("Please attach a photo before submitting.", true); return; }
    if (photo.size > 8 * 1024 * 1024) { setReportMessage("Photo must be 8 MB or smaller.", true); return; }
    const latitude = $("reportLatitude")?.value.trim();
    const longitude = $("reportLongitude")?.value.trim();
    if ((latitude && !longitude) || (!latitude && longitude)) {
        setReportMessage("Enter both latitude and longitude, or leave both empty.", true); return;
    }
    if (latitude && (Number(latitude) < -90 || Number(latitude) > 90 || Number(longitude) < -180 || Number(longitude) > 180)) {
        setReportMessage("Coordinates are outside the valid range.", true); return;
    }
    const button = $("submitReportBtn");
    if (button) { button.disabled = true; button.textContent = "Submitting…"; }
    setReportMessage("Uploading photo and report to the DRISHTI backend…");
    try {
        const data = new FormData();
        data.append("title", $("reportTitle").value.trim());
        data.append("hazard_type", $("reportType").value);
        data.append("description", $("reportDescription").value.trim());
        data.append("location_text", $("reportLocation").value.trim());
        data.append("reporter", ($("username")?.value || "Citizen").trim().slice(0, 80));
        data.append("photo", photo);
        if (latitude && longitude) { data.append("latitude", latitude); data.append("longitude", longitude); }
        const response = await fetch(`${API_BASE}/reports`, { method: "POST", body: data });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `Report upload failed (${response.status})`);
        form.reset();
        const preview = $("reportPhotoPreview");
        if (preview) { preview.classList.add("hidden"); preview.removeAttribute("src"); }
        setReportMessage(`Report submitted successfully. Reference ID: ${result.report.id}. The administrator can now review it.`);
        await loadMyHazardReports();
    } catch (error) {
        setReportMessage(`${error.message}. Check that the backend is running and try again.`, true);
    } finally {
        if (button) { button.disabled = false; button.textContent = "🚨 Submit hazard report"; }
    }
}

function escapeReportText(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}

async function getHazardReports() {
    const response = await fetch(`${API_BASE}/reports`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load reports");
    return Array.isArray(data.reports) ? data.reports : [];
}

async function loadMyHazardReports() {
    const target = $("myReportsList");
    if (!target) return;
    try {
        const reports = await getHazardReports();
        const username = ($("username")?.value || "Citizen").trim().toLowerCase();
        const mine = reports.filter(report => String(report.reporter || "").trim().toLowerCase() === username);
        if (!mine.length) { target.innerHTML = '<p class="muted">No reports submitted from this username yet.</p>'; return; }
        target.innerHTML = mine.slice(0, 10).map(report => `
            <div class="list-item">
                <div><strong>${escapeReportText(report.title)}</strong> <span class="badge ${String(report.status).toLowerCase() === 'resolved' ? 'low' : 'medium'}">${escapeReportText(report.status)}</span></div>
                <p class="muted">${escapeReportText(report.hazard_type)} · ${escapeReportText(report.location_text)}</p>
                <p>${escapeReportText(report.description)}</p>
                <a href="${escapeReportText(report.photo_url)}" target="_blank" rel="noopener">📷 View uploaded photo</a>
                <small class="muted">Ref: ${escapeReportText(report.id)} · ${escapeReportText(report.created_at)}</small>
            </div>`).join("");
    } catch (error) {
        target.innerHTML = `<p class="muted">Reports could not be loaded: ${escapeReportText(error.message)}. Check that the backend is running.</p>`;
    }
}

async function loadAdminHazardReports() {
    const target = $("communityReports");
    if (!target || role !== "admin") return;
    target.innerHTML = '<div class="card"><h2>🆘 Citizen Hazard Reports</h2><p class="muted">Loading reports from backend…</p></div>';
    try {
        const reports = await getHazardReports();
        if (!reports.length) { target.innerHTML = '<div class="card"><h2>🆘 Citizen Hazard Reports</h2><p class="muted">No citizen reports submitted yet.</p></div>'; return; }
        target.innerHTML = `<div class="card"><h2>🆘 Citizen Hazard Reports <span class="badge high">${reports.length} reports</span></h2><p class="muted">Photos and locations submitted by citizen users.</p><div class="list">${reports.map(report => `
            <div class="list-item">
                <div><strong>${escapeReportText(report.title)}</strong> <span class="badge ${String(report.status).toLowerCase() === 'resolved' ? 'low' : 'high'}">${escapeReportText(report.status)}</span></div>
                <p class="muted">${escapeReportText(report.hazard_type)} · Reporter: ${escapeReportText(report.reporter)} · ${escapeReportText(report.created_at)}</p>
                <p>${escapeReportText(report.description)}</p>
                <p>📍 ${escapeReportText(report.location_text)}${report.latitude != null && report.longitude != null ? ` (${Number(report.latitude).toFixed(5)}, ${Number(report.longitude).toFixed(5)})` : ""}</p>
                <div class="controls"><a class="btn" href="${escapeReportText(report.photo_url)}" target="_blank" rel="noopener">📷 View photo</a>${report.latitude != null && report.longitude != null ? `<a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(report.latitude + ',' + report.longitude)}" target="_blank" rel="noopener">🗺️ Directions</a>` : ""}
                <select id="reportStatus-${escapeReportText(report.id)}" style="padding:9px;border-radius:8px;background:#081827;color:#fff;border:1px solid #29465d"><option ${report.status==='NEW'?'selected':''}>NEW</option><option ${report.status==='ACKNOWLEDGED'?'selected':''}>ACKNOWLEDGED</option><option ${report.status==='RESPONDING'?'selected':''}>RESPONDING</option><option ${report.status==='RESOLVED'?'selected':''}>RESOLVED</option></select>
                <button class="btn" onclick="updateHazardReportStatus('${escapeReportText(report.id)}')">Update status</button></div>
            </div>`).join("")}</div></div>`;
    } catch (error) {
        target.innerHTML = `<div class="card"><h2>🆘 Citizen Hazard Reports</h2><p class="muted">Could not load reports: ${escapeReportText(error.message)}.</p></div>`;
    }
}

async function updateHazardReportStatus(reportId) {
    const select = $(`reportStatus-${reportId}`);
    if (!select) return;
    try {
        const response = await fetch(`${API_BASE}/reports/${encodeURIComponent(reportId)}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: select.value })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Status update failed");
        await loadAdminHazardReports();
        alert(`Report ${reportId} status updated to ${select.value}.`);
    } catch (error) { alert(`Could not update report: ${error.message}`); }
}

// =========================================================
// USER ALERTS
// =========================================================

function renderUserAlerts() {

    if (!$("page-userAlerts")) return;

    const row = rows[localIndex] || rows[0];
    let localSection = "";

    if (row) {
        const q = risk(row);

        localSection = `
            <div class="card">
                <h2>🚨 My Local Flood Alert</h2>

                <div class="prediction">
                    <h2>${badge(q.level)} Flood Risk</h2>

                    <p>Rainfall:
                        <b>${n(row[columns.rain]).toFixed(1)} mm</b>
                    </p>

                    <p>Water Level:
                        <b>${n(row[columns.water]).toFixed(2)} m</b>
                    </p>

                    <p>River Discharge:
                        <b>${n(row[columns.river]).toFixed(0)} m³/s</b>
                    </p>

                    <p>Location:
                        <b>${n(row[columns.lat]).toFixed(4)},
                        ${n(row[columns.lon]).toFixed(4)}</b>
                    </p>
                </div>

                <div class="controls">
                    <button class="danger" onclick="manualAlarm()">
                        🚨 ACTIVATE ALARM
                    </button>

                    <button class="btn" onclick="userPage('safe')">
                        🛡️ SAFE SPOTS
                    </button>
                </div>
            </div>
        `;
    }

    const sharedSection = renderSharedUserAlerts();

    $("page-userAlerts").innerHTML = `
        ${sharedSection}
        ${localSection}

        <div class="card">
            <h3>ℹ️ DRISHTI Alert Flow</h3>
            <p class="muted">
                HIGH and CRITICAL alerts generated by the
                administrator's flood + live-weather assessment are
                published here for the citizen/user view.
                The SMS panel demonstrates the notification flow
                for the registered demo user number.
            </p>
            <p class="muted">
                📱 Demo User Number: <b>${getDemoUserNumber()}</b>
            </p>
        </div>
    `;
}

// =========================================================
// SAFE SPOTS
// =========================================================

// =========================================================
// SAFE SPOTS + HOSPITAL FINDER (prototype directory)
// Locations/capacity/resources below are DEMO data, not verified live availability.
// =========================================================
const DRISHTI_SAFE_PLACES = [
  {id:'clocktower-relief', name:'Ghanta Ghar Community Relief Point', type:'shelter', area:'Ghanta Ghar, Dehradun', lat:30.3256, lon:78.0413, occupancy:'medium', food:'high', resources:['Drinking water','First aid','Food packets'], capacity:'Demo: medium occupancy', verified:false},
  {id:'parade-ground', name:'Parade Ground Relief Point', type:'shelter', area:'Parade Ground, Dehradun', lat:30.3290, lon:78.0470, occupancy:'low', food:'medium', resources:['Open gathering area','Water point'], capacity:'Demo: low occupancy', verified:false},
  {id:'doon-school', name:'School Shelter — Demo Location', type:'shelter', area:'Race Course, Dehradun', lat:30.3137, lon:78.0475, occupancy:'high', food:'low', resources:['Temporary shelter','First aid'], capacity:'Demo: high occupancy', verified:false},
  {id:'district-hospital', name:'Do not assume availability — District Hospital area', type:'hospital', area:'Gandhi Road, Dehradun', lat:30.3245, lon:78.0390, occupancy:'high', food:'low', resources:['Hospital / emergency care area'], capacity:'Availability not connected', verified:false},
  {id:'dun-hospital', name:'Hospital area — Patel Nagar (demo)', type:'hospital', area:'Patel Nagar, Dehradun', lat:30.3165, lon:78.0060, occupancy:'medium', food:'low', resources:['Medical care area'], capacity:'Availability not connected', verified:false},
  {id:'community-centre', name:'Community Support Point (demo)', type:'shelter', area:'Rajpur Road, Dehradun', lat:30.3550, lon:78.0800, occupancy:'low', food:'high', resources:['Food packets','Drinking water','Charging point'], capacity:'Demo: low occupancy', verified:false},
  {id:'relief-store', name:'Relief Supplies Point (demo)', type:'resource', area:'ISBT, Dehradun', lat:30.2850, lon:78.0030, occupancy:'medium', food:'high', resources:['Food packets','Water','Blankets'], capacity:'Demo resource listing', verified:false}
];

function drishtiEnsureLeaflet() {
  if (window.L) return Promise.resolve();
  if (window._drishtiLeafletPromise) return window._drishtiLeafletPromise;
  window._drishtiLeafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-drishti-leaflet]')) {
      const css = document.createElement('link'); css.rel='stylesheet'; css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; css.dataset.drishtiLeaflet='1'; document.head.appendChild(css);
    }
    const script=document.createElement('script'); script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.onload=resolve; script.onerror=reject; document.head.appendChild(script);
  });
  return window._drishtiLeafletPromise;
}

function renderSafe() {
  const box = $('page-safe');
  if (!box) return;
  box.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <h2>🛡️ Safe Spots & Hospitals</h2>
      <p class="muted">Find demo relief points, food/resources and hospital areas. Occupancy and supplies are sample values, not live-confirmed availability. Follow official evacuation guidance.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:10px;margin:16px 0">
        <label>Place type<select id="safeTypeFilter" class="input"><option value="all">All places</option><option value="shelter">Safe spots / shelters</option><option value="hospital">Hospitals</option><option value="resource">Food & resources</option></select></label>
        <label>Occupancy<select id="safeOccupancyFilter" class="input"><option value="all">Any occupancy</option><option value="low">Less occupied (demo)</option><option value="medium">Moderate (demo)</option><option value="high">Crowded (demo)</option></select></label>
        <label>Food availability<select id="safeFoodFilter" class="input"><option value="all">Any food level</option><option value="high">High (demo)</option><option value="medium">Medium (demo)</option><option value="low">Low (demo)</option></select></label>
        <label>Resource search<input id="safeResourceFilter" class="input" placeholder="e.g. water, first aid"></label>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <button type="button" class="primary btn" id="safeLocateBtn">📍 Use my location</button>
        <button type="button" class="btn" id="safeResetBtn">Reset filters</button>
        <span id="safeLocationStatus" class="muted" style="align-self:center">Default area: Ghanta Ghar, Dehradun (demo)</span>
      </div>
      <div id="safeMap" style="height:390px;min-height:300px;border-radius:14px;overflow:hidden;background:#e8eef2;border:1px solid #ccd7df;position:relative">
        <div style="padding:18px;color:#334155">Loading interactive map… Internet connection is required for map tiles.</div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin:12px 0;font-size:13px">
        <span>🔵 Safe spot</span><span>🔴 Hospital</span><span>🟠 Food/resources</span><span>Pulse ring = selected place</span>
      </div>
      <div id="safePlaceList" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px"></div>
    </div>
    <style>
      #page-safe .safe-place-card{border:1px solid var(--border-color,#dbe3ea);border-radius:12px;padding:14px;background:var(--card-bg,rgba(255,255,255,.04))}
      #page-safe .safe-place-card h3{margin:0 0 6px;font-size:16px}
      #page-safe .safe-pill{display:inline-block;padding:4px 8px;border-radius:99px;font-size:11px;font-weight:700;margin:3px 4px 3px 0;background:rgba(100,116,139,.15)}
      #page-safe .safe-pulse{animation:drishtiPulse 1.6s infinite}
      @keyframes drishtiPulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,.65)}70%{box-shadow:0 0 0 13px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}
      #page-safe select,#page-safe input{width:100%;box-sizing:border-box;padding:9px;border-radius:8px;border:1px solid #94a3b8;background:var(--input-bg,#fff);color:var(--text-color,#111827);margin-top:5px}
      .drishti-safe-marker{width:16px;height:16px;border:3px solid white;border-radius:50%;box-shadow:0 1px 7px #334155;animation:drishtiMapPulse 1.5s infinite}
      .drishti-safe-marker.shelter{background:#0ea5e9}.drishti-safe-marker.hospital{background:#ef4444}.drishti-safe-marker.resource{background:#f97316}
      @keyframes drishtiMapPulse{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(239,68,68,.45)}70%{transform:scale(1.08);box-shadow:0 0 0 9px rgba(239,68,68,0)}100%{transform:scale(1);box-shadow:0 0 0 0 rgba(239,68,68,0)}}
    </style>`;

  let map = null, markerLayer = null, userMarker = null;
  let userLocation = [30.3256,78.0413];
  const mapEl = $('safeMap');
  const safeEscape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const distanceKm = (a,b) => { const r=Math.PI/180, dLat=(b[0]-a[0])*r,dLon=(b[1]-a[1])*r; const x=Math.sin(dLat/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dLon/2)**2; return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)); };
  function getFilteredPlaces(){
    const type=$('safeTypeFilter')?.value||'all', occ=$('safeOccupancyFilter')?.value||'all', food=$('safeFoodFilter')?.value||'all', q=($('safeResourceFilter')?.value||'').trim().toLowerCase();
    return DRISHTI_SAFE_PLACES.filter(p=>(type==='all'||p.type===type)&&(occ==='all'||p.occupancy===occ)&&(food==='all'||p.food===food)&&(!q||(p.resources.join(' ').toLowerCase().includes(q)||p.name.toLowerCase().includes(q)||p.area.toLowerCase().includes(q)))).map(p=>({...p,distance:distanceKm(userLocation,[p.lat,p.lon])})).sort((a,b)=>a.distance-b.distance);
  }
  function drawList(places){
    const list=$('safePlaceList'); if(!list)return;
    list.innerHTML=places.length?places.map(p=>`<article class="safe-place-card"><h3>${p.type==='hospital'?'🏥':p.type==='resource'?'🥫':'🛡️'} ${safeEscape(p.name)}</h3><div class="muted">📍 ${safeEscape(p.area)} · approx. ${p.distance.toFixed(1)} km from selected location</div><div style="margin:8px 0"><span class="safe-pill">Occupancy: ${safeEscape(p.occupancy)}</span><span class="safe-pill">Food: ${safeEscape(p.food)}</span></div><div style="font-size:13px;margin:8px 0">${p.resources.map(x=>'• '+safeEscape(x)).join('<br>')}</div><div class="muted" style="font-size:12px;margin-bottom:10px">${safeEscape(p.capacity)} · Not live verified</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="primary btn" type="button" data-safe-focus="${p.id}">Show on map</button><button class="btn" type="button" data-safe-directions="${p.id}">Directions ↗</button></div></article>`).join(''):'<div class="card">No places match these filters. Try resetting the filters.</div>';
    list.querySelectorAll('[data-safe-focus]').forEach(b=>b.addEventListener('click',()=>focusPlace(b.dataset.safeFocus)));
    list.querySelectorAll('[data-safe-directions]').forEach(b=>b.addEventListener('click',()=>openDirections(b.dataset.safeDirections)));
  }
  function focusPlace(id){const p=DRISHTI_SAFE_PLACES.find(x=>x.id===id);if(!p)return;if(map){map.setView([p.lat,p.lon],15);const m=markerLayer?.getLayers().find(x=>x.options.placeId===id);if(m)m.openPopup();} }
  function openDirections(id){const p=DRISHTI_SAFE_PLACES.find(x=>x.id===id);if(!p)return;const origin=userLocation.join(',');window.open(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${p.lat},${p.lon}&travelmode=driving`,'_blank','noopener');}
  function redraw(){const places=getFilteredPlaces();drawList(places);if(!map||!markerLayer)return;markerLayer.clearLayers();places.forEach(p=>{const icon=window.L.divIcon({className:'',html:`<div class="drishti-safe-marker ${p.type}"></div>`,iconSize:[22,22],iconAnchor:[11,11]});const m=window.L.marker([p.lat,p.lon],{icon,placeId:p.id}).addTo(markerLayer);m.bindPopup(`<strong>${safeEscape(p.name)}</strong><br>${safeEscape(p.area)}<br>Occupancy: ${safeEscape(p.occupancy)} (demo)<br>Food: ${safeEscape(p.food)} (demo)<br><button type="button" onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${p.lat}%2C${p.lon}','_blank','noopener')">Open directions</button>`);});}
  $('safeTypeFilter').addEventListener('change',redraw);$('safeOccupancyFilter').addEventListener('change',redraw);$('safeFoodFilter').addEventListener('change',redraw);$('safeResourceFilter').addEventListener('input',redraw);
  $('safeResetBtn').addEventListener('click',()=>{$('safeTypeFilter').value='all';$('safeOccupancyFilter').value='all';$('safeFoodFilter').value='all';$('safeResourceFilter').value='';redraw();});
  $('safeLocateBtn').addEventListener('click',()=>{const status=$('safeLocationStatus');if(!navigator.geolocation){status.textContent='This browser does not support location.';return;}status.textContent='Requesting your location…';navigator.geolocation.getCurrentPosition(pos=>{userLocation=[pos.coords.latitude,pos.coords.longitude];status.textContent='Using your current location (GPS)';if(map){if(userMarker)userMarker.setLatLng(userLocation);else userMarker=window.L.circleMarker(userLocation,{radius:8,color:'#2563eb',fillColor:'#60a5fa',fillOpacity:1}).addTo(map).bindPopup('Your current location');map.setView(userLocation,12);}redraw();},()=>{status.textContent='Location permission denied or unavailable. Showing Dehradun demo area.';},{enableHighAccuracy:true,timeout:10000,maximumAge:60000});});
  drishtiEnsureLeaflet().then(()=>{
    if(!document.getElementById('safeMap')||!window.L)return;
    map=window.L.map('safeMap').setView(userLocation,12);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    markerLayer=window.L.layerGroup().addTo(map);
    redraw();setTimeout(()=>map.invalidateSize(),150);
  }).catch(()=>{mapEl.innerHTML='<div style="padding:18px;color:#334155"><b>Interactive map could not load.</b><br>Check internet access, then refresh. The place list and filters still work below.</div>';drawList(getFilteredPlaces());});
  drawList(getFilteredPlaces());
}

// =========================================================
// EMERGENCY HELP
// =========================================================

// STEP 9 — EMERGENCY HELP
// Replace ONLY your current renderHelp() and shareLocation() functions.
// Do NOT replace the whole app.js.

function renderHelp() {

    const box = $("page-help");

    if (!box) return;

    box.innerHTML = `
        <div class="card">

            <h2>🚨 Emergency Help</h2>

            <p class="muted">
                Quick-access emergency calling and live location sharing.
            </p>

            <div class="prediction">
                <h3>🚨 Emergency Contacts</h3>

                <p class="muted">
                    Use the appropriate emergency service for the situation.
                </p>

                <div class="controls">

                    <button
                        class="danger"
                        onclick="callNumber('112')">
                        🚨 CALL 112
                    </button>

                    <button
                        class="btn"
                        onclick="callNumber('108')">
                        🚑 CALL 108
                    </button>

                    <button
                        class="btn"
                        onclick="callNumber('101')">
                        🔥 CALL 101
                    </button>

                </div>
            </div>


            <div class="prediction">

                <h3>📍 Emergency Location Sharing</h3>

                <p class="muted">
                    Capture the user's current browser location and
                    prepare it for sharing.
                </p>

                <button
                    class="primary btn"
                    onclick="shareLocation()">
                    📍 SHARE MY LOCATION
                </button>

                <div
                    id="emergencyLocation"
                    style="margin-top:16px;">
                    <p class="muted">
                        Location not captured yet.
                    </p>
                </div>

            </div>


            <div class="prediction">

                <h3>🆘 Emergency Workflow</h3>

                <p>
                    <strong>1.</strong>
                    Capture location
                </p>

                <p>
                    <strong>2.</strong>
                    Contact emergency service
                </p>

                <p>
                    <strong>3.</strong>
                    Share the location with responders
                </p>

                <p class="muted">
                    This is a prototype interface. Verify local emergency
                    contacts and response arrangements before real-world deployment.
                </p>

            </div>

        </div>
    `;
}


function shareLocation() {

    const box = $("emergencyLocation");

    if (!navigator.geolocation) {

        if (box) {
            box.innerHTML = `
                <p>
                    ❌ Geolocation is not supported by this browser.
                </p>
            `;
        }

        return;
    }


    if (box) {
        box.innerHTML = `
            <p>
                📍 Getting your location...
            </p>
        `;
    }


    navigator.geolocation.getCurrentPosition(

        async position => {

            const latitude =
                position.coords.latitude.toFixed(6);

            const longitude =
                position.coords.longitude.toFixed(6);

            const locationText =
                `DRISHTI Emergency Location\n` +
                `Latitude: ${latitude}\n` +
                `Longitude: ${longitude}\n` +
                `https://www.google.com/maps?q=${latitude},${longitude}`;

            if (box) {
                box.innerHTML = `
                    <div class="prediction">

                        <h3>📍 Location Captured</h3>

                        <p>
                            <strong>Latitude:</strong>
                            ${latitude}
                        </p>

                        <p>
                            <strong>Longitude:</strong>
                            ${longitude}
                        </p>

                        <p>
                            <a
                                href="https://www.google.com/maps?q=${latitude},${longitude}"
                                target="_blank"
                                rel="noopener">
                                🗺️ OPEN LOCATION IN MAP
                            </a>
                        </p>

                        <div class="controls">

                            <button
                                class="primary btn"
                                onclick="copyEmergencyLocation(
                                    ${JSON.stringify(locationText)}
                                )">
                                📋 COPY LOCATION
                            </button>

                        </div>

                    </div>
                `;
            }

            // Use native sharing when supported.
            if (navigator.share) {

                try {

                    await navigator.share({
                        title: "DRISHTI Emergency Location",
                        text: locationText
                    });

                } catch (error) {

                    // User may simply cancel the share sheet.
                    console.log(
                        "Location share cancelled."
                    );

                }

            }

        },

        error => {

            let message =
                "Location permission unavailable.";

            if (error.code === 1) {
                message =
                    "Location permission was denied. Allow location access and try again.";
            } else if (error.code === 2) {
                message =
                    "Your location could not be determined.";
            } else if (error.code === 3) {
                message =
                    "Location request timed out. Try again.";
            }

            if (box) {
                box.innerHTML = `
                    <p>
                        ❌ ${message}
                    </p>
                `;
            }

        },

        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}


function copyEmergencyLocation(text) {

    if (navigator.clipboard) {

        navigator.clipboard.writeText(text)
            .then(() => {
                alert(
                    "Emergency location copied to clipboard."
                );
            })
            .catch(() => {
                alert(
                    "Could not copy automatically."
                );
            });

    } else {

        alert(
            text
        );

    }
}


// =========================================================
// EMERGENCY CALL
// =========================================================

function callNumber(number) {

    window.location.href =
        "tel:" + number;
}


// =========================================================
// DATASET LOADING
// =========================================================

async function loadDataset() {

    try {

        const response =
            await fetch(
                "data/flood_risk_dataset_india.csv"
            );


        if (!response.ok) {

            throw new Error(
                "Dataset file not found"
            );
        }


        const text =
            await response.text();


        rows =
            toObjects(text);


        if (!rows.length) {

            throw new Error(
                "Dataset is empty"
            );
        }


        console.log(
            "DRISHTI dataset loaded:",
            rows.length,
            "records"
        );


        console.log(
            "Columns:",
            Object.keys(rows[0])
        );


        renderAll();


    } catch (error) {

        console.error(
            "Dataset loading error:",
            error
        );


        alert(
            "Dataset load failed.\n\n" +
            "Run the frontend using:\n" +
            "python3 -m http.server 5500\n\n" +
            error.message
        );
    }
}


// =========================================================
// LOGIN
// =========================================================

function login() {

    role =
        $("role")
            ? $("role").value
            : "admin";


    if ($("loginScreen")) {

        $("loginScreen")
            .classList
            .add("hidden");
    }


    if ($("app")) {

        $("app")
            .classList
            .remove("hidden");
    }


    if ($("adminNav")) {

        $("adminNav")
            .classList
            .toggle(
                "hidden",
                role !== "admin"
            );
    }


    if ($("userNav")) {

        $("userNav")
            .classList
            .toggle(
                "hidden",
                role === "admin"
            );
    }


    if (role === "admin") {

        adminPage("overview");

    } else {

        userPage("userHome");
    }
}


// =========================================================
// LOGOUT
// =========================================================

function logout() {

    stopSimulation();
    stopLiveWeatherMonitoring();
    alertHistory = [];


    if ($("app")) {

        $("app")
            .classList
            .add("hidden");
    }


    if ($("loginScreen")) {

        $("loginScreen")
            .classList
            .remove("hidden");
    }
}


// =========================================================
// INITIALIZATION
// =========================================================

async function initializeDrishti() {

    console.log(
        "🚀 DRISHTI Starting..."
    );


    setupNav();


    // Load CSV

    await loadDataset();


    // Connect Flask

    const backend =
        await checkBackendConnection();

    // Load incidents persisted by Flask before the user logs in.
    if (backend) {
        await fetchBackendIncidents();
    }

    if (backend) {

        console.log(
            "✅ Backend Online"
        );


        console.log(
            `📊 Dataset Records: ${backend.records}`
        );


        console.log(
            "ℹ️ Backend ready."
        );


        console.log(
            "👉 Click NEXT READING to fetch sensor data."
        );

    } else {

        console.warn(
            "⚠️ Backend Offline"
        );

        console.warn(
            "Start Flask using:"
        );

        console.warn(
            "python3 server.py"
        );
    }
}


// =========================================================
// BUTTON EVENTS
// =========================================================

function setupButtons() {

    if ($("loginBtn")) {

        $("loginBtn").onclick =
            login;
    }


    if ($("logoutBtn")) {

        $("logoutBtn").onclick =
            logout;
    }


    if ($("closeAlarm")) {

        $("closeAlarm").onclick =
            () => {

                if ($("alarm")) {

                    $("alarm")
                        .classList
                        .add("hidden");
                }
            };
    }
}


// =========================================================
// START
// =========================================================

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        () => {

            setupButtons();

            initializeDrishti();

        }
    );

} else {

    setupButtons();

    initializeDrishti();
}
