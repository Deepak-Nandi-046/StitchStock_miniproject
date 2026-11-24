const customisationUser = typeof u !== 'undefined' ? u : guard('customer');

if (customisationUser) initCustomisationPage();

function initCustomisationPage() {
  document.getElementById('customisationPage').innerHTML = `
    <section class="customisation-banner">
      <p class="customisation-kicker">A little imagination, a lot of love</p>
      <h1>Make It <em>Yours</em></h1>
      <p>Share your idea and we’ll work with you to create a crochet piece made just for you.</p>
      <a class="pill-btn" href="shop.html">Continue Shopping</a>
    </section>
    <section class="customisation-section customisation-page-section" aria-labelledby="customisationFormTitle">
      <div class="section-head"><h2 id="customisationFormTitle">Tell Us What You Have in Mind</h2></div>
      <form class="customisation-form" id="customisationForm">
        <div class="customisation-preferences">
          <label for="requestType">Product type
            <select id="requestType" required>
              <option value="">Choose a product type</option>
              <option>Bags</option><option>Flowers or bouquet</option><option>Home decor</option>
              <option>Accessory</option><option>Keychain</option><option>Other custom design</option>
            </select>
          </label>
          <label for="requestColor">Colour preference
            <select id="requestColor" required>
              <option value="">Choose a colour</option>
              <option>No preference</option><option>Blush pink</option><option>Cream</option>
              <option>Lavender</option><option>Sage green</option><option>Other (describe below)</option>
            </select>
          </label>
          <label for="requestSize">Size preference
            <select id="requestSize" required>
              <option value="">Choose a size</option>
              <option>Small</option><option>Medium</option><option>Large</option>
              <option>Custom size (describe below)</option><option>No preference</option>
            </select>
          </label>
          <label for="requestBudget">Budget
            <select id="requestBudget" required>
              <option value="">Choose a budget</option>
              <option>Under ₹500</option><option>₹500–₹1,000</option><option>₹1,000–₹2,500</option>
              <option>₹2,500–₹5,000</option><option>Flexible</option>
            </select>
          </label>
          <label for="requestOccasion">Occasion
            <select id="requestOccasion" required>
              <option value="">Choose an occasion</option>
              <option>Birthday</option><option>Anniversary</option><option>Festival</option>
              <option>Thank you</option><option>Wedding</option><option>Just because</option><option>Other</option>
            </select>
          </label>
        </div>
        <label for="requestEmail">Contact email
          <input id="requestEmail" type="email" maxlength="254" autocomplete="email" required value="${esc(customisationUser.email || '')}">
        </label>
        <label for="requestPhone">Phone number (optional)
          <input id="requestPhone" type="tel" maxlength="30" autocomplete="tel" placeholder="How can we reach you?">
        </label>
        <label for="customisationDescription">Custom request description</label>
        <textarea id="customisationDescription" rows="5" maxlength="3000" required placeholder="Add details like design, style, measurements, or anything else we should know."></textarea>
        <div class="customisation-uploads">
          <label for="customisationPhotos">Reference images (up to 3, 2 MB each)
            <input id="customisationPhotos" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple>
          </label>
          <label for="customisationVideo">Reference video (MP4, WebM, or MOV; up to 8 MB)
            <input id="customisationVideo" type="file" accept="video/mp4,video/webm,video/quicktime">
          </label>
        </div>
        <p class="customisation-file-names" id="customisationFileNames" aria-live="polite">No files selected.</p>
        <p class="customisation-feedback" id="customisationFeedback" role="alert" aria-live="polite"></p>
        <p class="customisation-success" id="customisationSuccess" role="status" aria-live="polite" hidden></p>
        <div class="customisation-actions">
          <a class="outline-btn" href="index.html">Back to Home</a>
          <button class="pill-btn" id="sendCustomisation" type="submit">Submit Request →</button>
        </div>
      </form>
    </section>
    <section class="customisation-section customisation-page-section customisation-history" aria-labelledby="requestHistoryTitle">
      <div class="section-head"><h2 id="requestHistoryTitle">Your Requests</h2></div>
      <p class="customisation-intro">Follow the latest status of your custom crochet requests here.</p>
      <div id="customisationRequests"><div class="empty-state">Loading your requests... 🧶</div></div>
    </section>`;

  bindCustomisationForm();
  loadCustomisationRequests();
  setInterval(() => {
    if (!document.hidden) loadCustomisationRequests();
  }, 30000);
}

function bindCustomisationForm() {
  const form = document.getElementById('customisationForm');
  const photos = document.getElementById('customisationPhotos');
  const video = document.getElementById('customisationVideo');
  const feedback = document.getElementById('customisationFeedback');
  const success = document.getElementById('customisationSuccess');
  const updateFileNames = () => {
    const files = [...photos.files, ...video.files];
    document.getElementById('customisationFileNames').textContent =
      files.length ? files.map(file => file.name).join(', ') : 'No files selected.';
  };
  photos.onchange = updateFileNames;
  video.onchange = updateFileNames;
  form.onsubmit = async event => {
    event.preventDefault();
    feedback.textContent = '';
    success.hidden = true;
    const selectedPhotos = [...photos.files];
    const selectedVideos = [...video.files];
    if (selectedPhotos.length > 3) {
      feedback.textContent = 'Choose no more than 3 reference images.';
      return;
    }
    if (selectedPhotos.some(file => file.size > 2 * 1024 * 1024)) {
      feedback.textContent = 'Each reference image must be 2 MB or smaller.';
      return;
    }
    if (selectedVideos.length > 1) {
      feedback.textContent = 'Choose no more than 1 reference video.';
      return;
    }
    if (selectedVideos.some(file => file.size > 8 * 1024 * 1024)) {
      feedback.textContent = 'The reference video must be 8 MB or smaller.';
      return;
    }
    const button = document.getElementById('sendCustomisation');
    button.disabled = true;
    try {
      const attachments = await Promise.all([...selectedPhotos, ...selectedVideos].map(readCustomisationFile));
      const request = await api('/custom-requests', 'POST', {
        productType: document.getElementById('requestType').value,
        color: document.getElementById('requestColor').value,
        size: document.getElementById('requestSize').value,
        budget: document.getElementById('requestBudget').value,
        occasion: document.getElementById('requestOccasion').value,
        customerEmail: document.getElementById('requestEmail').value.trim(),
        customerPhone: document.getElementById('requestPhone').value.trim(),
        description: document.getElementById('customisationDescription').value.trim(),
        attachments,
      });
      form.reset();
      updateFileNames();
      success.textContent = `Your customisation request was submitted successfully. Request ID: ${request.id}`;
      success.hidden = false;
      await loadCustomisationRequests();
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}

function readCustomisationFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: reader.result });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function loadCustomisationRequests() {
  const host = document.getElementById('customisationRequests');
  try {
    const requests = await api('/custom-requests/mine');
    if (!requests.length) {
      host.innerHTML = '<div class="empty-state">No customisation requests yet. Share your first idea above 🧶</div>';
      return;
    }
    host.innerHTML = requests.map(request => `<article class="customisation-request">
      <div class="custom-request-heading">
        <strong class="custom-request-status">${esc(request.status || 'Submitted')}</strong>
        <time>${esc(new Date(request.createdAt).toLocaleString())}</time>
      </div>
      <p class="custom-request-id">Request ID: ${esc(request.id)}</p>
      <p><strong>${esc(request.productType || 'Custom item')}</strong> · ${esc(request.color || 'Any colour')} · ${esc(request.size || 'Any size')}</p>
      <p>Budget: ${esc(request.budget || 'Not specified')} · Occasion: ${esc(request.occasion || 'Not specified')}</p>
      <p>${esc(request.description)}</p>
      ${request.attachments.length ? `<div class="customisation-links">${request.attachments.map(file =>
        `<button type="button" class="custom-file-link" data-request-file="${esc(request.id)}" data-file-id="${esc(file.id)}">${esc(file.name)}</button>`
      ).join('')}</div>` : ''}
      ${request.adminReply ? `<div class="customisation-reply"><strong>Message from Stitch &amp; Stole</strong><p>${esc(request.adminReply)}</p></div>` : ''}
      ${request.quotedPrice != null ? `<p class="customisation-offer"><strong>Proposed price:</strong> ₹${Number(request.quotedPrice).toLocaleString('en-IN')}
        ${request.estimatedCompletion ? `<br><strong>Estimated completion:</strong> ${esc(request.estimatedCompletion)}` : ''}</p>` : ''}
      ${request.status === 'Offer Sent' && request.quotedPrice != null ? `<div class="customisation-actions offer-actions">
        <button type="button" class="pill-btn" data-offer-action="accept" data-request-id="${esc(request.id)}">Accept &amp; pay 50% advance</button>
        <button type="button" class="outline-btn" data-offer-action="reject" data-request-id="${esc(request.id)}">Decline offer</button>
      </div>` : ''}
      ${request.status === 'Accepted' && request.paymentStatus === 'Pending' ? renderAdvancePayment(request) : ''}
      ${request.paymentStatus ? `<p class="customisation-payment-note">${esc(request.paymentStatus)}${request.paymentConfirmedAt ? ` · ${esc(new Date(request.paymentConfirmedAt).toLocaleString())}` : ''}</p>` : ''}
    </article>`).join('');
    host.querySelectorAll('[data-offer-action]').forEach(button => {
      button.onclick = () => respondToCustomOffer(button);
    });
    host.querySelectorAll('[data-request-file]').forEach(button => {
      button.onclick = () => openCustomRequestFile(button.dataset.requestFile, button.dataset.fileId);
    });
    host.querySelectorAll('[data-confirm-advance]').forEach(button => {
      button.onclick = () => confirmCustomAdvance(button);
    });
  } catch (error) {
    host.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
  }
}

function renderAdvancePayment(request) {
  const amount = Number(request.paymentAmount) || Math.ceil(Number(request.quotedPrice) / 2);
  const upiUrl = `upi://pay?pa=stitchstock@upi&pn=StitchStock&am=${amount.toFixed(2)}&cu=INR`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiUrl)}`;
  return `<div class="customisation-payment">
    <h3>Pay your 50% advance</h3>
    <p>Advance due: <strong>₹${amount.toLocaleString('en-IN')}</strong> · Balance is due after completion.</p>
    <img src="${esc(qrUrl)}" alt="UPI payment QR code for ₹${amount.toLocaleString('en-IN')}">
    <p>UPI: stitchstock@upi</p>
    <p class="customisation-payment-note">After paying in your UPI app, confirm below. Payment is not automatically verified.</p>
    <button type="button" class="pill-btn" data-confirm-advance="${esc(request.id)}">I have paid the advance</button>
  </div>`;
}

async function respondToCustomOffer(button) {
  button.disabled = true;
  try {
    await api(`/custom-requests/${encodeURIComponent(button.dataset.requestId)}/offer-response`, 'POST', {
      decision: button.dataset.offerAction,
      paymentMethod: button.dataset.offerAction === 'accept' ? 'advance' : undefined,
    });
    await loadCustomisationRequests();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}

async function confirmCustomAdvance(button) {
  button.disabled = true;
  try {
    await api(`/custom-requests/${encodeURIComponent(button.dataset.confirmAdvance)}/confirm-advance-payment`, 'POST', {});
    await loadCustomisationRequests();
    toast('Your custom order is confirmed');
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}
