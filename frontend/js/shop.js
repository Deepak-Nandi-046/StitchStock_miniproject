const customerUser = typeof u !== 'undefined' ? u : guard('customer');
if (!customerUser) {
  // guard redirects cross-role visitors
} else {
  initShop();
}

let shopProducts = [];
let activeCategory = 'All';

async function initShop() {
  bindShopHeader();
  const app = document.getElementById('shopApp');
  app.innerHTML = `
    <section class="shop-hero" id="home">
      <div class="hero-content">
        <h1>Handmade <em>Crochet Treasures</em></h1>
        <p class="hero-category">Bags <span>✿</span> Flowers <span>✿</span> Gifts <span>✿</span> Custom Orders</p>
        <a class="pill-btn" href="#shop">Shop Now →</a>
        <div class="feature-row">
          <span class="feature-badge">🧶 Handmade with Love</span>
          <span class="feature-badge">♧ Unique Designs</span>
          <span class="feature-badge">🎁 Custom Orders Available</span>
        </div>
      </div>
      <aside class="hero-quote">More than just yarn, it’s happiness in every stitch ♡</aside>
    </section>
    <nav class="category-strip" id="categoryStrip" aria-label="Product categories"></nav>
    <section class="section-wrap" id="featured">
      <div class="section-head"><h2>Featured Products</h2></div>
      <div class="featured-layout"><div class="shop-skeleton-grid"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div></div>
    </section>
    <section class="section-wrap" id="shop">
      <div class="all-toolbar">
        <div>
          <div class="section-head"><h2>All Products</h2></div>
          <div class="filter-chips" id="filterChips"></div>
        </div>
        <label>Sort by
          <select class="sort-select" id="sortSelect">
            <option value="newest">Newest</option>
            <option value="low">Price low to high</option>
            <option value="high">Price high to low</option>
          </select>
        </label>
      </div>
      <div class="product-grid all-grid" id="allProducts"><div class="empty-state">Loading products... 🧶</div></div>
    </section>
    <section class="orders-section" id="orders">
      <h2>My Orders</h2>
      <div id="ordersList"><div class="empty-state">Loading your orders... 🧶</div></div>
    </section>
    <footer class="shop-footer" id="about">
      Payment is done manually. The owner confirms it after you pay through PhonePe.
    </footer>`;

  await Promise.all([loadProducts(), loadOrders()]);
}

function bindShopHeader() {
  if (typeof updateBagCount === 'function') updateBagCount();
  const bagHeader = document.getElementById('bagHeader');
  if (bagHeader) bagHeader.onclick = openBag;
  const search = document.getElementById('headerSearch');
  if (search) {
    search.addEventListener('input', () => renderAllProducts(search.value));
  }
  const wishlistHeader = document.getElementById('wishlistHeader');
  if (wishlistHeader) wishlistHeader.onclick = () => {
    activeCategory = 'Wishlist';
    renderAllProducts(document.getElementById('headerSearch')?.value || '');
    document.getElementById('shop').scrollIntoView();
  };
}

async function loadProducts() {
  try {
    shopProducts = await api('/products');
    renderCategories();
    renderFeatured();
    renderAllProducts();
  } catch (error) {
    document.getElementById('allProducts').innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
    toast(error.message);
  }
}

async function loadOrders() {
  try {
    const orders = await api('/orders/mine');
    if (!orders.length) {
      document.getElementById('ordersList').innerHTML = '<div class="empty-state">No orders yet 🧶</div>';
      return;
    }
    document.getElementById('ordersList').innerHTML = `
      <table class="orders-table">
        <thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Status</th><th>Queue position</th></tr></thead>
        <tbody>${orders.map(order => {
          const product = shopProducts.find(p => p.id === order.productId);
          return `<tr>
            <td data-label="#">${esc(shortId(order.id))}</td>
            <td data-label="Item">${esc(product ? product.name : 'Unknown item')}</td>
            <td data-label="Qty">${esc(order.qty)}</td>
            <td data-label="Status">${chip(order.status)}</td>
            <td data-label="Queue position">${esc(order.queuePosition ? '#' + order.queuePosition : '—')}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  } catch (error) {
    document.getElementById('ordersList').innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
    toast(error.message);
  }
}

function shortId(value) {
  return String(value).length > 8 ? String(value).slice(0, 8) : String(value);
}

function categoryForProduct(product) {
  if (product.category) return String(product.category);
  const name = String(product.name).toLowerCase();
  // TODO: Backend does not return categories yet; infer category from product name.
  if (name.includes('bag') || name.includes('tote')) return 'Bags';
  if (name.includes('bouquet')) return 'Bouquets';
  if (name.includes('flower')) return 'Flowers';
  if (name.includes('handbag')) return 'Handbags';
  if (name.includes('keychain')) return 'Keychains';
  if (name.includes('home') || name.includes('decor')) return 'Home Decor';
  if (name.includes('custom')) return 'Custom Orders';
  return 'Accessories';
}

function renderCategories() {
  const categories = [
    ['Bags', '🛍️'], ['Bouquets', '💐'], ['Flowers', '🌸'], ['Handbags', '🧵'],
    ['Home Decor', '🌻'], ['Accessories', '🎀'], ['Keychains', '⭐'], ['Custom Orders', '🎁']
  ];
  document.getElementById('categoryStrip').innerHTML = categories.map(([name, icon]) =>
    `<button type="button" class="category-tile${activeCategory === name ? ' active' : ''}" data-category="${esc(name)}">
      <span class="category-icon" aria-hidden="true">${icon}</span><span>${esc(name)}</span>
    </button>`
  ).join('');
  document.querySelectorAll('[data-category]').forEach(button => {
    button.onclick = () => {
      activeCategory = button.dataset.category;
      renderCategories();
      renderAllProducts(document.getElementById('headerSearch')?.value || '');
      document.getElementById('shop').scrollIntoView();
    };
  });
}

function renderFeatured() {
  const featured = shopProducts.slice(0, 4);
  const host = document.querySelector('.featured-layout');
  if (!featured.length) {
    host.innerHTML = '<div class="empty-state">No featured crochet pieces yet 🧶</div>';
    return;
  }
  host.innerHTML = `
    <div class="product-grid">${featured.map(productCard).join('')}</div>
    <aside class="promo-stack">
      <article class="promo-card">
        <h3>Handmade <em>Crochet Bags</em></h3>
        <p>Stylish · Unique · Everyday Use</p>
        <button type="button" class="pill-btn" data-promo-category="Bags">Explore Bags →</button>
      </article>
      <article class="promo-card flowers">
        <h3>Beautiful <em>Crochet Flowers</em></h3>
        <p>Perfect for gifting & home decor</p>
        <button type="button" class="pill-btn" data-promo-category="Flowers">Shop Flowers →</button>
      </article>
    </aside>`;
  bindProductActions(host);
  document.querySelectorAll('[data-promo-category]').forEach(button => {
    button.onclick = () => {
      activeCategory = button.dataset.promoCategory;
      renderCategories();
      renderAllProducts();
      document.getElementById('shop').scrollIntoView();
    };
  });
}

function getWishlist() {
  try {
    const value = JSON.parse(localStorage.getItem('ss_wishlist') || '[]');
    return Array.isArray(value) ? value.map(String) : [];
  } catch (e) { return []; }
}

function setWishlist(ids) {
  try { localStorage.setItem('ss_wishlist', JSON.stringify(ids)); } catch (e) {}
  updateWishlistCount();
}

function getBag() {
  try {
    const value = JSON.parse(localStorage.getItem('ss_bag') || '[]');
    return Array.isArray(value) ? value.map(String) : [];
  } catch (e) { return []; }
}

function setBag(ids) {
  try { localStorage.setItem('ss_bag', JSON.stringify(ids)); } catch (e) {}
  updateBagCount();
}

function updateBagCount() {
  const badge = document.getElementById('bagCount');
  if (badge) badge.textContent = String(getBag().length);
}

function openBag() {
  let drawer = document.getElementById('bagDrawer');
  if (!drawer) {
    drawer = document.createElement('aside');
    drawer.id = 'bagDrawer';
    drawer.className = 'bag-drawer';
    drawer.setAttribute('aria-label', 'Shopping bag');
    drawer.innerHTML = `
      <div class="bag-backdrop" data-close-bag></div>
      <div class="bag-panel" role="dialog" aria-modal="true" aria-labelledby="bagTitle">
        <div class="bag-head">
          <h2 id="bagTitle">My Bag</h2>
          <button type="button" class="icon-btn" data-close-bag aria-label="Close bag">×</button>
        </div>
        <div class="bag-items" id="bagItems"></div>
        <div class="bag-footer">
          <div class="bag-total"><span>Bag total</span><strong id="bagTotal">₹0</strong></div>
          <button type="button" class="pill-btn" id="placeBagOrder">Place Order</button>
        </div>
      </div>`;
    document.body.appendChild(drawer);
  }
  drawer.hidden = false;
  drawer.querySelectorAll('[data-close-bag]').forEach(button => {
    button.onclick = () => { drawer.hidden = true; };
  });
  renderBag();
}

function getBagItems() {
  try {
    const value = JSON.parse(localStorage.getItem('ss_bag_items') || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch (e) { return {}; }
}

function setBagItems(items) {
  try { localStorage.setItem('ss_bag_items', JSON.stringify(items)); } catch (e) {}
  const ids = Object.keys(items).filter(id => Number(items[id]) > 0);
  setBag(ids);
  renderBag();
}

function renderBag() {
  const drawer = document.getElementById('bagDrawer');
  if (!drawer) return;
  const items = getBagItems();
  const host = document.getElementById('bagItems');
  const entries = Object.entries(items).filter(([, qty]) => Number(qty) > 0);
  if (!entries.length) {
    host.innerHTML = '<div class="empty-state">Your bag is empty 🧶</div>';
    document.getElementById('bagTotal').textContent = '₹0';
    document.getElementById('placeBagOrder').disabled = true;
    return;
  }
  let total = 0;
  host.innerHTML = entries.map(([id, qty]) => {
    const product = shopProducts.find(item => String(item.id) === id);
    if (!product) return '';
    const quantity = Math.max(1, Number(qty) || 1);
    total += Number(product.price) * quantity;
    const image = product.image_url || 'assets/login-background.jpg';
    return `<article class="bag-item">
      <img src="${esc(image)}" alt="${esc(product.name)}" onerror="this.onerror=null;this.style.display='none'">
      <div class="bag-item-info">
        <h3>${esc(product.name)}</h3>
        <span>₹${esc(Number(product.price).toLocaleString('en-IN'))}</span>
        <div class="bag-quantity">
          <button type="button" data-bag-minus="${esc(id)}" aria-label="Decrease quantity">−</button>
          <strong>${esc(quantity)}</strong>
          <button type="button" data-bag-plus="${esc(id)}" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="bag-remove" data-bag-remove="${esc(id)}">Remove</button>
      </div>
    </article>`;
  }).join('');
  document.getElementById('bagTotal').textContent = `₹${total.toLocaleString('en-IN')}`;
  document.getElementById('placeBagOrder').disabled = false;

  drawer.querySelectorAll('[data-bag-minus]').forEach(button => button.onclick = () => {
    const id = button.dataset.bagMinus;
    const next = { ...getBagItems(), [id]: Math.max(1, Number(getBagItems()[id]) - 1) };
    setBagItems(next);
  });
  drawer.querySelectorAll('[data-bag-plus]').forEach(button => button.onclick = () => {
    const id = button.dataset.bagPlus;
    const next = { ...getBagItems(), [id]: Number(getBagItems()[id]) + 1 };
    setBagItems(next);
  });
  drawer.querySelectorAll('[data-bag-remove]').forEach(button => button.onclick = () => {
    const next = { ...getBagItems() };
    delete next[button.dataset.bagRemove];
    setBagItems(next);
  });
  document.getElementById('placeBagOrder').onclick = placeBagOrder;
}

function productCard(product) {
  const id = String(product.id);
  const wishlist = getWishlist();
  const saved = wishlist.includes(id);
  const stock = Number(product.stock) || 0;
  const stockText = stock > 0 ? (stock <= 2 ? `Only ${stock} left` : 'In stock') : 'Out of stock';
  const stockClass = stock <= 0 ? 'out' : stock <= 2 ? 'low' : '';
  const image = product.image_url || 'assets/login-background.jpg';
  return `<article class="product-card">
    <div class="product-image-wrap">
      <img src="${esc(image)}" alt="${esc(product.name)}" loading="lazy" onerror="this.onerror=null;this.style.display='none'">
      <button type="button" class="heart-btn${saved ? ' saved' : ''}" data-wishlist="${esc(id)}" aria-label="${saved ? 'Remove' : 'Add'} ${esc(product.name)} ${saved ? 'from' : 'to'} wishlist">${saved ? '♥' : '♡'}</button>
    </div>
    <div class="product-info">
      <h3 class="product-name">${esc(product.name)}</h3>
      <span class="product-price">₹${esc(Number(product.price).toLocaleString('en-IN'))}</span>
      <span class="stock-copy ${stockClass}">${esc(stockText)}</span>
      <div class="product-actions">
        <button type="button" class="outline-btn product-action" data-bag="${esc(id)}">Add to Bag</button>
        <button type="button" class="pill-btn product-action" data-order="${esc(id)}">${stock > 0 ? 'Buy Now' : 'Pre-order'}</button>
      </div>
    </div>
  </article>`;
}

function renderAllProducts(searchValue) {
  const search = String(searchValue ?? document.getElementById('headerSearch')?.value ?? '').trim().toLowerCase();
  const sort = document.getElementById('sortSelect')?.value || 'newest';
  const wishlist = getWishlist();
  let filtered = shopProducts.filter(product => {
    const category = categoryForProduct(product);
    const matchesCategory = activeCategory === 'All' ||
      (activeCategory === 'Wishlist' ? wishlist.includes(String(product.id)) : category === activeCategory);
    const matchesSearch = !search || `${product.name} ${category}`.toLowerCase().includes(search);
    return matchesCategory && matchesSearch;
  });
  if (sort === 'low') filtered.sort((a, b) => Number(a.price) - Number(b.price));
  if (sort === 'high') filtered.sort((a, b) => Number(b.price) - Number(a.price));

  const filterNames = ['All', 'Bags', 'Bouquets', 'Flowers', 'Accessories', 'Home Decor', 'Keychains', 'Custom Orders'];
  document.getElementById('filterChips').innerHTML = filterNames.map(name =>
    `<button type="button" class="filter-chip${activeCategory === name ? ' active' : ''}" data-filter="${esc(name)}">${esc(name)}</button>`
  ).join('');
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.onclick = () => {
      activeCategory = button.dataset.filter;
      renderCategories();
      renderAllProducts(document.getElementById('headerSearch')?.value || '');
    };
  });
  const host = document.getElementById('allProducts');
  host.innerHTML = filtered.length
    ? filtered.map(productCard).join('')
    : '<div class="empty-state">No matching crochet pieces yet 🧶</div>';
  bindProductActions(host);
}

function bindProductActions(root) {
  root.querySelectorAll('[data-wishlist]').forEach(button => {
    button.onclick = () => {
      const id = String(button.dataset.wishlist);
      let ids = getWishlist();
      const saved = ids.includes(id);
      ids = saved ? ids.filter(value => value !== id) : [...ids, id];
      setWishlist(ids);
      button.classList.toggle('saved', !saved);
      button.textContent = saved ? '♡' : '♥';
      toast(saved ? 'Removed from wishlist' : 'Added to wishlist');
      if (activeCategory === 'Wishlist') renderAllProducts(document.getElementById('headerSearch')?.value || '');
    };
  });
  root.querySelectorAll('[data-order]').forEach(button => {
    button.onclick = () => openBuyNow(button);
  });
  root.querySelectorAll('[data-bag]').forEach(button => {
    button.onclick = () => {
      const id = String(button.dataset.bag);
      let ids = getBag();
      if (!ids.includes(id)) ids.push(id);
      const items = getBagItems();
      items[id] = Math.max(1, Number(items[id]) || 1);
      try { localStorage.setItem('ss_bag_items', JSON.stringify(items)); } catch (e) {}
      setBag(ids);
      toast('Added to bag');
      openBag();
    };
  });
}

function openBuyNow(button) {
  const product = shopProducts.find(item => String(item.id) === String(button.dataset.order));
  if (!product) return;
  openCheckout([{ product, qty: 1 }], Number(product.stock) > 0 ? 'Delivery Details' : 'Pre-order Details');
}

function openCheckout(entries, title, bagCheckout = false) {
  let modal = document.getElementById('buyNowModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'buyNowModal';
    modal.className = 'checkout-modal';
    modal.innerHTML = `
      <div class="checkout-backdrop" data-close-checkout></div>
      <div class="checkout-panel" role="dialog" aria-modal="true" aria-labelledby="checkoutTitle">
        <div class="checkout-head">
          <div>
            <span class="checkout-step">Secure checkout</span>
            <h2 id="checkoutTitle">Delivery Details</h2>
          </div>
          <button type="button" class="icon-btn" data-close-checkout aria-label="Close checkout">×</button>
        </div>
        <div class="checkout-product" id="checkoutProduct"></div>
        <form class="checkout-form" id="checkoutForm">
          <label>Full Name
            <input id="deliveryName" autocomplete="name" required>
          </label>
          <label>Phone Number
            <input id="deliveryPhone" type="tel" inputmode="numeric" autocomplete="tel" pattern="[0-9]{10}" required>
          </label>
          <label class="checkout-wide">Address
            <textarea id="deliveryAddress" autocomplete="street-address" rows="3" required></textarea>
          </label>
          <label>Pincode
            <input id="deliveryPincode" inputmode="numeric" autocomplete="postal-code" pattern="[0-9]{6}" required>
          </label>
          <div class="checkout-summary checkout-wide">
            <span id="checkoutAmountLabel">Total</span>
            <strong id="checkoutAmount">₹0</strong>
          </div>
          <div class="form-actions checkout-wide">
            <button type="button" class="outline-btn" data-close-checkout>Cancel</button>
            <button type="submit" class="pill-btn" id="confirmCheckout">Continue to Payment</button>
          </div>
        </form>
        <section class="payment-step" id="paymentStep" hidden>
          <h3>Pay with UPI</h3>
          <div class="upi-payment">
            <img id="upiQr" class="upi-qr" alt="UPI payment QR code">
            <div>
              <strong>Scan &amp; pay using PhonePe / GPay / Paytm</strong>
              <span id="upiId">UPI: stitchstock@upi</span>
              <span id="upiAmount">Amount: ₹0</span>
            </div>
          </div>
          <label class="payment-confirm">
            <input id="paymentConfirmed" type="checkbox">
            I have completed the payment
          </label>
          <div class="form-actions checkout-wide">
            <button type="button" class="outline-btn" id="backToDetails">Back</button>
            <button type="button" class="pill-btn" id="confirmPayment">Confirm Payment &amp; Place Order</button>
          </div>
        </section>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.hidden = false;
  modal.dataset.bagCheckout = bagCheckout ? 'true' : 'false';
  modal.querySelectorAll('[data-close-checkout]').forEach(control => {
    control.onclick = () => { modal.hidden = true; };
  });
  const total = entries.reduce((sum, entry) => sum + Number(entry.product.price) * Number(entry.qty), 0);
  document.getElementById('checkoutTitle').textContent = title;
  document.getElementById('checkoutAmountLabel').textContent = 'Amount to pay';
  document.getElementById('checkoutAmount').textContent = `₹${total.toLocaleString('en-IN')}`;
  document.getElementById('checkoutProduct').innerHTML = entries.map(entry =>
    `<img src="${esc(entry.product.image_url || 'assets/login-background.jpg')}" alt="${esc(entry.product.name)}" onerror="this.onerror=null;this.style.display='none'">
     <div><strong>${esc(entry.product.name)}</strong><span>Qty ${esc(entry.qty)} · ₹${esc(Number(entry.product.price).toLocaleString('en-IN'))}</span></div>`
  ).join('');
  const form = document.getElementById('checkoutForm');
  const paymentStep = document.getElementById('paymentStep');
  form.hidden = false;
  paymentStep.hidden = true;
  form.onsubmit = async event => {
    event.preventDefault();
    const name = document.getElementById('deliveryName').value.trim();
    const address = document.getElementById('deliveryAddress').value.trim();
    const phone = document.getElementById('deliveryPhone').value.trim();
    const pincode = document.getElementById('deliveryPincode').value.trim();
    if (!name) return toast('Enter your full name');
    if (!/^[0-9]{10}$/.test(phone)) return toast('Enter a valid 10-digit phone number');
    if (!address) return toast('Enter your delivery address');
    if (!/^[0-9]{6}$/.test(pincode)) return toast('Enter a valid 6-digit pincode');
    form.hidden = true;
    paymentStep.hidden = false;
    document.getElementById('upiAmount').textContent = `Amount: ₹${total.toLocaleString('en-IN')}`;
    const upiUrl = `upi://pay?pa=stitchstock@upi&pn=StitchStock&am=${total.toFixed(2)}&cu=INR`;
    document.getElementById('upiQr').src =
      `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiUrl)}`;
  };
  document.getElementById('backToDetails').onclick = () => {
    paymentStep.hidden = true;
    form.hidden = false;
  };
  document.getElementById('confirmPayment').onclick = async () => {
    if (!document.getElementById('paymentConfirmed').checked)
      return toast('Confirm that you completed the payment');
    const confirmButton = document.getElementById('confirmPayment');
    confirmButton.disabled = true;
    try {
      for (const entry of entries) await placeOrder(entry.product.id, entry.qty);
      if (modal.dataset.bagCheckout === 'true') setBagItems({});
      modal.hidden = true;
    } catch (error) {
      toast(error.message);
    } finally {
      confirmButton.disabled = false;
    }
  };
  document.getElementById('deliveryName').focus();
}

async function placeOrder(productId, qty) {
  const order = await api('/orders', 'POST', { productId: Number(productId), qty: Number(qty) });
  toast(order.status === 'Confirmed'
    ? 'Order confirmed!'
    : `You are #${order.queuePosition || '?'} in the queue`);
  await Promise.all([loadProducts(), loadOrders()]);
  return order;
}

async function placeBagOrder() {
  const items = getBagItems();
  const entries = Object.entries(items).filter(([, qty]) => Number(qty) > 0);
  if (!entries.length) return toast('Your bag is empty');
  const checkoutEntries = entries.map(([productId, qty]) => ({
    product: shopProducts.find(item => String(item.id) === productId),
    qty: Number(qty)
  })).filter(entry => entry.product);
  const bagDrawer = document.getElementById('bagDrawer');
  if (bagDrawer) bagDrawer.hidden = true;
  openCheckout(checkoutEntries, 'Delivery Details', true);
}

document.getElementById('sortSelect')?.addEventListener('change', () => renderAllProducts());
