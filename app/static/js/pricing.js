const PRICING = {
  inr: { symbol: "₹", basic: "129", popular: "249", pro: "499" },
  eur: { symbol: "€", basic: "3.99", popular: "4.99", pro: "9.99" }
};


async function selectPlan(plan) {
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user || !user.email) {
    alert("Please sign in to continue");
    window.location.href = "/";
    return;
  }

  try {
    // 🔒 SECURE: No email in body, use JWT token
    const res = await fetch("/api/billing/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${user.token}` // 🔒 SECURE: JWT token
      },
      body: JSON.stringify({
        plan: plan,
        currency: currentCurrency,  
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("Checkout error:", err);
      alert("Failed to start checkout");
      return;
    }

    const data = await res.json();
    window.location.href = data.checkout_url;

  } catch (err) {
    alert("Something went wrong");
  }
}



// Add some interactive effects
document.addEventListener('DOMContentLoaded', function() {
  console.log(detectRegion())
  detectRegion();
  checkPaymentStatus();
  setupHoverEffects();

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

function detectRegion() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // If timezone is Indian Standard Time (IST)
  if (timeZone === 'Asia/Calcutta' || timeZone === 'Asia/Kolkata') {
    setCurrency('inr');
    showToast("🇮🇳 Special pricing applied for India!", "success");
  } else {
    setCurrency('eur');
  }
}

function setCurrency(currency) {
  currentCurrency = currency;
  const p = PRICING[currency];

  // Update HTML Elements (You need to add these IDs to HTML in Step 4)
  if(document.getElementById('price-basic')) document.getElementById('price-basic').innerText = p.symbol + p.basic;
  if(document.getElementById('price-popular')) document.getElementById('price-popular').innerText = p.symbol + p.popular;
  if(document.getElementById('price-pro')) document.getElementById('price-pro').innerText = p.symbol + p.pro;
}
