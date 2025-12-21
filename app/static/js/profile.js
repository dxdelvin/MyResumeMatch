const user = JSON.parse(localStorage.getItem("user"));

if (!user || !user.email) {
  window.location.href = "/";
}

document.getElementById("email").value = user.email;

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

  try {
    const res = await fetch(
      `/api/profile?email=${encodeURIComponent(user.email)}`
    );

    if (!res.ok) {
      throw new Error("Failed to load profile");
    }

    const profile = await res.json();

    // ✅ CASE 1: Profile exists → Edit mode
    if (profile) {
      document.getElementById("fullName").value = profile.full_name || "";
      document.getElementById("phone").value = profile.phone || "";
      document.getElementById("location").value = profile.location || "";
      document.getElementById("linkedin").value = profile.linkedin || "";
      document.getElementById("portfolio").value = profile.portfolio || "";

      title.innerText = "Edit Your Profile";
      subtitle.innerText = "Update your details anytime.";

      const initials = profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();

      document.getElementById("avatarInitials").innerText = initials;
    }
    // ✅ CASE 2: No profile → First-time user
    else {
      title.innerText = "Complete Your Profile";
      subtitle.innerText =
        "We'll use these details to build your resume.";

      autofillFromGoogleIfEmpty();
    }
  } catch (err) {
    console.error("Error loading profile:", err);

    // Fallback UX
    title.innerText = "Complete Your Profile";
    subtitle.innerText =
      "We'll use these details to build your resume.";

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

  const payload = {
    email: user.email,
    full_name: fullName,
    phone: document.getElementById("phone").value,
    location: document.getElementById("location").value,
    linkedin: document.getElementById("linkedin").value,
    portfolio: document.getElementById("portfolio").value,
  };

  try {
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    window.location.href = "/builder";
  } catch (err) {
    console.error("Error saving profile:", err);
    alert("Something went wrong");
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
