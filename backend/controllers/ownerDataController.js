const productStore = require('../db/productStore');
const orderStore = require('../db/orderStore');
const users = require('../auth/users');
const customerStore = require('../db/customerStore');
const customRequestStore = require('../db/customRequestStore');
const messageStore = require('../db/customerMessageStore');
const returnStore = require('../db/returnRequestStore');
const reviewStore = require('../db/reviewStore');
const { listAudit } = require('../engines/e3-audit');

async function customerData() {
  const [customRequests, messages, returns, reviews, registeredCustomers, allOrders] = await Promise.all([
    customRequestStore.listAll(),
    messageStore.listAll(),
    returnStore.listAll(),
    reviewStore.listAll(),
    customerStore.list(),
    orderStore.listAll(),
  ]);
  const profiles = new Map();
  const getProfile = (id, info = {}) => {
    const key = String(id);
    if (!profiles.has(key)) {
      profiles.set(key, {
        id: key,
        name: info.name || 'Customer',
        email: info.email || '',
        phone: info.phone || '',
        registeredAt: info.registeredAt || null,
        orders: [],
        customRequests: [],
        messages: [],
        returns: [],
        reviews: [],
        activity: [],
      });
    }
    const profile = profiles.get(key);
    if (!profile.name || profile.name === 'Customer') profile.name = info.name || profile.name;
    if (!profile.email) profile.email = info.email || '';
    if (!profile.phone) profile.phone = info.phone || '';
    if (!profile.registeredAt) profile.registeredAt = info.registeredAt || null;
    return profile;
  };

  users.listCustomers().forEach(user => {
    getProfile(user.id, { name: user.name, email: user.email, registeredAt: user.createdAt });
  });
  registeredCustomers.forEach(customer => {
    getProfile(customer.id, {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      registeredAt: customer.registeredAt,
    });
  });
  allOrders.forEach(order => {
    const profile = getProfile(order.customerId, {
      name: order.customerName,
      email: order.customerEmail,
      phone: order.deliveryDetails && order.deliveryDetails.phone,
    });
    profile.orders.push(order);
    profile.activity.push({ type: 'Order', detail: `Order ${order.id}: ${order.status}`, at: order.createdAt });
  });
  customRequests.forEach(request => {
    const profile = getProfile(request.customerId, {
      name: request.customerName,
      email: request.customerEmail,
      phone: request.customerPhone,
    });
    profile.customRequests.push(request);
    profile.activity.push({ type: 'Customisation request', detail: `${request.productType}: ${request.status}`, at: request.createdAt });
  });
  messages.forEach(message => {
    const profile = getProfile(message.customerId, { name: message.customerName, email: message.customerEmail });
    profile.messages.push(message);
    profile.activity.push({ type: 'Message', detail: message.subject, at: message.createdAt });
  });
  returns.forEach(request => {
    const profile = getProfile(request.customerId, { name: request.customerName, email: request.customerEmail });
    profile.returns.push(request);
    profile.activity.push({ type: request.type, detail: `${request.productName}: ${request.status}`, at: request.createdAt });
  });
  reviews.forEach(review => {
    const profile = getProfile(review.customerId, { name: review.customerName });
    profile.reviews.push(review);
    profile.activity.push({ type: 'Review', detail: `Rated ${review.rating} stars`, at: review.createdAt });
  });
  const audit = await listAudit(200);
  audit.forEach(event => {
    const profile = profiles.get(String(event.actor));
    if (profile) profile.activity.push({
      type: event.action || 'Activity',
      detail: event.entity || 'Account activity',
      at: event.at,
    });
  });

  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  return [...profiles.values()].map(profile => {
    profile.orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    profile.activity.sort((a, b) => new Date(b.at) - new Date(a.at));
    const orderAmounts = profile.orders.map(order => Number(order.totalAmount));
    return {
      ...profile,
      orderCount: profile.orders.length,
      totalPurchaseAmount: profile.orders.length && orderAmounts.every(Number.isFinite)
        ? orderAmounts.reduce((total, amount) => total + amount, 0)
        : profile.orders.length ? null : 0,
      status: profile.activity.some(item => new Date(item.at).getTime() >= cutoff)
        ? 'Active'
        : 'No recent activity',
      lastActivityAt: profile.activity[0] && profile.activity[0].at || null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

exports.customers = async (req, res) => res.json(await customerData());

exports.customer = async (req, res) => {
  const profile = (await customerData()).find(item => item.id === req.params.customerId);
  if (!profile) return res.status(404).json({ error: 'Customer not found in available account and activity data.' });
  res.json(profile);
};

exports.reviews = async (req, res) => {
  const products = new Map((await productStore.list({ includeInactive: true })).map(product => [String(product.id), product.name]));
  const reviews = await reviewStore.listAll();
  res.json(reviews.map(review => ({
    ...review,
    productName: products.get(String(review.productId)) || 'Product no longer listed',
  })));
};

exports.notifications = async (req, res) => {
  const [requests, messages, returns, allOrders] = await Promise.all([
    customRequestStore.listAll(),
    messageStore.listAll(),
    returnStore.listAll(),
    orderStore.listAll(),
  ]);
  const notifications = [
    ...requests.filter(item => ['Submitted', 'Under Review', 'Need More Details'].includes(item.status))
      .map(item => ({ id: `custom-${item.id}`, type: 'Customisation request', title: `Request from ${item.customerName || 'customer'}`, detail: `${item.productType} · ${item.status}`, at: item.createdAt, href: 'owner.html?view=custom-requests' })),
    ...messages.filter(item => item.messages && item.messages.some(message => message.sender === 'customer' && !message.readByAdmin))
      .map(item => ({ id: `message-${item.id}`, type: 'Customer chat', title: `Message from ${item.customerName}`, detail: (item.messages[item.messages.length - 1] || {}).text || '', at: item.updatedAt || item.createdAt, href: 'owner.html?view=chats' })),
    ...returns.filter(item => ['Pending', 'Under Review'].includes(item.status))
      .map(item => ({ id: `return-${item.id}`, type: 'Return or cancellation', title: `${item.type} request for order ${item.orderId}`, detail: `${item.customerName} · ${item.status}`, at: item.createdAt, href: 'owner.html?view=returns' })),
    ...allOrders.filter(item => item.isPreorder && item.preorderStatus === 'Pending')
      .map(item => ({ id: `preorder-${item.id}`, type: 'Pre-order', title: `Pre-order ${item.preorderId || item.id} needs review`, detail: `${item.productName} · Qty ${item.qty}`, at: item.createdAt, href: 'owner.html?view=preorders' })),
    ...allOrders.filter(item => !item.isPreorder && item.status === 'Placed')
      .map(item => ({ id: `order-${item.id}`, type: 'New order', title: `Order ${item.id} needs confirmation`, detail: `${item.customerName} · ${item.productName} · Qty ${item.qty}`, at: item.createdAt, href: 'owner.html?view=orders' })),
    ...allOrders.filter(item => ['Payment Submitted', 'Awaiting Verification'].includes(item.paymentStatus))
      .map(item => ({ id: `payment-${item.id}`, type: 'Payment verification', title: `Payment for order ${item.id} needs verification`, detail: `${item.customerName} · ₹${Number(item.paymentSubmission && item.paymentSubmission.amountPaid || item.totalAmount || 0).toLocaleString('en-IN')}`, at: item.paymentSubmission && item.paymentSubmission.submittedAt || item.createdAt, href: 'owner.html?view=payments' })),
  ];
  res.json(notifications.sort((a, b) => new Date(b.at) - new Date(a.at)));
};
