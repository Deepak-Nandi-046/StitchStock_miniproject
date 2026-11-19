const store = { get token(){ try{return localStorage.getItem('ss_token')}catch(e){return null} },
  get user(){ try{return JSON.parse(localStorage.getItem('ss_user')||'null')}catch(e){return null} },
  set(t,u){ try{localStorage.setItem('ss_token',t);localStorage.setItem('ss_user',JSON.stringify(u))}catch(e){} },
  clear(){ try{localStorage.removeItem('ss_token');localStorage.removeItem('ss_user')}catch(e){} } };

async function api(path, method='GET', body){
  const r = await fetch('/api'+path, { method, headers:{'Content-Type':'application/json',
    ...(store.token?{Authorization:'Bearer '+store.token}:{})}, body: body?JSON.stringify(body):undefined });
  const raw = await r.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (e) {}
  if (r.status === 401 && !path.startsWith('/auth/login')) { store.clear(); location.href='login.html'; }
  if (!r.ok) {
    const fallback = r.status === 404 && path.startsWith('/auth/password-reset/')
      ? 'Password reset is unavailable. Restart the backend server and try again.'
      : 'Something went wrong';
    throw new Error(data.error || fallback);
  }
  return data;
}
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toast.h); toast.h=setTimeout(()=>t.classList.remove('on'),2600); }
const esc = s => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const chip = s => `<span class="chip s-${s.replace(/\s+/g,'-')}">${esc(s)}</span>`;
function guard(role){ const u=store.user; if(!u||!store.token){location.href='login.html';return null}
  if(role&&u.role!==role){location.href=u.role==='owner'?'owner.html':'index.html';return null} return u; }
function header(u){ document.getElementById('who').innerHTML = `<span class="user-menu"><span>${esc(u.name)} · ${esc(u.role)}</span><button class="ghost" id="out">Log out</button>${u.role==='owner'?'<button class="ghost" id="deleteAccount">Delete account</button>':''}</span>`;
  document.getElementById('out').onclick=()=>{store.clear();location.href='login.html'};
  const deleteAccount=document.getElementById('deleteAccount');
  if(deleteAccount){deleteAccount.onclick=async()=>{
    if(!confirm('Delete this admin account? This will allow a new admin account to be created.')) return;
    try{await api('/auth/account','DELETE');store.clear();location.href='login.html'}catch(e){toast(e.message)}
  };}}