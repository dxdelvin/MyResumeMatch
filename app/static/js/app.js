async function generateResume() {
  const resumeText = document.getElementById("resumeText").value;
  const jobDescription = document.getElementById("jobDescription").value;
  const style = document.getElementById("styleSelect").value; // dropdown

  // Check credits first
  if (!currentProfile || currentProfile.credits <= 0) {
    showCreditPopup();
    return;
  }

  // Profile data (already saved earlier)
  const user = JSON.parse(localStorage.getItem("user"));
  const profile = JSON.parse(localStorage.getItem("profile")); // optional

  const response = await fetch("/api/generate-resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      style: style,
      resume_text: resumeText,
      job_description: jobDescription,

      // user profile data
      full_name: profile?.full_name || user?.name || "",
      email: user?.email || "",
      phone: profile?.phone || "",
      location: profile?.location || "",
      linkedin: profile?.linkedin || "",
      portfolio: profile?.portfolio || ""
    })
  });

  const data = await response.json();

  if (!response.ok || !data.resume_html) {
    alert("Failed to generate resume");
    console.error(data);
    return;
  }

  if (currentProfile && typeof currentProfile.credits === "number") {
    currentProfile.credits -= 1;
    document.getElementById("creditCount").innerText = currentProfile.credits;
  }

  document.getElementById("output").innerHTML = data.resume_html;

  const atsScoreElement = document.getElementById("atsScore");
  atsScoreElement.innerText = `${data.ats_score}`;
  atsScoreElement.className = data.ats_score >= 80 ? 'ats-score high' : data.ats_score >= 60 ? 'ats-score medium' : 'ats-score low';

  document.getElementById("suggestions").innerHTML = data.improvement_suggestions
    .split("\n")
    .filter(item => item.trim())
    .map(item => `<li class="suggestion-item">${item.replace(/^-\s*/, "")}</li>`)
    .join("");

  document.getElementById("resultSection").style.display = "block";

  document.getElementById("resultSection").scrollIntoView({ behavior: 'smooth' });
}

function showCreditPopup() {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.7);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  // Create popup
  const popup = document.createElement('div');
  popup.style.cssText = `
    background: white;
    padding: 30px;
    border-radius: 12px;
    text-align: center;
    max-width: 400px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  `;

  popup.innerHTML = `
    <h2 style="color: #dc3545; margin-bottom: 15px;">⚠️ Out of Credits!</h2>
    <p style="margin-bottom: 20px; color: #666;">You need credits to generate resumes. Purchase more credits to continue.</p>
    <button id="buyCreditsBtn" style="
      background: #007bff;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 16px;
      cursor: pointer;
      margin-right: 10px;
    ">Buy Credits</button>
    <button id="closePopupBtn" style="
      background: #6c757d;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 16px;
      cursor: pointer;
    ">Close</button>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  // Event listeners
  document.getElementById('buyCreditsBtn').onclick = () => {
    window.location.href = '/pricing';
  };

  document.getElementById('closePopupBtn').onclick = () => {
    document.body.removeChild(overlay);
  };

  // Close on overlay click
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  };
}

/* OPEN NEW PAGE AND PRINT */
function printResume() {
  const content = document.getElementById("output").innerHTML;

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Print Resume</title>
        <meta charset="UTF-8">
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

async function loadUserProfile() {
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user || !user.email) {
    // Don't redirect on pricing page - it's accessible to non-authenticated users
    if (window.location.pathname !== '/pricing') {
      window.location.href = "/";
    }
    return;
  }

  const res = await fetch(
    `/api/profile?email=${encodeURIComponent(user.email)}`
  );

  if (!res.ok) {
    console.error("Failed to load profile");
    return;
  }

  currentProfile = await res.json();

  document.getElementById("creditCount").innerText =
    currentProfile.credits ?? 0;
}
window.onload = loadUserProfile;

function logout() {
      localStorage.removeItem("user");
      localStorage.removeItem("profile");
      // Also clear any other potential keys
      localStorage.removeItem("currentProfile");
      window.location.href = "/";
    }