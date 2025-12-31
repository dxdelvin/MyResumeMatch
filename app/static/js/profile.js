const user = JSON.parse(localStorage.getItem("user"));

if (!user || !user.email) {
  window.location.href = "/";
}

// ℹ️ Email is NOT displayed in form anymore - it comes from JWT token
// document.getElementById("email").value = user.email;

// Autofill from Google (fallback only)
function autofillFromGoogleIfEmpty() {
  const fullNameInput = document.getElementById("fullName");

  if (!fullNameInput.value && user.name) {
    fullNameInput.value = user.name;

    const initials = user.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();

    document.getElementById("avatarInitials").innerText = initials;
  }
}

async function loadProfile() {
  const title = document.getElementById("pageTitle");
  const subtitle = document.getElementById("pageSubtitle");

  const emailInput = document.getElementById("email");
  if (emailInput && user.email) {
      emailInput.value = user.email;
  }

  try {
    // 🔒 SECURE: Use JWT token, not email parameter
    const res = await authorizedFetch("/api/profile", true);

    if (!res.ok) {
      throw new Error("Failed to load profile");
    }

    const profile = await res.json();

    if (profile && profile.full_name) {
      // Existing user with complete profile
      document.getElementById("fullName").value = profile.full_name || "";
      document.getElementById("phone").value = profile.phone || "";
      document.getElementById("location").value = profile.location || "";
      document.getElementById("linkedin").value = profile.linkedin || "";
      document.getElementById("portfolio").value = profile.portfolio || "";

      // Display email preview
      document.getElementById("email").value = user.email;
      document.getElementById("email").readOnly = true;

      const dangerZone = document.getElementById("dangerZone");
      if (dangerZone) dangerZone.style.display = "block";

      title.innerText = "Edit Your Profile";
      subtitle.innerText = "Update your details anytime.";

      // Set initials
      if (profile.full_name) {
        const initials = profile.full_name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
        document.getElementById("avatarInitials").innerText = initials;
      }

      const creditDisplay = document.getElementById("profileCreditCount");
      if (creditDisplay) {
          creditDisplay.innerText = profile.credits || 0;
      }

      const historyContainer = document.getElementById("paymentHistoryContainer");
      const emptyHistory = document.getElementById("emptyHistory");
      const historyBody = document.getElementById("paymentHistoryBody");
      
      if (profile.history && profile.history.length > 0) {
          if(historyContainer) historyContainer.style.display = "block";
          if(emptyHistory) emptyHistory.style.display = "none";
          
          if(historyBody) {
             historyBody.innerHTML = profile.history.map(pay => `
                <tr>
                    <td>${pay.date}</td>
                    <td><span style="background:#eff6ff; color:#1d4ed8; padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:600;">${pay.plan}</span></td>
                    <td>${pay.amount}</td>
                    <td style="text-align: right; color: #059669; font-weight: 700;">${pay.credits}</td>
                </tr>
             `).join("");
          }
      } else {
          if(historyContainer) historyContainer.style.display = "none";
          if(emptyHistory) emptyHistory.style.display = "block";
      }

    }
    else {
      // New user - no profile yet
      const dangerZone = document.getElementById("dangerZone");
      if (dangerZone) dangerZone.style.display = "none";

      title.innerText = "Complete Your Profile";
      subtitle.innerText = "We'll use these details to build your resume.";
      autofillFromGoogleIfEmpty();
      switchProfileTab('settings');
      showToast("Welcome! Please complete your profile.", "info");
    }
  } catch (err) {
    console.error("Error loading profile:", err);
    
    // New user scenario - show profile completion form
    const dangerZone = document.getElementById("dangerZone");
    if (dangerZone) dangerZone.style.display = "none";

    title.innerText = "Complete Your Profile";
    subtitle.innerText = "We'll use these details to build your resume.";
    autofillFromGoogleIfEmpty();
    switchProfileTab('settings');
    showToast("Welcome! Please complete your profile first.", "info");
  }
}

// Save profile
async function saveProfile() {
  const fullName = document.getElementById("fullName").value.trim();

  if (!fullName) {
    alert("Full name is required");
    return;
  }

  // 🔒 SECURE: No email field, it comes from JWT token
  const payload = {
    full_name: fullName,
    phone: document.getElementById("phone").value,
    location: document.getElementById("location").value,
    linkedin: document.getElementById("linkedin").value,
    portfolio: document.getElementById("portfolio").value,
  };

  try {
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${user.token}` 
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
        showToast("Profile updated successfully!", "success");
        setTimeout(() => window.location.href = "/builder", 2200);
    } else {
        showToast("Failed to save profile", "error");
        btn.disabled = false;
        btn.innerText = originalText;
    }
  } catch (err) {
    showToast("Network error", "error");
    btn.disabled = false;
    btn.innerText = originalText;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadProfile();

  const form = document.getElementById("profileForm");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      saveProfile();
    });
  }
});

function switchProfileTab(tabName) {
    const title = document.getElementById("pageTitle");
    const subtitle = document.getElementById("pageSubtitle");
    const walletView = document.getElementById("walletView");
    const settingsView = document.getElementById("settingsView");
    const tabs = document.querySelectorAll(".tab-btn");

    if (tabName === 'wallet') {
        // Show Wallet
        walletView.style.display = "block";
        settingsView.style.display = "none";
        title.innerText = "My Wallet";
        subtitle.innerText = "Manage your credits and transactions.";
        
        // Update Tab Active State - tabs[0] is "Edit Profile", tabs[1] is "My Wallet"
        tabs[0].classList.remove("active");
        tabs[1].classList.add("active");
        
    } else {
        // Show Settings
        walletView.style.display = "none";
        settingsView.style.display = "block";
        title.innerText = "Edit Profile";
        subtitle.innerText = "Update your resume details.";
        
        // Update Tab Active State - tabs[0] is "Edit Profile", tabs[1] is "My Wallet"
        tabs[0].classList.add("active");
        tabs[1].classList.remove("active");
    }
}


async function handleDeleteAccount() {
  // 🔒 CHECK 1: The "Are you sure?"
  const firstCheck = await showConfirmDialog(
    "⚠️ Delete Account?",
    "You are about to delete your account. This action is PERMANENT and cannot be undone.",
    "Delete",
    "Cancel",
    true
  );

  if (!firstCheck) return;

  // 🔒 CHECK 2: The "Money/Credits" Warning
  const creditEl = document.getElementById("profileCreditCount");
  const credits = creditEl ? creditEl.innerText : "any";

  const secondCheck = await showConfirmDialog(
    "🛑 CRITICAL WARNING",
    `You currently have ${credits} credits.\n\nDeleting your account will PERMANENTLY ERASE these credits.\nThere are NO REFUNDS for deleted accounts.\n\nDo you really want to proceed?`,
    "Delete Everything",
    "Keep Account",
    true
  );

  if (!secondCheck) return;

  // 🚀 EXECUTE DELETION
  try {
    const btn = document.querySelector("button[onclick='handleDeleteAccount()']");
    if(btn) {
        btn.innerText = "Deleting...";
        btn.disabled = true;
    }

    const res = await fetch("/api/profile", {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${user.token}`
      }
    });

    if (res.ok) {
      showToast("Account deleted successfully.", "success");
      // Clear local storage and bounce to home
      setTimeout(() => {
        localStorage.clear();
        window.location.href = "/";
      }, 1500);
    } else {
      showToast("Error: Could not delete account. Please try again or contact support.", "error");
      if(btn) {
          btn.innerText = "Delete Account";
          btn.disabled = false;
      }
    }
  } catch (err) {
    console.error(err);
    showToast("Network error. Please check your connection.", "error");
    const btn = document.querySelector("button[onclick='handleDeleteAccount()']");
    if(btn) {
        btn.innerText = "Delete Account";
        btn.disabled = false;
    }
  }
}