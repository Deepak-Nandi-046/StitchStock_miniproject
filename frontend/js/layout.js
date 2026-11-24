// Shared role-aware header and account menu.
function renderLayout(role, u) {
  const customerNav = [
    ['Home', 'index.html'], ['Shop', 'shop.html'],
    ['Customisation', 'customisation.html'], ['Wishlist', 'wishlist.html'],
    ['My Orders', 'orders.html'], ['Chat with Admin', 'messages.html'], ['About', 'about.html']
  ];
  const ownerNav = [
    { label: 'Overview', href: 'owner.html?view=overview', key: 'overview', icon: '▣' },
    {
      label: 'Store Management',
      key: 'store-management',
      icon: '🧶',
      items: [
        { label: 'Products', href: 'inventory.html', key: 'products', icon: '✿' },
      ],
    },
    {
      label: 'Orders & Payments',
      key: 'orders-payments',
      icon: '▤',
      items: [
        { label: 'Orders', href: 'owner.html?view=orders', key: 'orders', icon: '▤' },
        { label: 'Pre-orders', href: 'owner.html?view=preorders', key: 'preorders', icon: '◷' },
        { label: 'Payment Verification', href: 'owner.html?view=payments', key: 'payments', icon: '₹', badge: true },
      ],
    },
    {
      label: 'Customer Engagement',
      key: 'customer-engagement',
      icon: '♡',
      items: [
        { label: 'Customer Chats', href: 'owner.html?view=chats', key: 'chats', icon: '✉', badge: true },
        { label: 'Customisation Requests', href: 'owner.html?view=custom-requests', key: 'custom-requests', icon: '✿', badge: true },
        { label: 'Reviews', href: 'owner.html?view=reviews', key: 'reviews', icon: '☆' },
      ],
    },
    {
      label: 'Order Support',
      key: 'order-support',
      icon: '↺',
      items: [
        { label: 'Returns & Cancellations', href: 'owner.html?view=returns', key: 'returns', icon: '↺' },
        { label: 'Notifications', href: 'owner.html?view=notifications', key: 'notifications', icon: '♡' },
      ],
    },
  ];
  const nav = customerNav;
  const header = document.getElementById('siteHeader');
  header.classList.toggle('admin-site-header', role === 'owner');
  header.innerHTML = `
    <a class="brand-link" href="${role === 'owner' ? 'owner.html' : 'index.html'}" aria-label="StitchStock ${role === 'owner' ? 'admin' : 'store'}">
      <img src="assets/yarn-logo.png" alt="">
      <span class="brand-copy"><strong>Stitch<span>Stock</span></strong><small>Handmade with Love ♥</small></span>
    </a>
    <nav class="main-nav" id="mainNav" aria-label="${role === 'owner' ? 'Admin' : 'Store'} navigation">
      ${role === 'customer' ? nav.map(([label, href]) => {
        const current = location.pathname.toLowerCase();
        const isActive = (label === 'Home' && (current.endsWith('/index.html') || current === '/'))
            || (label === 'Shop' && (current.endsWith('/shop.html') || current.endsWith('/product.html')))
            || (label === 'Customisation' && current.endsWith('/customisation.html'))
            || (label === 'Wishlist' && current.endsWith('/wishlist.html'))
            || (label === 'My Orders' && current.endsWith('/orders.html'))
            || (label === 'Chat with Admin' && current.endsWith('/messages.html'))
            || (label === 'About' && current.endsWith('/about.html'));
        return `<a class="nav-pill${isActive ? ' active' : ''}" href="${esc(href)}">${esc(label)}</a>`;
      }).join('') : ''}
    </nav>
    <div class="header-tools">
      ${role === 'customer'
        ? `<label class="header-search" aria-label="Search products">⌕<input id="headerSearch" type="search" placeholder="Search crochet items..."></label>
           <a class="icon-btn" id="wishlistHeader" href="wishlist.html" aria-label="Wishlist">♡<span class="count-badge" id="wishlistCount">0</span></a>
           <a class="icon-btn" id="bagHeader" href="bag.html" aria-label="Open shopping bag">🛒<span class="count-badge" id="bagCount">0</span></a>`
        : '<button type="button" class="icon-btn refresh-btn" id="refreshAdmin" aria-label="Refresh dashboard" title="Refresh">↻</button>'}
      <details class="user-menu-wrap">
        <summary class="icon-btn profile-icon" aria-label="Open user menu" title="${esc(u.name)}">${u.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="">` : '👤'}</summary>
        <div class="user-popover">
          <strong class="user-name">${esc(u.name)}</strong>
          <a href="profile.html">My Profile</a>
          ${role === 'customer' ? '<a href="orders.html">My Orders</a>' : ''}
          <button type="button" id="layoutLogout">Log out</button>
          <button type="button" id="layoutDelete">Delete account</button>
        </div>
      </details>
      <button type="button" class="icon-btn menu-toggle" id="menuToggle" aria-label="Open navigation" aria-expanded="false">☰</button>
    </div>
  `;

  if (role === 'owner') renderAdminSidebar(header, ownerNav);
  if (role === 'customer') {
    api('/messages/unread').then(result => {
      const link = [...document.querySelectorAll('#mainNav a')].find(item => item.href.endsWith('/messages.html'));
      if (link && result.count) link.innerHTML += ` <span class="nav-unread-count">${esc(result.count)}</span>`;
    }).catch(error => toast(error.message));
  }
  document.getElementById('layoutLogout').onclick = () => {
    store.clear();
    location.href = 'login.html';
  };
  document.getElementById('menuToggle').onclick = event => {
    const navigation = document.getElementById(role === 'owner' ? 'adminSidebar' : 'mainNav');
    const open = navigation.classList.toggle('open');
    event.currentTarget.setAttribute('aria-expanded', String(open));
  };
  const search = document.getElementById('headerSearch');
  if (search) search.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !location.pathname.toLowerCase().endsWith('/shop.html'))
      location.href = `shop.html?q=${encodeURIComponent(search.value.trim())}`;
  });
  document.getElementById('layoutDelete').onclick = openDeleteModal;
  updateWishlistCount();
  updateBagCount();
}

function renderAdminSidebar(header, nav) {
  const main = document.querySelector('#adminApp, #inventoryApp');
  if (!main) return;
  const view = new URLSearchParams(location.search).get('view') || 'overview';
  const current = location.pathname.toLowerCase();
  const activeView = current.endsWith('/inventory.html') ? 'products' : view;
  const groups = nav.filter(item => item.items);
  const activeGroup = groups.find(group => group.items.some(item => item.key === activeView));
  const shell = document.createElement('div');
  shell.className = 'admin-shell';
  shell.innerHTML = `<aside class="admin-sidebar" id="adminSidebar">
    <p class="admin-sidebar-title">Dashboard</p>
    <nav aria-label="Admin pages">${nav.map(item => {
      if (!item.items) {
        return `<a class="admin-sidebar-link${activeView === item.key ? ' active' : ''}" href="${esc(item.href)}"${activeView === item.key ? ' aria-current="page"' : ''}>
          <span aria-hidden="true">${item.icon}</span><span>${esc(item.label)}</span>
        </a>`;
      }
      const isActive = item === activeGroup;
      return `<section class="admin-sidebar-group${isActive ? ' active' : ''}">
        <button type="button" class="admin-sidebar-link admin-sidebar-group-toggle" aria-expanded="${isActive}" aria-controls="admin-submenu-${esc(item.key)}">
          <span aria-hidden="true">${item.icon}</span><span class="admin-sidebar-group-label">${esc(item.label)}</span>
          <span class="admin-sidebar-chevron" aria-hidden="true">⌄</span>
        </button>
        <div class="admin-sidebar-submenu" id="admin-submenu-${esc(item.key)}"${isActive ? '' : ' hidden'}>
          ${item.items.map(subitem => `<a class="admin-sidebar-link${activeView === subitem.key ? ' active' : ''}" href="${esc(subitem.href)}"${activeView === subitem.key ? ' aria-current="page"' : ''}>
            <span aria-hidden="true">${subitem.icon}</span><span class="admin-sidebar-item-label">${esc(subitem.label)}</span>
            ${subitem.badge ? `<span class="admin-sidebar-count" data-sidebar-badge="${esc(subitem.key)}" hidden></span>` : ''}
          </a>`).join('')}
        </div>
      </section>`;
    }).join('')}</nav>
  </aside>`;
  header.parentNode.insertBefore(shell, main);
  shell.appendChild(main);
  shell.querySelectorAll('.admin-sidebar-group-toggle').forEach(button => {
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      document.getElementById(button.getAttribute('aria-controls')).hidden = expanded;
    });
  });
  refreshAdminSidebarBadges();
  window.setInterval(() => {
    if (!document.hidden) refreshAdminSidebarBadges();
  }, 30000);
}

async function refreshAdminSidebarBadges() {
  if (!document.getElementById('adminSidebar')) return;
  try {
    const [messages, requests, summary] = await Promise.all([
      api('/owner/messages'),
      api('/owner/custom-requests'),
      api('/owner/summary'),
    ]);
    const unreadMessages = messages.reduce((total, thread) =>
      total + (thread.messages || []).filter(message => message.sender === 'customer' && !message.readByAdmin).length, 0
    );
    const pendingRequests = requests.filter(request =>
      ['Submitted', 'Under Review', 'Need More Details'].includes(request.status)
    ).length;
    const pendingPayments = summary.orders.filter(order =>
      ['Payment Submitted', 'Awaiting Verification'].includes(order.paymentStatus)
    ).length;
    setAdminSidebarBadge('chats', unreadMessages, 'unread messages');
    setAdminSidebarBadge('custom-requests', pendingRequests, 'pending requests');
    setAdminSidebarBadge('payments', pendingPayments, 'payments to verify');
  } catch (error) {
    toast(error.message);
  }
}

function setAdminSidebarBadge(key, count, description) {
  const badge = document.querySelector(`[data-sidebar-badge="${key}"]`);
  if (!badge) return;
  badge.textContent = String(count);
  badge.hidden = count < 1;
  badge.setAttribute('aria-label', `${count} ${description}`);
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
