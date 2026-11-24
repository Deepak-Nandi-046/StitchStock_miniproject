const ownerUser = typeof u !== 'undefined' ? u : guard('owner');
if (!ownerUser) {
  // guard redirects cross-role visitors
} else {
  initAdmin();
}

let ownerSummary = null;
let customRequests = [];
let orderSearch = '';
let orderStatus = 'All';
let refreshTimer = null;

async function initAdmin() {
  document.getElementById('adminApp').innerHTML = `
    <section class="admin-banner" id="overview">
      <div>
        <h1>Handmade <em>Crochet Treasures</em></h1>
        <p class="admin-banner-category">Overview <span>✿</span> Inventory <span>✿</span> Orders <span>✿</span> Audit</p>
        <p id="adminDate"></p>
      </div>
    </section>
    <nav class="admin-category-strip" aria-label="Admin sections">
      <button type="button" class="admin-category-tile" data-admin-section="overview">
        <span class="admin-category-icon" aria-hidden="true">▣</span><span>Overview</span>
      </button>
      <button type="button" class="admin-category-tile" data-admin-link="inventory.html">
        <span class="admin-category-icon" aria-hidden="true">◷</span><span>Queues</span>
      </button>
      <button type="button" class="admin-category-tile" data-admin-section="orders">
        <span class="admin-category-icon" aria-hidden="true">🛍️</span><span>Orders</span>
      </button>
      <button type="button" class="admin-category-tile" data-admin-section="customRequests">
        <span class="admin-category-icon" aria-hidden="true">✉</span><span>Custom Requests</span>
      </button>
      <button type="button" class="admin-category-tile" data-admin-section="audit">
        <span class="admin-category-icon" aria-hidden="true">✓</span><span>Audit</span>
      </button>
    </nav>
    <section class="stat-grid" id="stats">
      <article class="card stat-card"><span class="stat-icon">▣</span><div><strong>—</strong><span>Orders today</span></div></article>
      <article class="card stat-card"><span class="stat-icon">◷</span><div><strong>—</strong><span>Waiting in queues</span></div></article>
      <article class="card stat-card"><span class="stat-icon">₹</span><div><strong>—</strong><span>Awaiting payment</span></div></article>
      <article class="card stat-card"><span class="stat-icon">!</span><div><strong>—</strong><span>Low stock</span></div></article>
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
            <option>Delivered</option>
            <option>Cancelled</option>
          </select>
        </label>
      </div>
      <div class="admin-table-wrap" id="ordersTable"><div class="admin-empty">Loading orders... 🧶</div></div>
    </section>
    <section class="admin-section" id="audit">
      <h2>Audit log</h2>
      <div class="audit-timeline" id="auditList"><div class="admin-empty">Loading audit log... 🧶</div></div>
    </section>
    <section class="admin-section" id="customRequests">
      <h2>Customisation requests</h2>
      <div class="custom-request-list" id="customRequestList"><div class="admin-empty">Loading requests... 🧶</div></div>
    </section>`;

  document.getElementById('adminDate').textContent = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(new Date());
  document.querySelectorAll('[data-admin-section]').forEach(button => {
    button.onclick = () => {
      const section = document.getElementById(button.dataset.adminSection);
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (button.textContent.includes('Add Product')) {
        document.getElementById('toggleAddProduct')?.click();
      }
    };
  });
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

async function refreshAdmin(manual) {
  try {
    const [summary, requests] = await Promise.all([
      api('/owner/summary'),
      api('/owner/custom-requests'),
    ]);
    ownerSummary = summary;
    customRequests = requests;
    renderStats();
    renderOrders();
    renderAudit();
    renderCustomRequests();
    const time = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    const updated = document.getElementById('updatedTime');
    if (updated) updated.textContent = `Updated ${time}`;
    if (manual) toast('Dashboard refreshed');
  } catch (error) {
    toast(error.message);
  }
}

function renderCustomRequests() {
  const host = document.getElementById('customRequestList');
  if (!customRequests.length) {
    host.innerHTML = '<div class="admin-empty">No customisation requests yet 🧶</div>';
    return;
  }
  host.innerHTML = customRequests.map(request => `<article class="custom-request-card">
    <div class="custom-request-meta">
      <strong>${esc(request.customerName || 'Customer')} <span class="custom-request-status">${esc(request.status || 'Submitted')}</span></strong>
      <time>${esc(new Date(request.createdAt).toLocaleString())}</time>
    </div>
    <p><strong>Request ID:</strong> <code>${esc(request.id)}</code></p>
    <p><strong>Contact:</strong> ${esc(request.customerEmail || 'Email unavailable')}${request.customerPhone ? ` · ${esc(request.customerPhone)}` : ''}</p>
    <p><strong>Request:</strong> ${esc(request.productType || 'Custom item')} · ${esc(request.color || 'Any colour')} · ${esc(request.size || 'Any size')}</p>
    <p><strong>Budget:</strong> ${esc(request.budget || 'Not specified')} · <strong>Occasion:</strong> ${esc(request.occasion || 'Not specified')}</p>
    <button type="button" class="compact-btn primary" data-view-custom-request="${esc(request.id)}">View details &amp; reply</button>
  </article>`).join('');
  host.querySelectorAll('[data-view-custom-request]').forEach(button => {
    button.onclick = () => showCustomRequest(button.dataset.viewCustomRequest);
  });
}

function showCustomRequest(requestId) {
  const request = customRequests.find(item => item.id === requestId);
  if (!request) return;
  let modal = document.getElementById('customRequestDialog');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'customRequestDialog';
    modal.className = 'custom-request-modal';
    modal.innerHTML = `<button type="button" class="custom-request-backdrop" data-close-request aria-label="Close request details"></button>
      <section class="custom-request-panel" role="dialog" aria-modal="true" aria-labelledby="customRequestTitle">
        <div class="custom-request-dialog-heading">
          <div><span class="admin-muted">Customisation request</span><h2 id="customRequestTitle"></h2></div>
          <button type="button" class="custom-request-close" data-close-request aria-label="Close">×</button>
        </div>
        <div id="customRequestDetails"></div>
        <form id="customRequestReplyForm" class="custom-request-reply-form">
          <label>Status
            <select name="status">${['Submitted', 'Under Review', 'Need More Details', 'Offer Sent', 'Accepted', 'Rejected', 'Order Confirmed'].map(status =>
              `<option>${status}</option>`
            ).join('')}</select>
          </label>
          <label>Reply or information request
            <textarea name="adminReply" rows="4" maxlength="3000" placeholder="Write a reply for the customer"></textarea>
          </label>
          <div class="custom-request-quote-fields">
            <label>Quoted price (₹)
              <input name="quotedPrice" type="number" min="1" max="10000000" step="1" placeholder="Enter a price to send an offer">
            </label>
            <label>Estimated completion
              <input name="estimatedCompletion" maxlength="100" placeholder="e.g. 2–3 weeks">
            </label>
          </div>
          <p class="custom-request-save-error" role="alert"></p>
          <div class="custom-request-dialog-actions">
            <button type="button" class="outline-btn" data-close-request>Close</button>
            <button type="submit" class="pill-btn">Save &amp; send update</button>
          </div>
        </form>
      </section>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close-request]').forEach(button => {
      button.onclick = () => { modal.hidden = true; };
    });
    modal.onclick = event => {
      if (event.target === modal) modal.hidden = true;
    };
    modal.querySelector('#customRequestReplyForm').onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('[type=submit]');
      const error = form.querySelector('.custom-request-save-error');
      const data = new FormData(form);
      submit.disabled = true;
      error.textContent = '';
      try {
        await api(`/owner/custom-requests/${encodeURIComponent(modal.dataset.requestId)}`, 'PATCH', {
          status: data.get('status'),
          adminReply: data.get('adminReply'),
          quotedPrice: data.get('quotedPrice'),
          estimatedCompletion: data.get('estimatedCompletion'),
        });
        modal.hidden = true;
        toast('Custom request update sent');
        await refreshAdmin(false);
      } catch (requestError) {
        error.textContent = requestError.message;
      } finally {
        submit.disabled = false;
      }
    };
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') modal.hidden = true;
    });
  }

  modal.dataset.requestId = request.id;
  modal.querySelector('#customRequestTitle').textContent = `Request ${shortId(request.id)}`;
  modal.querySelector('#customRequestDetails').innerHTML = `
    <dl class="custom-request-detail-grid">
      <div><dt>Request ID</dt><dd>${esc(request.id)}</dd></div>
      <div><dt>Customer</dt><dd>${esc(request.customerName || 'Customer')}</dd></div>
      <div><dt>Email</dt><dd>${esc(request.customerEmail || 'Not provided')}</dd></div>
      <div><dt>Phone</dt><dd>${esc(request.customerPhone || 'Not provided')}</dd></div>
      <div><dt>Product type</dt><dd>${esc(request.productType || 'Not specified')}</dd></div>
      <div><dt>Colour preference</dt><dd>${esc(request.color || 'Not specified')}</dd></div>
      <div><dt>Size</dt><dd>${esc(request.size || 'Not specified')}</dd></div>
      <div><dt>Budget</dt><dd>${esc(request.budget || 'Not specified')}</dd></div>
      <div><dt>Occasion</dt><dd>${esc(request.occasion || 'Not specified')}</dd></div>
      <div><dt>Submitted</dt><dd>${esc(new Date(request.createdAt).toLocaleString('en-IN'))}</dd></div>
      <div class="custom-request-description"><dt>Description</dt><dd>${esc(request.description || '')}</dd></div>
      <div class="custom-request-attachment-field"><dt>Reference images or videos</dt><dd>${
        request.attachments.length ? `<div class="custom-request-files">${request.attachments.map(file =>
          `<button type="button" class="compact-btn" data-request-file="${esc(request.id)}" data-file-id="${esc(file.id)}">${esc(file.name)} · ${file.mimeType.startsWith('video/') ? 'Video' : 'Photo'}</button>`
        ).join('')}</div>` : 'No attachments'
      }</dd></div>
    </dl>`;
  const form = modal.querySelector('#customRequestReplyForm');
  form.elements.status.value = request.status || 'Submitted';
  form.elements.adminReply.value = request.adminReply || '';
  form.elements.quotedPrice.value = request.quotedPrice == null ? '' : request.quotedPrice;
  form.elements.estimatedCompletion.value = request.estimatedCompletion || '';
  modal.querySelectorAll('[data-request-file]').forEach(button => {
    button.onclick = () => openCustomRequestFile(button.dataset.requestFile, button.dataset.fileId);
  });
  modal.hidden = false;
  form.elements.adminReply.focus();
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
        <td data-label="Product">${esc(productName(order.productId))}
          ${order.color ? `<small class="order-option">${esc(order.color)}</small>` : ''}
          ${order.giftWrap ? `<small class="order-option">Gift wrap${order.giftMessage ? ` · ${esc(order.giftMessage)}` : ''}</small>` : ''}
        </td>
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
