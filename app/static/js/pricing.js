async function selectPlan(plan) {
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user || !user.email) {
    alert("Please sign in to continue");
    window.location.href = "/";
    return;
  }

  try {
    const res = await fetch("/api/billing/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan: plan,          // basic | popular | pro
        email: user.email,   // REQUIRED
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("Checkout error:", err);
      alert("Failed to start checkout");
      return;
    }

    const data = await res.json();

    // Redirect to Stripe Checkout
    window.location.href = data.checkout_url;

  } catch (err) {
    console.error("Network error:", err);
    alert("Something went wrong");
  }
}



// Add some interactive effects
document.addEventListener('DOMContentLoaded', function() {
  // Check for payment status on pricing page
  checkPaymentStatus();

  // Add hover effects to pricing cards
  const cards = document.querySelectorAll('.pricing-card');

  cards.forEach(card => {
    card.addEventListener('mouseenter', function() {
      if (!this.classList.contains('popular')) {
        this.style.transform = 'translateY(-5px)';
      }
    });

    card.addEventListener('mouseleave', function() {
      if (!this.classList.contains('popular')) {
        this.style.transform = 'translateY(0)';
      }
    });
  });
});

function logout() {
      localStorage.removeItem("user");
      localStorage.removeItem("profile");
      // Also clear any other potential keys
      localStorage.removeItem("currentProfile");
      window.location.href = "/";
    }