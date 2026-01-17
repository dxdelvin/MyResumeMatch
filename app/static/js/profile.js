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

// 🎉 Handle Promocode Application
async function applyPromocodeButton() {
  const promocodeInput = document.getElementById("promocode");
  const promocode = promocodeInput.value.trim().toUpperCase();
  const msgDiv = document.getElementById("promoMessage");
  const applyBtn = document.getElementById("applyPromoBtn");

  if (!promocode) {
    msgDiv.style.display = "block";
    msgDiv.style.background = "#fee2e2";
    msgDiv.style.color = "#dc2626";
    msgDiv.innerText = "⚠️ Please enter a promocode";
    return;
  }

  // Disable button during request
  applyBtn.disabled = true;
  applyBtn.innerText = "Validating...";

  try {
    const res = await authorizedFetch("/api/promocode/validate?promocode=" + encodeURIComponent(promocode), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${user.token}`
      }
    });

    if (!res) {
      msgDiv.style.display = "block";
      msgDiv.style.background = "#fee2e2";
      msgDiv.style.color = "#dc2626";
      msgDiv.innerText = "❌ Network error";
      applyBtn.disabled = false;
      applyBtn.innerText = "Apply Code";
      return;
    }

    if (res.ok) {
      const data = await res.json();
      msgDiv.style.display = "block";
      msgDiv.style.background = "#dcfce7";
      msgDiv.style.color = "#166534";
      msgDiv.innerText = `✅ ${data.message}`;
      
      // Update credit display
      const creditDisplay = document.getElementById("profileCreditCount");
      if (creditDisplay) {
        creditDisplay.innerText = data.total_credits || data.credits_awarded;
      }
      
      // Disable input and button after successful redemption
      promocodeInput.disabled = true;
      applyBtn.disabled = true;
      applyBtn.innerText = "Applied ✓";
      applyBtn.style.background = "#10B981";
    } else {
      const error = await res.json();
      msgDiv.style.display = "block";
      msgDiv.style.background = "#fee2e2";
      msgDiv.style.color = "#dc2626";
      msgDiv.innerText = `❌ ${error.detail || "Invalid promocode"}`;
      applyBtn.disabled = false;
      applyBtn.innerText = "Apply Code";
    }
  } catch (err) {
    console.error(err);
    msgDiv.style.display = "block";
    msgDiv.style.background = "#fee2e2";
    msgDiv.style.color = "#dc2626";
    msgDiv.innerText = "❌ Error validating promocode";
    applyBtn.disabled = false;
    applyBtn.innerText = "Apply Code";
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
    const res = await authorizedFetch("/api/profile", {
      headers: {
        "Authorization": `Bearer ${user.token}`
      }
    });

    if (!res) return; // Network error handled by authorizedFetch

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

      // Show/hide promocode section based on redemption status
      const promoInputSection = document.getElementById("promoInputSection");
      const promoAppliedMessage = document.getElementById("promoAppliedMessage");
      const promoCodeDisplay = document.getElementById("appliedPromoCode");
      
      if (profile.promocode_redeemed) {
        if (promoInputSection) promoInputSection.style.display = "none";
        if (promoAppliedMessage) promoAppliedMessage.style.display = "block";
        // Show which code was applied
        if (promoCodeDisplay && profile.promocode_used) {
          promoCodeDisplay.innerText = profile.promocode_used;
        }
      } else {
        if (promoInputSection) promoInputSection.style.display = "block";
        if (promoAppliedMessage) promoAppliedMessage.style.display = "none";
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
  const btn = document.querySelector('#profileForm button[type="submit"]');
  const originalText = btn ? btn.innerText : "Save Profile";

  if (!fullName) {
    showToast("Full name is required", "error");
    return;
  }

  // Disable button during save
  if (btn) {
    btn.disabled = true;
    btn.innerText = "Saving...";
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
    const res = await authorizedFetch("/api/profile", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${user.token}` 
      },
      body: JSON.stringify(payload),
    });

    if (!res) {
      // Network error handled by authorizedFetch
      if (btn) {
        btn.disabled = false;
        btn.innerText = originalText;
      }
      return;
    }

    if (res.ok) {
      const data = await res.json();
      // Check if there was a promocode error during profile creation
      if (data.error) {
        showToast(data.error, "error");
      }
      showToast(data.message || "Profile saved successfully!", "success");
      setTimeout(() => window.location.href = "/builder", 2200);
    } else {
      const errorData = await res.json().catch(() => ({}));
      showToast(errorData.detail || "Failed to save profile", "error");
      if (btn) {
        btn.disabled = false;
        btn.innerText = originalText;
      }
    }
  } catch (err) {
    console.error("Save profile error:", err);
    showToast("Network error. Please try again.", "error");
    if (btn) {
      btn.disabled = false;
      btn.innerText = originalText;
    }
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

  // Setup promocode button
  const applyPromoBtn = document.getElementById("applyPromoBtn");
  if (applyPromoBtn) {
    applyPromoBtn.addEventListener("click", applyPromocodeButton);
  }

  // Allow Enter key to apply promocode
  const promocodeInput = document.getElementById("promocode");
  if (promocodeInput) {
    promocodeInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyPromocodeButton();
      }
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

    const res = await authorizedFetch("/api/profile", {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${user.token}`
      }
    });

    if (!res) return; // Network error handled by authorizedFetch

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