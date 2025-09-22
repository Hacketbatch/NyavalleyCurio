// Cart functionality
document.addEventListener("DOMContentLoaded", function () {
  // Update cart count
  updateCartCount();

  // Add to cart buttons
  const addToCartButtons = document.querySelectorAll(".add-to-cart");
  addToCartButtons.forEach((button) => {
    button.addEventListener("click", function (e) {
      e.preventDefault();
      const productId = this.dataset.productId;
      addToCart(productId);
    });
  });

  // Quantity controls in cart
  const quantityButtons = document.querySelectorAll(".quantity-btn");
  quantityButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const input = this.parentElement.querySelector(".quantity-input");
      const productId = this.dataset.productId;
      let quantity = parseInt(input.value);

      if (this.classList.contains("decrease")) {
        quantity = Math.max(1, quantity - 1);
      } else {
        quantity += 1;
      }

      input.value = quantity;
      updateCartQuantity(productId, quantity);
    });
  });

  // Remove item from cart
  const removeButtons = document.querySelectorAll(".remove-item");
  removeButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const productId = this.dataset.productId;
      removeFromCart(productId);
    });
  });

  // Address selection in checkout
  const addressCards = document.querySelectorAll(".address-card");
  addressCards.forEach((card) => {
    card.addEventListener("click", function () {
      addressCards.forEach((c) => c.classList.remove("selected"));
      this.classList.add("selected");
      document.querySelector('input[name="shipping_address_id"]').value =
        this.dataset.addressId;
    });
  });

  // Payment method selection
  const paymentOptions = document.querySelectorAll(".payment-option");
  paymentOptions.forEach((option) => {
    option.addEventListener("click", function () {
      paymentOptions.forEach((o) => o.classList.remove("selected"));
      this.classList.add("selected");
      document.querySelector('input[name="payment_method"]').value =
        this.dataset.method;
    });
  });

  // Place order button
  const placeOrderBtn = document.getElementById("place-order");
  if (placeOrderBtn) {
    placeOrderBtn.addEventListener("click", function (e) {
      e.preventDefault();
      placeOrder();
    });
  }
});

// Update cart count
function updateCartCount() {
  fetch("/cart-count")
    .then((response) => response.json())
    .then((data) => {
      const cartCountElements = document.querySelectorAll(".cart-count");
      cartCountElements.forEach((element) => {
        element.textContent = data.count;
      });
    })
    .catch((error) => console.error("Error:", error));
}

// Add product to cart
function addToCart(productId, quantity = 1) {
  fetch("/add-to-cart", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_id: productId,
      quantity: quantity,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        alert("Product added to cart!");
        updateCartCount();
      } else {
        alert("Error: " + data.message);
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      alert("An error occurred. Please try again.");
    });
}

// Update cart quantity
function updateCartQuantity(productId, quantity) {
  fetch("/update-cart", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_id: productId,
      quantity: quantity,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        location.reload(); // Reload to update totals
      } else {
        alert("Error: " + data.message);
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      alert("An error occurred. Please try again.");
    });
}

// Remove item from cart
function removeFromCart(productId) {
  if (confirm("Are you sure you want to remove this item from your cart?")) {
    fetch("/update-cart", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product_id: productId,
        quantity: 0,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          location.reload(); // Reload to update cart
          updateCartCount();
          alert("Item removed from cart");
          location.reload();
        } else {
          alert("Error: " + data.message);
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        alert("An error occurred. Please try again.");
      });
  }
}

// Place order
function placeOrder() {
  const shippingAddressId = document.querySelector(
    'input[name="shipping_address_id"]'
  ).value;
  const paymentMethod = document.querySelector(
    'input[name="payment_method"]'
  ).value;

  if (!shippingAddressId) {
    alert("Please select a shipping address");
    return;
  }

  if (!paymentMethod) {
    alert("Please select a payment method");
    return;
  }

  fetch("/place-order", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      shipping_address_id: shippingAddressId,
      payment_method: paymentMethod,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        alert("Order placed successfully! Your order ID is: " + data.orderId);
        window.location.href = "/account?order_success=true";
      } else {
        alert("Error: " + data.message);
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      alert("An error occurred. Please try again.");
    });
}

// Add new address
function addNewAddress() {
  const country = document.getElementById("new_country").value;
  const state = document.getElementById("new_state").value;
  const city = document.getElementById("new_city").value;
  const streetAddress = document.getElementById("new_street_address").value;
  const zipCode = document.getElementById("new_zip_code").value;
  const addressType = document.getElementById("new_address_type").value;

  if (!country || !state || !city || !streetAddress || !zipCode) {
    alert("Please fill in all address fields");
    return;
  }

  fetch("/add-address", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      country: country,
      state: state,
      city: city,
      street_address: streetAddress,
      zip_code: zipCode,
      address_type: addressType,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        alert("Address added successfully!");
        location.reload();
      } else {
        alert("Error: " + data.message);
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      alert("An error occurred. Please try again.");
    });
}
