const ownerUser = typeof u !== 'undefined' ? u : guard('owner');
if (!ownerUser) {
  // guard redirects cross-role visitors
} else {
  initAdmin();
}

let ownerSummary = null;
let orderSearch = '';
let orderStatus = 'All';
let refreshTimer = null;

async function initAdmin() {
  document.getElementById('adminApp').innerHTML = `
    <section class="admin-banner" id="overview">
      <div>
        <h1>Good morning, <em>${esc(ownerUser.name)}</em></h1>
        <p id="adminDate"></p>
      </div>
    </section>
    <section class="stat-grid" id="stats">
      <article class="card stat-card"><span class="stat-icon">▣</span><div><strong>—</strong><span>Orders today</span></div></article>
      <article class="card stat-card"><span class="stat-icon">◷</span><div><strong>—</strong><span>Waiting in queues</span></div></article>
      <article class="card stat-card"><span class="stat-icon">₹</span><div><strong>—</strong><span>Awaiting payment</span></div></article>
      <article class="card stat-card"><span class="stat-icon">!</span><div><strong>—</strong><span>Low stock</span></div></article>
    </section>
    <section class="admin-section" id="inventory">
      <div class="section-title-row">
        <h2>Inventory</h2>
        <button type="button" class="pill-btn" id="toggleAddProduct">+ Add ready product</button>
      </div>
      <form class="add-product-form" id="addProductForm" hidden>
        <label>Name
          <input id="newProductName" name="name" maxlength="100" required>
        </label>
        <label>Price (₹)
          <input id="newProductPrice" name="price" type="number" min="0" step="0.01" required>
        </label>
        <label>Stock
          <input id="newProductStock" name="stock" type="number" min="0" step="1" value="1" required>
        </label>
        <label>Category
          <select id="newProductCategory" name="category">
            <option>Bags</option>
            <option>Bouquets</option>
            <option>Flowers</option>
            <option>Handbags</option>
            <option>Home Decor</option>
            <option>Accessories</option>
            <option>Keychains</option>
            <option>Custom Orders</option>
          </select>
        </label>
        <label class="wide-field">Image URL
          <input id="newProductImage" name="image_url" type="text" placeholder="assets/hero.webp or https://...">
        </label>
        <label class="wide-field">Description
          <input id="newProductDescription" name="description" maxlength="300">
        </label>
        <div class="form-actions">
          <button type="button" class="outline-btn" id="cancelAddProduct">Cancel</button>
          <button type="submit" class="pill-btn" id="submitAddProduct">Add product</button>
        </div>
      </form>
      <div class="inventory-grid" id="inventoryGrid"><div class="admin-empty">Loading inventory... 🧶</div></div>
    </section>
    <section class="admin-section" id="orders">
      <h2>Orders</h2>
      <div class="toolbar">
        <label>Search
          <input id="orderSearch" type="search" placeholder="Search product or customer">
        </label>
        <label>Status
          <select id="orderStatus">
            <option>All</option>
            <option>Confirmed</option>
            <option>Pre-order Queued</option>
            <option>In Production</option>
            <option>Ready for Balance Payment</option>
            <option>Payment Completed</option>
            <option>Shipped</option>
            <option>Cancelled</option>
          </select>
        </label>
      </div>
      <div class="admin-table-wrap" id="ordersTable"><div class="admin-empty">Loading orders... 🧶</div></div>
    </section>
    <section class="admin-section" id="audit">
      <h2>Audit log</h2>
      <div class="audit-timeline" id="auditList"><div class="admin-empty">Loading audit log... 🧶</div></div>
    </section>`;

  document.getElementById('adminDate').textContent = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(new Date());
  bindAddProductForm();
  document.getElementById('orderSearch').oninput = event => {
    orderSearch = event.target.value.trim().toLowerCase();
    renderOrders();
  };
  document.getElementById('orderStatus').onchange = event => {
    orderStatus = event.target.value;
    renderOrders();
  };
  document.getElementById('refreshAdmin')?.addEventListener('click', () => refreshAdmin(true));
  await refreshAdmin(false);
  refreshTimer = setInterval(() => {
    if (!document.hidden) refreshAdmin(false);
  }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshAdmin(false);
  });
}

function bindAddProductForm() {
  const form = document.getElementById('addProductForm');
  const toggle = document.getElementById('toggleAddProduct');
  const cancel = document.getElementById('cancelAddProduct');
  toggle.onclick = () => {
    form.hidden = !form.hidden;
    if (!form.hidden) document.getElementById('newProductName').focus();
  };
  cancel.onclick = () => {
    form.reset();
    form.hidden = true;
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const submit = document.getElementById('submitAddProduct');
    submit.disabled = true;
    try {
      const product = await api('/owner/products', 'POST', {
        name: document.getElementById('newProductName').value,
        price: Number(document.getElementById('newProductPrice').value),
        stock: Number(document.getElementById('newProductStock').value),
        category: document.getElementById('newProductCategory').value,
        image_url: document.getElementById('newProductImage').value,
        description: document.getElementById('newProductDescription').value
      });
      toast(`${product.name} added`);
      form.reset();
      form.hidden = true;
      await refreshAdmin(false);
    } catch (error) {
      toast(error.message);
      submit.disabled = false;
    } finally {
      submit.disabled = false;
    }
  };
}

async function refreshAdmin(manual) {
  try {
    ownerSummary = await api('/owner/summary');
    renderStats();
    renderInventory();
    renderOrders();
    renderAudit();
    const time = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    const updated = document.getElementById('updatedTime');
    if (updated) updated.textContent = `Updated ${time}`;
    if (manual) toast('Dashboard refreshed');
  } catch (error) {
    toast(error.message);
  }
}

function renderStats() {
  const today = new Date().toDateString();
  const ordersToday = ownerSummary.orders.filter(order =>
    order.createdAt && new Date(order.createdAt).toDateString() === today
  ).length;
  const waiting = ownerSummary.products.reduce((total, product) => total + (Number(product.queue) || 0), 0);
  const awaitingPayment = ownerSummary.orders.filter(order =>
    order.status === 'Ready for Balance Payment'
  ).length;
  const lowStock = ownerSummary.products.filter(product => Number(product.stock) <= 2).length;
  const values = [
    ['▣', ordersToday, 'Orders today'],
    ['◷', waiting, 'Waiting in queues'],
    ['₹', awaitingPayment, 'Awaiting payment'],
    ['!', lowStock, 'Low stock']
  ];
  document.getElementById('stats').innerHTML = values.map(([icon, value, label]) =>
    `<article class="stat-card"><span class="stat-icon">${icon}</span><div><strong>${esc(value)}</strong><span>${esc(label)}</span></div></article>`
  ).join('');
}

function productName(productId) {
  const product = ownerSummary?.products.find(item => item.id === productId);
  return product ? product.name : 'Unknown item';
}

function renderInventory() {
  const host = document.getElementById('inventoryGrid');
  if (!ownerSummary.products.length) {
    host.innerHTML = '<div class="admin-empty">No inventory items yet 🧶</div>';
    return;
  }
  host.innerHTML = ownerSummary.products.map(product => {
    const stock = Number(product.stock) || 0;
    const fillClass = stock <= 2 ? 'low' : stock <= 5 ? 'warn' : 'good';
    const fillWidth = Math.min(100, stock * 10);
    const image = product.image_url || 'assets/login-background.jpg';
    const queue = Number(product.queue) || 0;
    return `<article class="inventory-card">
      <img class="inventory-image" src="${esc(image)}" alt="${esc(product.name)}" onerror="this.onerror=null;this.style.display='none'">
      <div class="inventory-body">
        <h3>${esc(product.name)}</h3>
        <div class="inventory-meta"><span>₹${esc(Number(product.price).toLocaleString('en-IN'))}</span><span>${esc(stock)} in stock</span></div>
        <div class="stock-track"><div class="stock-fill ${fillClass}" style="width:${fillWidth}%"></div></div>
        <div class="inventory-meta"><span>Queue: ${esc(queue)}</span></div>
        <div class="restock-row">
          <input type="number" min="1" max="100" value="5" data-restock-input="${esc(product.id)}" aria-label="Restock amount for ${esc(product.name)}">
          <button type="button" class="compact-btn" data-restock-quick="${esc(product.id)}">+5 stock</button>
          <button type="button" class="compact-btn primary" data-restock="${esc(product.id)}">Restock</button>
        </div>
        <button type="button" class="compact-btn" style="width:100%;margin-top:6px" data-allocate="${esc(product.id)}" ${queue === 0 ? 'disabled' : ''}>Serve next in queue</button>
      </div>
    </article>`;
  }).join('');

  host.querySelectorAll('[data-restock]').forEach(button => {
    button.onclick = () => restockProduct(button);
  });
  host.querySelectorAll('[data-restock-quick]').forEach(button => {
    button.onclick = () => restockProduct(button, 5);
  });
  host.querySelectorAll('[data-allocate]').forEach(button => {
    button.onclick = () => allocateQueue(button);
  });
}

async function restockProduct(button, quickAmount) {
  const productId = button.dataset.restock || button.dataset.restockQuick;
  const input = [...document.querySelectorAll('[data-restock-input]')]
    .find(item => item.dataset.restockInput === productId);
  const add = quickAmount ?? Number(input?.value);
  if (!Number.isInteger(add) || add < 1) return toast('Enter a valid stock amount');
  button.disabled = true;
  try {
    await api(`/owner/products/${encodeURIComponent(productId)}/restock`, 'POST', { add });
    toast('Stock updated');
    await refreshAdmin(false);
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}

async function allocateQueue(button) {
  button.disabled = true;
  try {
    await api(`/owner/queue/${encodeURIComponent(button.dataset.allocate)}/allocate`, 'POST');
    toast('Next queue item moved to In Production');
    await refreshAdmin(false);
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}

function renderOrders() {
  let orders = ownerSummary.orders;
  if (orderStatus !== 'All') orders = orders.filter(order => order.status === orderStatus);
  if (orderSearch) {
    orders = orders.filter(order =>
      `${productName(order.productId)} ${order.customerId} ${order.id}`.toLowerCase().includes(orderSearch)
    );
  }
  const host = document.getElementById('ordersTable');
  if (!orders.length) {
    host.innerHTML = '<div class="admin-empty">No matching orders found 🧶</div>';
    return;
  }
  host.innerHTML = `<table class="admin-orders-table">
    <thead><tr><th>#</th><th>Product</th><th>Customer</th><th>Qty</th><th>Status</th><th>Placed</th><th>Actions</th></tr></thead>
    <tbody>${orders.map(order => {
      const moves = (ownerSummary.nextMoves[order.status] || []);
      return `<tr>
        <td data-label="#">${esc(shortId(order.id))}</td>
        <td data-label="Product">${esc(productName(order.productId))}</td>
        <td data-label="Customer" title="${esc(order.customerId)}">${esc(shortId(order.customerId))}</td>
        <td data-label="Qty">${esc(order.qty)}</td>
        <td data-label="Status">${chip(order.status)}</td>
        <td data-label="Placed">${esc(order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN') : '—')}</td>
        <td data-label="Actions"><div class="order-actions">${moves.map(status =>
          `<button type="button" class="compact-btn" data-order="${esc(order.id)}" data-status="${esc(status)}">${esc(status)}</button>`
        ).join('') || '—'}</div></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
  host.querySelectorAll('[data-order]').forEach(button => {
    button.onclick = () => changeOrderStatus(button);
  });
}

async function changeOrderStatus(button) {
  const status = button.dataset.status;
  if (status === 'Cancelled' && !confirm('Cancel this order? This may restore stock.')) return;
  if (status === 'Shipped' && !confirm('Mark this order as shipped?')) return;
  button.disabled = true;
  try {
    await api(`/owner/orders/${encodeURIComponent(button.dataset.order)}/status`, 'POST', { status });
    toast(`Order moved to ${status}`);
    await refreshAdmin(false);
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}

function renderAudit() {
  const host = document.getElementById('auditList');
  const events = (ownerSummary.audit || []).slice(0, 30);
  if (!events.length) {
    host.innerHTML = '<div class="admin-empty">No audit events yet 🧶</div>';
    return;
  }
  host.innerHTML = events.map(event => {
    const fullId = event.entityId == null ? '' : String(event.entityId);
    const short = shortId(fullId);
    const time = event.at ? new Date(event.at).toLocaleString('en-IN') : '—';
    const readable = readableAuditAction(event);
    return `<article class="audit-row">
      <span class="audit-id" title="${esc(fullId)}">${esc(fullId ? short : 'System')}
        ${fullId ? `<button type="button" class="copy-id" data-copy="${esc(fullId)}" aria-label="Copy full audit ID">Copy</button>` : ''}
      </span>
      <span>${esc(readable)}</span>
      <time class="audit-time">${esc(time)}</time>
    </article>`;
  }).join('');
  host.querySelectorAll('[data-copy]').forEach(button => {
    button.onclick = async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        toast('Audit ID copied');
      } catch (error) {
        toast('Could not copy the ID');
      }
    };
  });
}

function readableAuditAction(event) {
  if (event.action === 'STATUS_CHANGED') {
    const to = event.details && event.details.to ? event.details.to : 'a new status';
    return `Order ${shortId(event.entityId)} moved to ${to}`;
  }
  if (event.action === 'RESTOCK') {
    const add = event.details && event.details.add ? event.details.add : 0;
    return `Product ${shortId(event.entityId)} restocked by ${add}`;
  }
  if (event.action === 'ALLOCATED') return `Order ${shortId(event.entityId)} moved to In Production`;
  if (event.action === 'PRODUCT_ADDED') {
    const name = event.details && event.details.name ? event.details.name : 'Product';
    return `${name} added with ${event.details?.stock || 0} in stock`;
  }
  if (event.action === 'ORDER_CONFIRMED') return `Order ${shortId(event.entityId)} confirmed`;
  if (event.action === 'PREORDER_QUEUED') return `Order ${shortId(event.entityId)} joined a pre-order queue`;
  return `${event.action || 'Audit event'} · ${event.entity || 'record'} ${shortId(event.entityId)}`;
}

function shortId(value) {
  const text = String(value == null ? '' : value);
  return text.length > 8 ? text.slice(0, 8) : text;
}
