const messageUser = typeof u !== 'undefined' ? u : guard('customer');
let customerConversation = null;

if (messageUser) initCustomerMessages();

function initCustomerMessages() {
  document.getElementById('customerMessagesPage').innerHTML = `
    <section class="page-heading"><p class="customisation-kicker">We are here to help</p><h1>Chat with <em>Admin</em></h1>
      <p>Send a message and continue your conversation whenever you need us.</p></section>
    <section class="customer-chat-card">
      <header class="customer-chat-heading"><div><h2>StitchStock Support</h2><p id="customerChatStatus">Loading conversation…</p></div><span class="chat-unread-count" id="customerUnreadCount" hidden></span></header>
      <div class="chat-transcript customer-chat-transcript" id="customerChatTranscript"><div class="empty-state">Loading messages… 🧶</div></div>
      <form class="customer-chat-compose" id="customerChatForm">
        <label class="sr-only" for="customerChatText">Your message</label>
        <textarea id="customerChatText" rows="3" maxlength="3000" required placeholder="Write a message to the admin…"></textarea>
        <p id="customerChatFeedback" role="alert"></p><button class="pill-btn" type="submit">Send Message →</button>
      </form>
    </section>`;
  document.getElementById('customerChatForm').onsubmit = sendCustomerMessage;
  loadCustomerMessages();
  setInterval(() => { if (!document.hidden) loadCustomerMessages(); }, 10000);
}

async function sendCustomerMessage(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type=submit]');
  const text = document.getElementById('customerChatText').value.trim();
  if (!text) return;
  button.disabled = true;
  document.getElementById('customerChatFeedback').textContent = '';
  try {
    await api('/messages', 'POST', { text });
    form.reset();
    await loadCustomerMessages();
  } catch (error) {
    document.getElementById('customerChatFeedback').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function loadCustomerMessages() {
  const transcript = document.getElementById('customerChatTranscript');
  try {
    customerConversation = await api('/messages/mine');
    if (typeof refreshCustomerUnreadBadge === 'function') refreshCustomerUnreadBadge();
    const messages = customerConversation ? customerConversation.messages : [];
    document.getElementById('customerChatStatus').textContent = messages.length
      ? 'Your messages are saved and will be here when you return.'
      : 'Start a private conversation with the admin.';
    const unread = customerConversation?.unreadCount || 0;
    const badge = document.getElementById('customerUnreadCount');
    badge.hidden = !unread;
    badge.textContent = unread ? `${unread} unread` : '';
    transcript.innerHTML = messages.length ? messages.map(message => `<article class="chat-bubble ${message.sender === 'customer' ? 'sent' : 'received'}">
      <p>${esc(message.text)}</p><time>${esc(new Date(message.at).toLocaleString('en-IN'))}${message.subject ? ` · ${esc(message.subject)}` : ''}</time>
      ${message.sender === 'customer' ? `<small>${message.readByAdmin ? 'Read by admin' : 'Sent'}</small>` : '<small>StitchStock Support</small>'}
    </article>`).join('') : '<div class="empty-state">No messages yet. Say hello whenever you need help.</div>';
    transcript.scrollTop = transcript.scrollHeight;
  } catch (error) {
    transcript.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
  }
}
