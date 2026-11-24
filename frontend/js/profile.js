const profileUser = typeof u !== 'undefined' ? u : guard();
let profileData = null;
let profileAvatar = '';

if (profileUser) loadProfile();

async function loadProfile() {
  const host = document.getElementById('profilePage');
  try {
    profileData = await api('/auth/profile');
    profileAvatar = profileData.avatarUrl || '';
    const userName = document.querySelector('.user-name');
    if (userName) userName.textContent = profileData.name;
    const summary = document.querySelector('.profile-icon');
    if (summary) {
      summary.title = profileData.name;
      summary.innerHTML = profileAvatar ? `<img src="${esc(profileAvatar)}" alt="">` : '👤';
    }
    host.innerHTML = `<section class="page-heading"><p class="customisation-kicker">Your account</p><h1>My <em>Profile</em></h1><p>Keep your contact and delivery details up to date.</p></section>
      <div class="profile-page-grid">
        <section class="profile-card">
          <div class="profile-card-heading"><div class="profile-avatar" id="profileAvatar">${profileAvatar ? `<img src="${esc(profileAvatar)}" alt="Profile picture">` : '♡'}</div><div><h2>Profile details</h2><p>Role: ${esc(profileData.role === 'owner' ? 'Admin' : 'Customer')}</p></div></div>
          <form id="profileForm">
            <label>Full name<input name="name" maxlength="100" required value="${esc(profileData.name || '')}" disabled></label>
            <label>Email address<input name="email" type="email" maxlength="254" value="${esc(profileData.email || '')}" ${profileData.canUpdateEmail ? '' : 'disabled'}></label>
            <label>Phone number<input name="phone" type="tel" maxlength="30" value="${esc(profileData.phone || '')}" disabled></label>
            ${profileData.role === 'customer' ? `<label>Delivery address<textarea name="address" maxlength="500" rows="4" disabled>${esc(profileData.address || '')}</textarea></label>
              <label>Delivery pincode<input name="pincode" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" value="${esc(profileData.pincode || '')}" disabled></label>` : ''}
            <label class="profile-picture-field">Profile picture<input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" disabled><small>JPG, PNG, or WebP up to 2 MB</small></label>
            ${!profileData.canUpdateEmail ? '<p class="profile-note">Email changes are not enabled for this login provider.</p>' : ''}
            <p class="profile-feedback" id="profileFeedback" role="status"></p>
            <div class="profile-actions"><button type="button" class="outline-btn" id="editProfile">Edit Profile</button><button type="submit" class="pill-btn" id="saveProfile" hidden>Save Changes</button></div>
          </form>
        </section>
        <section class="profile-card">
          <h2>Change password</h2><p class="profile-note">Use your current password to securely set a new one.</p>
          <form id="passwordForm">
            <label>Current password<span class="profile-password-wrap"><input name="currentPassword" type="password" autocomplete="current-password" required><button type="button" class="password-toggle" aria-label="Show current password" aria-pressed="false">Show</button></span></label>
            <label>New password<span class="profile-password-wrap"><input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="64" required><button type="button" class="password-toggle" aria-label="Show new password" aria-pressed="false">Show</button></span><small>8–64 characters, including uppercase, lowercase, a number, and a symbol.</small></label>
            <label>Confirm new password<span class="profile-password-wrap"><input name="confirmPassword" type="password" autocomplete="new-password" maxlength="64" required><button type="button" class="password-toggle" aria-label="Show confirmation password" aria-pressed="false">Show</button></span></label>
            <p class="profile-feedback" id="passwordFeedback" role="alert"></p>
            <button type="submit" class="pill-btn">Update Password</button>
          </form>
        </section>
      </div>`;
    bindProfileForms();
  } catch (error) {
    host.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
    toast(error.message);
  }
}

function bindProfileForms() {
  const form = document.getElementById('profileForm');
  const fields = [...form.querySelectorAll('input:not([type=file]), textarea'), form.elements.avatar];
  const edit = document.getElementById('editProfile');
  const save = document.getElementById('saveProfile');
  edit.onclick = () => {
    fields.forEach(field => { if (!field.name || field.name !== 'email' || profileData.canUpdateEmail) field.disabled = false; });
    edit.hidden = true;
    save.hidden = false;
    form.elements.name.focus();
  };
  form.elements.avatar.onchange = async () => {
    const file = form.elements.avatar.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      document.getElementById('profileFeedback').textContent = 'Profile pictures must be 2 MB or smaller.';
      form.elements.avatar.value = '';
      return;
    }
    profileAvatar = await readProfileImage(file);
    document.getElementById('profileAvatar').innerHTML = `<img src="${esc(profileAvatar)}" alt="Profile picture preview">`;
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const button = save;
    const feedback = document.getElementById('profileFeedback');
    button.disabled = true;
    feedback.textContent = '';
    try {
      const updated = await api('/auth/profile', 'PATCH', {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.trim(),
        address: form.elements.address ? form.elements.address.value.trim() : '',
        pincode: form.elements.pincode ? form.elements.pincode.value.trim() : '',
        avatarUrl: profileAvatar,
      });
      profileData = updated;
      store.set(updated.token, {
        id: updated.id, name: updated.name, email: updated.email, role: updated.role,
        avatarUrl: updated.avatarUrl || '',
      });
      await loadProfile();
      const userName = document.querySelector('.user-name');
      if (userName) userName.textContent = updated.name;
      const summary = document.querySelector('.profile-icon');
      if (summary) {
        summary.title = updated.name;
        summary.innerHTML = updated.avatarUrl ? `<img src="${esc(updated.avatarUrl)}" alt="">` : '👤';
      }
      document.getElementById('profileFeedback').textContent = 'Profile updated successfully.';
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };

  const passwordForm = document.getElementById('passwordForm');
  passwordForm.querySelectorAll('.password-toggle').forEach(button => {
    button.onclick = () => {
      const input = button.parentElement.querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? 'Hide' : 'Show';
      button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} ${input.name.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
      button.setAttribute('aria-pressed', String(show));
    };
  });
  passwordForm.onsubmit = async event => {
    event.preventDefault();
    const feedback = document.getElementById('passwordFeedback');
    const submit = passwordForm.querySelector('[type=submit]');
    if (passwordForm.elements.newPassword.value !== passwordForm.elements.confirmPassword.value) {
      feedback.textContent = 'The new passwords do not match.';
      return;
    }
    submit.disabled = true;
    feedback.textContent = '';
    try {
      const result = await api('/auth/password/change', 'POST', {
        currentPassword: passwordForm.elements.currentPassword.value,
        newPassword: passwordForm.elements.newPassword.value,
        confirmPassword: passwordForm.elements.confirmPassword.value,
      });
      passwordForm.reset();
      passwordForm.querySelectorAll('.password-toggle').forEach(button => {
        const input = button.parentElement.querySelector('input');
        input.type = 'password';
        button.textContent = 'Show';
        button.setAttribute('aria-label', `Show ${input.name.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
        button.setAttribute('aria-pressed', 'false');
      });
      feedback.textContent = result.message;
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  };
}

function readProfileImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected profile picture.'));
    reader.readAsDataURL(file);
  });
}
