function selectPlan(planType) {
  // For now, just show an alert. In a real app, this would integrate with payment processing
  const planDetails = {
    starter: { name: 'Starter', price: '$9/month', credits: '50' },
    professional: { name: 'Professional', price: '$19/month', credits: '200' },
    enterprise: { name: 'Enterprise', price: '$49/month', credits: 'Unlimited' }
  };

  const plan = planDetails[planType];

  alert(`🎉 You selected the ${plan.name} plan!\n\nPrice: ${plan.price}\nCredits: ${plan.credits} generations\n\nPayment integration coming soon!`);

  // In a real implementation, you would:
  // 1. Redirect to payment processor (Stripe, PayPal, etc.)
  // 2. Handle successful payment
  // 3. Update user credits in database
  // 4. Redirect back to builder
}

// Add some interactive effects
document.addEventListener('DOMContentLoaded', function() {
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