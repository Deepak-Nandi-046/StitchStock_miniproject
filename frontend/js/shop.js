const customerUser = typeof u !== 'undefined' ? u : guard('customer');
let shopProducts = [];
let activeCategory = 'All';
let customerOrders = [];
let customerReturnRequests = [];
let restockNotices = [];
let currentStorePage = 'home';
if (customerUser) initShop();

async function initShop() {
  const app = document.getElementById('shopApp');
  currentStorePage = app.dataset.page || 'home';
  const params = new URLSearchParams(location.search);
  activeCategory = params.get('category') || 'All';
  document.title = `StitchStock · ${({
    home: 'Home', shop: 'Shop', product: 'Product Details',
    wishlist: 'Wishlist', bag: 'Shopping Bag', orders: 'My Orders', about: 'About Us',
  })[currentStorePage] || 'Shop'}`;
  app.innerHTML = renderStorePage();
  bindShopHeader();
  if (currentStorePage === 'shop') bindGiftFinder();
  await pullCustomerState();
  await loadProducts();
  if (currentStorePage === 'orders') {
    await loadOrders();
    setInterval(() => { if (!document.hidden) loadOrders(); }, 30000);
  }
  if (['home', 'shop'].includes(currentStorePage))
    setInterval(() => { if (!document.hidden) loadProducts(); }, 30000);
}

function renderStorePage() {
  const home = `
    <section class="shop-hero" id="home">
      <div class="hero-content">
        <h1>Handmade <em>Crochet Treasures</em></h1>
        <p class="hero-category">Bags <span>✿</span> Flowers <span>✿</span> Gifts <span>✿</span> Custom Orders</p>
        <a class="pill-btn" href="shop.html">Shop Now →</a>
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
      <div class="section-head"><h2>Featured Products</h2><a class="text-link" href="shop.html">Shop all →</a></div>
      <div class="featured-layout"><div class="shop-skeleton-grid"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div></div>
    </section>
    <section class="section-wrap discovery-section" id="newArrivals">
      <div class="section-head"><h2>New Arrivals</h2><a class="text-link" href="shop.html">Explore all →</a></div>
      <div class="product-grid discovery-grid" id="newArrivalProducts"></div>
    </section>
    <section class="section-wrap discovery-section" id="recentlyViewedSection" hidden>
      <div class="section-head"><h2>Recently Viewed</h2></div>
      <div class="product-grid discovery-grid" id="recentlyViewed"></div>
    </section>
    <section class="home-promo-banner">
      <div><p>Made slowly. Loved forever.</p><h2>A thoughtful gift in every stitch</h2><a class="pill-btn" href="shop.html">Find your favourite →</a></div>
    </section>
    ${storeFooter()}`;
  const shop = `
    <section class="page-heading"><p class="customisation-kicker">Handmade with love</p><h1>Shop Crochet <em>Collections</em></h1><p>Find a little joy in every handmade stitch.</p></section>
    <nav class="category-strip" id="categoryStrip" aria-label="Product categories"></nav>
    <section class="section-wrap discovery-section" id="recentlyViewedSection" hidden><div class="section-head"><h2>Recently Viewed</h2></div><div class="product-grid discovery-grid" id="recentlyViewed"></div></section>
    <section class="section-wrap discovery-section" id="giftFinder">
      <div class="section-head"><h2>Find a Handmade Gift</h2></div>
      <form class="gift-finder-form" id="giftFinderForm">
        <label>Occasion<select id="giftOccasion"><option>Birthday</option><option>Anniversary</option><option>Thank you</option><option>Just because</option><option>Festival</option></select></label>
        <label>Budget<select id="giftBudget"><option value="500">Under ₹500</option><option value="1000">Under ₹1,000</option><option value="2500">Under ₹2,500</option><option value="999999">Any budget</option></select></label>
        <label>Gift type<select id="giftType"><option value="all">Any handmade gift</option><option value="Bags">Bags</option><option value="Flowers">Flowers &amp; bouquets</option><option value="Accessories">Accessories</option><option value="Home Decor">Home decor</option><option value="Keychains">Keychains</option></select></label>
        <button class="pill-btn" type="submit">Find Gifts →</button>
      </form>
      <div class="product-grid discovery-grid" id="giftResults" aria-live="polite"></div>
    </section>
    <section class="section-wrap shop-products-section" id="shopProducts">
      <div class="all-toolbar"><div><div class="section-head"><h2>All Products</h2></div><div class="filter-chips" id="filterChips"></div></div>
        <label class="shop-search">Search products<input id="shopSearch" type="search" placeholder="Search crochet items..."></label>
        <label>Sort by<select class="sort-select" id="sortSelect"><option value="newest">Newest</option><option value="low">Price low to high</option><option value="high">Price high to low</option></select></label>
      </div>
      <div class="product-grid all-grid" id="allProducts"><div class="empty-state">Loading products... 🧶</div></div>
    </section>
    ${storeFooter()}`;
  const wishlist = `
    <section class="page-heading"><p class="customisation-kicker">Saved with love</p><h1>My <em>Wishlist</em></h1><p>Your favourite crochet finds, all in one place.</p></section>
    <section class="section-wrap page-products"><div class="product-grid all-grid" id="wishlistProducts"></div></section>${storeFooter()}`;
  const product = `<section id="productDetail"><div class="empty-state">Loading product... 🧶</div></section>${storeFooter()}`;
  const bag = `
    <section class="page-heading"><p class="customisation-kicker">Your handmade picks</p><h1>Shopping <em>Bag</em></h1><p>Review your items before placing your order.</p></section>
    <section class="section-wrap bag-page-section">
      <div id="bagPageItems"></div>
      <div class="bag-page-summary"><span>Bag total</span><strong id="bagPageTotal">₹0</strong><button type="button" class="pill-btn" id="checkoutBag">Proceed to Checkout →</button></div>
    </section>${storeFooter()}`;
  const orders = `
    <section class="page-heading"><p class="customisation-kicker">Every stitch, on its way</p><h1>My <em>Orders</em></h1><p>Follow your crochet orders from confirmation to delivery.</p></section>
    <section class="section-wrap orders-page-section"><div id="ordersList"><div class="empty-state">Loading your orders... 🧶</div></div></section>
    <section class="section-wrap discovery-section" id="notifications"><div class="section-head"><h2>Notifications</h2></div><div id="customerNotifications"></div></section>${storeFooter()}`;
  const about = `
    <section class="shop-hero about-hero"><div class="hero-content"><h1>Stitch &amp; <em>Stole</em></h1><p class="hero-category">Handmade with Love ♥</p><p>We celebrate the care, creativity, and warmth behind every crochet piece.</p><a class="pill-btn" href="shop.html">Explore the shop →</a></div><aside class="hero-quote">More than just yarn, it’s happiness in every stitch ♡</aside></section>
    <section class="section-wrap about-story"><div class="section-head"><h2>Made by hand, made to be loved</h2></div><p>Our crochet bags, flowers, accessories, and gifts are thoughtfully handmade, one stitch at a time. Every piece brings a little colour and care into your everyday moments.</p><a class="pill-btn" href="customisation.html">Request a custom piece →</a></section>
    <section class="section-wrap discovery-section" id="careGuide"><div class="section-head"><h2>Crochet Care Guide</h2></div><div class="help-grid">
      <article class="help-card"><h3>Washing</h3><p>Hand-wash gently in cool water with mild detergent. Avoid bleach and vigorous rubbing.</p></article>
      <article class="help-card"><h3>Drying</h3><p>Press out water with a towel, reshape, and lay flat to air-dry. Avoid wringing or tumble drying.</p></article>
      <article class="help-card"><h3>Storing</h3><p>Store clean and completely dry in a cool place. Keep delicate crochet folded rather than hanging.</p></article>
    </div></section>
    <section class="section-wrap discovery-section" id="helpCenter"><div class="section-head"><h2>FAQ &amp; Help Center</h2></div><div class="faq-list">
      <details><summary>How do I pay?</summary><p>Checkout shows UPI payment instructions. Confirm payment in the app to place your order.</p></details>
      <details><summary>When will my order arrive?</summary><p>Check My Orders for the latest confirmation, preparation, shipping, and delivery status.</p></details>
      <details><summary>Can I pre-order an out-of-stock item?</summary><p>Yes. Choose Pre-order to join the queue. We will prepare it when stock becomes available.</p></details>
      <details><summary>How do I request a custom item?</summary><p>Open the Customisation page to describe your idea and attach inspiration photos or a short video.</p></details>
      <details><summary>How should I care for crochet?</summary><p>Hand-wash gently, reshape and dry flat, and store clean and dry. See the Crochet Care Guide above.</p></details>
    </div></section>${storeFooter()}`;
  return ({ home, shop, product, wishlist, bag, orders, about })[currentStorePage] || home;
}

function storeFooter() {
  return `<footer class="shop-footer">Stitch &amp; Stole · Handmade with Love ♥</footer>`;
}

function bindShopHeader() {
  updateBagCount();
  const search = document.getElementById('headerSearch');
  if (search) {
    const query = new URLSearchParams(location.search).get('q') || '';
    search.value = query;
    const shopSearch = document.getElementById('shopSearch');
    if (shopSearch) {
      shopSearch.value = query;
      shopSearch.addEventListener('input', () => {
        search.value = shopSearch.value;
        renderAllProducts(shopSearch.value);
      });
    }
    if (currentStorePage === 'shop') search.addEventListener('input', () => {
      if (shopSearch) shopSearch.value = search.value;
      renderAllProducts(search.value);
    });
  }
  document.getElementById('sortSelect')?.addEventListener('change', () => renderAllProducts());
}

async function loadProducts() {
  try {
    shopProducts = await api('/products');
    trackRestocks(shopProducts);
    if (currentStorePage === 'home') {
      renderCategories();
      renderFeatured();
      renderNewArrivals();
      renderRecentlyViewed();
    } else if (currentStorePage === 'shop') {
      renderCategories();
      renderAllProducts();
      renderRecentlyViewed();
      renderGiftFinderResults();
    } else if (currentStorePage === 'product') {
      renderProductPage(new URLSearchParams(location.search).get('id'));
    } else if (currentStorePage === 'wishlist') {
      renderWishlistPage();
    } else if (currentStorePage === 'bag') {
      renderBagPage();
    }
  } catch (error) {
    const host = document.getElementById('allProducts') || document.getElementById('productDetail') ||
      document.getElementById('wishlistProducts') || document.getElementById('bagPageItems') || document.getElementById('shopApp');
    host.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
    toast(error.message);
  }
}

async function loadOrders() {
  const host = document.getElementById('ordersList');
  if (!host) return;
  try {
    [customerOrders, customerReturnRequests] = await Promise.all([
      api('/orders/mine'),
      api('/returns/mine'),
    ]);
    renderNotifications();
    if (!customerOrders.length) {
      host.innerHTML = '<div class="empty-state">No orders yet 🧶</div>';
      return;
    }
    host.innerHTML = `<div class="tracking-list">${customerOrders.map(renderCustomerOrder).join('')}</div>`;
    host.querySelectorAll('[data-order-request]').forEach(button => {
      button.onclick = () => {
        const form = [...host.querySelectorAll('[data-order-request-form]')]
          .find(item => item.dataset.orderRequestForm === button.dataset.orderRequest);
        if (form) {
          form.hidden = false;
          form.querySelector('textarea').focus();
        }
      };
    });
    host.querySelectorAll('[data-order-request-form]').forEach(form => {
      form.onsubmit = event => submitOrderRequest(event, form);
      form.querySelector('[data-request-cancel]').onclick = () => { form.hidden = true; };
    });
    host.querySelectorAll('[data-payment-form]').forEach(form => {
      form.onsubmit = event => submitCustomerPayment(event, form);
    });
  } catch (error) {
    host.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
    toast(error.message);
  }
}

function renderCustomerOrder(order) {
  const product = shopProducts.find(item => String(item.id) === String(order.productId));
  const name = order.productName || (product && product.name) || 'Handmade item';
  const delivery = order.deliveryDetails || {};
  const steps = order.isPreorder
    ? ['Pre-order placed', 'Confirmed', 'Available', 'Preparing', 'Shipped', 'Delivered']
    : ['Placed', 'Confirmed', 'Preparing', 'Shipped', 'Delivered'];
  const currentStep = order.isPreorder
    ? order.preorderStatus === 'Rejected' ? -1
      : order.preorderStatus === 'Pending' ? 0
        : order.preorderStatus === 'Confirmed' ? 1
          : order.status === 'Preparing' ? 3 : order.status === 'Shipped' ? 4 : order.status === 'Delivered' ? 5 : 2
    : trackingStep(order.status);
  const orderLabel = order.isPreorder ? `Pre-order PO-${order.preorderId || order.id}` : `Order #${order.id}`;
  return `<article class="tracking-card">
    <div class="tracking-heading"><strong>${esc(orderLabel)} · ${esc(name)} · Qty ${esc(order.qty)}</strong><span>${esc(customerStatus(order))}</span></div>
    <p class="tracking-gift">Placed ${esc(new Date(order.createdAt).toLocaleString('en-IN'))} · Total ₹${esc(Number(order.totalAmount || 0).toLocaleString('en-IN'))} · Payment: ${esc(order.paymentStatus || 'Not recorded')}</p>
    ${order.isPreorder && order.expectedAvailability ? `<p class="tracking-gift">Expected availability: ${esc(new Date(`${order.expectedAvailability}T00:00:00`).toLocaleDateString('en-IN'))}</p>` : ''}
    ${order.isPreorder && order.preorderStatus === 'Rejected' ? '<p class="tracking-gift">Please contact Stitch &amp; Stole about your payment.</p>' : ''}
    ${order.paymentRejectionReason ? `<p class="payment-rejection">Payment rejected: ${esc(order.paymentRejectionReason)}</p>` : ''}
    ${order.paymentStatus !== 'Verified / Paid' ? `<form class="customer-payment-resubmit" data-payment-form="${esc(order.id)}">
      <label>Transaction reference<input name="reference" maxlength="120" placeholder="UPI transaction ID"></label>
      <label>Payment screenshot<input name="proof" type="file" accept="image/jpeg,image/png,image/webp"></label>
      <button type="submit" class="outline-btn">Submit / correct payment</button>
    </form>` : ''}
    ${currentStep >= 0 ? `<ol class="tracking-steps">${steps.map((step, index) =>
      `<li class="${index <= currentStep ? 'complete' : ''}"><span></span>${step}</li>`
    ).join('')}</ol>` : ''}
    ${order.trackingNumber ? `<p class="tracking-gift">Tracking: ${esc(order.carrier ? `${order.carrier} · ` : '')}${esc(order.trackingNumber)}</p>` : ''}
    ${delivery.address ? `<p class="tracking-gift">Delivering to: ${esc(delivery.name)}, ${esc(delivery.address)}, ${esc(delivery.pincode)}</p>` : ''}
    ${order.giftWrap ? `<p class="tracking-gift">Gift wrapped${order.giftMessage ? ` · ${esc(order.giftMessage)}` : ''}</p>` : ''}
    ${renderOrderReturnAction(order)}
  </article>`;
}

async function submitCustomerPayment(event, form) {
  event.preventDefault();
  const reference = form.elements.reference.value.trim();
  const file = form.elements.proof.files[0];
  if (!reference && !file) return toast('Add a transaction reference or payment screenshot.');
  if (file && file.size > 2 * 1024 * 1024) return toast('Payment screenshots must be 2 MB or smaller.');
  const button = form.querySelector('[type=submit]');
  button.disabled = true;
  try {
    const proof = file ? (await readCustomisationFile(file)).data : '';
    await api(`/orders/${encodeURIComponent(form.dataset.paymentForm)}/payment`, 'POST', {
      reference,
      proof,
      amountPaid: Number(customerOrders.find(order => String(order.id) === form.dataset.paymentForm)?.totalAmount),
      method: 'UPI',
    });
    toast('Payment submitted — awaiting admin verification.');
    await loadOrders();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}

function renderOrderReturnAction(order) {
  const request = customerReturnRequests.find(item => String(item.orderId) === String(order.id));
  const rejectionNotice = request && request.status === 'Rejected'
    ? `<p class="tracking-gift">Return/cancellation request: Rejected</p>
      <p class="return-rejection-reason"><strong>Admin's reason:</strong> ${esc(request.rejectionReason || 'No reason was recorded.')}</p>`
    : '';
  if (request && !['Rejected', 'Completed'].includes(request.status))
    return `<p class="tracking-gift">Return/cancellation request: ${esc(request.status)}</p>
      ${(request.evidence || []).filter(file => file.url).map(file =>
        `<a class="tracking-gift" href="${esc(file.url)}" target="_blank" rel="noopener">${esc(file.name || 'View submitted evidence')}</a>`
      ).join('')}`;
  const type = ['Placed', 'Confirmed'].includes(order.status) ? 'Cancellation' : order.status === 'Delivered' ? 'Return' : '';
  if (!type) return rejectionNotice;
  return `${rejectionNotice}<div class="order-return-control">
    <button type="button" class="outline-btn order-request-action" data-order-request="${esc(order.id)}">Request ${type.toLowerCase()}</button>
    <form class="order-return-form" data-order-request-form="${esc(order.id)}" data-request-type="${type}" hidden>
      <label>Reason<textarea name="message" maxlength="1000" required placeholder="Tell us why you are requesting this ${type.toLowerCase()}."></textarea></label>
      ${type === 'Return' ? `<label>Product photos or video (optional)<input name="evidence" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" multiple></label>
        <small>Attach up to 3 photos and 1 video. Photos: up to 2 MB each; video: up to 8 MB.</small>` : ''}
      <div class="order-return-form-actions">
        <button type="submit" class="outline-btn">Submit request</button>
        <button type="button" class="outline-btn" data-request-cancel>Cancel</button>
      </div>
    </form>
  </div>`;
}

async function submitOrderRequest(event, form) {
  event.preventDefault();
  const type = form.dataset.requestType;
  const message = form.elements.message.value.trim();
  const files = [...(form.elements.evidence?.files || [])];
  const photoCount = files.filter(file => file.type.startsWith('image/')).length;
  const videoCount = files.filter(file => file.type.startsWith('video/')).length;
  if (photoCount > 3 || videoCount > 1 || files.length > 4)
    return toast('Choose up to 3 photos and 1 video.');
  if (files.some(file => !file.type.startsWith('image/') && !file.type.startsWith('video/')))
    return toast('Choose JPG, PNG, WebP, MP4, WebM, or MOV files.');
  if (files.some(file => file.size > (file.type.startsWith('video/') ? 8 : 2) * 1024 * 1024))
    return toast('Photos must be 2 MB or smaller and videos 8 MB or smaller.');

  const button = form.querySelector('[type=submit]');
  button.disabled = true;
  try {
    const evidence = await Promise.all(files.map(async file => ({
      name: file.name,
      data: (await readCustomisationFile(file)).data,
    })));
    await api('/returns', 'POST', {
      orderId: form.dataset.orderRequestForm,
      type,
      message,
      evidence,
    });
    toast(`${type} request submitted`);
    await loadOrders();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}

function customerStatus(order) {
  if (order.isPreorder) return order.preorderStatus === 'Available'
    ? `Available · ${order.status}`
    : `Pre-order ${order.preorderStatus || 'Pending'}`;
  return order.status;
}

function trackingStep(status) {
  if (status === 'Placed') return 0;
  if (status === 'Confirmed') return 1;
  if (status === 'Preparing') return 2;
  if (status === 'Shipped') return 3;
  if (status === 'Delivered') return 4;
  return -1;
}

function trackRestocks(products) {
    const key = 'ss_product_stock';
    let previous = {};
    try { previous = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) {}
    restockNotices = products.filter(product =>
      Object.prototype.hasOwnProperty.call(previous, product.id) &&
      Number(product.stock) > Number(previous[product.id])
    ).map(product => `${product.name} is back in stock.`);
    try {
      localStorage.setItem(key, JSON.stringify(Object.fromEntries(products.map(product => [product.id, product.stock]))));
    } catch (e) {}
    renderNotifications();
  }

function renderNotifications() {
    const host = document.getElementById('customerNotifications');
    if (!host) return;
    const notices = [
      ...customerOrders.flatMap(order => (order.customerUpdates || []).map(update => ({
        at: update.at,
        text: `${order.isPreorder ? `Pre-order PO-${order.preorderId || order.id}` : `Order #${order.id}`}: ${update.message}`,
      }))).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 10),
      ...restockNotices,
    ];
    host.innerHTML = notices.length
      ? `<ul class="notification-list">${notices.map(notice => typeof notice === 'string'
        ? `<li>${esc(notice)}</li>`
        : `<li><strong>${esc(notice.text)}</strong><time>${esc(new Date(notice.at).toLocaleString('en-IN'))}</time></li>`
      ).join('')}</ul>`
      : '<div class="empty-state">No new updates yet 🧶</div>';
  }

function recentProductIds() {
    try {
      const ids = JSON.parse(localStorage.getItem('ss_recent_products') || '[]');
      return Array.isArray(ids) ? ids.map(String).slice(0, 8) : [];
    } catch (e) { return []; }
  }

function renderRecentlyViewed() {
    const section = document.getElementById('recentlyViewedSection');
    const host = document.getElementById('recentlyViewed');
    if (!section || !host) return;
    const recent = recentProductIds()
      .map(id => shopProducts.find(product => String(product.id) === id))
      .filter(Boolean);
    section.hidden = !recent.length;
    host.innerHTML = recent.map(productCard).join('');
    bindProductActions(host);
  }

function bindGiftFinder() {
    const form = document.getElementById('giftFinderForm');
    form.onsubmit = event => {
      event.preventDefault();
      renderGiftFinderResults();
    };
  }

function renderGiftFinderResults() {
    const host = document.getElementById('giftResults');
    if (!host || !shopProducts.length) return;
    const budget = Number(document.getElementById('giftBudget').value);
    const type = document.getElementById('giftType').value;
    const occasion = document.getElementById('giftOccasion').value;
    const preferredCategories = {
      Birthday: ['Accessories', 'Bags', 'Keychains'],
      Anniversary: ['Flowers', 'Bouquets', 'Home Decor'],
      'Thank you': ['Flowers', 'Bouquets', 'Accessories'],
      'Just because': ['Accessories', 'Keychains', 'Flowers'],
      Festival: ['Bags', 'Home Decor', 'Flowers', 'Bouquets'],
    }[occasion] || [];
    const results = shopProducts.filter(product => {
      const category = categoryForProduct(product);
      const matchesType = type === 'all' || category === type ||
        (type === 'Flowers' && category === 'Bouquets');
      return Number(product.price) <= budget && matchesType;
    }).sort((a, b) => {
      const rank = product => {
        const index = preferredCategories.indexOf(categoryForProduct(product));
        return index < 0 ? preferredCategories.length : index;
      };
      return rank(a) - rank(b);
    }).slice(0, 4);
    host.innerHTML = results.length
      ? `<p class="gift-result-label">Thoughtful ${esc(occasion.toLowerCase())} gifts</p>${results.map(productCard).join('')}`
      : '<div class="empty-state">No gifts match those filters yet. Try a higher budget or another gift type.</div>';
    bindProductActions(host);
  }
function shortId(value) {
  return String(value).length > 8 ? String(value).slice(0, 8) : String(value);
}

function categoryForProduct(product) {
  if (product.category) return String(product.category);
  const name = String(product.name).toLowerCase();
  // TODO: Backend does not return categories yet; infer category from product name.
  if (name.includes('handbag')) return 'Handbags';
  if (name.includes('bag') || name.includes('tote')) return 'Bags';
  if (name.includes('bouquet')) return 'Bouquets';
  if (name.includes('flower')) return 'Flowers';
  if (name.includes('keychain')) return 'Keychains';
  if (name.includes('home') || name.includes('decor')) return 'Home Decor';
  if (name.includes('custom')) return 'Custom Orders';
  return 'Accessories';
}

function renderCategories() {
  const host = document.getElementById('categoryStrip');
  if (!host) return;
  const categories = [
    ['Bags', '🛍️'], ['Bouquets', '💐'], ['Flowers', '🌸'], ['Handbags', '🧵'],
    ['Home Decor', '🌻'], ['Accessories', '🎀'], ['Keychains', '⭐'], ['Custom Orders', '🎁']
  ];
  host.innerHTML = categories.map(([name, icon]) =>
    `<button type="button" class="category-tile${activeCategory === name ? ' active' : ''}" data-category="${esc(name)}">
      <span class="category-icon" aria-hidden="true">${icon}</span><span>${esc(name)}</span>
    </button>`
  ).join('');
  document.querySelectorAll('[data-category]').forEach(button => {
    button.onclick = () => {
      if (currentStorePage !== 'shop') {
        location.href = `shop.html?category=${encodeURIComponent(button.dataset.category)}`;
        return;
      }
      activeCategory = button.dataset.category;
      renderCategories();
      renderAllProducts(document.getElementById('shopSearch')?.value || document.getElementById('headerSearch')?.value || '');
      document.getElementById('shopProducts').scrollIntoView();
    };
  });
}

function renderNewArrivals() {
  const host = document.getElementById('newArrivalProducts');
  if (!host) return;
  const latest = [...shopProducts].reverse().slice(0, 4);
  host.innerHTML = latest.length
    ? latest.map(productCard).join('')
    : '<div class="empty-state">New handmade pieces are coming soon 🧶</div>';
  bindProductActions(host);
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
      location.href = `shop.html?category=${encodeURIComponent(button.dataset.promoCategory)}`;
    };
  });
}

// ---- Database sync for the bag and wishlist -------------------------------------------------
// localStorage stays as a fast local copy; the database (cart_item / wishlist_item) is the source of
// truth. We load it once when a store page opens, and save the full state after every change.
let cartSyncChain = Promise.resolve();
let wishlistSyncChain = Promise.resolve();
let serverStateAvailable = true;

function queueCartSync() {
  if (!serverStateAvailable) return;
  cartSyncChain = cartSyncChain
    .then(() => api('/cart', 'PUT', { items: getBagItems(), colors: getBagColors() }))
    .catch(error => console.warn('Could not save the bag:', error.message));
}

function queueWishlistSync() {
  if (!serverStateAvailable) return;
  wishlistSyncChain = wishlistSyncChain
    .then(() => api('/wishlist', 'PUT', { ids: getWishlist() }))
    .catch(error => console.warn('Could not save the wishlist:', error.message));
}

async function pullCustomerState() {
  const user = store.user;
  if (!user || user.role !== 'customer') return;
  try {
    const [cart, wishlist] = await Promise.all([api('/cart'), api('/wishlist')]);
    if (cart.persisted === false) { serverStateAvailable = false; return; }   // demo account
    // First time this customer opens the shop after the feature was added: keep what is already
    // in this browser and upload it, instead of wiping it with an empty database copy.
    const flag = 'ss_state_synced_' + user.id;
    const firstSync = !localStorage.getItem(flag);

    if (firstSync && !Object.keys(cart.items).length && Object.keys(getBagItems()).length) {
      queueCartSync();
    } else {
      localStorage.setItem('ss_bag_items', JSON.stringify(cart.items));
      localStorage.setItem('ss_bag_colors', JSON.stringify(cart.colors));
      localStorage.setItem('ss_bag', JSON.stringify(Object.keys(cart.items)));
    }
    if (firstSync && !wishlist.ids.length && getWishlist().length) {
      queueWishlistSync();
    } else {
      localStorage.setItem('ss_wishlist', JSON.stringify(wishlist.ids));
    }
    localStorage.setItem(flag, '1');
    updateBagCount();
    updateWishlistCount();
  } catch (error) {
    console.warn('Could not load the saved bag and wishlist:', error.message);
  }
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
  queueWishlistSync();
}

function renderWishlistPage() {
  const host = document.getElementById('wishlistProducts');
  if (!host) return;
  const saved = getWishlist();
  const products = saved.map(id => shopProducts.find(product => String(product.id) === id)).filter(Boolean);
  host.innerHTML = products.length
    ? products.map(productCard).join('')
    : '<div class="empty-state">Your wishlist is waiting for something lovely. <p><a class="pill-btn" href="shop.html">Explore the Shop →</a></p></div>';
  bindProductActions(host);
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
  if (!ids.length) {
    try { localStorage.removeItem('ss_bag_colors'); } catch (e) {}
  }
  setBag(ids);
  queueCartSync();
  renderBag();
  renderBagPage();
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
    const next = { ...getBagItems(), [id]: Math.min(20, Number(getBagItems()[id]) + 1) };
    setBagItems(next);
  });
  drawer.querySelectorAll('[data-bag-remove]').forEach(button => button.onclick = () => {
    const next = { ...getBagItems() };
    delete next[button.dataset.bagRemove];
    setBagItems(next);
  });
  document.getElementById('placeBagOrder').onclick = placeBagOrder;
}

function getBagColors() {
  try {
    const value = JSON.parse(localStorage.getItem('ss_bag_colors') || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch (e) { return {}; }
}

function setBagColor(productId, color) {
  const colors = getBagColors();
  colors[String(productId)] = color;
  try { localStorage.setItem('ss_bag_colors', JSON.stringify(colors)); } catch (e) {}
  queueCartSync();
}

function addProductToBag(productId, quantity = 1, color = '') {
  const id = String(productId);
  const product = shopProducts.find(item => String(item.id) === id);
  if (!product) return toast('This product is no longer available.');
  const items = getBagItems();
  const existingQuantity = Math.max(0, Number(items[id]) || 0);
  const requestedQuantity = Math.max(1, Math.min(20, Number(quantity) || 1));
  items[id] = Math.min(20, existingQuantity + requestedQuantity);
  if (color) setBagColor(id, color);
  setBagItems(items);
  toast('Added to your shopping bag');
}

function renderBagPage() {
  const host = document.getElementById('bagPageItems');
  if (!host) return;
  const items = getBagItems();
  const entries = Object.entries(items).filter(([, qty]) => Number(qty) > 0);
  let total = 0;
  const colors = getBagColors();
  const products = entries.map(([id, qty]) => ({
    id,
    qty: Math.max(1, Number(qty) || 1),
    product: shopProducts.find(item => String(item.id) === id),
  })).filter(entry => entry.product);

  host.innerHTML = products.length ? `<div class="bag-page-list">${products.map(entry => {
    const { product, id, qty } = entry;
    total += Number(product.price) * qty;
    const options = productColors(product);
    const selected = colors[id] && options.includes(colors[id]) ? colors[id] : options[0];
    if (selected && !colors[id]) setBagColor(id, selected);
    return `<article class="bag-page-item">
      <a href="product.html?id=${encodeURIComponent(id)}"><img src="${esc(product.image_url || 'assets/login-background.jpg')}" alt="${esc(product.name)}"></a>
      <div class="bag-page-item-info">
        <h2><a href="product.html?id=${encodeURIComponent(id)}">${esc(product.name)}</a></h2>
        <strong>₹${esc(Number(product.price).toLocaleString('en-IN'))}</strong>
        ${options.length ? `<label>Colour<select data-bag-color="${esc(id)}">${options.map(color => `<option${color === selected ? ' selected' : ''}>${esc(color)}</option>`).join('')}</select></label>` : ''}
        <div class="bag-quantity">
          <button type="button" data-page-bag-minus="${esc(id)}" aria-label="Decrease quantity">−</button>
          <strong>${esc(qty)}</strong>
          <button type="button" data-page-bag-plus="${esc(id)}" aria-label="Increase quantity">+</button>
          <button type="button" class="bag-remove" data-page-bag-remove="${esc(id)}">Remove</button>
        </div>
      </div>
    </article>`;
  }).join('')}</div>` : '<div class="empty-state">Your shopping bag is empty. <p><a class="pill-btn" href="shop.html">Find something handmade →</a></p></div>';

  const totalHost = document.getElementById('bagPageTotal');
  if (totalHost) totalHost.textContent = `₹${total.toLocaleString('en-IN')}`;
  const checkout = document.getElementById('checkoutBag');
  if (checkout) checkout.disabled = !products.length;
  host.querySelectorAll('[data-bag-color]').forEach(select =>
    select.onchange = () => setBagColor(select.dataset.bagColor, select.value)
  );
  host.querySelectorAll('[data-page-bag-minus]').forEach(button => button.onclick = () => {
    const id = button.dataset.pageBagMinus;
    const next = { ...getBagItems(), [id]: Math.max(1, Number(getBagItems()[id]) - 1) };
    setBagItems(next);
  });
  host.querySelectorAll('[data-page-bag-plus]').forEach(button => button.onclick = () => {
    const id = button.dataset.pageBagPlus;
    const next = { ...getBagItems(), [id]: Math.min(20, Number(getBagItems()[id]) + 1) };
    setBagItems(next);
  });
  host.querySelectorAll('[data-page-bag-remove]').forEach(button => button.onclick = () => {
    const id = button.dataset.pageBagRemove;
    const next = { ...getBagItems() };
    delete next[id];
    const colors = getBagColors();
    delete colors[id];
    try { localStorage.setItem('ss_bag_colors', JSON.stringify(colors)); } catch (e) {}
    setBagItems(next);
  });
  if (checkout) checkout.onclick = placeBagOrder;
}

function productCard(product) {
  const id = String(product.id);
  const wishlist = getWishlist();
  const saved = wishlist.includes(id);
  const stock = Number(product.stock) || 0;
  const stockText = stock > 0 ? (stock <= 2 ? `Only ${stock} left` : 'In stock') : 'Out of stock';
  const stockClass = stock <= 0 ? 'out' : stock <= 2 ? 'low' : '';
  const image = product.image_url || 'assets/login-background.jpg';
  const colors = productColors(product);
  const productUrl = `product.html?id=${encodeURIComponent(id)}`;
  return `<article class="product-card">
    <div class="product-image-wrap">
      <a class="product-open-link" href="${esc(productUrl)}" aria-label="View ${esc(product.name)} details">
        <img src="${esc(image)}" alt="${esc(product.name)}" loading="lazy" onerror="this.onerror=null;this.style.display='none'">
      </a>
      <button type="button" class="heart-btn${saved ? ' saved' : ''}" data-wishlist="${esc(id)}" aria-label="${saved ? 'Remove' : 'Add'} ${esc(product.name)} ${saved ? 'from' : 'to'} wishlist">${saved ? '♥' : '♡'}</button>
    </div>
    <div class="product-info">
      <h3 class="product-name"><a href="${esc(productUrl)}">${esc(product.name)}</a></h3>
      <span class="product-price">₹${esc(Number(product.price).toLocaleString('en-IN'))}</span>
      <span class="stock-copy ${stockClass}">${esc(stockText)}</span>
      ${colors.length ? `<span class="product-colour-copy">Colours: ${esc(colors.slice(0, 3).join(', '))}${colors.length > 3 ? ' +' : ''}</span>` : ''}
      <div class="product-actions">
        <a class="outline-btn product-action" href="${esc(productUrl)}">View Details</a>
        <button type="button" class="outline-btn product-action" data-bag="${esc(id)}">Add to Bag</button>
        <button type="button" class="pill-btn product-action" data-order="${esc(id)}">${stock > 0 ? 'Buy Now' : 'Pre-order'}</button>
      </div>
    </div>
  </article>`;
}

function productColors(product) {
  if (Array.isArray(product.available_colors))
    return product.available_colors.filter(color => typeof color === 'string').slice(0, 8);
  if (categoryForProduct(product) === 'Keychains') return [];
  return ['Blush Pink', 'Cream', 'Lavender', 'Sage Green'];
}

function renderProductPage(productId) {
  const host = document.getElementById('productDetail');
  if (!host) return;
  const product = shopProducts.find(item => String(item.id) === String(productId));
  if (!product) {
    host.innerHTML = `<section class="section-wrap"><div class="empty-state">This product could not be found.<p><a class="pill-btn" href="shop.html">Back to Shop</a></p></div></section>`;
    return;
  }

  const ids = [String(product.id), ...recentProductIds().filter(id => id !== String(product.id))].slice(0, 8);
  try { localStorage.setItem('ss_recent_products', JSON.stringify(ids)); } catch (e) {}
  const similar = shopProducts.filter(item =>
    item.id !== product.id && categoryForProduct(item) === categoryForProduct(product)
  ).slice(0, 3);
  const recommendations = similar.length ? similar : shopProducts
    .filter(item => item.id !== product.id)
    .sort((a, b) => Math.abs(Number(a.price) - Number(product.price)) - Math.abs(Number(b.price) - Number(product.price)))
    .slice(0, 3);
  const stock = Number(product.stock) || 0;
  const saved = getWishlist().includes(String(product.id));
  host.innerHTML = `
    <div class="section-wrap product-detail-wrap">
      <a class="back-to-shop" href="shop.html">← Back to Shop</a>
      <div class="product-detail-summary">
        <img src="${esc(product.image_url || 'assets/login-background.jpg')}" alt="${esc(product.name)}">
        <div class="product-detail-info">
          <p class="customisation-kicker">${esc(categoryForProduct(product))}</p>
          <h1>${esc(product.name)}</h1>
          <strong class="product-detail-price">₹${esc(Number(product.price).toLocaleString('en-IN'))}</strong>
          <span class="stock-copy ${stock <= 0 ? 'out' : stock <= 2 ? 'low' : ''}">${esc(stock > 0 ? (stock <= 2 ? `Only ${stock} left` : 'In stock') : 'Out of stock · Pre-order available')}</span>
          <p>${esc(product.description || 'Handmade with care, one stitch at a time.')}</p>
          ${productColors(product).length ? `<label>Colour
            <select id="productDetailColor">${productColors(product).map(color => `<option>${esc(color)}</option>`).join('')}</select>
          </label>` : ''}
          <label>Quantity
            <input id="productDetailQty" type="number" min="1" max="20" value="1">
          </label>
          <div class="product-detail-actions">
            <button type="button" class="outline-btn" id="detailAddBag">Add to Bag</button>
            <button type="button" class="pill-btn" id="detailBuyNow">${stock > 0 ? 'Buy Now' : 'Pre-order'}</button>
            <button type="button" class="icon-btn detail-wishlist${saved ? ' saved' : ''}" id="detailWishlist" aria-label="${saved ? 'Remove from' : 'Add to'} wishlist">${saved ? '♥' : '♡'}</button>
          </div>
        </div>
      </div>
      <section class="review-section">
        <h2>Customer Reviews</h2><div id="productReviews">Loading reviews...</div>
        <form class="review-form" id="reviewForm">
          ${renderReviewRatingInput()}
          <label>Your review <textarea id="reviewText" maxlength="1200" rows="3" placeholder="Share your experience (optional)"></textarea></label>
          <label>Product photo (JPG, PNG, or WebP; up to 2 MB)<input id="reviewPhoto" type="file" accept="image/jpeg,image/png,image/webp"></label>
          <p id="reviewFeedback" role="status"></p><button class="outline-btn" type="submit">Post Review</button>
        </form>
      </section>
      ${recommendations.length ? `<section class="similar-section"><h2>You May Also Like</h2><div class="product-grid discovery-grid">${recommendations.map(productCard).join('')}</div></section>` : ''}
    </div>`;

  document.getElementById('detailAddBag').onclick = () => addProductToBag(product.id, Number(document.getElementById('productDetailQty').value), document.getElementById('productDetailColor')?.value || '');
  document.getElementById('detailBuyNow').onclick = () => {
    const qty = Math.max(1, Math.min(20, Number(document.getElementById('productDetailQty').value) || 1));
    openCheckout([{ product, qty, color: document.getElementById('productDetailColor')?.value || '' }], stock > 0 ? 'Delivery Details' : 'Pre-order Details');
  };
  document.getElementById('detailWishlist').onclick = event => {
    let wishlist = getWishlist();
    const wasSaved = wishlist.includes(String(product.id));
    wishlist = wasSaved ? wishlist.filter(id => id !== String(product.id)) : [...wishlist, String(product.id)];
    setWishlist(wishlist);
    event.currentTarget.textContent = wasSaved ? '♡' : '♥';
    event.currentTarget.classList.toggle('saved', !wasSaved);
    toast(wasSaved ? 'Removed from wishlist' : 'Added to wishlist');
  };
  bindProductActions(host);
  bindReviewForm(product.id);
  loadProductReviews(product.id);
}

async function openProductDetails(productId) {
  const product = shopProducts.find(item => String(item.id) === String(productId));
  if (!product) return;
  const ids = [String(product.id), ...recentProductIds().filter(id => id !== String(product.id))].slice(0, 8);
  try { localStorage.setItem('ss_recent_products', JSON.stringify(ids)); } catch (e) {}
  renderRecentlyViewed();
  const sameCategory = shopProducts.filter(item =>
    item.id !== product.id && categoryForProduct(item) === categoryForProduct(product)
  ).slice(0, 3);
  const similar = sameCategory.length ? sameCategory : shopProducts
    .filter(item => item.id !== product.id)
    .sort((a, b) => Math.abs(Number(a.price) - Number(product.price)) - Math.abs(Number(b.price) - Number(product.price)))
    .slice(0, 3);
  let modal = document.getElementById('productDetailsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'productDetailsModal';
    modal.className = 'checkout-modal';
    modal.innerHTML = `<div class="checkout-backdrop" data-close-details></div>
      <div class="checkout-panel product-details-panel" role="dialog" aria-modal="true" aria-labelledby="productDetailsTitle">
        <div class="checkout-head"><h2 id="productDetailsTitle"></h2><button class="icon-btn" type="button" data-close-details aria-label="Close details">×</button></div>
        <div id="productDetailsContent"></div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.hidden = false;
  modal.querySelectorAll('[data-close-details]').forEach(button => button.onclick = () => { modal.hidden = true; });
  document.getElementById('productDetailsTitle').textContent = product.name;
  document.getElementById('productDetailsContent').innerHTML = `
    <div class="product-detail-summary">
      <img src="${esc(product.image_url || 'assets/login-background.jpg')}" alt="${esc(product.name)}">
      <div><p>${esc(product.description || 'Handmade with care, one stitch at a time.')}</p>
        <strong>₹${esc(Number(product.price).toLocaleString('en-IN'))}</strong>
        <label>Choose a colour
          <select id="quickViewColor">${productColors(product).map(color => `<option>${esc(color)}</option>`).join('')}</select>
        </label>
        <button class="pill-btn" id="quickViewBuy" type="button">Buy Now →</button>
      </div>
    </div>
    <div class="review-section">
      <h3>Customer Reviews</h3><div id="productReviews">Loading reviews...</div>
      <form class="review-form" id="reviewForm">
        ${renderReviewRatingInput()}
        <label>Your review <textarea id="reviewText" maxlength="1200" rows="3" placeholder="Share your experience (optional)"></textarea></label>
        <label>Product photo (JPG, PNG, or WebP; up to 2 MB)<input id="reviewPhoto" type="file" accept="image/jpeg,image/png,image/webp"></label>
        <p id="reviewFeedback" role="status"></p><button class="outline-btn" type="submit">Post Review</button>
      </form>
    </div>
    ${similar.length ? `<div class="similar-section"><h3>You May Also Like</h3><div class="product-grid discovery-grid">${similar.map(productCard).join('')}</div></div>` : ''}
  `;
  document.getElementById('quickViewBuy').onclick = () => {
    modal.hidden = true;
    openCheckout([{ product, qty: 1, color: document.getElementById('quickViewColor').value }], 'Delivery Details');
  };
  bindProductActions(document.getElementById('productDetailsContent'));
  bindReviewForm(product.id);
  loadProductReviews(product.id);
}

async function loadProductReviews(productId) {
  const host = document.getElementById('productReviews');
  try {
    const reviews = await api(`/products/${encodeURIComponent(productId)}/reviews`);
    host.innerHTML = reviews.length ? reviews.map(review => `<article class="product-review">
      <strong>${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</strong>
      <span>${esc(review.customerName)} · ${esc(new Date(review.createdAt).toLocaleDateString())}</span>
      ${review.text ? `<p>${esc(review.text)}</p>` : ''}
      ${review.photo ? `<img src="${esc(review.photo)}" alt="Customer shared product photo">` : ''}
    </article>`).join('') : '<p class="admin-muted">No reviews yet. Be the first to share one.</p>';
  } catch (error) {
    host.textContent = error.message;
  }
}

function bindReviewForm(productId) {
  const form = document.getElementById('reviewForm');
  let selectedRating = 0;
  const ratingLabel = document.getElementById('ratingSelectionLabel');
  const stars = [...form.querySelectorAll('[data-review-rating]')];
  const paintRating = () => {
    stars.forEach(star => {
      const value = Number(star.dataset.reviewRating);
      star.textContent = value <= selectedRating ? '★' : '☆';
      star.setAttribute('aria-checked', String(value === selectedRating));
      star.classList.toggle('selected', value <= selectedRating);
    });
    ratingLabel.textContent = selectedRating ? `${'★'.repeat(selectedRating)}${'☆'.repeat(5 - selectedRating)} (${selectedRating} out of 5)` : 'Choose a star rating';
  };
  stars.forEach(star => star.onclick = () => {
    selectedRating = Number(star.dataset.reviewRating);
    paintRating();
  });
  form.onsubmit = async event => {
    event.preventDefault();
    const feedback = document.getElementById('reviewFeedback');
    const photo = document.getElementById('reviewPhoto').files[0];
    if (!selectedRating) {
      feedback.textContent = 'Select a star rating before submitting.';
      return;
    }
    if (photo && photo.size > 2 * 1024 * 1024) {
      feedback.textContent = 'Review photos must be 2 MB or smaller.';
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const photoData = photo ? await readCustomisationFile(photo) : null;
      await api(`/products/${encodeURIComponent(productId)}/reviews`, 'POST', {
        rating: selectedRating,
        text: document.getElementById('reviewText').value,
        photo: photoData ? photoData.data : '',
      });
      form.reset();
      selectedRating = 0;
      paintRating();
      feedback.textContent = 'Thank you for your review!';
      await loadProductReviews(productId);
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}

function renderReviewRatingInput() {
  return `<div class="rating-select"><span>Your rating</span><div class="rating-stars" role="radiogroup" aria-label="Choose a rating from one to five stars">
    ${[1, 2, 3, 4, 5].map(value => `<button type="button" role="radio" aria-checked="false" aria-label="${value} star${value === 1 ? '' : 's'}" data-review-rating="${value}">☆</button>`).join('')}
  </div><span id="ratingSelectionLabel" class="rating-selection-label">Choose a star rating</span></div>`;
}

function readCustomisationFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: reader.result });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function renderAllProducts(searchValue) {
  const search = String(searchValue ?? document.getElementById('shopSearch')?.value ?? document.getElementById('headerSearch')?.value ?? '').trim().toLowerCase();
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

  const filterNames = ['All', 'Bags', 'Bouquets', 'Flowers', 'Handbags', 'Accessories', 'Home Decor', 'Keychains', 'Custom Orders'];
  const filters = document.getElementById('filterChips');
  filters.innerHTML = filterNames.map(name =>
    `<button type="button" class="filter-chip${activeCategory === name ? ' active' : ''}" data-filter="${esc(name)}">${esc(name)}</button>`
  ).join('');
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.onclick = () => {
      activeCategory = button.dataset.filter;
      renderCategories();
      renderAllProducts(document.getElementById('shopSearch')?.value || document.getElementById('headerSearch')?.value || '');
    };
  });
  const host = document.getElementById('allProducts');
  host.innerHTML = filtered.length
    ? filtered.map(productCard).join('')
    : '<div class="empty-state">No matching crochet pieces yet 🧶</div>';
  bindProductActions(host);
}

function bindProductActions(root) {
  root.querySelectorAll('[data-quick-view]').forEach(button => {
    button.onclick = () => openProductDetails(button.dataset.quickView);
  });
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
      if (currentStorePage === 'wishlist') renderWishlistPage();
      if (activeCategory === 'Wishlist') renderAllProducts(document.getElementById('shopSearch')?.value || document.getElementById('headerSearch')?.value || '');
    };
  });
  root.querySelectorAll('[data-order]').forEach(button => {
    button.onclick = () => openBuyNow(button);
  });
  root.querySelectorAll('[data-bag]').forEach(button => {
    button.onclick = () => addProductToBag(button.dataset.bag);
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
          <div class="checkout-wide gift-wrap-options">
            <label class="gift-wrap-toggle"><input id="giftWrap" type="checkbox"> Add gift wrapping</label>
            <label id="giftMessageField" hidden>Personal message (up to 300 characters)
              <textarea id="giftMessage" maxlength="300" rows="2" placeholder="Write a short note"></textarea>
            </label>
          </div>
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
          <div class="payment-submission-fields">
            <label>Transaction reference<input id="paymentReference" maxlength="120" placeholder="UPI transaction ID"></label>
            <label>Payment screenshot<input id="paymentProof" type="file" accept="image/jpeg,image/png,image/webp"></label>
            <p class="profile-note">Payment is not confirmed until the admin verifies it.</p>
          </div>
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
     <div><strong>${esc(entry.product.name)}</strong><span>Qty ${esc(entry.qty)} · ₹${esc(Number(entry.product.price).toLocaleString('en-IN'))}</span>
       ${productColors(entry.product).length ? `<label class="checkout-colour">Colour
         <select data-checkout-color="${esc(entry.product.id)}">${productColors(entry.product).map(color =>
           `<option${entry.color === color ? ' selected' : ''}>${esc(color)}</option>`
         ).join('')}</select>
       </label>` : ''}</div>`
  ).join('');
  const form = document.getElementById('checkoutForm');
  const paymentStep = document.getElementById('paymentStep');
  form.hidden = false;
  paymentStep.hidden = true;
  document.getElementById('giftWrap').checked = false;
  document.getElementById('giftMessage').value = '';
  document.getElementById('paymentConfirmed').checked = false;
  document.getElementById('paymentReference').value = '';
  document.getElementById('paymentProof').value = '';

  // Confirm button stays disabled until checkbox ticked + reference + screenshot are provided
  const updateConfirmState = () => {
    const ready = document.getElementById('paymentConfirmed').checked
      && document.getElementById('paymentReference').value.trim() !== ''
      && document.getElementById('paymentProof').files.length > 0;
    document.getElementById('confirmPayment').disabled = !ready;
  };
  ['paymentConfirmed', 'paymentReference', 'paymentProof'].forEach(id => {
    const el = document.getElementById(id);
    el.oninput = updateConfirmState;
    el.onchange = updateConfirmState;
  });
  updateConfirmState();
  document.getElementById('giftMessageField').hidden = true;
  document.getElementById('giftWrap').onchange = event => {
    document.getElementById('giftMessageField').hidden = !event.currentTarget.checked;
  };
  api('/auth/profile').then(profile => {
    if (modal.hidden) return;
    document.getElementById('deliveryName').value = profile.name || '';
    document.getElementById('deliveryPhone').value = profile.phone || '';
    document.getElementById('deliveryAddress').value = profile.address || '';
    document.getElementById('deliveryPincode').value = profile.pincode || '';
  }).catch(error => toast(error.message));
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
    modal.dataset.deliveryDetails = JSON.stringify({ name, phone, address, pincode });
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
    const paymentReference = document.getElementById('paymentReference').value.trim();
    const proofFile = document.getElementById('paymentProof').files[0];
    if (!paymentReference && !proofFile) return toast('Add a transaction reference or payment screenshot.');
    if (proofFile && proofFile.size > 2 * 1024 * 1024) return toast('Payment screenshots must be 2 MB or smaller.');
    const confirmButton = document.getElementById('confirmPayment');
    confirmButton.disabled = true;
    try {
      const giftWrap = document.getElementById('giftWrap').checked;
      const giftMessage = giftWrap ? document.getElementById('giftMessage').value.trim() : '';
      const deliveryDetails = JSON.parse(modal.dataset.deliveryDetails || '{}');
      const paymentProof = proofFile ? (await readCustomisationFile(proofFile)).data : '';
      for (const entry of entries) {
        const colorSelect = [...modal.querySelectorAll('[data-checkout-color]')]
          .find(select => select.dataset.checkoutColor === String(entry.product.id));
        const color = colorSelect ? colorSelect.value : '';
        await placeOrder(entry.product.id, entry.qty, {
          color, giftWrap, giftMessage, deliveryDetails,
          paymentSubmission: { method: 'UPI', reference: paymentReference, amountPaid: Number(entry.product.price) * entry.qty, proof: paymentProof },
        });
      }
      if (modal.dataset.bagCheckout === 'true') setBagItems({});
      modal.hidden = true;
      window.location.href = 'orders.html';
    } catch (error) {
      toast(error.message);
      console.error('Place order failed:', error);
      confirmButton.disabled = false;
    }
  };
  document.getElementById('deliveryName').focus();
}

async function placeOrder(productId, qty, options = {}) {
  const order = await api('/orders', 'POST', {
    productId: Number(productId),
    qty: Number(qty),
    color: options.color || '',
    giftWrap: Boolean(options.giftWrap),
    giftMessage: options.giftMessage || '',
    deliveryDetails: options.deliveryDetails,
    paymentSubmission: options.paymentSubmission,
  });
  toast(options.paymentSubmission
    ? `Payment submitted — awaiting admin verification. ${order.isPreorder ? `Pre-order PO-${order.preorderId || order.id}` : `Order #${order.id}`} placed.`
    : order.isPreorder
      ? `Pre-order PO-${order.preorderId || order.id} submitted`
      : `Order #${order.id} placed and awaiting confirmation`);
  await Promise.all([loadProducts(), loadOrders()]);
  return order;
}

async function placeBagOrder() {
  const items = getBagItems();
  const entries = Object.entries(items).filter(([, qty]) => Number(qty) > 0);
  if (!entries.length) return toast('Your bag is empty');
  const checkoutEntries = entries.map(([productId, qty]) => ({
    product: shopProducts.find(item => String(item.id) === productId),
    qty: Number(qty),
    color: getBagColors()[productId] || productColors(shopProducts.find(item => String(item.id) === productId) || {})[0] || '',
  })).filter(entry => entry.product);
  if (!checkoutEntries.length) return toast('Your bag has no available products');
  const bagDrawer = document.getElementById('bagDrawer');
  if (bagDrawer) bagDrawer.hidden = true;
  openCheckout(checkoutEntries, 'Delivery Details', true);
}