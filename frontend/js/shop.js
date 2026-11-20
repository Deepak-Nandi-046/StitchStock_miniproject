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
      <button type="button" class="pill-btn product-action" data-order="${esc(id)}" ${stock <= 0 ? '' : ''}>${stock > 0 ? 'Order' : 'Pre-order'}</button>
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

  const filterNames = ['All', 'Bags', 'Bouquets', 'Flowers', 'Accessories', 'Home Decor', 'Keychains', 'Custom Orders', 'Wishlist'];
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
    button.onclick = () => placeOrder(button);
  });
}

async function placeOrder(button) {
  button.disabled = true;
  try {
    const order = await api('/orders', 'POST', { productId: Number(button.dataset.order), qty: 1 });
    if (order.status === 'Confirmed') {
      toast('Order confirmed!');
    } else {
      toast(`You are #${order.queuePosition || '?'} in the queue`);
    }
    await Promise.all([loadProducts(), loadOrders()]);
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}

document.getElementById('sortSelect')?.addEventListener('change', () => renderAllProducts());
