
let currentUser = null;
let currentProfile = null;

// Character Limits (must match backend)
const CHAR_LIMITS = {
  resume_experience: 6000,
  job_description: 6000,
  ask_ai_adjust: 4000,
  cover_letter_extra: 1000
};

// PDF Extraction Constants
const PDF_CHAR_LIMIT = 6000;
const MAX_PDF_PAGES = 5; // Limit extraction to first 5 pages

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

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

  if (!currentUser.email || !currentUser.token) {
    console.error("User email or token missing");
    window.location.href = "/";
    return;
  }

  try {
    // 🔒 SECURE: Use JWT token, not email parameter
    const res = await fetch("/api/profile", {
      headers: {
        "Authorization": `Bearer ${currentUser.token}`
      }
    });

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
  setupPDFUpload(); // Setup PDF upload handler
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

/*************************************************
 * PDF UPLOAD & EXTRACTION
 *************************************************/
function setupPDFUpload() {
  const fileUpload = document.getElementById('fileUpload');
  
  fileUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    
    if (!file) return;
    
    // Validate file type
    if (file.type !== 'application/pdf') {
      showToast('Please upload a valid PDF file.', 'error');
      return;
    }
    
    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      showToast('PDF file is too large. Maximum size is 10MB.', 'error');
      return;
    }
    
    // Show loading state
    showToast('📄 Extracting text from PDF...', 'info');
    
    try {
      const extractedText = await extractTextFromPDF(file);
      
      if (!extractedText) {
        showToast('Could not extract text from PDF. Please ensure it\'s a valid PDF.', 'error');
        return;
      }
      
      // Limit to PDF_CHAR_LIMIT
      const limitedText = extractedText.substring(0, PDF_CHAR_LIMIT);
      const isLimited = extractedText.length > PDF_CHAR_LIMIT;
      
      // Populate the textarea
      const resumeEl = document.getElementById('resumeText');
      resumeEl.value = limitedText;
      
      // Trigger input event to update counter
      resumeEl.dispatchEvent(new Event('input'));
      
      // Show success toast with info about extraction
      const charCount = limitedText.length;
      const totalChars = extractedText.length;
      
      if (isLimited) {
        showToast(
          `✅ Extracted ${charCount}/${totalChars} characters (limited to ${PDF_CHAR_LIMIT} chars)`,
          'success'
        );
      } else {
        showToast(
          `✅ Successfully extracted ${charCount} characters from PDF`,
          'success'
        );
      }
      
    } catch (err) {
      console.error('PDF extraction error:', err);
      showToast('Error extracting PDF. Please try again.', 'error');
    }
    
    // Reset file input asynchronously to avoid triggering another file picker
    setTimeout(() => {
      fileUpload.value = '';
    }, 0);
  });
}

async function extractTextFromPDF(file) {
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Load PDF document
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    const pagesToProcess = Math.min(pdf.numPages, MAX_PDF_PAGES);
    
    // Extract text from first N pages
    for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Join text items with spaces
      const pageText = textContent.items
        .map(item => (item.str || ''))
        .join(' ');
      
      fullText += pageText + '\n\n';
      
      // Stop if we've already exceeded the limit
      if (fullText.length > PDF_CHAR_LIMIT) {
        break;
      }
    }
    
    // Clean up whitespace
    fullText = fullText
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
    
    return fullText;
    
  } catch (err) {
    console.error('PDF extraction failed:', err);
    throw err;
  }
}

/**
 * Setup PDF extraction for modal fields (Motivation and Highlight)
 */
function setupModalPDFUpload() {
  // Motivation PDF Upload
  const clMotivationPdf = document.getElementById('clMotivationPdf');
  if (clMotivationPdf) {
    clMotivationPdf.addEventListener('change', async (e) => {
      await handleModalPDFUpload(e, 'clMotivation', CHAR_LIMITS.cover_letter_extra, 'Motivation');
    });
  }
  
  // Highlight PDF Upload
  const clHighlightPdf = document.getElementById('clHighlightPdf');
  if (clHighlightPdf) {
    clHighlightPdf.addEventListener('change', async (e) => {
      await handleModalPDFUpload(e, 'clHighlight', CHAR_LIMITS.cover_letter_extra, 'Highlight');
    });
  }
}

async function handleModalPDFUpload(event, textareaId, charLimit, fieldName) {
  const file = event.target.files[0];
  
  if (!file) return;
  
  // Validate file type
  if (file.type !== 'application/pdf') {
    showToast('Please upload a valid PDF file.', 'error');
    return;
  }
  
  // Validate file size (max 10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    showToast('PDF file is too large. Maximum size is 10MB.', 'error');
    return;
  }
  
  showToast('📄 Extracting text from PDF...', 'info');
  
  try {
    const extractedText = await extractTextFromPDF(file);
    
    if (!extractedText) {
      showToast('Could not extract text from PDF. Please ensure it\'s a valid PDF.', 'error');
      return;
    }
    
    // Limit to field-specific char limit
    const limitedText = extractedText.substring(0, charLimit);
    const isLimited = extractedText.length > charLimit;
    
    // Populate the textarea
    const textarea = document.getElementById(textareaId);
    textarea.value = limitedText;
    
    // Trigger input event to update counter
    textarea.dispatchEvent(new Event('input'));
    
    // Show success toast
    const charCount = limitedText.length;
    const totalChars = extractedText.length;
    
    if (isLimited) {
      showToast(
        `✅ ${fieldName}: Extracted ${charCount}/${totalChars} characters (limited to ${charLimit} chars)`,
        'success'
      );
    } else {
      showToast(
        `✅ ${fieldName}: Successfully extracted ${charCount} characters`,
        'success'
      );
    }
    
  } catch (err) {
    console.error('Modal PDF extraction error:', err);
    showToast('Error extracting PDF. Please try again.', 'error');
  }
  
  // Reset file input asynchronously to avoid triggering another file picker
  setTimeout(() => {
    event.target.value = '';
  }, 0);
}

function validateCharacterLimits() {
  const resumeText = document.getElementById("resumeText").value;
  const jobDescription = document.getElementById("jobDescription").value;

  if (resumeText.length > CHAR_LIMITS.resume_experience) {
    showToast(`Your Experience exceeds the ${CHAR_LIMITS.resume_experience} character limit.`, "error");
    return false;
  }

  if (jobDescription.length > CHAR_LIMITS.job_description) {
    showToast(`Job Description exceeds the ${CHAR_LIMITS.job_description} character limit.`, "error");
    return false;
  }

  return true;
}
// Tips and facts to keep users engaged during loading
const LOADING_TIPS = [
  "💡 Pro Tip: Use action verbs like 'Led', 'Designed', or 'Implemented' to make your resume stand out!",
  "⭐ Did you know? 92% of recruiters spend less than 10 seconds on your resume - make it count!",
  "🏃 ATS Fact: Most modern applicant tracking systems scan for keywords first - include relevant skills!",
  "📊 Resume Hack: Quantify your achievements with numbers and percentages whenever possible!",
  "✅ Best Practice: Tailor your resume to each job description for better results!",
  "🚀 Career Tip: A strong summary can make recruiters read further into your resume!",
  "🔥 Engagement Secret: Use specific company names and technologies you've worked with!",
  "💼 Pro Move: Update your LinkedIn to match your resume for maximum visibility!",
  "🎓 Skill Boost: Highlight both technical and soft skills for well-rounded appeal!",
  "⏱️ Time Saver: Most recruiters only scan your resume - put important info upfront!"
];

let currentTipIndex = 0;

function startGenerate(generationType = 'resume') {
  const btn = document.getElementById('generateBtn');
  btn.disabled = true;
  
  // Set button text based on type
  if (generationType === 'resume') {
    btn.innerHTML = '<span class="material-icons-round">hourglass_empty</span> Generating Resume...';
  } else if (generationType === 'cover-letter') {
    btn.innerHTML = '<span class="material-icons-round">hourglass_empty</span> Generating Cover Letter...';
  } else {
    btn.innerHTML = '<span class="material-icons-round">hourglass_empty</span> Generating...';
  }
  
  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.add('show');
  
  // Update loading text
  let loadingText = overlay.querySelector('p');
  if (!loadingText) {
    loadingText = document.createElement('p');
    overlay.querySelector('.spinner').after(loadingText);
  }
  
  if (generationType === 'resume') {
    loadingText.textContent = '✨ Crafting your perfect resume...';
  } else if (generationType === 'cover-letter') {
    loadingText.textContent = '📝 Composing your cover letter...';
  } else {
    loadingText.textContent = '⏳ Working on your document...';
  }
  
  // Start rotating tips
  startTipRotation();
}

function finishGenerate() {
  const btn = document.getElementById('generateBtn');
  btn.disabled = false;
  updateGenerateButtonText(activeView);
  
  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.remove('show');
  
  // Stop tip rotation
  stopTipRotation();
}

let tipInterval = null;

function startTipRotation() {
  stopTipRotation(); // Clear any existing interval
  
  const overlay = document.getElementById('loadingOverlay');
  let tipEl = overlay.querySelector('.loading-tip');
  
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'loading-tip';
    overlay.appendChild(tipEl);
  }
  
  // Show first tip immediately
  tipEl.textContent = LOADING_TIPS[currentTipIndex];
  
  // Rotate tips every 4 seconds
  tipInterval = setInterval(() => {
    currentTipIndex = (currentTipIndex + 1) % LOADING_TIPS.length;
    tipEl.textContent = LOADING_TIPS[currentTipIndex];
  }, 4000);
}

function stopTipRotation() {
  if (tipInterval) {
    clearInterval(tipInterval);
    tipInterval = null;
  }
}

/*************************************************
 * GENERATE RESUME
 *************************************************/
async function generateResume() {
  startGenerate('resume');

  const resumeText = document.getElementById("resumeText").value.trim();
  const jobDescription = document.getElementById("jobDescription").value.trim();
  const style = document.getElementById("styleSelect")?.value || "harvard";

  // ✅ Validation: Empty inputs
  if (!resumeText || !jobDescription) {
    showToast("Please provide both resume text and job description.", "error");
    finishGenerate();
    return;
  }

  // ✅ Validation: Character limits
  if (!validateCharacterLimits()) {
    finishGenerate();
    return;
  }

  // Auth check
  if (!currentUser || !currentUser.email || !currentUser.token) {
    showToast("Session expired. Please login again.", "error");
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
    // 🔒 SECURE: No email in body, use JWT token
    const response = await fetch("/api/generate-resume", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentUser.token}` // 🔒 SECURE: JWT token
      },
      body: JSON.stringify({
        style: style,
        resume_text: resumeText,
        job_description: jobDescription,

        // profile data (NO email field - it comes from JWT token)
        full_name: currentProfile.full_name || currentUser.name || "",
        phone: currentProfile.phone || "",
        location: currentProfile.location || "",
        linkedin: currentProfile.linkedin || "",
        portfolio: currentProfile.portfolio || ""
      })
    });

    const data = await response.json();

    if (!response.ok || !data.resume_html) {
      const msg = data.detail || "Failed to generate resume";
      showToast(msg, "error");
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
    showToast("Resume generated successfully!", "success");  
    finishGenerate();

  } catch (err) {
    console.error("Resume generation error:", err);
    showToast("Network error. Please try again.", "error");
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
    showToast(`Your instruction exceeds ${CHAR_LIMITS.ask_ai_adjust} characters. Please be more concise.`, "error");
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
    // 🔒 SECURE: No email in body, use JWT token
    const response = await fetch("/api/refine-resume", { 
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentUser.token}` // 🔒 SECURE: JWT token
      },
      body: JSON.stringify({
        html: currentHTML,
        instruction: instruction
        // ✅ NO email field - it comes from JWT token
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
    showToast("Error: " + err.message, "error");
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
 * MOBILE RESPONSIVENESS & UI ADJUSTMENTS
 * *************************************************/

// --- 1. MOBILE ACCORDION LOGIC ---
function setupMobileAccordions() {
  // Only run on mobile devices (width < 1000px)
  if (window.innerWidth > 1000) return;

  const inputs = document.querySelectorAll('.input-group');
  
  inputs.forEach(group => {
    // Avoid double-initialization
    if (group.dataset.accordionInit) return;

    const label = group.querySelector('.input-label');
    const content = group.querySelector('textarea, select, .modern-select');
    const counter = group.querySelector('div[id*="Counter"]'); // Character counters

    // Only apply if we found a label and an input area
    if (label && content) {
      group.dataset.accordionInit = "true"; // Mark as done
      
      // Make label look clickable
      label.style.cursor = 'pointer';
      label.style.userSelect = 'none';
      
      // Add the arrow icon if not present
      let arrow = label.querySelector('.accordion-arrow');
      if (!arrow) {
          arrow = document.createElement('span');
          arrow.className = 'material-icons-round accordion-arrow';
          arrow.innerText = 'expand_less'; // Default: Open
          arrow.style.transition = 'transform 0.2s';
          arrow.style.marginLeft = '10px';
          // Add to label
          label.appendChild(arrow);
      }

      // Add Click Handler to toggle visibility
      label.addEventListener('click', () => {
        const isHidden = content.style.display === 'none';
        
        // Toggle Input and Counter
        content.style.display = isHidden ? 'block' : 'none';
        if (counter) counter.style.display = isHidden ? 'block' : 'none';
        
        // Rotate Arrow
        arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
      });
    }
  });
}

// --- 2. DYNAMIC BUTTON TEXT LOGIC (Capitalist Mobile Mode) ---
function updateGenerateButtonText(view) {
  const btn = document.getElementById('generateBtn');
  if (!btn) return;

  // RULE: On Mobile, ALWAYS just say "Generate" (Saves space)
  if (window.innerWidth <= 1000) {
     btn.innerHTML = '<span class="material-icons-round">auto_awesome</span> Generate';
     return;
  }

  // RULE: On Desktop, be specific
  if (view === 'resume') {
      btn.innerHTML = '<span class="material-icons-round">auto_awesome</span> Generate Resume';
  } else if (view === 'coverletter') {
      btn.innerHTML = '<span class="material-icons-round">mail</span> Generate Cover Letter';
  }
}

/*************************************************
 * COVER LETTER FUNCTIONALITY
 *************************************************/
 
// 1. Update activeView state
let activeView = 'resume'; // 'resume' | 'coverletter' | 'history'

// 2. Update switchView function
function switchView(view) {
    activeView = view;
    
    // Update Tabs UI
    document.querySelectorAll('.view-tab').forEach(btn => {
        // Simple text check or logic to set active class
        const text = btn.innerText.toLowerCase();
        if (text.includes(view.replace('_', ' '))) {
             btn.classList.add('active');
        } else {
             btn.classList.remove('active');
        }
    });
    document.querySelectorAll('.view-tab').forEach(b => b.classList.remove('active'));
    // Set current
    event.currentTarget.classList.add('active');


    // Update Content Areas
    const resumeEl = document.getElementById('output');
    const clEl = document.getElementById('output-cl');
    const historyEl = document.getElementById('output-history');
    
    const previewActions = document.getElementById('previewActions'); // ATS & Download buttons
    const refineBar = document.getElementById('aiRefineBar');

    // Hide all first
    resumeEl.style.display = 'none';
    clEl.style.display = 'none';
    historyEl.style.display = 'none';

    if (view === 'resume') {
        resumeEl.style.display = 'block';
        if(previewActions) previewActions.style.visibility = 'visible';
        if(refineBar) refineBar.style.display = 'block';
    } 
    else if (view === 'coverletter') {
        clEl.style.display = 'block';
        if(previewActions) previewActions.style.visibility = 'visible';
        if(refineBar) refineBar.style.display = 'block';
    }
    else if (view === 'history') {
        historyEl.style.display = 'block';
        
        // Hide Actions and Refine bar for History view
        if(previewActions) previewActions.style.visibility = 'hidden';
        if(refineBar) refineBar.style.display = 'none';
        
        // Render Data
        renderHistory();
    }
    updateGenerateButtonText(view);
}

// 3. New Render Function (Mock Data)
function renderHistory() {
    const historyEl = document.getElementById('output-history');
    
    // Mock Data (Later fetch from API)
    const mockSessions = [
        { id: 1, type: 'resume', title: 'Software Engineer - Google', date: '2 mins ago', score: 92 },
        { id: 2, type: 'cover_letter', title: 'Cover Letter - Netflix', date: '2 days ago', score: null },
        { id: 3, type: 'resume', title: 'Frontend Dev - Startup', date: '5 days ago', score: 85 },
    ];

    if (mockSessions.length === 0) {
        historyEl.innerHTML = `
            <div class="empty-state">
                <span class="material-icons-round empty-icon">history</span>
                <h3>No History Yet</h3>
                <p>Your generated resumes will appear here.</p>
            </div>
        `;
        return;
    }

    let html = '<div class="history-grid">';
    
    mockSessions.forEach(session => {
        const icon = session.type === 'resume' ? 'description' : 'mail';
        const typeLabel = session.type === 'resume' ? 'Resume' : 'Cover Letter';
        const scoreBadge = session.score 
            ? `<div class="history-score">ATS: ${session.score}</div>` 
            : '';

        html += `
            <div class="history-card">
                <div class="history-header">
                    <div class="history-icon">
                        <span class="material-icons-round">${icon}</span>
                    </div>
                    ${scoreBadge}
                </div>
                <div>
                    <div class="history-title">${session.title}</div>
                    <div class="history-meta">${typeLabel} • ${session.date}</div>
                </div>
                <div class="history-actions">
                    <button class="btn-history-load" onclick="loadSession(${session.id})">Load</button>
                    <button class="btn-history-delete"><span class="material-icons-round" style="font-size:16px">delete</span></button>
                </div>
            </div>
        `;
    });

    html += '</div>';
    historyEl.innerHTML = html;
}

// 4. Stub for loading a session
function loadSession(id) {
    showToast(`Loading session #${id}... (Backend pending)`, 'info');
    // Logic: Fetch JSON by ID -> Populate Inputs -> Switch View
}

// --- MODAL HANDLING ---
function openCLModal() {
    // Basic validation before opening
    const jobDesc = document.getElementById("jobDescription").value.trim();
    
    if(!jobDesc) { showToast("Please paste a Job Description first.", "error"); return; }
    
    document.getElementById('clModal').style.display = 'flex';
    
    // Setup PDF handlers for modal fields
    setupModalPDFUpload();
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
        showToast(`Motivation text exceeds ${CHAR_LIMITS.cover_letter_extra} characters.`, "error");        return;
    }

    if (highlight.length > CHAR_LIMITS.cover_letter_extra) {
        showToast(`Highlight text exceeds ${CHAR_LIMITS.cover_letter_extra} characters.`, "error");
        return;
    }

    // ✅ Credit Check with Popup
    if (!currentProfile || currentProfile.credits < 1) {
        showCreditPopup();
        return;
    }

    startGenerate('cover-letter'); // Pass document type for context-aware loading message

    try {
        // 🔒 SECURE: No email in body, use JWT token
        const response = await fetch("/api/generate-cover-letter", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${currentUser.token}` // 🔒 SECURE: JWT token
            },
            body: JSON.stringify({
                style: "professional, concise, one-page format", // Fixed style for CL
                resume_text: resumeText,
                job_description: jobDescription,
                hiring_manager: manager,
                motivation: motivation,
                highlight: highlight
                // ✅ NO email field - it comes from JWT token
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

        
        currentProfile.credits = data.credits_left;
        document.getElementById("creditCount").innerText = currentProfile.credits;

        // Render HTML
        document.getElementById("output-cl").innerHTML = data.cover_letter_html;
        document.getElementById("output-cl").contentEditable = true; // Allow manual edits
        
        // Show Refine Bar (content was generated successfully)
        document.getElementById("aiRefineBar").style.display = "block";
        showToast("Cover Letter generated successfully!", "success");

    } catch (err) {
        console.error(err);
        showToast(err.message, "error");
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
    if (!instruction) {
    showToast("Please enter an instruction.", "info");
    return;
  }

    // ✅ Character limit validation
    if (instruction.length > CHAR_LIMITS.ask_ai_adjust) {
    showToast(`Instruction exceeds ${CHAR_LIMITS.ask_ai_adjust} chars.`, "error");
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
        // 🔒 SECURE: No email in body, use JWT token
        const res = await fetch("/api/refine-resume", {
             method: "POST",
             headers: { 
                 "Content-Type": "application/json",
                 "Authorization": `Bearer ${currentUser.token}` // 🔒 SECURE: JWT token
             },
             body: JSON.stringify({
                 html: currentHTML,
                 instruction: instruction,
                 type: "cover_letter"
                 // ✅ NO email field - it comes from JWT token
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
        showToast("Refinement complete!", "success");
        btn.style.background = "#10B981";
        setTimeout(() => { 
            btn.style.background = "";
        }, 1000);

    } catch(e) { 
      console.error(e);
      showToast(err.message, "error");
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
      showToast(`Your ${title} is not ready yet. Please generate it first.`, "error");
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


// --- TOAST NOTIFICATION SYSTEM ---
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'info';
  if (type === 'success') icon = 'check_circle';
  if (type === 'error') icon = 'error_outline';

  toast.innerHTML = `
    <span class="material-icons-round">${icon}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Replace standard alerts with this globally accessible function
window.showToast = showToast;


document.addEventListener("DOMContentLoaded", () => {
   loadUserProfile();
   setupCharacterCounters();

   setupMobileAccordions();
   
   updateGenerateButtonText(activeView);
});


window.addEventListener('resize', () => {
    updateGenerateButtonText(activeView);
    setupMobileAccordions(); // Re-check in case layout changed
});