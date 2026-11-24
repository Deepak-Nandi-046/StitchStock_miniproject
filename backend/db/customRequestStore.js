const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { writeJson } = require('./jsonFile');

const dataDirectory = path.join(__dirname, '..', 'data');
const uploadDirectory = path.join(dataDirectory, 'custom-requests');
const recordsPath = path.join(dataDirectory, 'custom-requests.json');
const extensionByType = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

let requests;
let writes = Promise.resolve();

async function loadRequests() {
  if (requests) return requests;
  try {
    requests = JSON.parse(await fs.readFile(recordsPath, 'utf8'));
    if (!Array.isArray(requests)) throw new Error('Custom request data must be an array');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    requests = [];
  }
  return requests;
}

function saveRequests() {
  writes = writes.then(async () => {
    await writeJson(recordsPath, requests);
  });
  return writes;
}

async function create({ customerId, customerName, customerEmail, customerPhone, productType, color, size, budget, occasion, description, attachments }) {
  await loadRequests();
  await fs.mkdir(uploadDirectory, { recursive: true });
  const requestId = crypto.randomUUID();
  const savedAttachments = [];
  try {
    for (const attachment of attachments) {
      const fileId = crypto.randomUUID();
      const storageName = `${requestId}-${fileId}.${extensionByType[attachment.mimeType]}`;
      await fs.writeFile(path.join(uploadDirectory, storageName), attachment.buffer, { flag: 'wx' });
      savedAttachments.push({
        id: fileId,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.buffer.length,
        storageName,
      });
    }

    const request = {
      id: requestId,
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      productType,
      color,
      size,
      budget,
      occasion,
      description,
      attachments: savedAttachments,
      status: 'Submitted',
      adminReply: '',
      quotedPrice: null,
      estimatedCompletion: '',
      createdAt: new Date().toISOString(),
    };
    requests.unshift(request);
    await saveRequests();
    return publicRequest(request);
  } catch (error) {
    await Promise.all(savedAttachments.map(file =>
      fs.unlink(path.join(uploadDirectory, file.storageName)).catch(unlinkError => {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      })
    ));
    throw error;
  }
}

async function update(requestId, changes) {
  await loadRequests();
  const request = requests.find(item => item.id === requestId);
  if (!request) return null;
  if (changes.status === 'Rejected' ||
      (changes.status === 'Offer Sent' && request.status !== 'Offer Sent')) {
    request.paymentMethod = '';
    request.paymentAmount = null;
    request.paymentStatus = '';
    delete request.paymentConfirmedAt;
  }
  Object.assign(request, changes, { updatedAt: new Date().toISOString() });
  await saveRequests();
  return publicRequest(request);
}

async function respondToOffer(requestId, customerId, decision, paymentMethod) {
  await loadRequests();
  const request = requests.find(item => item.id === requestId && item.customerId === customerId);
  if (!request) return null;
  if (request.status !== 'Offer Sent' || !Number.isFinite(request.quotedPrice))
    return { error: 'There is no active offer to respond to.' };

  request.status = decision === 'accept' ? 'Accepted' : 'Rejected';
  request.paymentMethod = decision === 'accept' ? paymentMethod : '';
  request.paymentAmount = decision === 'accept'
    ? Math.ceil(request.quotedPrice / 2)
    : null;
  request.paymentStatus = decision === 'accept' ? 'Pending' : '';
  delete request.paymentConfirmedAt;
  request.updatedAt = new Date().toISOString();
  await saveRequests();
  return publicRequest(request);
}

async function confirmAdvancePayment(requestId, customerId) {
  await loadRequests();
  const request = requests.find(item => item.id === requestId && item.customerId === customerId);
  if (!request) return null;
  if (request.status !== 'Accepted' || request.paymentMethod !== 'advance' ||
      request.paymentStatus !== 'Pending')
    return { error: 'This request is not awaiting an advance payment.' };

  request.status = 'Order Confirmed';
  request.paymentStatus = 'Customer marked advance paid';
  request.paymentConfirmedAt = new Date().toISOString();
  request.updatedAt = request.paymentConfirmedAt;
  await saveRequests();
  return publicRequest(request);
}

function publicRequest(request) {
  const { customerId, customerName, ...details } = request;
  return {
    ...details,
    status: ({
      Received: 'Submitted',
      Reviewing: 'Under Review',
      'In Progress': 'Order Confirmed',
      Completed: 'Order Confirmed',
      Declined: 'Rejected',
    })[details.status] || details.status,
    attachments: details.attachments.map(({ storageName, ...attachment }) => attachment),
    customerId,
    customerName,
  };
}

async function listAll() {
  return (await loadRequests()).map(publicRequest);
}

async function listForCustomer(customerId) {
  return (await loadRequests())
    .filter(request => request.customerId === customerId)
    .map(request => {
      const { customerId: ignoredId, customerName: ignoredName, ...details } = request;
      return {
        ...details,
        attachments: details.attachments.map(({ storageName, ...attachment }) => attachment),
      };
    });
}

async function getFile(requestId, fileId) {
  const request = (await loadRequests()).find(item => item.id === requestId);
  const attachment = request?.attachments.find(item => item.id === fileId);
  return request && attachment
    ? { request, attachment, path: path.join(uploadDirectory, attachment.storageName) }
    : null;
}

module.exports = { create, listAll, listForCustomer, getFile, update, respondToOffer, confirmAdvancePayment };
