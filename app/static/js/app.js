/*************************************************
 * GLOBAL STATE
 *************************************************/
let currentUser = null;
let currentProfile = null;

/*************************************************
 * LOAD USER + PROFILE (ON PAGE LOAD)
 *************************************************/
async function loadUserProfile() {
  const storedUser = localStorage.getItem("user");

  if (!storedUser) {
    if (window.location.pathname !== "/pricing") {
      window.location.href = "/";
    }
    return;
  }

  currentUser = JSON.parse(storedUser);

  if (!currentUser.email) {
    console.error("User email missing");
    window.location.href = "/";
    return;
  }

  try {
    const res = await fetch(
      `/api/profile?email=${encodeURIComponent(currentUser.email)}`
    );

    if (!res.ok) {
      console.error("Failed to load profile");
      return;
    }

    currentProfile = await res.json();

    // Show credits
    const creditEl = document.getElementById("creditCount");
    if (creditEl) {
      creditEl.innerText = currentProfile.credits ?? 0;
    }
  } catch (err) {
    console.error("Error loading profile:", err);
  }
}

window.onload = loadUserProfile;

/*************************************************
 * LOADING FUNCTIONS
 *************************************************/
function startGenerate() {
  const btn = document.getElementById('generateBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons-round">hourglass_empty</span> Generating...';
  document.getElementById('loadingOverlay').style.display = 'flex';
}

function finishGenerate() {
  const btn = document.getElementById('generateBtn');
  btn.disabled = false;
  btn.innerHTML = '<span class="material-icons-round">auto_awesome</span> Generate Resume';
  document.getElementById('loadingOverlay').style.display = 'none';
}

/*************************************************
 * GENERATE RESUME
 *************************************************/
async function generateResume() {
  startGenerate();

  const resumeText = document.getElementById("resumeText").value.trim();
  const jobDescription = document.getElementById("jobDescription").value.trim();
  const style = document.getElementById("styleSelect")?.value || "harvard";

  if (!resumeText || !jobDescription) {
    alert("Please provide both resume text and job description.");
    finishGenerate();
    return;
  }

  // Auth check
  if (!currentUser || !currentUser.email) {
    alert("Session expired. Please login again.");
    window.location.href = "/";
    finishGenerate();
    return;
  }

  // Credit check (frontend UX only – backend enforces too)
  if (!currentProfile || currentProfile.credits <= 0) {
    showCreditPopup();
    finishGenerate();
    return;
  }

  try {
    const response = await fetch("/api/generate-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        style: style,
        resume_text: resumeText,
        job_description: jobDescription,

        // profile data
        full_name: currentProfile.full_name || currentUser.name || "",
        email: currentUser.email,
        phone: currentProfile.phone || "",
        location: currentProfile.location || "",
        linkedin: currentProfile.linkedin || "",
        portfolio: currentProfile.portfolio || ""
      })
    });

    const data = await response.json();

    if (!response.ok || !data.resume_html) {
      alert("Failed to generate resume");
      console.error(data);
      finishGenerate();
      return;
    }

    // Deduct credit locally for instant UX
    currentProfile.credits -= 1;
    const creditEl = document.getElementById("creditCount");
    if (creditEl) {
      creditEl.innerText = currentProfile.credits;
    }

    // Render resume
    document.getElementById("output").innerHTML = data.resume_html;
    document.getElementById("output").contentEditable = true;


    // ATS Score
    if (data.ats_score !== undefined) {
      const atsScoreEl = document.getElementById("atsScore");
      if (atsScoreEl) {
        atsScoreEl.innerText = data.ats_score;
        const level = data.ats_score >= 80 ? "high" : data.ats_score >= 60 ? "medium" : "low";
        atsScoreEl.parentElement.className = `score-circle ${level}`;  // Set class on the circle
        updateGauge(data.ats_score);  // Update the visual gauge
      }
    }

    document.getElementById("output").scrollIntoView({ behavior: "smooth" });
    
    finishGenerate();

  } catch (err) {
    console.error("Resume generation error:", err);
    alert("Something went wrong while generating resume.");
    finishGenerate();
  }
}

/*************************************************
 * CREDIT POPUP
 *************************************************/
function showCreditPopup() {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const popup = document.createElement("div");
  popup.style.cssText = `
    background: white;
    padding: 30px;
    border-radius: 12px;
    text-align: center;
    max-width: 400px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  `;

  popup.innerHTML = `
    <h2 style="color:#dc3545;margin-bottom:15px;">⚠️ Out of Credits</h2>
    <p style="margin-bottom:20px;color:#555;">
      You need credits to generate resumes.
    </p>
    <button id="buyCreditsBtn"
      style="background:#007bff;color:white;border:none;padding:12px 24px;border-radius:6px;font-size:16px;margin-right:10px;">
      Buy Credits
    </button>
    <button id="closePopupBtn"
      style="background:#6c757d;color:white;border:none;padding:12px 24px;border-radius:6px;font-size:16px;">
      Close
    </button>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  document.getElementById("buyCreditsBtn").onclick = () => {
    window.location.href = "/pricing";
  };

  document.getElementById("closePopupBtn").onclick = () => {
    document.body.removeChild(overlay);
  };

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  };
}

/*************************************************
 * PRINT / SAVE PDF
 *************************************************/
function printResume() {
  const content = document.getElementById("output").innerHTML;

  if (!content || content.trim() === "") {
    alert("Nothing to print.");
    return;
  }

  const printWindow = window.open("", "_blank");

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Print Resume</title>
        <meta charset="UTF-8">
        <style>
          @page {
            size: A4;
            orientation: portrait;
          }
          body {
            margin: 0;
            padding: 0;
          }
        </style>
      </head>
      <body>
        ${content}
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 500);
}

function logout() {
  localStorage.removeItem("user");
  localStorage.removeItem("profile");
  localStorage.removeItem("currentProfile");
  window.location.href = "/";
}
