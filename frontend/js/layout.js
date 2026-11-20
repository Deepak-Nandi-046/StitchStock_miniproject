// Shared role-aware header and account menu.
function renderLayout(role, u) {
  const customerNav = [
    ['Home', 'index.html#home'], ['Shop', 'index.html#shop'], ['Bags', 'index.html#shop'],
    ['Flowers', 'index.html#shop'], ['Custom Orders', 'index.html#custom'], ['About', 'index.html#about']
  ];
  const ownerNav = [
    ['Overview', 'owner.html#overview'], ['Inventory', 'inventory.html'],
    ['Queues', 'inventory.html#inventory'], ['Orders', 'owner.html#orders'], ['Audit', 'owner.html#audit']
  ];
  const nav = role === 'owner' ? ownerNav : customerNav;
  const header = document.getElementById('siteHeader');
  header.innerHTML = `
    <a class="brand-link" href="${role === 'owner' ? 'owner.html' : 'index.html'}" aria-label="StitchStock ${role === 'owner' ? 'admin' : 'store'}">
      <img src="assets/yarn-logo.png" alt="">
      <span class="brand-copy"><strong>Stitch<span>Stock</span></strong><small>Handmade with Love ♥</small></span>
    </a>
    <nav class="main-nav" id="mainNav" aria-label="${role === 'owner' ? 'Admin' : 'Store'} navigation">
      ${nav.map(([label, href]) => {
        const current = location.pathname.toLowerCase();
        const isActive = role === 'owner'
          ? (label === 'Overview' && current.endsWith('/owner.html'))
            || (label === 'Inventory' && current.endsWith('/inventory.html'))
            || (label === 'Queues' && current.endsWith('/inventory.html'))
            || (label === 'Orders' && current.endsWith('/owner.html') && location.hash === '#orders')
            || (label === 'Audit' && current.endsWith('/owner.html') && location.hash === '#audit')
          : label === 'Home';
        return `<a class="nav-pill${isActive ? ' active' : ''}" href="${esc(href)}">${esc(label)}</a>`;
      }).join('')}
    </nav>
    <div class="header-tools">
      ${role === 'customer'
        ? `<label class="header-search" aria-label="Search products">⌕<input id="headerSearch" type="search" placeholder="Search crochet items..."></label>
           <button type="button" class="icon-btn" id="wishlistHeader" aria-label="Wishlist">♡<span class="count-badge" id="wishlistCount">0</span></button>
           <button type="button" class="icon-btn" id="bagHeader" aria-label="Open shopping bag">🛒<span class="count-badge" id="bagCount">0</span></button>`
        : '<button type="button" class="icon-btn refresh-btn" id="refreshAdmin" aria-label="Refresh dashboard" title="Refresh">↻</button>'}
      <details class="user-menu-wrap">
        <summary class="icon-btn profile-icon" aria-label="Open user menu" title="${esc(u.name)}">👤</summary>
        <div class="user-popover">
          <strong class="user-name">${esc(u.name)}</strong>
          ${role === 'customer' ? '<a href="#orders">My Orders</a>' : ''}
          <button type="button" id="layoutLogout">Log out</button>
          <button type="button" id="layoutDelete">Delete account</button>
        </div>
      </details>
      <button type="button" class="icon-btn menu-toggle" id="menuToggle" aria-label="Open navigation" aria-expanded="false">☰</button>
    </div>
  `;

  document.getElementById('layoutLogout').onclick = () => {
    store.clear();
    location.href = 'login.html';
  };
  document.getElementById('menuToggle').onclick = event => {
    const open = document.getElementById('mainNav').classList.toggle('open');
    event.currentTarget.setAttribute('aria-expanded', String(open));
  };
  document.getElementById('layoutDelete').onclick = openDeleteModal;
  updateWishlistCount();
  updateBagCount();
}

function updateWishlistCount() {
  let count = 0;
  try {
    const raw = localStorage.getItem('ss_wishlist') || '[]';
    try {
      const parsed = JSON.parse(raw);
      count = Array.isArray(parsed) ? parsed.length : 0;
    } catch (e) {
      count = raw ? raw.split(',').filter(Boolean).length : 0;
    }
  } catch (e) {}
  const badge = document.getElementById('wishlistCount');
  if (badge) badge.textContent = String(count);
}

function updateBagCount() {
  let count = 0;
  try {
    const parsed = JSON.parse(localStorage.getItem('ss_bag') || '[]');
    count = Array.isArray(parsed) ? parsed.length : 0;
  } catch (e) {}
  const badge = document.getElementById('bagCount');
  if (badge) badge.textContent = String(count);
}

function openDeleteModal() {
  let modal = document.getElementById('deleteModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'deleteModal';
    modal.className = 'delete-modal';
    modal.innerHTML = `
      <div class="delete-dialog" role="dialog" aria-modal="true" aria-labelledby="deleteTitle">
        <h2 id="deleteTitle">Delete account?</h2>
        <p>This permanently removes your account. Type <strong>DELETE</strong> to continue.</p>
        <label>Confirmation
          <input id="deleteConfirmInput" autocomplete="off" aria-label="Type DELETE to confirm">
        </label>
        <div class="modal-actions">
          <button type="button" class="outline-btn" id="deleteCancel">Cancel</button>
          <button type="button" class="danger-btn" id="deleteConfirm" disabled>Delete account</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.hidden = false;
  const input = document.getElementById('deleteConfirmInput');
  const confirmButton = document.getElementById('deleteConfirm');
  input.value = '';
  confirmButton.disabled = true;
  input.oninput = () => { confirmButton.disabled = input.value !== 'DELETE'; };
  document.getElementById('deleteCancel').onclick = () => { modal.hidden = true; };
  confirmButton.onclick = async () => {
    if (input.value !== 'DELETE') return;
    confirmButton.disabled = true;
    try {
      await api('/auth/account', 'DELETE');
      store.clear();
      location.href = 'login.html';
    } catch (error) {
      toast(error.message);
      confirmButton.disabled = false;
    }
  };
  input.focus();
}
