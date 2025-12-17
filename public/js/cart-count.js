document.addEventListener("DOMContentLoaded", () => {
  const cartCountEl = document.querySelector("#cart-count");
  if (!cartCountEl) return; // Exit if page doesn't have a cart count element

  async function updateCartCount() {
    try {
      const res = await fetch("/cart/count");
      const data = await res.json();
      if (data.success) {
        cartCountEl.textContent = data.count;
      }
      
    } catch (error) {
      console.error("Cart count update failed:", error);
    }
  }

  // Initial load
  updateCartCount();

  // Global listener for "cart-updated" event (can be triggered anywhere)
  window.addEventListener("cart-updated", updateCartCount);
});
