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
  const title = document.getElementById("profileTitle");
  const subtitle = document.getElementById("profileSubtitle");

  const emailInput = document.getElementById("email");
  if (emailInput && user.email) {
      emailInput.value = user.email;
  }

  try {
    // 🔒 SECURE: Use JWT token, not email parameter
    const res = await fetch("/api/profile", {
      headers: {
        "Authorization": `Bearer ${user.token}`
      }
    });

    if (!res.ok) {
      throw new Error("Failed to load profile");
    }

    const profile = await res.json();

    if (profile) {
      document.getElementById("fullName").value = profile.full_name || "";
      document.getElementById("phone").value = profile.phone || "";
      document.getElementById("location").value = profile.location || "";
      document.getElementById("linkedin").value = profile.linkedin || "";
      document.getElementById("portfolio").value = profile.portfolio || "";

      // Display email preview
      document.getElementById("email").value = user.email;
      document.getElementById("email").readOnly = true;

      title.innerText = "Edit Your Profile";
      subtitle.innerText = "Update your details anytime.";

      // Set initials
      if (profile.full_name) {
        const initials = profile.full_name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .substring(0, 2)
          .toUpperCase();
        document.getElementById("avatarInitials").innerText = initials;
      }
    }
    else {
      title.innerText = "Complete Your Profile";
      subtitle.innerText = "We'll use these details to build your resume.";
      autofillFromGoogleIfEmpty();
      // Optional: Info toast for new users
      showToast("Welcome! Please complete your profile.", "info");
    }
  } catch (err) {
    console.error("Error loading profile:", err);
    
    // ✅ UX IMPROVEMENT: Error Toast
    showToast("Could not load profile data. Please refresh.", "error");

    // Fallback UX
    title.innerText = "Complete Your Profile";
    subtitle.innerText = "We'll use these details to build your resume.";
    autofillFromGoogleIfEmpty();
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