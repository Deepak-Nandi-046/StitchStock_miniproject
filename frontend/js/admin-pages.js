const adminUser = typeof u !== 'undefined' ? u : guard('owner');
const viewName = new URLSearchParams(location.search).get('view') || 'overview';
let ownerSummary = null;
let customRequests = [];
let orderSearch = '';
let orderStatus = 'All';
let customRequestSearch = '';
let customRequestStatus = 'All';
let customerMessages = [];
let returnRequests = [];
let adminReviews = [];
let adminNotifications = [];

if (adminUser) initAdminPage();

function initAdminPage() {
  const views = {
    overview: ['Overview', 'Your handmade business at a glance'],
    'custom-requests': ['Customisation Requests', 'Review and respond to handmade requests'],
    orders: ['Orders', 'Manage every customer order'],
    preorders: ['Pre-orders', 'Track availability and waiting orders'],
    chats: ['Customer Chats', 'Conversations with Stitch & Stole customers'],
    payments: ['Payment Verification', 'Review customer payment submissions'],
    reviews: ['Reviews', 'Ratings and customer feedback'],
    returns: ['Returns & Cancellations', 'Review customer order requests'],
    notifications: ['Notifications', 'Items that need admin attention'],
  };
  if (!views[viewName]) {
    location.replace('owner.html?view=overview');
    return;
  }
  document.title = `StitchStock · ${views[viewName][0]}`;
  document.getElementById('adminApp').innerHTML = adminPageFrame(
    views[viewName][0],
    views[viewName][1],
    '<div class="admin-empty">Loading... 🧶</div>'
  );
  document.getElementById('refreshAdmin')?.addEventListener('click', () => refreshAdmin(true));
  refreshAdmin(false);
  setInterval(() => {
    if (!document.hidden) refreshAdmin(false);
  }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshAdmin(false);
  });
}

function adminPageFrame(title, subtitle, content) {
  return `<section class="admin-banner">
    <div>
      <h1>${esc(title)} <em>Made with Love</em></h1>
      <p>${esc(subtitle)}</p>
      <p>${esc(new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()))}</p>
    </div>
  </section>${content}`;
}

async function refreshAdmin(manual) {
  try {
    switch (viewName) {
      case 'overview': {
        const [summary, requests, messages, returns, notifications] = await Promise.all([
          api('/owner/summary'),
          api('/owner/custom-requests'),
          api('/owner/messages'),
          api('/owner/returns'),
          api('/owner/notifications'),
        ]);
        ownerSummary = summary;
        customRequests = requests;
        customerMessages = messages;
        returnRequests = returns;
        adminNotifications = notifications;
        renderOverview();
        break;
      }
      case 'orders':
      case 'preorders':
        ownerSummary = await api('/owner/summary');
        viewName === 'orders' ? renderOrdersPage() : renderPreordersPage();
        break;
      case 'custom-requests':
        customRequests = await api('/owner/custom-requests');
        renderCustomRequestsPage();
        break;
      case 'chats':
        customerMessages = await api('/owner/messages');
        renderChatsPage();
        break;
      case 'payments':
        ownerSummary = await api('/owner/summary');
        renderPaymentsPage();
        break;
      case 'reviews':
        adminReviews = await api('/owner/reviews');
        renderReviewsPage();
        break;
      case 'returns':
        returnRequests = await api('/owner/returns');
        renderReturnsPage();
        break;
      case 'notifications':
        adminNotifications = await api('/owner/notifications');
        renderNotificationsPage();
        break;
    }
    if (manual) toast('Dashboard refreshed');
  } catch (error) {
    const host = document.getElementById('adminContent');
    if (host) host.innerHTML = `<div class="admin-empty">${esc(error.message)}</div>`;
    else if (document.querySelector('#adminApp .admin-banner'))
      installAdminContent(`<div class="admin-empty">${esc(error.message)}</div>`);
    toast(error.message);
  }
}

function renderOverview() {
  const orders = ownerSummary.orders || [];
  const regularOrders = orders.filter(order => !order.isPreorder || order.preorderStatus === 'Available');
  const pendingOrders = regularOrders.filter(order => !['Delivered', 'Cancelled'].includes(order.status));
  const pendingRequests = customRequests.filter(request =>
    ['Submitted', 'Under Review', 'Need More Details'].includes(request.status)
  );
  const preorders = orders.filter(order => order.isPreorder && ['Pending', 'Confirmed'].includes(order.preorderStatus));
  const awaitingPayments = orders.filter(order => ['Payment Submitted', 'Awaiting Verification'].includes(order.paymentStatus));
  const recentOrders = regularOrders.slice(0, 5);
  const actions = [
    { count: regularOrders.filter(order => order.status === 'Placed').length, label: 'New orders to confirm', href: 'owner.html?view=orders' },
    { count: pendingRequests.length, label: 'Customisation requests to review', href: 'owner.html?view=custom-requests' },
    { count: preorders.length, label: 'Pre-orders waiting for stock', href: 'owner.html?view=preorders' },
    { count: awaitingPayments.length, label: 'Payments awaiting verification', href: 'owner.html?view=payments' },
    { count: customerMessages.reduce((count, thread) => count + (thread.messages || []).filter(message => message.sender === 'customer' && !message.readByAdmin).length, 0), label: 'Unread customer chats', href: 'owner.html?view=chats' },
    { count: returnRequests.filter(request => ['Pending', 'Under Review'].includes(request.status)).length, label: 'Returns or cancellations to review', href: 'owner.html?view=returns' },
  ].filter(action => action.count);
  const metrics = [
    ['Total Products', ownerSummary.products.length],
    ['Total Orders', orders.length],
    ['Pending Orders', pendingOrders.length],
    ['Pending Customisation Requests', pendingRequests.length],
    ['Pending Pre-orders', preorders.length],
  ];
  installAdminContent(`<section class="admin-overview-stats">${metrics.map(([label, value]) =>
    `<article class="card stat-card"><div><strong>${esc(value)}</strong><span>${esc(label)}</span></div></article>`
  ).join('')}</section>
  <div class="admin-overview-grid">
    <section class="admin-panel">
      <div class="admin-panel-heading"><h2>Recent Orders</h2><a href="owner.html?view=orders">View all →</a></div>
      ${recentOrders.length ? `<div class="admin-recent-list">${recentOrders.map(order => `<article>
        <div><strong>Order ${esc(order.id)}</strong><span>${esc(order.customerName || order.customerEmail || order.customerId)}</span></div>
        <div>${chip(order.status)}<time>${esc(order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN') : '—')}</time></div>
      </article>`).join('')}</div>` : '<div class="admin-empty">No orders yet 🧶</div>'}
    </section>
    <section class="admin-panel admin-pending-panel">
      <div class="admin-panel-heading"><h2>Pending Actions</h2><a href="owner.html?view=notifications">All notifications →</a></div>
      ${actions.length ? `<ul class="admin-pending-list">${actions.map(action =>
        `<li><a href="${esc(action.href)}"><span class="admin-pending-count">${esc(action.count)}</span>${esc(action.label)}<span aria-hidden="true">→</span></a></li>`
      ).join('')}</ul>` : '<div class="admin-empty">You are all caught up ✿</div>'}
    </section>
  </div>`);
}

function installAdminContent(content) {
  const host = document.getElementById('adminApp');
  const frame = host.querySelector('.admin-banner');
  host.innerHTML = '';
  host.append(frame);
  const section = document.createElement('div');
  section.id = 'adminContent';
  section.innerHTML = content;
  host.append(section);
}

function renderOrdersPage() {
  installAdminContent(`<div class="toolbar admin-toolbar">
    <label>Search orders<input id="orderSearch" type="search" value="${esc(orderSearch)}" placeholder="Order, product, customer or email"></label>
    <label>Status<select id="orderStatus">${['All', 'Placed', 'Confirmed', 'Preparing', 'Shipped', 'Delivered', 'Cancelled'].map(status =>
      `<option${status === orderStatus ? ' selected' : ''}>${esc(status)}</option>`
    ).join('')}</select></label>
  </div><div class="admin-table-wrap" id="ordersTable"></div>`);
  document.getElementById('orderSearch').oninput = event => {
    orderSearch = event.target.value.trim().toLowerCase();
    renderOrders();
  };
  document.getElementById('orderStatus').onchange = event => {
    orderStatus = event.target.value;
    renderOrders();
  };
  renderOrders();
}

function renderCustomRequestsPage() {
  installAdminContent(`<div class="toolbar admin-toolbar">
    <label>Search requests<input id="customRequestSearch" type="search" value="${esc(customRequestSearch)}" placeholder="Request ID, customer, email, or product"></label>
    <label>Status<select id="customRequestStatus">${['All', 'Submitted', 'Under Review', 'Need More Details', 'Offer Sent', 'Accepted', 'Rejected', 'Order Confirmed'].map(status =>
      `<option${status === customRequestStatus ? ' selected' : ''}>${esc(status)}</option>`
    ).join('')}</select></label>
  </div><div class="custom-request-list" id="customRequestList"><div class="admin-empty">Loading requests... 🧶</div></div>`);
  document.getElementById('customRequestSearch').oninput = event => {
    customRequestSearch = event.target.value.trim().toLowerCase();
    renderCustomRequests();
  };
  document.getElementById('customRequestStatus').onchange = event => {
    customRequestStatus = event.target.value;
    renderCustomRequests();
  };
  renderCustomRequests();
}

function renderPreordersPage() {
  const orders = ownerSummary.orders.filter(order => order.isPreorder);
  installAdminContent(`<section class="admin-panel">
    <div class="admin-panel-heading"><h2>Customer Pre-orders</h2><a href="inventory.html">Manage all products →</a></div>
    ${orders.length ? `<div class="admin-table-wrap"><table class="admin-orders-table admin-preorder-table">
      <thead><tr><th>Pre-order</th><th>Customer</th><th>Product / Qty</th><th>Placed</th><th>Payment</th><th>Expected</th><th>Availability</th><th>Status &amp; Actions</th></tr></thead>
      <tbody>${orders.map(order => {
        const product = ownerSummary.products.find(item => String(item.id) === String(order.productId));
        const stock = Number(product && product.stock) || 0;
        const status = order.preorderStatus || 'Pending';
        return `<tr data-preorder-row="${esc(order.id)}">
          <td data-label="Pre-order">PO-${esc(order.preorderId || order.id)}<small class="order-option">Order #${esc(order.id)}</small></td>
          <td data-label="Customer">${esc(order.customerName || order.customerEmail || order.customerId)}<small class="order-option">${esc(order.customerEmail || 'Email not recorded')}</small><small class="order-option">${esc(order.deliveryDetails && order.deliveryDetails.phone || 'Contact not recorded')}</small></td>
          <td data-label="Product / Qty">${esc(order.productName || productName(order.productId))}<small class="order-option">Qty ${esc(order.qty)} · ${esc(stock)} in stock</small></td>
          <td data-label="Placed">${esc(new Date(order.createdAt).toLocaleString('en-IN'))}</td>
          <td data-label="Payment">${esc(order.paymentStatus || 'Not recorded')}</td>
          <td data-label="Expected"><div class="preorder-availability-control"><input type="date" value="${esc(order.expectedAvailability || '')}" data-preorder-date="${esc(order.id)}" aria-label="Expected availability for pre-order ${esc(order.id)}"><button type="button" class="compact-btn" data-save-availability="${esc(order.id)}">Save date</button></div></td>
          <td data-label="Availability">
            <div class="preorder-stock-control"><span>${stock} in stock · need ${esc(order.qty)}</span><input type="number" min="1" value="${Math.max(1, Number(order.qty) - stock)}" data-preorder-restock-input="${esc(order.id)}" aria-label="Add stock for pre-order ${esc(order.id)}"><button type="button" class="compact-btn" data-preorder-restock="${esc(order.id)}" data-product-id="${esc(order.productId)}">Add stock</button></div>
          </td>
          <td data-label="Status & Actions">${chip(status)}<div class="order-actions">
            ${status === 'Pending' ? `<button type="button" class="compact-btn primary" data-preorder-status="Confirmed" data-preorder-id="${esc(order.id)}">Confirm</button><button type="button" class="compact-btn" data-preorder-status="Rejected" data-preorder-id="${esc(order.id)}">Reject</button>` : ''}
            ${status === 'Confirmed' ? `<button type="button" class="compact-btn primary" data-preorder-ready="${esc(order.id)}" ${stock < order.qty ? 'disabled title="Restock the product first"' : ''}>Mark available &amp; ready</button><button type="button" class="compact-btn" data-preorder-status="Rejected" data-preorder-id="${esc(order.id)}">Reject</button>` : ''}
          </div></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>` : '<div class="admin-empty">No customer pre-orders have been placed yet.</div>'}
  </section>`);
  document.querySelectorAll('[data-preorder-status]').forEach(button => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        await api(`/owner/preorders/${encodeURIComponent(button.dataset.preorderId)}`, 'PATCH', { status: button.dataset.preorderStatus });
        toast(`Pre-order ${button.dataset.preorderStatus.toLowerCase()}`);
        await refreshAdmin(false);
      } catch (error) {
        toast(error.message);
        button.disabled = false;
      }
    };
  });
  document.querySelectorAll('[data-save-availability]').forEach(button => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        const input = button.closest('tr').querySelector('[data-preorder-date]');
        await api(`/owner/preorders/${encodeURIComponent(button.dataset.saveAvailability)}`, 'PATCH', { expectedAvailability: input.value });
        toast('Expected availability updated');
        await refreshAdmin(false);
      } catch (error) {
        toast(error.message);
        button.disabled = false;
      }
    };
  });
  document.querySelectorAll('[data-preorder-restock]').forEach(button => {
    button.onclick = async () => {
      const input = button.closest('tr').querySelector('[data-preorder-restock-input]');
      const add = Number(input.value);
      if (!Number.isInteger(add) || add < 1) return toast('Enter a valid stock amount');
      button.disabled = true;
      try {
        await api(`/owner/products/${encodeURIComponent(button.dataset.productId)}/restock`, 'POST', { add });
        toast('Product stock updated');
        await refreshAdmin(false);
      } catch (error) {
        toast(error.message);
        button.disabled = false;
      }
    };
  });
  document.querySelectorAll('[data-preorder-ready]').forEach(button => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        await api(`/owner/preorders/${encodeURIComponent(button.dataset.preorderReady)}/ready`, 'POST');
        toast('Customer notified: their product is available and being prepared');
        await refreshAdmin(false);
      } catch (error) {
        toast(error.message);
        button.disabled = false;
      }
    };
  });
}

function renderChatsPage() {
  const selectedId = new URLSearchParams(location.search).get('chat');
  const selected = customerMessages.find(thread => thread.id === selectedId) || customerMessages[0];
  installAdminContent(`<div class="admin-chat-layout">
    <section class="admin-panel admin-chat-list">
      <label>Search customers or messages<input id="chatSearch" type="search" placeholder="Name, email, or conversation"></label>
      <div id="chatConversationList"></div>
    </section>
    <section class="admin-panel admin-chat-thread" id="adminChatThread"></section>
  </div>`);
  const list = document.getElementById('chatConversationList');
  const drawList = query => {
    const filtered = customerMessages.filter(thread =>
      `${thread.customerName} ${thread.customerEmail} ${thread.customerPhone || ''} ${(thread.messages || []).map(message => message.text).join(' ')}`
        .toLowerCase().includes(query)
    );
    list.innerHTML = filtered.length ? filtered.map(thread => {
      const last = thread.messages[thread.messages.length - 1] || {};
      const unread = thread.messages.filter(message => message.sender === 'customer' && !message.readByAdmin).length;
      return `<a class="admin-chat-conversation${thread.id === selected?.id ? ' active' : ''}" href="owner.html?view=chats&amp;chat=${encodeURIComponent(thread.id)}">
        <strong>${esc(thread.customerName || 'Customer')}${unread ? `<span class="chat-unread-count">${unread}</span>` : ''}</strong>
        <small>${esc(thread.customerEmail || 'Email not recorded')}</small>
        <span>${esc(last.text || '')}</span>
        <time>${esc(last.at ? new Date(last.at).toLocaleString('en-IN') : '')}</time>
      </a>`;
    }).join('') : '<p class="admin-muted">No matching conversations.</p>';
  };
  drawList('');
  document.getElementById('chatSearch').oninput = event => drawList(event.target.value.trim().toLowerCase());
  const threadHost = document.getElementById('adminChatThread');
  if (!selected) {
    threadHost.innerHTML = '<div class="admin-empty">Customer conversations will appear here.</div>';
    return;
  }
  threadHost.innerHTML = `<header class="admin-chat-heading">${selected.customerAvatar ? `<img class="admin-chat-avatar" src="${esc(selected.customerAvatar)}" alt="">` : ''}
    <div><h2>${esc(selected.customerName || 'Customer')}</h2><span>${esc(selected.customerEmail || '')}${selected.customerPhone ? ` · ${esc(selected.customerPhone)}` : ''}</span></div>${chip(selected.status || 'Open')}</header>
    <div class="chat-transcript">${selected.messages.map(message => `<article class="chat-bubble ${message.sender === 'admin' ? 'sent' : 'received'}">
      <p>${esc(message.text)}</p><time>${esc(new Date(message.at).toLocaleString('en-IN'))}${message.subject ? ` · ${esc(message.subject)}` : ''}</time>
      ${message.sender === 'admin' ? `<small>${message.readByCustomer ? 'Read' : 'Sent'}</small>` : ''}
    </article>`).join('')}</div>
    <form class="admin-message-reply" id="adminChatReply">
      <label>Reply<textarea name="reply" rows="3" maxlength="3000" required placeholder="Write a reply"></textarea></label>
      <button type="submit" class="pill-btn">Send Reply</button>
    </form>`;
  api(`/owner/messages/${encodeURIComponent(selected.id)}`, 'PATCH', { markRead: true }).catch(error => toast(error.message));
  document.getElementById('adminChatReply').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type=submit]');
    const reply = form.elements.reply.value.trim();
    if (!reply) return;
    button.disabled = true;
    try {
      await api(`/owner/messages/${encodeURIComponent(selected.id)}`, 'PATCH', { reply });
      await refreshAdmin(false);
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
  };
}

function renderPaymentsPage() {
  const pending = ownerSummary.orders.filter(order => ['Payment Submitted', 'Awaiting Verification'].includes(order.paymentStatus));
  installAdminContent(pending.length ? `<div class="admin-payment-list">${pending.map(order => {
    const proof = order.paymentSubmission || {};
    const delivery = order.deliveryDetails || {};
    return `<article class="admin-panel">
      <div class="admin-panel-heading"><div><h2>Order #${esc(order.id)}</h2><span>${esc(order.customerName || 'Customer')} · ${esc(order.customerEmail || '')}</span></div>${chip(order.paymentStatus)}</div>
      <p><strong>Amount:</strong> ₹${esc(Number(proof.amountPaid || order.totalAmount || 0).toLocaleString('en-IN'))} · <strong>Method:</strong> ${esc(proof.method || 'UPI')}</p>
      <p><strong>Reference:</strong> ${esc(proof.reference || 'Not provided')} · <strong>Submitted:</strong> ${esc(proof.submittedAt ? new Date(proof.submittedAt).toLocaleString('en-IN') : '—')}</p>
      ${proof.proof ? `<a class="compact-btn" href="${esc(proof.proof)}" target="_blank" rel="noopener">View payment proof</a>` : '<p class="admin-muted">No screenshot attached.</p>'}
      <p><strong>Delivery:</strong> ${esc([delivery.name, delivery.phone, delivery.address, delivery.pincode].filter(Boolean).join(' · ') || 'Not recorded')}</p>
      <div class="order-actions"><button type="button" class="compact-btn primary" data-verify-payment="${esc(order.id)}">Verify payment</button>
        <button type="button" class="compact-btn" data-reject-payment="${esc(order.id)}">Reject payment</button></div>
    </article>`;
  }).join('')}</div>` : '<div class="admin-empty">No payments are awaiting verification.</div>');
  document.querySelectorAll('[data-verify-payment]').forEach(button => button.onclick = () => updatePaymentVerification(button, 'approve'));
  document.querySelectorAll('[data-reject-payment]').forEach(button => button.onclick = () => updatePaymentVerification(button, 'reject'));
}

async function updatePaymentVerification(button, action) {
  const reason = action === 'reject' ? prompt('Reason for rejecting this payment:') : '';
  if (action === 'reject' && (!reason || !reason.trim())) return;
  button.disabled = true;
  try {
    await api(`/owner/orders/${encodeURIComponent(button.dataset[action === 'approve' ? 'verifyPayment' : 'rejectPayment'])}/payment-verification`, 'POST', {
      action,
      reason: reason ? reason.trim() : '',
    });
    toast(action === 'approve' ? 'Payment verified' : 'Payment rejected');
    await refreshAdmin(false);
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}

function renderReviewsPage() {
  installAdminContent(adminReviews.length ? `<div class="admin-review-list">${adminReviews.map(review => `<article class="admin-panel">
    <div class="admin-panel-heading"><div><h2>${esc(review.productName)}</h2><span>${esc(review.customerName || 'Customer')} · ${esc(new Date(review.createdAt).toLocaleString('en-IN'))}</span></div>
      <strong class="review-rating" aria-label="${esc(review.rating)} out of 5 stars">${'★'.repeat(Number(review.rating) || 0)}${'☆'.repeat(5 - (Number(review.rating) || 0))}</strong>
    </div>
    <p>${esc(review.text || 'No written comment.')}</p>
    ${review.photo ? `<img class="admin-review-photo" src="${esc(review.photo)}" alt="Customer review attachment">` : ''}
  </article>`).join('')}` : '<div class="admin-empty">No customer reviews yet.</div>');
}

function renderReturnsPage() {
  installAdminContent(returnRequests.length ? `<div class="admin-return-list">${returnRequests.map(request => `<article class="admin-panel">
    <div class="admin-panel-heading"><div><h2>${esc(request.type)} · Order ${esc(request.orderId)}</h2><span>${esc(request.customerName)} · ${esc(request.customerEmail || 'Email not recorded')}</span></div>${chip(request.status)}</div>
    <p><strong>${esc(request.productName)}</strong> · Qty ${esc(request.quantity)} · Order status at request: ${esc(request.orderStatus)}</p>
    <p class="admin-message-copy">${esc(request.message)}</p>
    <time class="admin-muted">${esc(new Date(request.createdAt).toLocaleString('en-IN'))}</time>
    ${['Pending', 'Under Review'].includes(request.status) ? `<div class="order-actions">
      <button class="compact-btn" data-return-status="Under Review" data-return-id="${esc(request.id)}">Under Review</button>
      <button class="compact-btn primary" data-return-status="Approved" data-return-id="${esc(request.id)}">${request.type === 'Cancellation' ? 'Approve cancellation' : 'Approve return'}</button>
      <button class="compact-btn" data-return-status="Rejected" data-return-id="${esc(request.id)}">Reject</button>
    </div>` : request.status === 'Approved' ? `<button class="compact-btn" data-return-status="Completed" data-return-id="${esc(request.id)}">Mark completed</button>` : ''}
  </article>`).join('')}` : '<div class="admin-empty">No return or cancellation requests yet.</div>');
  document.querySelectorAll('[data-return-status]').forEach(button => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        await api(`/owner/returns/${encodeURIComponent(button.dataset.returnId)}`, 'PATCH', { status: button.dataset.returnStatus });
        toast(`Request moved to ${button.dataset.returnStatus}`);
        await refreshAdmin(false);
      } catch (error) {
        toast(error.message);
        button.disabled = false;
      }
    };
  });
}

function renderNotificationsPage() {
  installAdminContent(adminNotifications.length ? `<div class="admin-notification-list">${adminNotifications.map(notification => `<a class="admin-notification-card" href="${esc(notification.href)}">
    <span class="admin-notification-icon" aria-hidden="true">✿</span>
    <span><strong>${esc(notification.title)}</strong><small>${esc(notification.type)} · ${esc(notification.detail)}</small></span>
    <time>${esc(new Date(notification.at).toLocaleString('en-IN'))}</time>
  </a>`).join('')}</div>` : '<div class="admin-empty">No pending notifications. You are all caught up ✿</div>');
}

function renderCustomRequests() {
  const host = document.getElementById('customRequestList');
  let visible = customRequests;
  if (customRequestStatus !== 'All') visible = visible.filter(request => request.status === customRequestStatus);
  if (customRequestSearch) visible = visible.filter(request =>
    `${request.id} ${request.customerName} ${request.customerEmail} ${request.customerPhone} ${request.productType} ${request.color} ${request.description}`.toLowerCase().includes(customRequestSearch)
  );
  if (!visible.length) {
    host.innerHTML = '<div class="admin-empty">No matching customisation requests.</div>';
    return;
  }
  host.innerHTML = visible.map(request => `<article class="custom-request-card">
    <div class="custom-request-meta">
      <strong>${esc(request.customerName || 'Customer')} <span class="custom-request-status">${esc(request.status || 'Submitted')}</span></strong>
      <time>${esc(new Date(request.createdAt).toLocaleString('en-IN'))}</time>
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
          <label>Status<select name="status">${['Submitted', 'Under Review', 'Need More Details', 'Offer Sent', 'Accepted', 'Rejected', 'Order Confirmed'].map(status => `<option>${status}</option>`).join('')}</select></label>
          <label>Reply or information request<textarea name="adminReply" rows="4" maxlength="3000" placeholder="Write a reply for the customer"></textarea></label>
          <div class="custom-request-quote-fields">
            <label>Quoted price (₹)<input name="quotedPrice" type="number" min="1" max="10000000" step="1" placeholder="Enter a price to send an offer"></label>
            <label>Estimated completion<input name="estimatedCompletion" maxlength="100" placeholder="e.g. 2–3 weeks"></label>
          </div>
          <p class="custom-request-save-error" role="alert"></p>
          <div class="custom-request-dialog-actions"><button type="button" class="outline-btn" data-close-request>Close</button><button type="submit" class="pill-btn">Save &amp; send update</button></div>
        </form>
      </section>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close-request]').forEach(button => button.onclick = () => { modal.hidden = true; });
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
  modal.querySelector('#customRequestDetails').innerHTML = `<dl class="custom-request-detail-grid">
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
    <div class="custom-request-attachment-field"><dt>Reference images or videos</dt><dd>${request.attachments.length
      ? `<div class="custom-request-files">${request.attachments.map(file => `<button type="button" class="compact-btn" data-request-file="${esc(request.id)}" data-file-id="${esc(file.id)}">${esc(file.name)} · ${file.mimeType.startsWith('video/') ? 'Video' : 'Photo'}</button>`).join('')}</div>`
      : 'No attachments'}</dd></div>
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

function renderOrders() {
  let orders = ownerSummary.orders.filter(order => !order.isPreorder || order.preorderStatus === 'Available');
  if (orderStatus !== 'All') orders = orders.filter(order => order.status === orderStatus);
  if (orderSearch) orders = orders.filter(order =>
    `${order.id} ${productName(order.productId)} ${order.customerName} ${order.customerEmail} ${order.customerId}`.toLowerCase().includes(orderSearch)
  );
  const host = document.getElementById('ordersTable');
  if (!orders.length) {
    host.innerHTML = '<div class="admin-empty">No matching orders found 🧶</div>';
    return;
  }
  host.innerHTML = `<table class="admin-orders-table">
    <thead><tr><th>Order</th><th>Customer / Contact</th><th>Product / Qty</th><th>Total</th><th>Payment</th><th>Status</th><th>Placed</th><th>Details</th></tr></thead>
    <tbody>${orders.map(order => {
      return `<tr>
        <td data-label="Order">#${esc(order.id)}</td>
        <td data-label="Customer / Contact">${esc(order.customerName || order.customerEmail || order.customerId)}<small class="order-option">${esc(order.customerEmail || 'Email not recorded')}</small><small class="order-option">${esc(order.deliveryDetails && order.deliveryDetails.phone || 'Contact not recorded')}</small></td>
        <td data-label="Product / Qty">${esc(order.productName || productName(order.productId))}<small class="order-option">Qty ${esc(order.qty)}${order.color ? ` · ${esc(order.color)}` : ''}${order.giftWrap ? ' · Gift wrapped' : ''}</small></td>
        <td data-label="Total">₹${esc(Number(order.totalAmount || 0).toLocaleString('en-IN'))}</td>
        <td data-label="Payment">${esc(order.paymentStatus || 'Not recorded')}</td>
        <td data-label="Status">${chip(order.status)}</td>
        <td data-label="Placed">${esc(order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN') : '—')}</td>
        <td data-label="Details"><button type="button" class="compact-btn primary" data-view-order="${esc(order.id)}">View details</button></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
  host.querySelectorAll('[data-view-order]').forEach(button => button.onclick = () => showOrderDetails(button.dataset.viewOrder));
}

function showOrderDetails(orderId) {
  const order = ownerSummary.orders.find(item => String(item.id) === String(orderId));
  if (!order) return;
  let modal = document.getElementById('orderDetailsDialog');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'orderDetailsDialog';
    modal.className = 'custom-request-modal';
    modal.innerHTML = `<button type="button" class="custom-request-backdrop" data-close-order aria-label="Close order details"></button>
      <section class="custom-request-panel order-details-panel" role="dialog" aria-modal="true" aria-labelledby="orderDetailsTitle">
        <div class="custom-request-dialog-heading"><div><span class="admin-muted">Order management</span><h2 id="orderDetailsTitle"></h2></div>
          <button type="button" class="custom-request-close" data-close-order aria-label="Close">×</button></div>
        <div id="orderDetailsSummary"></div>
        <form id="orderDetailsForm" class="custom-request-reply-form">
          <label>Order status<select name="status"></select></label>
          <div class="custom-request-quote-fields">
            <label>Shipping carrier<input name="carrier" maxlength="80" placeholder="Carrier name"></label>
            <label>Tracking number<input name="trackingNumber" maxlength="120" placeholder="Tracking number"></label>
          </div>
          <p class="custom-request-save-error" role="alert"></p>
          <div class="custom-request-dialog-actions"><button type="button" class="outline-btn" data-close-order>Close</button><button type="submit" class="pill-btn">Save order update</button></div>
        </form>
      </section>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close-order]').forEach(button => button.onclick = () => { modal.hidden = true; });
    modal.querySelector('#orderDetailsForm').onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('[type=submit]');
      const data = new FormData(form);
      submit.disabled = true;
      form.querySelector('.custom-request-save-error').textContent = '';
      try {
        await api(`/owner/orders/${encodeURIComponent(modal.dataset.orderId)}`, 'PATCH', {
          status: data.get('status'),
          carrier: data.get('carrier'),
          trackingNumber: data.get('trackingNumber'),
        });
        modal.hidden = true;
        toast('Order update sent to the customer');
        await refreshAdmin(false);
      } catch (error) {
        form.querySelector('.custom-request-save-error').textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    };
  }
  modal.dataset.orderId = order.id;
  modal.querySelector('#orderDetailsTitle').textContent = `Order #${order.id}`;
  const delivery = order.deliveryDetails || {};
  modal.querySelector('#orderDetailsSummary').innerHTML = `<dl class="custom-request-detail-grid">
    <div><dt>Customer</dt><dd>${esc(order.customerName || 'Customer')}</dd></div>
    <div><dt>Email</dt><dd>${esc(order.customerEmail || 'Not recorded')}</dd></div>
    <div><dt>Contact</dt><dd>${esc(delivery.phone || 'Not recorded')}</dd></div>
    <div><dt>Product</dt><dd>${esc(order.productName || productName(order.productId))}</dd></div>
    <div><dt>Quantity</dt><dd>${esc(order.qty)}</dd></div>
    <div><dt>Total</dt><dd>₹${esc(Number(order.totalAmount || 0).toLocaleString('en-IN'))}</dd></div>
    <div><dt>Payment status</dt><dd>${esc(order.paymentStatus || 'Not recorded')}</dd></div>
    ${order.paymentSubmission ? `<div><dt>Payment method</dt><dd>${esc(order.paymentSubmission.method || 'UPI')}</dd></div>
      <div><dt>Amount submitted</dt><dd>₹${esc(Number(order.paymentSubmission.amountPaid || 0).toLocaleString('en-IN'))}</dd></div>
      <div><dt>Transaction reference</dt><dd>${esc(order.paymentSubmission.reference || 'Not provided')}</dd></div>` : ''}
    ${order.paymentRejectionReason ? `<div class="custom-request-description"><dt>Payment rejection reason</dt><dd>${esc(order.paymentRejectionReason)}</dd></div>` : ''}
    <div><dt>Order date</dt><dd>${esc(new Date(order.createdAt).toLocaleString('en-IN'))}</dd></div>
    <div class="custom-request-description"><dt>Delivery address</dt><dd>${esc([delivery.name, delivery.address, delivery.pincode].filter(Boolean).join(', ') || 'Not recorded')}</dd></div>
    <div><dt>Shipping</dt><dd>${esc([order.carrier, order.trackingNumber].filter(Boolean).join(' · ') || 'Not shipped yet')}</dd></div>
  </dl>`;
  const form = modal.querySelector('#orderDetailsForm');
  const statusOptions = [...new Set([order.status, ...(ownerSummary.nextMoves[order.status] || [])])];
  form.elements.status.innerHTML = statusOptions.map(status =>
    `<option value="${esc(status)}">${esc(status)}</option>`
  ).join('');
  form.elements.status.value = order.status;
  form.elements.carrier.value = order.carrier || '';
  form.elements.trackingNumber.value = order.trackingNumber || '';
  modal.hidden = false;
}

function productName(productId) {
  const product = ownerSummary?.products.find(item => String(item.id) === String(productId));
  return product ? product.name : 'Unknown item';
}

function shortId(value) {
  const text = String(value == null ? '' : value);
  return text.length > 8 ? text.slice(0, 8) : text;
}
