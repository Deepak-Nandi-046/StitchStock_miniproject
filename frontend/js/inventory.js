const ownerUser = guard('owner');
if (!ownerUser) {
  // guard redirects cross-role visitors
} else {
  initInventory();
}

async function initInventory() {
  document.getElementById('inventoryApp').innerHTML = `
    <section class="admin-banner inventory-banner" id="inventory">
      <div>
        <h1>Inventory <em>Made with Love</em></h1>
        <p>Manage the handmade product catalogue and current stock</p>
      </div>
    </section>
    <section class="admin-section">
      <div class="section-title-row">
        <h2>Products</h2>
        <button type="button" class="pill-btn" id="toggleAddProduct">+ Add ready product</button>
      </div>
      <div class="add-product-form-modal" id="addProductFormModal" hidden>
        <form class="add-product-form" id="addProductForm">
          <h2 class="add-product-title">Add <em>Crochet Product</em></h2>
          <div class="product-image-uploader">
            <label for="newProductImageFile">
              <img id="newProductImagePreview" class="product-image-preview" src="assets/login-background.jpg" alt="Product preview">
              <strong>Upload or Drag Image</strong>
              <span>Recommended: 1200 x 1200 px</span>
              <input id="newProductImageFile" type="file" accept="image/*">
              <input id="newProductImage" type="text" placeholder="assets/hero.webp or https://..." aria-label="Product image URL">
            </label>
          </div>
          <label class="design-name">Design Title
            <input id="newProductName" maxlength="100" required placeholder="Rose Bouquet Tote Bag">
          </label>
          <label class="design-category">Category
            <select id="newProductCategory">
              <option>Bags &amp; Purses</option><option>Bouquets</option><option>Flowers</option>
              <option>Handbags</option><option>Home Decor</option><option>Accessories</option>
              <option>Keychains</option><option>Custom Orders</option>
            </select>
          </label>
          <label class="design-price">Price (₹)
            <input id="newProductPrice" type="number" min="0" step="0.01" required placeholder="129.00">
          </label>
          <label class="design-availability">Availability Status
            <select id="newProductAvailability">
              <option value="in-stock">In Stock</option>
              <option value="made-to-order">Made to Order</option>
              <option value="featured">Featured</option>
            </select>
          </label>
          <label class="wide-field">Design Description &amp; Care Notes
            <textarea id="newProductDescription" maxlength="300" rows="4" placeholder="Hand-crochet details, materials, and care instructions"></textarea>
          </label>
          <label class="design-stock">Initial Stock
            <input id="newProductStock" type="number" min="0" step="1" value="1" required>
          </label>
          <div class="form-actions">
            <button type="button" class="outline-btn" id="cancelAddProduct">Cancel</button>
            <button type="submit" class="pill-btn" id="submitAddProduct">Save Design</button>
          </div>
        </form>
      </div>
      <div class="inventory-grid" id="inventoryGrid"><div class="admin-empty">Loading inventory... 🧶</div></div>
    </section>`;

  bindAddProductForm();
  document.getElementById('refreshAdmin')?.addEventListener('click', refreshInventory);
  await refreshInventory();
}

function bindAddProductForm() {
  const form = document.getElementById('addProductForm');
  const modal = document.getElementById('addProductFormModal');
  const imageInput = document.getElementById('newProductImage');
  const imageFile = document.getElementById('newProductImageFile');
  const preview = document.getElementById('newProductImagePreview');

  document.getElementById('toggleAddProduct').onclick = () => {
    modal.hidden = false;
    document.getElementById('newProductName').focus();
  };
  document.getElementById('cancelAddProduct').onclick = () => {
    form.reset();
    modal.hidden = true;
  };
  modal.onclick = event => {
    if (event.target === modal) modal.hidden = true;
  };
  imageInput.oninput = () => {
    if (imageInput.value.trim()) preview.src = imageInput.value.trim();
  };
  imageFile.onchange = () => {
    const file = imageFile.files && imageFile.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast('Choose an image smaller than 2 MB');
    const reader = new FileReader();
    reader.onload = () => {
      preview.src = reader.result;
      imageInput.value = reader.result;
    };
    reader.readAsDataURL(file);
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
      preview.src = 'assets/login-background.jpg';
      modal.hidden = true;
      await refreshInventory();
    } catch (error) {
      toast(error.message);
    } finally {
      submit.disabled = false;
    }
  };
}

async function refreshInventory() {
  try {
    const summary = await api('/owner/summary');
    renderInventory(summary.products);
  } catch (error) {
    toast(error.message);
  }
}

function renderInventory(products) {
  const host = document.getElementById('inventoryGrid');
  if (!products.length) {
    host.innerHTML = '<div class="admin-empty">No inventory items yet 🧶</div>';
    return;
  }
  host.innerHTML = products.map(product => {
    const stock = Number(product.stock) || 0;
    const fillClass = stock <= 2 ? 'low' : stock <= 5 ? 'warn' : 'good';
    const fillWidth = Math.min(100, stock * 10);
    const image = product.image_url || 'assets/login-background.jpg';
    return `<article class="inventory-card">
      <img class="inventory-image" src="${esc(image)}" alt="${esc(product.name)}" onerror="this.onerror=null;this.style.display='none'">
      <div class="inventory-body">
        <h3>${esc(product.name)}</h3>
        <div class="inventory-meta"><span>₹${esc(Number(product.price).toLocaleString('en-IN'))}</span><span>${esc(stock)} in stock</span></div>
        <div class="stock-track"><div class="stock-fill ${fillClass}" style="width:${fillWidth}%"></div></div>
        <div class="restock-row">
          <input type="number" min="1" max="100" value="5" data-restock-input="${esc(product.id)}" aria-label="Restock amount for ${esc(product.name)}">
          <button type="button" class="compact-btn" data-restock-quick="${esc(product.id)}">+5 stock</button>
          <button type="button" class="compact-btn primary" data-restock="${esc(product.id)}">Restock</button>
        </div>
      </div>
    </article>`;
  }).join('');

  host.querySelectorAll('[data-restock]').forEach(button => button.onclick = () => restockProduct(button));
  host.querySelectorAll('[data-restock-quick]').forEach(button => button.onclick = () => restockProduct(button, 5));
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
    await refreshInventory();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}
