/*************************************************
 * GLOBAL STATE
 *************************************************/
let currentUser = null;
let currentProfile = null;

// Character Limits (must match backend)
const CHAR_LIMITS = {
  resume_experience: 6000,
  job_description: 6000,
  ask_ai_adjust: 4000,
  cover_letter_extra: 1000
};

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

window.onload = () => {
  loadUserProfile();
  setupCharacterCounters();
  checkPaymentStatus(); // Check for payment confirmation
};

/*************************************************
 * CHARACTER COUNTER SETUP & UTILITIES
 *************************************************/
function setupCharacterCounters() {
  // Resume Text Counter
  const resumeEl = document.getElementById("resumeText");
  if (resumeEl) {
    setupCounterForElement(resumeEl, "resumeCounter", CHAR_LIMITS.resume_experience);
  }

  // Job Description Counter
  const jobEl = document.getElementById("jobDescription");
  if (jobEl) {
    setupCounterForElement(jobEl, "jobCounter", CHAR_LIMITS.job_description);
  }

  // Refine Input Counter (Ask AI to Adjust)
  const refineEl = document.querySelector('.refine-input');
  if (refineEl) {
    setupCounterForElement(refineEl, "refineCounter", CHAR_LIMITS.ask_ai_adjust);
  }

  // Cover Letter Modal Counters
  const motivationEl = document.getElementById("clMotivation");
  if (motivationEl) {
    setupCounterForElement(motivationEl, "clMotivationCounter", CHAR_LIMITS.cover_letter_extra);
  }

  const highlightEl = document.getElementById("clHighlight");
  if (highlightEl) {
    setupCounterForElement(highlightEl, "clHighlightCounter", CHAR_LIMITS.cover_letter_extra);
  }
}

function setupCounterForElement(element, counterId, limit) {
  // Create counter display if it doesn't exist
  let counterEl = document.getElementById(counterId);
  if (!counterEl) {
    counterEl = document.createElement('div');
    counterEl.id = counterId;
    counterEl.style.cssText = `
      font-size: 12px;
      color: #666;
      margin-top: 4px;
      text-align: right;
    `;
    element.parentNode.insertBefore(counterEl, element.nextSibling);
  }

  // Update counter on input
  const updateCounter = () => {
    const length = element.value.length;
    const percentage = (length / limit) * 100;
    const remaining = limit - length;
    
    // Set color based on usage
    let color = '#10B981'; // Green - plenty of space
    if (percentage > 80) {
      color = '#F59E0B'; // Orange - warning
    }
    if (percentage > 95) {
      color = '#EF4444'; // Red - critical
    }

    counterEl.style.color = color;
    counterEl.innerHTML = `${length} / ${limit} characters`;

    // Disable/enable submit if over limit
    if (length > limit) {
      counterEl.style.color = '#EF4444';
      counterEl.innerHTML += ' ⚠️ LIMIT EXCEEDED';
      // Disable appropriate button
      if (element.id === "resumeText" || element.id === "jobDescription") {
        const btn = document.getElementById('generateBtn');
        if (btn) btn.disabled = true;
      }
    } else {
      const btn = document.getElementById('generateBtn');
      if (btn && element.id.startsWith('resume') || element.id === 'jobDescription') btn.disabled = false;
    }
  };

  element.addEventListener('input', updateCounter);
  element.addEventListener('change', updateCounter);
  
  // Initial call
  updateCounter();
}

function validateCharacterLimits() {
  const resumeText = document.getElementById("resumeText").value;
  const jobDescription = document.getElementById("jobDescription").value;

  if (resumeText.length > CHAR_LIMITS.resume_experience) {
    alert(`Your Experience exceeds the ${CHAR_LIMITS.resume_experience} character limit.`);
    return false;
  }

  if (jobDescription.length > CHAR_LIMITS.job_description) {
    alert(`Job Description exceeds the ${CHAR_LIMITS.job_description} character limit.`);
    return false;
  }

  return true;
}
function startGenerate() {
  const btn = document.getElementById('generateBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons-round">hourglass_empty</span> Generating...';
  document.getElementById('loadingOverlay').style.display = 'flex';
}

function finishGenerate() {
  const btn = document.getElementById('generateBtn');
  btn.disabled = false;
  btn.innerHTML = '<span class="material-icons-round">auto_awesome</span> Generate';
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

  // ✅ Validation: Empty inputs
  if (!resumeText || !jobDescription) {
    alert("Please provide both resume text and job description.");
    finishGenerate();
    return;
  }

  // ✅ Validation: Character limits
  if (!validateCharacterLimits()) {
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
  if (!currentProfile || currentProfile.credits < 1) {
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
      alert("Error: " + (data.detail || "Failed to generate resume"));
      console.error(data);
      finishGenerate();
      return;
    }

    // ✅ ATOMIC: Update credits from backend response
    if (data.credits_left !== undefined) {
      currentProfile.credits = data.credits_left;
      const creditEl = document.getElementById("creditCount");
      if (creditEl) {
        creditEl.innerText = currentProfile.credits;
      }
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

    const refineBar = document.getElementById("aiRefineBar");
    if (refineBar) {
        refineBar.style.display = "block"; 
    }
      
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
 * PAYMENT CONFIRMATION POPUP
 *************************************************/

// Credit pack details for display
const CREDIT_PACKS = {
  basic: { credits: 80, name: "Basic" },
  popular: { credits: 250, name: "Popular" },
  pro: { credits: 500, name: "Pro" }
};

function checkPaymentStatus() {
  // Get URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const paymentStatus = urlParams.get('payment');
  const plan = urlParams.get('plan');

  if (paymentStatus === 'success' && plan && currentProfile) {
    showPaymentPopup(true, plan);
    // Clean up URL to remove payment params
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (paymentStatus === 'cancelled') {
    showPaymentPopup(false, null);
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function showPaymentPopup(success, plan) {
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
    padding: 40px;
    border-radius: 16px;
    text-align: center;
    max-width: 450px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.3);
  `;

  if (success && plan && CREDIT_PACKS[plan]) {
    const packInfo = CREDIT_PACKS[plan];
    popup.innerHTML = `
      <div style="margin-bottom: 20px;">
        <span style="font-size: 48px;">✅</span>
      </div>
      <h2 style="color:#10B981; margin-bottom: 10px; font-size: 28px;">Payment Successful!</h2>
      <p style="color: #666; font-size: 16px; margin-bottom: 20px;">
        Your payment has been processed successfully.
      </p>
      <div style="
        background: #f0fdf4;
        border: 2px solid #10B981;
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 25px;
      ">
        <p style="color: #666; margin: 0 0 8px 0; font-size: 14px;">Credits Added</p>
        <p style="
          color: #10B981;
          font-size: 36px;
          font-weight: 700;
          margin: 0;
        ">+${packInfo.credits}</p>
      </div>
      <p style="color: #666; margin-bottom: 20px; font-size: 14px;">
        Your credits are now available in your account.
      </p>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: #10B981;
        color: white;
        border: none;
        padding: 14px 32px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.3s;
      "
      onmouseover="this.style.background='#059669'"
      onmouseout="this.style.background='#10B981'">
        Continue to Builder
      </button>
    `;
  } else {
    popup.innerHTML = `
      <div style="margin-bottom: 20px;">
        <span style="font-size: 48px;">❌</span>
      </div>
      <h2 style="color:#EF4444; margin-bottom: 10px; font-size: 28px;">Payment Cancelled</h2>
      <p style="color: #666; font-size: 16px; margin-bottom: 25px;">
        Your payment was cancelled. No charges were made.
      </p>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: #6c757d;
        color: white;
        border: none;
        padding: 14px 32px;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.3s;
      "
      onmouseover="this.style.background='#5a6268'"
      onmouseout="this.style.background='#6c757d'">
        Close
      </button>
    `;
  }

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  };
}


/*************************************************
 * UPDATE RESUME WITH AI (Refine)
 *************************************************/
async function updateResumeWithAI() {
  const inputEl = document.querySelector('.refine-input');
  const instruction = inputEl.value.trim();
  
  if (!instruction) return; // Don't send empty requests

  // ✅ Character limit validation
  if (instruction.length > CHAR_LIMITS.ask_ai_adjust) {
    alert(`Your instruction exceeds ${CHAR_LIMITS.ask_ai_adjust} characters. Please be more concise.`);
    return;
  }

  // 1. Credit Check (0.5 Credits)
  if (!currentProfile || currentProfile.credits < 0.5) {
    showCreditPopup();
    return;
  }

  // 2. UI Loading State
  const btn = document.querySelector('.btn-refine-send');
  const originalIcon = btn.innerHTML;
  btn.innerHTML = '<span class="material-icons-round spinning">hourglass_empty</span>';
  btn.disabled = true;
  inputEl.disabled = true;

  try {
    const currentHTML = document.getElementById('output').innerHTML;

    // 3. Send to Backend
    const response = await fetch("/api/refine-resume", { 
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html: currentHTML,
        instruction: instruction,
        email: currentUser.email
      })
    });

    const data = await response.json();

    if (!response.ok) {
      // Check if it's a credit error
      if (response.status === 402) {
        showCreditPopup();
        return;
      }
      throw new Error(data.detail || data.error || "Failed to update");
    }

    if (!data.updated_html) {
      throw new Error("No updated content received");
    }

    // 4. Update the Resume in DOM
    const outputEl = document.getElementById('output');
    outputEl.innerHTML = data.updated_html;
    outputEl.contentEditable = true; // Keep editing enabled
    
    // 5. Update Credits (from atomic backend operation)
    currentProfile.credits = data.credits_left;
    const creditEl = document.getElementById("creditCount");
    if (creditEl) {
      creditEl.innerText = currentProfile.credits;
    }

    // 6. Success Feedback
    inputEl.value = ''; // Clear input
    btn.style.background = "#10B981"; // Green flash
    setTimeout(() => { 
        btn.style.background = ""; // Reset color
    }, 1000);

  } catch (err) {
    console.error("Refine error:", err);
    alert("Error: " + err.message);
  } finally {
    // Reset UI
    btn.innerHTML = originalIcon;
    btn.disabled = false;
    inputEl.disabled = false;
    inputEl.focus();
  }
}

function logout() {
  localStorage.removeItem("user");
  localStorage.removeItem("profile");
  localStorage.removeItem("currentProfile");
  window.location.href = "/";
}

/*************************************************
 * COVER LETTER FUNCTIONALITY
 *************************************************/
 
// --- STATE ---
let activeView = 'resume'; // 'resume' | 'coverletter'

// --- VIEW SWITCHING ---
function switchView(view) {
    activeView = view;
    
    // 1. Update Tabs
    document.querySelectorAll('.view-tab').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');

    // 2. Update Content Areas
    const resumeEl = document.getElementById('output');
    const clEl = document.getElementById('output-cl');
    const atsContainer = document.getElementById('atsContainer');
    const mainBtn = document.getElementById('generateBtn');
    const refineBar = document.getElementById('aiRefineBar');

    if (view === 'resume') {
        resumeEl.style.display = 'block';
        clEl.style.display = 'none';
        atsContainer.style.opacity = '1'; // Show ATS score
        
        // Update Main Button Text
        mainBtn.innerHTML = '<span class="material-icons-round">auto_awesome</span> Generate Resume';
        mainBtn.onclick = generateResume;
        
        // Show refine bar only if resume has content (not empty-state)
        const hasResume = !resumeEl.querySelector('.empty-state');
        refineBar.style.display = hasResume ? 'block' : 'none';
    } else {
        resumeEl.style.display = 'none';
        clEl.style.display = 'block';
        atsContainer.style.opacity = '0'; // Hide ATS score (less relevant for CL)

        // Update Main Button Text
        mainBtn.innerHTML = '<span class="material-icons-round">mail</span> Generate Cover Letter';
        mainBtn.onclick = openCLModal; // Below Function is defined next
        
        // Show refine bar only if cover letter has content (not empty-state)
        const hasCoverLetter = !clEl.querySelector('.empty-state');
        refineBar.style.display = hasCoverLetter ? 'block' : 'none';
    }
}

// --- MODAL HANDLING ---
function openCLModal() {
    // Basic validation before opening
    const jobDesc = document.getElementById("jobDescription").value.trim();
    if(!jobDesc) { alert("Please paste a Job Description first."); return; }
    
    document.getElementById('clModal').style.display = 'flex';
}

function closeCLModal() {
    document.getElementById('clModal').style.display = 'none';
}

// --- GENERATE COVER LETTER API CALL ---
async function submitCoverLetterGen() {
    closeCLModal();

    const resumeText = document.getElementById("resumeText").value.trim();
    const jobDescription = document.getElementById("jobDescription").value.trim();
    const style = document.getElementById("styleSelect").value;
    
    // Modal Inputs
    const manager = document.getElementById("clManager").value;
    const motivation = document.getElementById("clMotivation").value;
    const highlight = document.getElementById("clHighlight").value;

    // ✅ Character limit validation for cover letter fields
    if (motivation.length > CHAR_LIMITS.cover_letter_extra) {
        alert(`Motivation text exceeds ${CHAR_LIMITS.cover_letter_extra} characters.`);
        return;
    }

    if (highlight.length > CHAR_LIMITS.cover_letter_extra) {
        alert(`Highlight text exceeds ${CHAR_LIMITS.cover_letter_extra} characters.`);
        return;
    }

    // ✅ Credit Check with Popup
    if (!currentProfile || currentProfile.credits < 1) {
        showCreditPopup();
        return;
    }

    startGenerate(); // Reuse existing loader

    try {
        const response = await fetch("/api/generate-cover-letter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: currentUser.email,
                style: "professional, concise, one-page format", // Fixed style for CL
                resume_text: resumeText,
                job_description: jobDescription,
                hiring_manager: manager,
                motivation: motivation,
                highlight: highlight
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            // Check if it's a credit error
            if (response.status === 402) {
                showCreditPopup();
                return;
            }
            throw new Error(data.detail || data.error);
        }

        // ✅ ATOMIC: Update Credit & Update UI from response
        currentProfile.credits = data.credits_left;
        document.getElementById("creditCount").innerText = currentProfile.credits;

        // Render HTML
        document.getElementById("output-cl").innerHTML = data.cover_letter_html;
        document.getElementById("output-cl").contentEditable = true; // Allow manual edits
        
        // Show Refine Bar (content was generated successfully)
        document.getElementById("aiRefineBar").style.display = "block";

    } catch (err) {
        console.error(err);
        alert("Error: " + err.message);
    } finally {
        finishGenerate();
    }
}

// --- UNIFIED REFINE HANDLER ---
async function handleRefine() {
    if (activeView === 'resume') {
        updateResumeWithAI(); // Existing function
    } else {
        updateCoverLetterWithAI(); // New function similar to updateResumeWithAI
    }
}

async function updateCoverLetterWithAI() {
    // Implementation matches updateResumeWithAI but points to document.getElementById('output-cl')
    // and calls /api/refine-resume with type: "cover_letter"
    const inputEl = document.querySelector('.refine-input');
    const instruction = inputEl.value.trim();
    if (!instruction) return;

    // ✅ Character limit validation
    if (instruction.length > CHAR_LIMITS.ask_ai_adjust) {
      alert(`Your instruction exceeds ${CHAR_LIMITS.ask_ai_adjust} characters. Please be more concise.`);
      return;
    }

    // Credit check
    if (!currentProfile || currentProfile.credits < 0.5) {
      showCreditPopup();
      return;
    }

    // Loading state
    const btn = document.querySelector('.btn-refine-send');
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<span class="material-icons-round spinning">hourglass_empty</span>';
    btn.disabled = true;
    inputEl.disabled = true;

    try {
        const currentHTML = document.getElementById('output-cl').innerHTML;
        const res = await fetch("/api/refine-resume", {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({
                 email: currentUser.email,
                 html: currentHTML,
                 instruction: instruction,
                 type: "cover_letter"
             })
        });
        const data = await res.json();

        if (!res.ok) {
          // Check if it's a credit error
          if (res.status === 402) {
            showCreditPopup();
            return;
          }
          throw new Error(data.detail || data.error || "Failed to update");
        }

        if (!data.updated_html) {
          throw new Error("No updated content received");
        }

        // Update the Cover Letter in DOM
        const outputEl = document.getElementById('output-cl');
        outputEl.innerHTML = data.updated_html;
        outputEl.contentEditable = true;

        // Update credits
        currentProfile.credits = data.credits_left;
        const creditEl = document.getElementById("creditCount");
        if (creditEl) {
          creditEl.innerText = currentProfile.credits;
        }

        // Success feedback
        inputEl.value = '';
        btn.style.background = "#10B981";
        setTimeout(() => { 
            btn.style.background = "";
        }, 1000);

    } catch(e) { 
      console.error(e);
      alert("Error: " + e.message);
    } finally {
      // Reset UI
      btn.innerHTML = originalIcon;
      btn.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();
    }
}


/**
 * 🖨️ UNIVERSAL PRINT FUNCTION
 * (Relaxed Margins Version)
 */
function printActiveDocument() {
  // 1. Determine which content to print
  let contentId, title;
  
  if (activeView === 'resume') {
    contentId = 'output';
    title = 'Resume';
  } else {
    contentId = 'output-cl';
    title = 'Cover Letter';
  }

  const contentElement = document.getElementById(contentId);
  
  // 2. Safety Check
  const hasEmptyState = contentElement ? contentElement.querySelector('.empty-state') : null;
  
  if (!contentElement || hasEmptyState || contentElement.innerText.trim() === "") {
      alert(`Your ${title} is not ready yet. Please generate it first.`);
      return;
  }

  // 3. Open Print Window
  const printWindow = window.open("", "_blank");
  
  // 4. Write the HTML
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>Print ${title}</title>
        <meta charset="UTF-8">
        <style>
          /* RELAXED A4 SIZE: 
             We removed 'margin: 0' so the browser/printer handles the margins.
             This prevents content from being cut off on standard printers.
          */
          @page {
            size: A4; 
          }
          
          body {
            padding: 0;
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact;
            font-family: sans-serif;
          }

          /* Content scales to fit the printable area */
          .paper-a4 {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
            box-shadow: none; 
          }
        </style>
      </head>
      <body>
        ${contentElement.innerHTML}
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  // 5. Trigger Print
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 500);
}